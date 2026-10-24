import { randomUUID } from "node:crypto";
import { z } from "zod";
import { looksLineNumbered, syntaxCheck } from "../site/diagnostics.ts";
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
        "Read a project file, exactly as it is on disk. Pass start_line and end_line to read part of a long file, " +
        "for example around a line an error points to. Read a file before editing it so that old_str matches exactly.",
      schema: z.object({
        path: z.string().describe('Path relative to the project root, e.g. "src/app/_routes/index.page.tsx".'),
        start_line: z.number().int().min(1).optional().describe("First line to read, from 1. Default: 1."),
        end_line: z.number().int().min(1).optional().describe("Last line to read. Default: the end of the file."),
      }),
      async run({ path, start_line, end_line }) {
        const resolved = resolveReadablePath(path);
        const lines = (await readExisting(ws, resolved)).split("\n");
        const start = Math.min(start_line ?? 1, lines.length);
        const end = Math.min(end_line ?? lines.length, lines.length, start + MAX_READ_LINES - 1);
        // No per-line numbers: models copy them back into the code. The range goes in a header instead.
        const header =
          start === 1 && end === lines.length
            ? `${resolved} (${lines.length} lines)`
            : `${resolved} (lines ${start}-${end} of ${lines.length})`;
        return `${header}\n${lines.slice(start - 1, end).join("\n")}`;
      },
    }),

    define({
      name: "edit_file",
      description:
        "Replace one exact piece of text in a file under src/ or public/. old_str must appear exactly once, " +
        "with the same whitespace and indentation. Keep edits small: a few lines of old_str, with enough context to be unique. " +
        "The result reports any syntax error the edit introduced. The preview reloads after each edit.",
      schema: z.object({
        path: z.string().describe("Path relative to the project root."),
        old_str: z.string().describe("The exact text to replace, copied from the file."),
        new_str: z.string().describe("The replacement text. Empty to delete old_str."),
      }),
      async run({ path, old_str, new_str }) {
        const resolved = resolveEditablePath(path);
        if (old_str === "") throw new WorkspaceError("old_str is empty. To create or rewrite a whole file, use write_file.");
        rejectLineNumbers(new_str);
        return ctx.exclusive(async () => {
          const content = await readExisting(ws, resolved);
          const occurrences = content.split(old_str).length - 1;
          if (occurrences === 0) throw new WorkspaceError(`old_str was not found in ${resolved}. Read the file again and copy the text exactly.`);
          if (occurrences > 1) throw new WorkspaceError(`old_str occurs ${occurrences} times in ${resolved}. Include more surrounding lines.`);
          // A function replacement keeps "$&" and friends in new_str literal.
          const updated = content.replace(old_str, () => new_str);
          await ws.writeFile(resolved, updated);
          ctx.filesChanged.add(resolved);
          return withSyntax(`Edited ${resolved}.`, await syntaxCheck(resolved, updated));
        });
      },
    }),

    define({
      name: "write_file",
      description:
        "Create a file under src/ or public/, or replace a whole file. Use it for new files, and to rewrite a file " +
        "that is badly broken instead of patching it line by line. content is the complete file. " +
        "The result reports any syntax error in it.",
      schema: z.object({
        path: z.string().describe("Path relative to the project root."),
        content: z.string().describe("The complete file content."),
      }),
      async run({ path, content }) {
        const resolved = resolveEditablePath(path);
        rejectLineNumbers(content);
        return ctx.exclusive(async () => {
          const existed = (await ws.readFile(resolved)) !== null;
          await ws.writeFile(resolved, content);
          ctx.filesChanged.add(resolved);
          return withSyntax(`${existed ? "Rewrote" : "Created"} ${resolved}.`, await syntaxCheck(resolved, content));
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

/** Refuses code that carries a line-number gutter copied from read_file or check output. */
function rejectLineNumbers(text: string): void {
  if (looksLineNumbered(text)) {
    throw new WorkspaceError(
      'Nothing was written: most lines start with a line number (like "  12 | " or "  12<tab>"). ' +
        "Those numbers come from error excerpts and are not part of the file. Send the code without them.",
    );
  }
}

function withSyntax(done: string, syntax: string): string {
  return syntax ? `${done} But the file now has a syntax error. Fix it before anything else:\n\n${syntax}` : `${done} No syntax errors.`;
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
