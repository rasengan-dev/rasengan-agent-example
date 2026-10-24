import type { EngineId } from "../events.ts";
import { aiSdk } from "./ai-sdk.ts";
import { manualLoop } from "./manual-loop.ts";
import type { AgentEngine } from "./types.ts";

export const ENGINES: Record<EngineId, AgentEngine> = {
  manual: manualLoop,
  "ai-sdk": aiSdk,
};

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === "string" && value in ENGINES;
}

export type { AgentEngine, Turn } from "./types.ts";
