import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponseUsageMetadata, type Part } from "@google/genai";
import { z } from "zod";
import type { Usage } from "../events.ts";
import type { AgentEngine } from "./types.ts";

/**
 * The whole agent loop, by hand, on the raw Google Gen AI SDK:
 *
 *   1. send the conversation and the tool list to Gemini
 *   2. if the reply contains function calls, run them in the container
 *   3. append the results to the conversation and go back to 1
 *   4. stop when Gemini answers without calling a function
 */
export const manualLoop: AgentEngine = {
  id: "manual",
  label: "Hand-written loop",
  file: "engines/manual-loop.ts",

  async run({ apiKey, model, system, history, message, tools, maxSteps, shouldStop, signal, onModelResponse }) {
    const ai = new GoogleGenAI({ apiKey });

    // What the model knows about our tools: a name, a description, a JSON schema.
    const functionDeclarations = tools.map((tool) => {
      const { $schema: _, ...parametersJsonSchema } = z.toJSONSchema(tool.schema);
      return { name: tool.name, description: tool.description, parametersJsonSchema };
    });

    // The conversation. Gemini only knows what we send it, every single time.
    const contents: Content[] = [
      ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      { role: "user", parts: [{ text: message }] },
    ];

    for (let step = 0; step < maxSteps; step++) {
      // 1. Ask the model.
      const started = Date.now();
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: system,
          tools: [{ functionDeclarations }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: signal,
        },
      });

      const reply = response.candidates?.[0]?.content;
      if (!reply?.parts) throw new Error(`Gemini returned no content (finish reason: ${response.candidates?.[0]?.finishReason ?? "unknown"}).`);
      // Keep the model's turn exactly as sent: Gemini needs its thought signatures back.
      contents.push(reply);

      const calls = reply.parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
      onModelResponse({
        text: textOf(reply.parts),
        toolCalls: calls.length,
        usage: usageOf(response.usageMetadata),
        durationMs: Date.now() - started,
        contextSize: contents.length - 1,
      });

      // 2. No function call: the model is done.
      if (calls.length === 0) return;

      // 3. Run each tool it asked for and send the results back, in one user turn.
      const results: Part[] = [];
      for (const call of calls) {
        const tool = tools.find((candidate) => candidate.name === call.name);
        const outcome = tool
          ? await tool.execute(call.args ?? {})
          : { output: `There is no tool named ${call.name}.`, isError: true };
        results.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: outcome.isError ? { error: outcome.output } : { output: outcome.output },
          },
        });
      }
      contents.push({ role: "user", parts: results });

      // 4. Our guardrails: finish succeeded, or the budget is spent.
      if (shouldStop() || signal.aborted) return;
    }
  },
};

/** The visible text of a reply, without Gemini's thought summaries. */
function textOf(parts: Part[]): string {
  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}

function usageOf(metadata: GenerateContentResponseUsageMetadata | undefined): Usage {
  return {
    input: metadata?.promptTokenCount ?? 0,
    cached: metadata?.cachedContentTokenCount ?? 0,
    output: (metadata?.candidatesTokenCount ?? 0) + (metadata?.thoughtsTokenCount ?? 0),
  };
}
