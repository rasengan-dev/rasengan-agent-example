/**
 * Everything the dashboard sees. Both engines produce the same events, so the
 * UI never knows which one ran.
 */

export type EngineId = "manual" | "ai-sdk";

export interface Usage {
  /** Prompt tokens, cached ones included. */
  input: number;
  /** Prompt tokens read from Gemini's cache. */
  cached: number;
  /** Generated tokens, thinking included. */
  output: number;
}

export type StopReason = "finish" | "answered" | "budget" | "max_steps" | "stopped" | "error";

export type AgentEvent =
  | { type: "run_started"; runId: string; engine: EngineId; model: string; message: string; budgetUsd: number; maxSteps: number; at: number }
  /** One model call. Sent before the tools it asked for run. */
  | {
      type: "model_response";
      runId: string;
      step: number;
      text: string;
      toolCalls: number;
      usage: Usage;
      costUsd: number;
      totalCostUsd: number;
      durationMs: number;
      /** Messages the model received; only the hand-written loop knows it. */
      contextSize?: number;
    }
  | { type: "tool_call"; runId: string; step: number; id: string; name: string; input: unknown }
  | { type: "tool_result"; runId: string; step: number; id: string; name: string; output: string; isError: boolean; durationMs: number }
  | { type: "run_finished"; runId: string; reason: StopReason; reply: string | null; totalCostUsd: number; steps: number }
  | { type: "run_error"; runId: string; message: string }
  | { type: "site_changed"; path: string }
  | { type: "reset" };

type Listener = (event: AgentEvent) => void;

/** The session's event history, replayed to every dashboard that connects. */
export class EventLog {
  #events: AgentEvent[] = [];
  #listeners = new Set<Listener>();

  get events(): readonly AgentEvent[] {
    return this.#events;
  }

  emit(event: AgentEvent): void {
    this.#events.push(event);
    for (const listener of this.#listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear(): void {
    this.#events = [];
    this.emit({ type: "reset" });
  }
}
