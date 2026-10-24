import type { Usage } from "./events.ts";

/**
 * USD per million tokens, Standard tier. gemini-3.8-flash is on its introductory
 * rate until 2026-12-31 (then 1.50 / 0.15 / 7.50). Add the other models you use
 * from https://ai.google.dev/gemini-api/docs/pricing.
 */
const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, cachedInput: 0.075, output: 3.75 },
};

/** Unknown models are estimated at gemini-3.8-flash rates. */
export function costUsd(model: string, usage: Usage): number {
  const price = PRICES[model] ?? PRICES["gemini-3.8-flash"]!;
  const uncached = Math.max(0, usage.input - usage.cached);
  return (uncached * price.input + usage.cached * price.cachedInput + usage.output * price.output) / 1_000_000;
}
