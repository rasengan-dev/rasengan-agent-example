# Tools

A tool is a name, a description the model reads to decide when to use it, a zod schema for its arguments, and a function that runs on our side. They are defined once in [`server/src/agent/tools.ts`](../server/src/agent/tools.ts) and converted for each engine: Gemini function declarations (JSON Schema from `z.toJSONSchema`) for the hand-written loop, `tool()` for the AI SDK.

| Tool | Arguments | What it does |
|---|---|---|
| `list_files` | none | Lists every file under `src/` and `public/` |
| `read_file` | `path`, `start_line?`, `end_line?` | Returns a file exactly as it is on disk, or a range of lines |
| `edit_file` | `path`, `old_str`, `new_str` | Replaces one exact passage, then syntax-checks the file |
| `write_file` | `path`, `content` | Creates or rewrites a whole file, then syntax-checks it |
| `check` | none | Runs `tsc --noEmit` and collects the dev server’s errors since the last check |
| `finish` | `reply` | Ends the task with a message for the user, but only if the project has no errors |

Every tool returns text, and never throws: a failure goes back to the model as a result it can act on. Arguments are validated against the schema before the tool runs.

## Designing tools an agent can recover with

The model only sees what your tools send back. Most "the agent got stuck" problems are tool problems, not model problems.

| What traps the agent | What helps it |
|---|---|
| errors buried in hundreds of lines of logs | the first error: the file, the line, and the code around it |
| checking only at the end of the task | lint, types and tests after every change |
| a tool that fails silently | an explicit failure that says what to do next |
| huge outputs: whole files, full logs | filtered, paginated, summarized outputs |
| editing without reading the code | read before writing, targeted edits |
| no way to know when it is done | a success criterion: passing tests, a green build |

How this project applies them:

- **`check` shows the first errors, a count, and an excerpt** of the code around the first one ([`site/diagnostics.ts`](../server/src/site/diagnostics.ts)). Later errors usually cascade from the first.
- **`edit_file` and `write_file` syntax-check the file right after writing it** (TypeScript `transpileModule`, a few milliseconds), so a broken edit is reported on the step that made it.
- **`read_file` returns the file without line numbers.** Models copy what they see: numbered output ends up pasted into the code. Line ranges go in a header instead, and writes that look line-numbered are refused with an explanation.
- **`finish` refuses to end while the project has errors** (up to 3 times, then it stops and reports what is left).
- **Paths are checked** before any read or write: nothing outside the site, nothing in `node_modules`, and writes only under `src/` and `public/`.

## Concurrency

The AI SDK may run the tools of one step in parallel. Edits go through a small queue (`RunContext.exclusive`) so two edits to the same file in one step cannot overwrite each other.
