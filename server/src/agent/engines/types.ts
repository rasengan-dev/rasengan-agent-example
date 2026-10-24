import type { EngineId, Usage } from "../events.ts";
import type { AgentTool } from "../tools.ts";

/** An earlier exchange, kept as plain text: the request and the agent's reply. */
export interface Turn {
  role: "user" | "model";
  text: string;
}

/** What an engine reports after each model call, before running the tools it asked for. */
export interface ModelResponse {
  text: string;
  toolCalls: number;
  usage: Usage;
  durationMs: number;
  contextSize?: number;
}

export interface EngineRunOptions {
  apiKey: string;
  model: string;
  system: string;
  history: Turn[];
  message: string;
  tools: AgentTool[];
  maxSteps: number;
  /** True once finish succeeded or the budget is spent. Checked after each step. */
  shouldStop(): boolean;
  signal: AbortSignal;
  onModelResponse(response: ModelResponse): void;
}

/**
 * The contract both engines implement. Everything else (tools, guardrails,
 * events, the dashboard) is shared: an engine only runs the loop.
 */
export interface AgentEngine {
  id: EngineId;
  label: string;
  /** Shown in the dashboard so the audience knows which file is running. */
  file: string;
  run(options: EngineRunOptions): Promise<void>;
}
