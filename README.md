# rasengan-agent-example

A small coding agent that builds landing pages in [Rasengan.js](https://rasengan.dev), written to show how an AI agent works from the inside: **a model, a loop, tools and guardrails**.

It was built for the talk *Construire un agent IA de A à Z* at DevFest Douala 2026. Everything runs in one Docker container, on the Rasengan ecosystem: [Futon](https://github.com/rasengan-dev/rasenganjs/tree/main/packages/platform/futon) for the server, Rasengan.js for the dashboard and for the site the agent generates, and Gemini as the model.

> **En français.** Un petit agent de code qui construit des landing pages en Rasengan.js, pour comprendre comment fonctionne un agent IA de l’intérieur : un modèle, une boucle, des outils et des garde-fous. La boucle existe en deux versions, écrite à la main et avec le Vercel AI SDK, pour montrer qu’un framework d’agent n’est que cette boucle, déjà écrite.

## What it does

You describe a product ("A landing page for Kora, an app that lets small shops in Douala accept Mobile Money…"). The agent reads the starter site, writes the page section by section, type-checks its own work, fixes what breaks, and finishes with a short message. The dashboard shows every model call, every tool call and the live preview as it happens.

## Two engines, one contract

The point of the project is the loop, so it exists twice:

| Engine | File | |
|---|---|---|
| Hand-written loop | [`server/src/agent/engines/manual-loop.ts`](server/src/agent/engines/manual-loop.ts) | About 40 lines on `@google/genai`: call Gemini, run its `functionCalls`, send back `functionResponse`s, repeat |
| Vercel AI SDK | [`server/src/agent/engines/ai-sdk.ts`](server/src/agent/engines/ai-sdk.ts) | The same agent on `ToolLoopAgent` with `@ai-sdk/google` |

Both implement one interface ([`engines/types.ts`](server/src/agent/engines/types.ts)) and share everything else: the tools, the system prompt, the guardrails and the events. Switch engines from the dashboard header: the timeline looks the same with either one.

## Quick start

You need a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

### With Docker

```bash
cp .env.example .env        # then set GEMINI_API_KEY
docker compose up --build
```

- Dashboard and API: http://localhost:3000
- Site preview: http://localhost:5320 (hot reload on port 6665)
- The site’s `src/` is mounted at `./site-src`: open it in your editor and watch the agent’s edits land.

### Without Docker

Requires Node.js 22 and pnpm 10.

```bash
pnpm install
cp .env.example .env        # then set GEMINI_API_KEY
pnpm dev                    # server on :3000, dashboard on :5300
```

On first start, the server copies `template/` to `workspace/site` and runs `npm install` there, then starts `rasengan dev` on port 5320.

To serve the built dashboard from the server, as Docker does: `pnpm build && pnpm start`, then open http://localhost:3000.

## Project layout

```
server/              Futon server: API, event stream (SSE), the agent
  src/agent/
    engines/         the two loops, behind one interface
    tools.ts         list_files, read_file, edit_file, write_file, check, finish
    prompt.ts        the system prompt
    runner.ts        one run at a time, guardrails, events
    events.ts        what the dashboard receives
    pricing.ts       cost estimate per model call
  src/site/          the site on disk, rasengan dev, type-checking
dashboard/           Rasengan.js app: home, studio, loop inspector
template/            the starter site the agent edits
docs/                how it works
```

## Documentation

- [Architecture](docs/architecture.md): the pieces and how a request flows through them
- [The agent loop](docs/agent-loop.md): the loop step by step, in both engines
- [Tools](docs/tools.md): each tool, and how to design tools an agent can recover with
- [System prompt and skills](docs/system-prompt-and-skills.md): what the prompt holds, and where skills would fit
- [Guardrails and cost](docs/guardrails-and-cost.md): budget, limits, sandbox, and why tokens grow each step
- [Extending the agent](docs/extending.md): add a tool, change the prompt, add a skill or an engine
- [Configuration and API](docs/configuration.md): environment variables and HTTP routes
- [Troubleshooting](docs/troubleshooting.md): known issues and their workarounds

## Security

There is no authentication. Anyone who can reach port 3000 can start runs and spend your Gemini credits. Keep it on localhost or a trusted network. The agent can only write under the site’s `src/` and `public/`, and everything it runs stays inside the container.

## License

[MIT](LICENSE) © Dilane Kombou
