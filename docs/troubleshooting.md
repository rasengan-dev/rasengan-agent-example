# Troubleshooting

## "GEMINI_API_KEY is not set on the server"

Copy `.env.example` to `.env`, set the key, and restart the server. With Docker, the key is read from your shell or from `.env` next to `docker-compose.yml`.

## The preview is blank or says "Not found"

`rasengan dev` answers 404 to requests that do not ask for HTML. Browsers do, so the preview works; tools like `curl` need `-H 'accept: text/html'`. If the preview stays blank, open the **Code** tab’s terminal or `GET /api/logs` to see what `rasengan dev` printed.

## The preview does not reload after an edit

The site’s hot reload uses a WebSocket on port 6665. With Docker, make sure that port is published (it is in `docker-compose.yml`).

## The first start is slow

The server copies the template to `workspace/site` and runs `npm install` there once. The Docker image does this at build time instead.

## Reset the site

Use **Reset site** on the home page, or `POST /api/reset`. It restores `src/` and `public/` from the template and clears the conversation.

## Rasengan 2.0.0 and single-page apps

The dashboard is a Rasengan SPA (`ssr: false`), which hits two issues in rasengan 2.0.0. Both are worked around in this repository:

1. **`rasengan build` never exits.** It writes `dist/`, then the process stays alive after "Detected deployment platform", which would hang a Docker build. [`dashboard/scripts/build.mjs`](../dashboard/scripts/build.mjs) runs the same Vite build through Vite’s API and exits.
2. **SPA pages hydrate an empty `#root` (React error 418).** The client entry reads `window.__RASENGAN_SPA_MODE__` when it loads, but the flag is injected after the entry scripts. [`dashboard/src/template.tsx`](../dashboard/src/template.tsx) sets it earlier in a classic script.

## The agent is stuck on errors

Open the **Loop inspector** to see exactly what the model received at each step. Most loops come from tool output: errors that are too long, outputs the model copies back, or failures without a hint of what to do next. See [Tools](tools.md#designing-tools-an-agent-can-recover-with).
