# The agent loop

A model only reads text and writes text. It does not see your files, cannot run anything, and remembers nothing between two calls. An agent adds three things around it:

- **tools** it can ask for (function calling: the model never runs them, it asks),
- **a loop** that runs what it asked for and sends the results back, again and again,
- **guardrails** that decide when to stop.

## The hand-written loop

[`engines/manual-loop.ts`](../server/src/agent/engines/manual-loop.ts), simplified:

```ts
const contents = [{ role: "user", parts: [{ text: message }] }];

for (let step = 0; step < maxSteps; step++) {
  // 1. Ask the model
  const res = await ai.models.generateContent({ model, contents, config });
  contents.push(res.candidates[0].content);

  // 2. No function call: it is done
  const calls = res.functionCalls ?? [];
  if (calls.length === 0) return;

  // 3. Run every tool it asked for and send the results back, in one turn
  contents.push({ role: "user", parts: await runTools(calls) });

  // 4. Our guardrails
  if (shouldStop()) return;
}
```

`contents` is the agent’s whole memory: an array of messages sent in full on every call. Tool results go back with the role `user`: to the model, it is the outside world answering.

A real run looks like this:

```
[1] user   « A landing page for Kora… »
[2] model  "I’ll look at the project."  + functionCall list_files()
[3] user   functionResponse → "src/app/_routes/index.page.tsx …"
[4] model  functionCall read_file(index.page.tsx)
[5] user   functionResponse → the file
[6] model  functionCall write_file(src/components/landing/hero.tsx, …)
[7] user   functionResponse → "Created. No syntax errors."
[8] model  functionCall check()
[9] user   functionResponse → "1 error: Cannot find name 'Hero'"
[10] model functionCall edit_file(index.page.tsx, add the import)
[11] user  functionResponse → "Edited. No syntax errors."
[12] model functionCall finish("Your landing page is ready…")
```

Self-correction is nothing magic: at step 9 the error is just text in `contents`, and the next call reads it like everything else.

Two details that matter with Gemini:

- **Keep the model’s turn as it was sent.** Gemini 3 returns thought signatures with its function calls and needs them back, so the engine pushes the candidate content untouched.
- **Several calls per turn.** A reply can hold several `functionCall`s. Run them all, then send all the results in one message.

## The same agent on the Vercel AI SDK

[`engines/ai-sdk.ts`](../server/src/agent/engines/ai-sdk.ts) hands the same tools to `ToolLoopAgent` and says when to stop:

```ts
const agent = new ToolLoopAgent({
  model: google(model),
  instructions: system,
  tools,
  stopWhen: [() => shouldStop(), isStepCount(maxSteps)],
});
await agent.generate({ messages });
```

It runs the same four steps. A framework is this loop, already written.

## One interface for both

```ts
interface AgentEngine {
  id: "manual" | "ai-sdk";
  run(options: {
    model: string; system: string; history: Turn[]; message: string;
    tools: AgentTool[]; maxSteps: number;
    shouldStop(): boolean; signal: AbortSignal;
    onModelResponse(response: { text: string; toolCalls: number; usage: Usage; durationMs: number }): void;
  }): Promise<void>;
}
```

The runner reports `onModelResponse` before the tools of that step run, in both engines (the AI SDK one uses `onLanguageModelCallEnd`), so the dashboard timeline reads the same whichever loop runs.

## When does a run stop?

| Reason | When |
|---|---|
| `finish` | `finish` was called and the project has no errors |
| `answered` | the model replied without calling a tool |
| `budget` | the estimated cost reached the run’s budget |
| `max_steps` | the step limit was reached |
| `stopped` | the user pressed Stop |
| `error` | the API or an engine failed |

## Memory between requests

The conversation is not replayed in full on the next request. Each earlier exchange is kept as two lines of plain text, the request and the agent’s final reply (the last 5 exchanges). The current task gets everything.
