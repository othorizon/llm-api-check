# LLM API Check

**Browser-only LLM capability & performance tester.** Register any OpenAI-compatible model (OpenAI, DeepSeek, Qwen/DashScope, Volcengine Ark/Doubao, MiniMax, Zhipu GLM, Moonshot Kimi, Gemini, xAI, Mistral, Groq, OpenRouter, Ollama, vLLM, LiteLLM, …) and measure it **from your browser** — no backend, no analytics, API keys never leave the page.

- **Performance**: streaming / non-streaming TTFT, time-to-first-content-token, decode & end-to-end tokens/s, p50/p95, prompt-cache cold vs warm, with randomised prompts so caches cannot inflate results — plus scenario scores (real-time voice, chat UI, agent loops, batch).
- **Capabilities**: reasoning by default, `reasoning_effort`, every known "disable/enable thinking" dialect (`reasoning_effort: none|minimal`, `thinking:{type:disabled}`, `enable_thinking`, `chat_template_kwargs`, OpenRouter `reasoning`, Ollama `think`, Gemini `thinking_budget`), tool calling (`auto` / `required` / named `tool_choice`, parallel, streaming, round-trip, `strict`), structured output (`json_object`, `json_schema`, strict, nested), vision (base64 + URL), prompt caching (automatic + `cache_control`), parameter compatibility.
- **Message formats**: multiple / mid-conversation `system` messages, consecutive `user` or `assistant` turns, assistant prefill, tool calls without results, orphan tool results, content-parts arrays.
- **Privacy**: static site, strict CSP, no third-party requests; everything is stored in `localStorage` (keys optionally in `sessionStorage`) and can be wiped in one click. See `/privacy`.
- **SEO**: every route is prerendered to static HTML in English (`/`, the default) and Chinese (`/zh`), with `hreflang` (`x-default` → English), Open Graph, JSON-LD and a sitemap. Visitors are never redirected by language automatically; a first visit shows a one-time switch banner, and a chosen language is remembered. Legacy `/en/*` URLs 301 to the root via `_redirects`.

## Development

```bash
npm install
npm run dev                 # http://localhost:5173
npm run mock                # OpenAI-compatible mock server on http://localhost:8787/v1 (models: mock-fast, mock-thinker, mock-strict, mock-slow, mock-flaky)
npm test                    # unit tests (vitest)
npm run typecheck
```

To try the UI without real keys, add a **Custom** provider with base URL `http://localhost:8787/v1` and any key (e.g. `sk-test-1234567890`), then add the `mock-*` models.

## Build

```bash
VITE_SITE_URL=https://llmapicheck.dev npm run build
```

`build` runs the client build, an SSR build and `scripts/prerender.mjs`, which writes one HTML file per route and locale into `dist/`, plus `404.html`, `robots.txt`, `sitemap.xml`, `_redirects` (legacy `/en/*` → `/*`) and `_headers` (CSP and other security headers).

`VITE_SITE_URL` (or Cloudflare's `CF_PAGES_URL`) is used for canonical URLs, `hreflang` alternates, Open Graph URLs and the sitemap. It defaults to `https://llmapicheck.dev`, the production domain; set it when deploying a copy elsewhere.

## Deploy to Cloudflare

The site is 100 % static. Requests go from the visitor's browser straight to the LLM provider; nothing runs on Cloudflare except static asset serving.

### Option A — Workers (static assets, recommended)

`wrangler.jsonc` is already configured (`assets.directory = ./dist`, `not_found_handling = 404-page`).

```bash
npx wrangler login
npm run deploy   # add the custom domain llmapicheck.dev in the Worker's Domains & Routes settings
```

Or connect the repository in the Cloudflare dashboard (**Workers & Pages → Create → Workers → Import a repository**) with:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Environment variable: `VITE_SITE_URL` = your public URL

### Option B — Cloudflare Pages

```bash
npm run deploy:pages
```

Or via Git integration: framework preset **None**, build command `npm run build`, build output directory `dist`, environment variable `VITE_SITE_URL`. `_headers` and `404.html` are picked up automatically.

### Custom domain

Add the domain in the Worker/Pages settings and set `VITE_SITE_URL` to it before building so canonical URLs and the sitemap match.

## Project layout

```
src/lib/llm        transport: OpenAI-compatible client, SSE parser, stream accumulator, error classification
src/lib/perf       performance suite: randomised prompts, runner, statistics, scenario scoring
src/lib/caps       capability & message-format probes (tests/*), registry, runner, reasoning dialects
src/lib/providers  provider presets (base URLs, CORS notes, reasoning dialects)
src/lib/store      zustand stores persisted to localStorage (keys in a separate store)
src/i18n           zh-CN / en catalogues (all UI copy and probe explanations)
src/pages, src/components, src/content   UI and long-form docs
scripts/           prerender, mock server, asset generation, Playwright e2e drive
```

## Adding a provider preset

Edit `src/lib/providers/presets.ts`. A preset only needs a base URL; optionally add alternative regions, the auth header name (e.g. `api-key` for Azure), extra headers, suggested model IDs, the max-tokens parameter name and the reasoning dialects the provider documents.

## Adding a probe

Create a `CapTestDef` in `src/lib/caps/tests/*.ts`, register it in `src/lib/caps/registry.ts`, and add `name` / `desc` / `why` for its id under `caps.tests` plus any new `messages` codes in both `src/i18n/en.ts` and `src/i18n/zh.ts`. The i18n unit test fails if a code or test id is missing a translation.

## License

MIT
