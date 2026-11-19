# Guardrails and cost

## Guardrails

They live in the code ([`runner.ts`](../server/src/agent/runner.ts), [`tools.ts`](../server/src/agent/tools.ts), [`workspace.ts`](../server/src/site/workspace.ts)), not in the prompt.

| Guardrail | Value |
|---|---|
| Budget per run | chosen in the dashboard, $0.05 to $5 (default $0.50) |
| Model calls per run | 20 by default, 40 at most |
| Automatic fixes | `finish` sends errors back up to 3 times, then stops and reports them |
| Writable paths | only `src/` and `public/` of the site |
| Readable paths | inside the site, never `node_modules`, `dist`, `.git` or `.rasengan` |
| One run at a time | a second request is refused while the agent works |
| Stop button | aborts the current model call and ends the run |
| Sandbox | everything runs in the container; only the Gemini API is called from outside |

## Cost

Each model call sends the system prompt, the tools and the whole conversation so far. Input tokens therefore grow with every step: step 10 re-reads the nine before it. That is why an agent costs more than a chatbot for the same question, and why the loop inspector shows input tokens per step.

Caching helps: the start of the conversation does not change, and Gemini bills cached input tokens at a tenth of the normal price.

[`pricing.ts`](../server/src/agent/pricing.ts) estimates the cost of each call from its token usage. It holds `gemini-3.8-flash`’s introductory Standard-tier prices (valid until 2026-12-31): $0.75 per million input tokens, $0.075 cached, $3.75 output. Models not listed are estimated at those rates. Check [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and update the table for the models you use.
