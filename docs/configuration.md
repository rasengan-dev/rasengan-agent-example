# Configuration and API

## Environment variables

Set them in `.env` at the repository root (read by `pnpm dev` and `pnpm start`) or in your shell for Docker Compose.

| Variable | Default | |
|---|---|---|
| `GEMINI_API_KEY` | none | Required to start runs. Get one from [Google AI Studio](https://aistudio.google.com/apikey) |
| `AGENT_MODELS` | `gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite` | Models offered in the dashboard, comma-separated; the first is the default |
| `PORT` | `3000` | Port of the Futon server |
| `HOST` | `0.0.0.0` | Interface the server listens on |
| `SITE_DIR` | `workspace/site` | Where the site the agent edits lives |
| `TEMPLATE_DIR` | `template` | The starter site |
| `DASHBOARD_DIR` | `dashboard/dist` | The built dashboard the server serves, when present |
| `PREVIEW_URL` | `http://localhost:5320` | Where the browser reaches the site’s dev server |
| `CORS_ORIGINS` | `http://localhost:5300,http://127.0.0.1:5300` | Origins allowed to call the API, for the dashboard’s dev server |

Relative paths resolve from the repository root.

## HTTP API

| Route | |
|---|---|
| `GET /api/state` | Engines, models, preview URL and status, whether the API key is set |
| `GET /api/events` | Server-Sent Events: the whole session so far, then every new event |
| `POST /api/runs` | `{ message, engine, model, budgetUsd, maxSteps? }` starts a run; `409` if one is running |
| `POST /api/runs/stop` | Stops the current run |
| `POST /api/reset` | Restores the starter site and clears the conversation |
| `GET /api/files` | Files under the site’s `src/` and `public/` |
| `GET /api/file?path=` | One file’s content |
| `GET /api/logs` | The end of the `rasengan dev` log |

Events are described in [`server/src/agent/events.ts`](../server/src/agent/events.ts): `run_started`, `model_response`, `tool_call`, `tool_result`, `run_finished`, `run_error`, `site_changed` and `reset`.
