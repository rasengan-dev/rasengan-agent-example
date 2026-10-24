import ts from "typescript";

/**
 * Turns compiler output into something a small model can act on: the first
 * errors (later ones usually cascade from them), the source around the first
 * one, and a count of the rest.
 */

const SHOWN_ERRORS = 8;
const CONTEXT_LINES = 3;

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
}

const TSC_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+: .*)$/;

export function parseTsc(output: string): Diagnostic[] {
  return output.split("\n").flatMap((line) => {
    const match = TSC_LINE.exec(line.trim());
    return match ? [{ file: match[1]!, line: Number(match[2]), column: Number(match[3]), message: match[4]! }] : [];
  });
}

/** `source(path)` returns a file's text, to quote the code around the first error. */
export async function formatDiagnostics(diagnostics: Diagnostic[], source: (path: string) => Promise<string | null>): Promise<string> {
  if (diagnostics.length === 0) return "";
  const first = diagnostics[0]!;
  const lines = [`${diagnostics.length} error${diagnostics.length === 1 ? "" : "s"}. Fix the first one first: the others often follow from it.`];
  for (const item of diagnostics.slice(0, SHOWN_ERRORS)) lines.push(`${item.file}:${item.line}:${item.column} ${item.message}`);
  if (diagnostics.length > SHOWN_ERRORS) lines.push(`… and ${diagnostics.length - SHOWN_ERRORS} more.`);

  const text = await source(first.file);
  if (text !== null) lines.push("", `Around ${first.file}:${first.line}:`, excerpt(text, first.line, first.column));
  return lines.join("\n");
}

/** A few lines around `line`, with a marker under the column. Line numbers are in a gutter, not part of the code. */
function excerpt(text: string, line: number, column: number): string {
  const all = text.split("\n");
  const start = Math.max(1, line - CONTEXT_LINES);
  const end = Math.min(all.length, line + CONTEXT_LINES);
  const out: string[] = [];
  for (let number = start; number <= end; number++) {
    out.push(`${number === line ? ">" : " "}${String(number).padStart(5)} | ${all[number - 1]}`);
    if (number === line) out.push(`       | ${" ".repeat(Math.max(0, column - 1))}^`);
  }
  return out.join("\n");
}

const SCRIPT = /\.(m?[jt]sx?)$/;

/**
 * Syntax errors only (no types), in a few milliseconds: run after every write
 * so a broken edit is caught on the step that made it.
 */
export async function syntaxCheck(path: string, content: string): Promise<string> {
  if (!SCRIPT.test(path)) return "";
  const result = ts.transpileModule(content, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const diagnostics: Diagnostic[] = (result.diagnostics ?? []).flatMap((diagnostic) => {
    if (diagnostic.start === undefined || !diagnostic.file) return [];
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return [
      {
        file: path,
        line: position.line + 1,
        column: position.character + 1,
        message: `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      },
    ];
  });
  return formatDiagnostics(diagnostics, async () => content);
}

/**
 * True when most lines start with a line-number gutter like "   12\t" or "   12 | ":
 * the model pasted read_file or check output into the code.
 */
export function looksLineNumbered(text: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 3) return false;
  const numbered = lines.filter((line) => /^\s*>?\s*\d+(\t| \| )/.test(line)).length;
  return numbered / lines.length > 0.5;
}
