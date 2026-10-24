import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative } from "node:path";
import { formatDiagnostics, parseTsc } from "./diagnostics.ts";

/** An error the model can act on: tools return its message instead of crashing the run. */
export class WorkspaceError extends Error {}

export interface CheckResult {
  ok: boolean;
  /** `tsc --noEmit` output, empty when clean. */
  typecheck: string;
  /** Error lines the dev server logged since the previous check. */
  devServer: string;
}

export type PreviewStatus = "starting" | "ready" | "crashed" | "stopped";

const EDITABLE_ROOTS = ["src", "public"];
const FORBIDDEN_SEGMENTS = new Set(["node_modules", ".rasengan", "dist", ".git"]);
const MAX_LOG_CHARS = 200_000;
const MAX_REPORTED_LINES = 15;
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Normalizes a model-supplied path and rejects anything outside the site. */
export function resolveReadablePath(input: string): string {
  const trimmed = input.trim().replace(/^\.\//, "");
  if (trimmed === "" || posix.isAbsolute(trimmed)) {
    throw new WorkspaceError(`Use a path relative to the project root, e.g. "src/app/_routes/index.page.tsx".`);
  }
  const normalized = posix.normalize(trimmed);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new WorkspaceError(`"${input}" is outside the project.`);
  }
  if (normalized.split("/").some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    throw new WorkspaceError(`"${input}" is not part of the project sources.`);
  }
  return normalized;
}

/** Like resolveReadablePath, but only src/ and public/ may be changed. */
export function resolveEditablePath(input: string): string {
  const path = resolveReadablePath(input);
  if (!EDITABLE_ROOTS.some((root) => path.startsWith(`${root}/`))) {
    throw new WorkspaceError(`Only files under src/ and public/ can be changed; "${path}" is read-only.`);
  }
  return path;
}

/**
 * The Rasengan site on disk and its `rasengan dev` process. The container is
 * the sandbox: the agent only reaches it through these methods.
 */
export class SiteWorkspace {
  #devServer: ChildProcess | undefined;
  #status: PreviewStatus = "stopped";
  #log = "";
  /** Characters of #log already reported by check(). */
  #logOffset = 0;

  constructor(
    readonly siteDir: string,
    readonly templateDir: string,
    readonly previewPort: number,
    private readonly onChange: (path: string) => void,
  ) {}

  get status(): PreviewStatus {
    return this.#status;
  }

  /** Creates the site from the template and installs its dependencies, once. */
  async ensure(): Promise<void> {
    if (!existsSync(join(this.siteDir, "package.json"))) {
      console.log(`Creating the site in ${this.siteDir}`);
      await mkdir(this.siteDir, { recursive: true });
      await cp(this.templateDir, this.siteDir, {
        recursive: true,
        filter: (source) => !source.includes(`${this.templateDir}/node_modules`),
      });
    }
    // A bind-mounted src/ starts empty: fill it from the template.
    for (const root of EDITABLE_ROOTS) {
      const target = join(this.siteDir, root);
      if (!existsSync(target) || (await readdir(target)).length === 0) {
        await cp(join(this.templateDir, root), target, { recursive: true });
      }
    }
    if (!existsSync(join(this.siteDir, "node_modules"))) {
      console.log("Installing the site's dependencies (first start only)…");
      const install = await run("npm", ["install", "--no-audit", "--no-fund"], this.siteDir);
      if (install.code !== 0) throw new Error(`npm install failed:\n${install.output}`);
    }
  }

