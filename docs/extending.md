# Extending the agent

## Add a tool

1. In [`server/src/agent/tools.ts`](../server/src/agent/tools.ts), add a `define({...})` entry to `createTools`:

   ```ts
   define({
     name: "search_files",
     description: "Search the project for a text. Returns matching lines as path:line: text, at most 50.",
     schema: z.object({
       query: z.string().describe("The text to look for."),
     }),
     async run({ query }) {
       // …return a short, readable string
     },
   }),
   ```

2. That is all: both engines pick it up, and the dashboard shows its calls in the timeline.

Write the description for the model: when to use the tool, what it returns, and what it does not do. Keep outputs short and errors actionable (see [Tools](tools.md#designing-tools-an-agent-can-recover-with)). Any error a tool throws goes back to the model as its message. Throw a `WorkspaceError` for the expected ones (bad path, missing file); other errors are also logged on the server.

## Change what the agent builds

The brief is [`server/src/agent/prompt.ts`](../server/src/agent/prompt.ts). To make it build something else (a blog, a dashboard, a portfolio), rewrite the role and the craft sections. Keep the "When something breaks" and "How to finish" sections: they are what lets the agent recover.

The starting point is [`template/`](../template). Change it, then reset the site from the dashboard (or delete `workspace/site`) to start from the new template.

## Add skills

A sketch of how skills could work here:

1. Put each skill in `server/skills/<name>/SKILL.md`, with a `name` and a `description` in its front matter.
2. Add a `load_skill` tool whose description lists every skill’s name and description, and whose `run` returns the body of the one asked for.
3. In the system prompt, tell the agent to load a skill before working on a topic it covers.

Only the list of names and descriptions costs tokens on every call; the bodies are read when needed.

## Add an engine

Implement `AgentEngine` from [`engines/types.ts`](../server/src/agent/engines/types.ts) and register it in [`engines/index.ts`](../server/src/agent/engines/index.ts). Call `onModelResponse` once per model call, before running that call’s tools, and check `shouldStop()` and `signal` between steps. Add its id to `EngineId` in [`events.ts`](../server/src/agent/events.ts) and a label in the dashboard’s engine switch.

## Use another model

The models offered in the dashboard come from `AGENT_MODELS` (see [Configuration](configuration.md)). Both engines talk to Gemini. Another provider means a new engine: for the AI SDK one, swapping `@ai-sdk/google` for another provider package is usually enough.
