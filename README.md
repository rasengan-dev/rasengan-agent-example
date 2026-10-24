# rasengan/agent

A small coding agent that builds Rasengan.js sites, made for DevFest Douala and Yaoundé 2026. It shows how an agent works: **a model, a loop, tools and guardrails**. It runs entirely in the Rasengan ecosystem in one Docker container, with no Workers or Durable Objects.

- **Futon** (`server/`) serves the API, the event stream and the built dashboard.
- **Rasengan.js** (`dashboard/`) is the dashboard: home, studio (agent timeline and live preview) and loop inspector.
- **Gemini** (`gemini-3.8-flash` by default) is the model.
- The agent edits a Rasengan site (`template/`, copied to `workspace/site`) that runs under `rasengan dev`.

## Two engines, one contract

| Engine | File | What it shows |
|---|---|---|
| Hand-written loop | [`server/src/agent/engines/manual-loop.ts`](server/src/agent/engines/manual-loop.ts) | The loop by hand on `@google/genai`: call Gemini, run its `functionCalls`, send back `functionResponse`s, repeat |
| Vercel AI SDK | [`server/src/agent/engines/ai-sdk.ts`](server/src/agent/engines/ai-sdk.ts) | The same agent on `ToolLoopAgent` with `@ai-sdk/google` |

Both implement `AgentEngine` ([`engines/types.ts`](server/src/agent/engines/types.ts)). They share everything else:

- **The tools** ([`agent/tools.ts`](server/src/agent/tools.ts)) are defined once with zod: `list_files`, `read_file`, `edit_file`, `check` (tsc plus dev server errors) and `finish`, which refuses to end while the project has errors.
- **The guardrails** ([`agent/runner.ts`](server/src/agent/runner.ts)) are the dollar budget, the step limit, the Stop button and up to 2 automatic fixes. Only `src/` and `public/` are writable.
- **The events** ([`agent/events.ts`](server/src/agent/events.ts)) stream to the dashboard over SSE (`GET /api/events`).

Switch engines from the dashboard header: the timeline looks the same with either one.

## Run with Docker

```bash
cp .env.example .env   # then set GEMINI_API_KEY
docker compose up --build
```

Open http://localhost:3000. The site preview is on http://localhost:5320, and its hot reload uses port 6665.
The site's `src/` is mounted at `./site-src`, so you can open it in your editor during the demo and watch the edits land.

## Run without Docker

```bash
pnpm install
cp .env.example .env   # then set GEMINI_API_KEY
pnpm dev               # server on :3000, dashboard on :5300
```

On first start the server copies `template/` to `workspace/site` and runs `npm install` there.
To serve the built dashboard from the server, as Docker does: `pnpm build && pnpm start`, then open http://localhost:3000.

## Rasengan 2.0.0 workarounds

The dashboard is an SPA (`ssr: false`), which hits two issues in rasengan 2.0.0:

1. **`rasengan build` never exits.** The build writes `dist/`, then the process stays alive after "Detected deployment platform". `dashboard/scripts/build.mjs` runs the same Vite build and exits.
2. **SPA pages hydrate an empty `#root` (React error 418).** `entries/client/render.js` reads `window.__RASENGAN_SPA_MODE__` when the module loads, but the flag is injected after the entry scripts. `dashboard/src/template.tsx` sets the flag earlier in a classic script.

## API

| Route | |
|---|---|
| `GET /api/state` | engines, models, preview URL and status, whether the API key is set |
| `GET /api/events` | SSE: the whole session, then live events |
| `POST /api/runs` | `{ message, engine, model, budgetUsd }` starts a run |
| `POST /api/runs/stop` | stops the current run |
| `POST /api/reset` | restores the starter site and clears the conversation |
| `GET /api/files`, `GET /api/file?path=` | the site's files |
| `GET /api/logs` | the end of the `rasengan dev` log |

⚠️ There is no authentication: anyone who can reach port 3000 can spend your Gemini credits. Keep it on localhost or a trusted network.
