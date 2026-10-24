import { randomUUID } from "node:crypto";
import type { SiteWorkspace } from "../site/workspace.ts";
import { ENGINES, type Turn } from "./engines/index.ts";
import type { EngineId, EventLog, StopReason } from "./events.ts";
import { costUsd } from "./pricing.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import { RunContext, createTools } from "./tools.ts";

export interface RunRequest {
  message: string;
  engine: EngineId;
  model: string;
  budgetUsd: number;
  maxSteps: number;
}

/** Earlier exchanges sent back to the model as plain text. */
const MAX_HISTORY_TURNS = 10;
/** Times finish sends failing checks back before giving up. */
const MAX_AUTO_FIXES = 3;
/** Tool output shown in the dashboard; the model always gets all of it. */
const MAX_UI_OUTPUT = 4_000;

/**
 * Runs one request at a time with the chosen engine, and turns what happens
 * into events. Guardrails live here, not in the engines: budget, step limit,
 * and the Stop button.
 */
export class AgentRunner {
  #history: Turn[] = [];
  #current: { id: string; controller: AbortController } | undefined;

  constructor(
    private readonly workspace: SiteWorkspace,
    private readonly log: EventLog,
    private readonly apiKey: string,
  ) {}

  get running(): boolean {
    return this.#current !== undefined;
  }

  /** Starts a run in the background and returns its id. */
  start(request: RunRequest): string {
    if (this.#current) throw new Error("The agent is already working on a request.");
    const id = randomUUID();
    const controller = new AbortController();
    this.#current = { id, controller };
    void this.#execute(id, request, controller.signal).finally(() => {
      if (this.#current?.id === id) this.#current = undefined;
    });
    return id;
  }

  stop(): void {
    this.#current?.controller.abort();
  }

  /** Forgets the conversation (the site itself is reset by the workspace). */
  reset(): void {
    this.stop();
    this.#history = [];
  }

  async #execute(runId: string, request: RunRequest, signal: AbortSignal): Promise<void> {
    const engine = ENGINES[request.engine];
    const ctx = new RunContext(this.workspace, MAX_AUTO_FIXES);
    let totalCostUsd = 0;
    let lastText = "";
    let failed = false;

    const tools = createTools(ctx, {
      onCall: (call) => this.log.emit({ type: "tool_call", runId, ...call }),
      onResult: (result) =>
        this.log.emit({
          type: "tool_result",
          runId,
          ...result,
          output: result.output.length > MAX_UI_OUTPUT ? `${result.output.slice(0, MAX_UI_OUTPUT)}\n…` : result.output,
        }),
    });

    this.log.emit({
      type: "run_started",
      runId,
      engine: engine.id,
      model: request.model,
      message: request.message,
      budgetUsd: request.budgetUsd,
      maxSteps: request.maxSteps,
      at: Date.now(),
    });

    try {
      await engine.run({
        apiKey: this.apiKey,
        model: request.model,
        system: SYSTEM_PROMPT,
        history: this.#history,
        message: request.message,
        tools,
        maxSteps: request.maxSteps,
        signal,
        shouldStop: () => ctx.finished !== undefined || totalCostUsd >= request.budgetUsd,
        onModelResponse: (response) => {
          ctx.step++;
          const stepCost = costUsd(request.model, response.usage);
          totalCostUsd += stepCost;
          if (response.text) lastText = response.text;
          this.log.emit({ type: "model_response", runId, step: ctx.step, ...response, costUsd: stepCost, totalCostUsd });
        },
      });
    } catch (cause) {
      if (!signal.aborted) {
        failed = true;
        console.error("Agent run failed", cause);
        this.log.emit({ type: "run_error", runId, message: errorMessage(cause) });
      }
    }

    const reason: StopReason = ctx.finished
      ? "finish"
      : signal.aborted
        ? "stopped"
        : failed
          ? "error"
        : totalCostUsd >= request.budgetUsd
          ? "budget"
          : ctx.step >= request.maxSteps
            ? "max_steps"
            : "answered";
    const reply = ctx.finished?.reply ?? (reason === "answered" && lastText ? lastText : null);

    this.#history.push({ role: "user", text: request.message }, { role: "model", text: reply ?? `(The run ended early: ${reason}.)` });
    this.#history = this.#history.slice(-MAX_HISTORY_TURNS);

    this.log.emit({ type: "run_finished", runId, reason, reply, totalCostUsd, steps: ctx.step });
  }
}

/** The Google Gen AI SDK puts the API's JSON error body in the message: show its text. */
function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  try {
    const body = JSON.parse(message) as { error?: { message?: string } };
    return body.error?.message ?? message;
  } catch {
    return message;
  }
}
