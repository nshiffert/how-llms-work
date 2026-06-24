# How LLMs Work

An interactive learning center for LLM and transformer internals. One page per
concept, each with a real, interactive visualization — watch attention scores get
computed, step through byte-pair encoding one merge at a time, drag a temperature
slider and see the probability distribution change shape.

Mechanics first, metaphors second. Real numbers, not placeholders.

**Live:** https://how-llms-work-1hu.pages.dev

## Stack

- **[Astro](https://astro.build)** — static-first, multi-page output, MDX content
- **React** islands (`@astrojs/react`) for the interactive visualizations only
- **Tailwind CSS** for styling
- **Framer Motion** for animation, **D3** for data viz
- **KaTeX** for math, **Shiki** for code highlighting
- **[gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)** — the real GPT-4o
  tokenizer (`o200k_base`), running client-side

The build output is a pure static folder (`dist/`) — no server runtime — deployed
to Cloudflare Pages.

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:4321
```

## Build & preview

```bash
pnpm build      # -> dist/
pnpm preview    # serve the static build
```

## Deploy

```bash
pnpm build
npx wrangler pages deploy dist --project-name=how-llms-work --branch=main
```

Cloudflare credentials are read from the environment (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`) and are **not** stored in this repo.

## Content structure

Every topic page follows the same five-section template: the hook → the mechanic
(interactive viz) → worked example (numbers + code) → what breaks (failure mode)
→ interview pressure test (collapsible Q&A). Topics are MDX in
`src/content/topics/`, driven by the registry in `src/data/topics.ts`.
