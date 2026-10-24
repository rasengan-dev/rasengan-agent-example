import { existsSync } from "node:fs";
import { join } from "node:path";
import { Futon, cors, json, logger, staticFiles, type Middleware } from "@rasenganjs/futon";
import { NodeProdAdapter } from "@rasenganjs/runtime/adapters/node";
import { ENGINES, isEngineId } from "./agent/engines/index.ts";
import { EventLog, type AgentEvent } from "./agent/events.ts";
import { AgentRunner } from "./agent/runner.ts";
import { config } from "./config.ts";
import { WorkspaceError, SiteWorkspace, resolveReadablePath } from "./site/workspace.ts";

const log = new EventLog();
const workspace = new SiteWorkspace(config.siteDir, config.templateDir, config.previewPort, (path) =>
  log.emit({ type: "site_changed", path }),
);
const runner = new AgentRunner(workspace, log, config.geminiApiKey);

const app = new Futon();
app.use(logger());
app.use("/api", cors({ origin: config.corsOrigins }));

app.get("/api/state", async () =>
  json({
    engines: Object.values(ENGINES).map(({ id, label, file }) => ({ id, label, file })),
    models: config.models,
    previewUrl: config.previewUrl,
    preview: workspace.status,
    running: runner.running,
    hasApiKey: config.geminiApiKey !== "",
  }),
);

/** Server-Sent Events: the whole session so far, then every new event. */
app.get("/api/events", async () => {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const write = (chunk: string) => {
          // The Node adapter gives no disconnect signal: a long backlog means the client is gone.
          if ((controller.desiredSize ?? 0) < -200) return cleanup();
          controller.enqueue(encoder.encode(chunk));
        };
        const send = (event: AgentEvent) => write(`data: ${JSON.stringify(event)}\n\n`);
        // Node sends the headers with the first chunk: without one, the browser waits for the first event.
        write(": connected\n\n");
        for (const event of log.events) send(event);
        const unsubscribe = log.subscribe(send);
        const heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
        cleanup = () => {
          unsubscribe();
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // already closed
          }
        };
      },
      cancel: () => cleanup(),
    },
    new CountQueuingStrategy({ highWaterMark: 1 }),
  );
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
});

app.post("/api/runs", async (ctx) => {
  if (!config.geminiApiKey) return json({ error: "GEMINI_API_KEY is not set on the server." }, { status: 500 });
  const body = (await ctx.request.json().catch(() => null)) as Record<string, unknown> | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "Write a message for the agent." }, { status: 400 });
  const engine = isEngineId(body?.engine) ? body.engine : "manual";
  const model = typeof body?.model === "string" && config.models.includes(body.model) ? body.model : config.models[0]!;
  const budgetUsd = clamp(Number(body?.budgetUsd ?? 0.5), 0.05, 5);
  const maxSteps = clamp(Number(body?.maxSteps ?? 20), 1, 40);
  if (runner.running) return json({ error: "The agent is already working." }, { status: 409 });
  const runId = runner.start({ message, engine, model, budgetUsd, maxSteps });
  return json({ runId }, { status: 202 });
});

app.post("/api/runs/stop", async () => {
  runner.stop();
  return json({ stopped: true });
});

/** Back to the starter site and an empty conversation. */
app.post("/api/reset", async () => {
  runner.reset();
  await workspace.reset();
  log.clear();
  return json({ reset: true });
});

app.get("/api/files", async () => json({ files: await workspace.listFiles() }));

app.get("/api/file", async (ctx) => {
  const path = resolveReadablePath(String(ctx.query.path ?? ""));
  const content = await workspace.readFile(path);
  return content === null ? json({ error: "Not found" }, { status: 404 }) : json({ path, content });
});

app.get("/api/logs", async () => json({ status: workspace.status, log: workspace.logTail() }));

// The built dashboard (Docker). In dev it runs on its own port with `pnpm dev`.
const hasDashboard = existsSync(join(config.dashboardDir, "index.html"));
if (hasDashboard) {
  app.use(staticFiles({ root: ".", index: "index.html" }) as Middleware);
  // Client-side routes (/studio, /inspector) all load the same page.
  app.fallback(async (ctx) => {
    const page = await ctx.runtime.assets?.load("index.html");
    return page ? new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }) : json({ error: "Not found" }, { status: 404 });
  });
}

app.onError(async (error) => {
  if (error instanceof WorkspaceError) return json({ error: error.message }, { status: 400 });
  console.error(error);
  return json({ error: error.message }, { status: 500 });
});

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

await workspace.ensure();
void workspace.startDevServer().then(() => console.log(`Site preview (${workspace.status}) on ${config.previewUrl}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    workspace.stopDevServer();
    process.exit(0);
  });
}

// Resolves only when the server closes: keep it last.
const adapter = new NodeProdAdapter({ port: config.port, host: config.host, rootDir: config.dashboardDir });
await adapter.serve(app, {
  onListening: ({ port }) => {
    console.log(`Agent server on http://localhost:${port}${hasDashboard ? " (dashboard included)" : ""}`);
    if (!config.geminiApiKey) console.warn("GEMINI_API_KEY is not set: runs will be refused.");
  },
});