  async startDevServer(): Promise<void> {
    if (this.#devServer) return;
    this.#status = "starting";
    const child = spawn(join(this.siteDir, "node_modules/.bin/rasengan"), ["dev"], {
      cwd: this.siteDir,
      env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.#devServer = child;
    const append = (chunk: Buffer) => this.#appendLog(chunk.toString());
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("exit", (code) => {
      this.#devServer = undefined;
      this.#status = code === 0 || code === null ? "stopped" : "crashed";
      this.#appendLog(`\n[rasengan dev exited with code ${code}]\n`);
    });

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && this.#devServer === child) {
      if (await this.#devServerAnswers()) {
        this.#status = "ready";
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (this.#devServer === child) this.#status = "crashed";
  }

  stopDevServer(): void {
    this.#devServer?.kill();
  }

  /** Files under src/ and public/, relative to the site root, sorted. */
  async listFiles(): Promise<string[]> {
    const files: string[] = [];
    for (const root of EDITABLE_ROOTS) {
      const dir = join(this.siteDir, root);
      if (!existsSync(dir)) continue;
      for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) files.push(relative(this.siteDir, join(entry.parentPath, entry.name)).split("\\").join("/"));
      }
    }
    return files.sort();
  }

  /** null when the file does not exist. */
  async readFile(path: string): Promise<string | null> {
    try {
      return await readFile(join(this.siteDir, path), "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT" || (cause as NodeJS.ErrnoException).code === "EISDIR") return null;
      throw cause;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const target = join(this.siteDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    this.onChange(path);
  }

  /** Type-checks the site and collects the dev server's errors since the last check. */
  async check(): Promise<CheckResult> {
    // Vite needs a moment to pick up the last write before its errors show in the log.
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (this.#devServer) await this.#devServerAnswers();

    const tsc = await run(join(this.siteDir, "node_modules/.bin/tsc"), ["--noEmit", "-p", "."], this.siteDir);
    let typecheck = "";
    if (tsc.code !== 0) {
      const diagnostics = parseTsc(tsc.output);
      typecheck =
        diagnostics.length > 0
          ? await formatDiagnostics(diagnostics, (path) => this.readFile(path))
          : firstLines(tsc.output.trim());
    }

    const fresh = this.#log.slice(this.#logOffset);
    this.#logOffset = this.#log.length;
    // The dev server repeats the same error (and stack) on every request: keep each line once.
    const devServer = firstLines(
      [...new Set(fresh.split("\n").map((line) => line.replace(/^\S+Z \[Futon\] /, "").trim()))]
        .filter((line) => /error|failed|✘/i.test(line) && !/^at /.test(line))
        .join("\n"),
    );
    return { ok: typecheck === "" && devServer === "", typecheck, devServer };
  }

  /** Puts src/ and public/ back to the template's. */
  async reset(): Promise<void> {
    for (const root of EDITABLE_ROOTS) {
      const target = join(this.siteDir, root);
      // Empty the folder rather than remove it: it may be a bind mount.
      if (existsSync(target)) {
        for (const entry of await readdir(target)) await rm(join(target, entry), { recursive: true, force: true });
      }
      await cp(join(this.templateDir, root), target, { recursive: true });
    }
    this.#logOffset = this.#log.length;
  }

  logTail(maxChars = 20_000): string {
    return this.#log.slice(-maxChars);
  }

  #appendLog(text: string): void {
    this.#log += text.replace(ANSI, "");
    if (this.#log.length > MAX_LOG_CHARS) {
      const drop = this.#log.length - MAX_LOG_CHARS;
      this.#log = this.#log.slice(drop);
      this.#logOffset = Math.max(0, this.#logOffset - drop);
    }
  }

  async #devServerAnswers(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.previewPort}/`, { signal: AbortSignal.timeout(5_000) });
      await response.body?.cancel();
      return true;
    } catch {
      return false;
    }
  }
}

function run(command: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, FORCE_COLOR: "0" } });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output: output.replace(ANSI, "") }));
  });
}

/** The first lines: with compiler errors, the root cause comes first. */
function firstLines(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  return lines.length > MAX_REPORTED_LINES
    ? [...lines.slice(0, MAX_REPORTED_LINES), `… ${lines.length - MAX_REPORTED_LINES} more lines`].join("\n")
    : lines.join("\n");
}
