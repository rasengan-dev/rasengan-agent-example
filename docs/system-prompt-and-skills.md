# System prompt and skills

## The system prompt

[`server/src/agent/prompt.ts`](../server/src/agent/prompt.ts) is the agent’s brief. It is sent first, on every model call, before the whole conversation. It has five parts:

1. **The role**: the agent designs and builds landing pages for startups, products and launches.
2. **The project**: Rasengan.js, file-based routing, where layouts and styles live, Tailwind and theme tokens.
3. **The craft**: the sections of a good landing page and their order, copy rules (one call to action, never invent facts), design rules (one accent, mobile first, both themes).
4. **When something breaks**: fix the first error first, never copy line numbers from error excerpts, rewrite a badly broken file with `write_file`.
5. **How to finish**: call `finish` with a short message in the user’s language.

Two rules keep it useful:

- **It never changes between calls.** No dates, ids or user data inside it. A stable prefix can be cached, which makes every call cheaper.
- **The prompt guides, the code enforces.** Anything that must hold (budget, writable paths, "no finishing with errors") lives in the code. A prompt can be ignored; a guardrail in code cannot.

## Skills

A system prompt is always in the context, so it must stay short. Skills are how agents such as Claude Code carry detailed expertise without paying for it on every call:

- a skill is a folder with a `SKILL.md`: a name, a description, then detailed instructions;
- only the name and the description sit in the context permanently;
- the agent reads the rest when a task calls for it.

```markdown
---
name: rasengan-routing
description: Pages, layouts and routes in Rasengan.js
---

# Detailed instructions…
```

This project does not have skills yet. The natural next step would be a `load_skill(name)` tool that lists the available skills in its description and returns the body of the one asked for, with skills such as `rasengan-routing`, `contact-form` or `seo-landing`. See [Extending the agent](extending.md#add-skills).
