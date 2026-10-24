import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkspaceError, resolveEditablePath, resolveReadablePath, type CheckResult, type SiteWorkspace } from "../site/workspace.ts";

/**
 * A tool, independent of any engine: a name, a description and a zod schema the
 * model sees, and a function that runs in the container. Each engine turns
 * these into its own format (Gemini function declarations, AI SDK tools).
 */
export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodObject;
  execute(input: unknown): Promise<ToolOutcome>;
}

/** Tools never throw: an error goes back to the model as a result it can act on. */
export interface ToolOutcome {
  output: string;
  isError: boolean;
}

/** State the tools share during one run. */
export class RunContext {
  /** Model calls so far; tool events carry the step that asked for them. */
  step = 0;
  readonly filesChanged = new Set<string>();
  /** Times finish was refused because the check failed. */
  autoFixes = 0;
  /** Set by finish: ends the run. */
  finished: { reply: string; clean: boolean } | undefined;
  #editQueue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly workspace: SiteWorkspace,
    readonly maxAutoFixes: number,
  ) {}

  /** Runs read-modify-write edits one at a time; the AI SDK runs a step's tools concurrently. */
  exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.#editQueue.then(run);
    this.#editQueue = result.catch(() => undefined);
    return result;
  }
}

export interface ToolHooks {
  onCall(call: { id: string; step: number; name: string; input: unknown }): void;
  onResult(result: { id: string; step: number; name: string; output: string; isError: boolean; durationMs: number }): void;
}

const MAX_READ_LINES = 2000;

/** Fixed order: the tool list is part of the prompt prefix Gemini can cache. */
export function createTools(ctx: RunContext, hooks: ToolHooks): AgentTool[] {
  const ws = ctx.workspace;

  const definitions = [
    define({
      name: "list_files",
      description:
        "List every file under src/ and public/ in the Rasengan project, one path per line. " +
        "Call it first when you do not know where something lives.",
      schema: z.object({}),
      async run() {
        const files = await ws.listFiles();
        return files.length === 0 ? "(no files)" : files.join("\n");
      },
    }),

    define({
      name: "read_file",
      description:
        "Read a project file. Lines are prefixed with their number and a tab; the prefix is not part of the file. " +
        "Read a file before editing it so that old_str matches exactly.",
      schema: z.object({
        path: z.string().describe('Path relative to the project root, e.g. "src/app/_routes/index.page.tsx".'),
      }),
      async run({ path }) {
        const lines = (await readExisting(ws, resolveReadablePath(path))).split("\n");
        const numbered = lines
          .slice(0, MAX_READ_LINES)
          .map((line, index) => `${String(index + 1).padStart(5)}\t${line}`)
          .join("\n");
        return lines.length > MAX_READ_LINES ? `${numbered}\n… ${lines.length - MAX_READ_LINES} more lines` : numbered;
      },
    }),

    define({
      name: "edit_file",
      description:
        "Replace one exact piece of text in a file under src/ or public/. old_str must appear exactly once, " +
        "with the same whitespace, and without read_file's line-number prefixes. " +
        "Use an empty old_str to create a new file with new_str as its content. The preview reloads after each edit.",
      schema: z.object({
        path: z.string().describe("Path relative to the project root."),
        old_str: z.string().describe("The exact text to replace, or empty to create a new file."),
        new_str: z.string().describe("The replacement text, or the new file's content."),
      }),
      async run({ path, old_str, new_str }) {
        const resolved = resolveEditablePath(path);
        return ctx.exclusive(async () => {
          const content = await ws.readFile(resolved);
          if (old_str === "") {
            if (content !== null) throw new WorkspaceError(`${resolved} already exists. Pass the text to replace in old_str.`);
            await ws.writeFile(resolved, new_str);
            ctx.filesChanged.add(resolved);
            return `Created ${resolved}.`;
          }
          if (content === null) throw new WorkspaceError(`${resolved} does not exist. Use list_files to see the project files.`);
          const occurrences = content.split(old_str).length - 1;
          if (occurrences === 0) throw new WorkspaceError(`old_str was not found in ${resolved}. Read the file again and copy the text exactly.`);
          if (occurrences > 1) throw new WorkspaceError(`old_str occurs ${occurrences} times in ${resolved}. Include more surrounding lines.`);
          // A function replacement keeps "$&" and friends in new_str literal.
          await ws.writeFile(resolved, content.replace(old_str, () => new_str));
          ctx.filesChanged.add(resolved);
          return `Edited ${resolved}.`;
        });
      },
    }),

    define({
      name: "check",
      description: "Type-check the project and report errors the dev server logged since the last check. Run it after a series of edits.",
      schema: z.object({}),
      async run() {
        return formatCheck(await ws.check());
      },
    }),

    define({
      name: "finish",
      description:
        "Call this once the request is done, with the message for the site owner. " +
        "It checks the project first: if it reports errors, fix them and call finish again.",
      schema: z.object({
        reply: z.string().describe("What changed on the site, for the owner: one to three short sentences, in their language, no code."),
      }),
      async run({ reply }) {
        if (ctx.filesChanged.size === 0) {
          ctx.finished = { reply, clean: true };
          return "Done.";
        }
        const result = await ws.check();
        if (result.ok) {
          ctx.finished = { reply, clean: true };
          return "Done: the project has no errors.";
        }
        if (ctx.autoFixes >= ctx.maxAutoFixes) {
          ctx.finished = { reply, clean: false };
          return `Stopped with errors remaining:\n\n${formatCheck(result)}`;
        }
        ctx.autoFixes++;
        return `Not finished: the project has errors. Fix them, then call finish again.\n\n${formatCheck(result)}`;
      },
    }),
  ];

  /** Validates the model's arguments, runs the tool, and reports both ends to the dashboard. */
  function define<S extends z.ZodObject>(tool: {
    name: string;
    description: string;
    schema: S;
    run(input: z.infer<S>): Promise<string>;
  }): AgentTool {
    return {
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      async execute(input) {
        const id = randomUUID();
        const step = ctx.step;
        const started = Date.now();
        hooks.onCall({ id, step, name: tool.name, input });
        let outcome: ToolOutcome;
        const parsed = tool.schema.safeParse(input ?? {});
        if (!parsed.success) {
          outcome = { output: `Invalid arguments: ${z.prettifyError(parsed.error)}`, isError: true };
        } else {
          try {
            outcome = { output: await tool.run(parsed.data), isError: false };
          } catch (cause) {
            if (!(cause instanceof WorkspaceError)) console.error(`Tool ${tool.name} failed`, cause);
            outcome = { output: cause instanceof Error ? cause.message : String(cause), isError: true };
          }
        }
        hooks.onResult({ id, step, name: tool.name, ...outcome, durationMs: Date.now() - started });
        return outcome;
      },
    };
  }

  return definitions;
}

async function readExisting(ws: SiteWorkspace, path: string): Promise<string> {
  const content = await ws.readFile(path);
  if (content === null) throw new WorkspaceError(`${path} does not exist. Use list_files to see the project files.`);
  return content;
}

function formatCheck(result: CheckResult): string {
  if (result.ok) return "No errors: the project type-checks and the dev server reported nothing.";
  const sections: string[] = [];
  if (result.typecheck) sections.push(`TypeScript errors:\n${result.typecheck}`);
  if (result.devServer) sections.push(`Dev server errors:\n${result.devServer}`);
  return sections.join("\n\n");
}
