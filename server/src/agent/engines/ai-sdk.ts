import { createGoogleGenerativeAI, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { ToolLoopAgent, isStepCount, tool, type ModelMessage, type ToolSet } from "ai";
import type { AgentEngine } from "./types.ts";

/**
 * The same agent on the Vercel AI SDK: ToolLoopAgent runs the loop that
 * manual-loop.ts writes by hand. We only hand it the tools and when to stop.
 */
export const aiSdk: AgentEngine = {
  id: "ai-sdk",
  label: "Vercel AI SDK",
  file: "engines/ai-sdk.ts",

  async run({ apiKey, model, system, history, message, tools, maxSteps, shouldStop, signal, onModelResponse }) {
    const google = createGoogleGenerativeAI({ apiKey });

    const toolSet: ToolSet = Object.fromEntries(
      tools.map((agentTool) => [
        agentTool.name,
        tool({
          description: agentTool.description,
          inputSchema: agentTool.schema,
          async execute(input) {
            const outcome = await agentTool.execute(input);
            // A thrown error goes back to the model as a tool error.
            if (outcome.isError) throw new Error(outcome.output);
            return outcome.output;
          },
        }),
      ]),
    );

    let started = Date.now();
    const agent = new ToolLoopAgent({
      model: google(model),
      instructions: system,
      tools: toolSet,
      stopWhen: [() => shouldStop(), isStepCount(maxSteps)],
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: "low" } } satisfies GoogleLanguageModelOptions,
      },
      onLanguageModelCallStart: () => {
        started = Date.now();
      },
      // Fires after each model call, before its tools run: same order as the hand-written loop.
      onLanguageModelCallEnd: (event) => {
        onModelResponse({
          text: event.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("").trim(),
          toolCalls: event.content.filter((part) => part.type === "tool-call").length,
          usage: {
            input: event.usage.inputTokens ?? 0,
            cached: event.usage.inputTokenDetails.cacheReadTokens ?? 0,
            output: event.usage.outputTokens ?? 0,
          },
          durationMs: Date.now() - started,
        });
      },
    });

    const messages: ModelMessage[] = [
      ...history.map((turn): ModelMessage =>
        turn.role === "user" ? { role: "user", content: turn.text } : { role: "assistant", content: turn.text },
      ),
      { role: "user", content: message },
    ];
    await agent.generate({ messages, abortSignal: signal });
  },
};
