// Generates static raster assets with headless Chromium (already installed in this environment):
//   public/og.png (1200x630), public/apple-touch-icon.png (180x180), public/assets/vision-probe.png (320x320)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
mkdirSync(join(root, "public/assets"), { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ deviceScaleFactor: 1 });

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;background:#0d0d0d;color:#fff;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Noto Sans SC",sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:64px;box-sizing:border-box;position:relative;overflow:hidden}
.bg{position:absolute;inset:0;background:radial-gradient(900px 500px at 85% 15%,rgba(42,120,214,.35),transparent 60%),radial-gradient(700px 400px at 10% 100%,rgba(27,175,122,.25),transparent 60%)}
.top{display:flex;align-items:center;gap:16px;position:relative}
.logo{width:56px;height:56px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center}
h1{font-size:64px;line-height:1.08;margin:0;letter-spacing:-.02em;position:relative;max-width:1000px}
p{font-size:28px;line-height:1.4;color:#c3c2b7;margin:20px 0 0;position:relative;max-width:1000px}
.chips{display:flex;gap:12px;flex-wrap:wrap;position:relative}
.chip{border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:10px 18px;font-size:22px;color:#e8e8e3;background:rgba(255,255,255,.04)}
.brand{font-size:26px;font-weight:600;letter-spacing:-.01em}
</style></head><body><div class="bg"></div>
<div class="top"><div class="logo"><svg width="36" height="36" viewBox="0 0 32 32"><path d="M6 19h4.6l2-6 3 10" fill="none" stroke="#0b0b0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.6 23 26 10" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="brand">LLM API Check</div></div>
<div><h1>Check any LLM API from your browser</h1><p>Latency &amp; throughput · prompt cache · reasoning controls · tool calling · JSON Schema · vision · message formats. No server, your API keys never leave your browser.</p></div>
<div class="chips"><span class="chip">OpenAI</span><span class="chip">DeepSeek</span><span class="chip">Qwen 通义千问</span><span class="chip">Doubao 豆包</span><span class="chip">MiniMax</span><span class="chip">GLM</span><span class="chip">Kimi</span><span class="chip">Gemini</span><span class="chip">+ any OpenAI-compatible API</span></div>
</body></html>`;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og);
await page.screenshot({ path: join(root, "public/og.png"), type: "png" });

const icon = `<!doctype html><html><body style="margin:0;background:#0b0b0b;width:180px;height:180px;display:flex;align-items:center;justify-content:center"><svg width="150" height="150" viewBox="0 0 32 32"><path d="M6 19h4.6l2-6 3 10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.6 23 26 10" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></body></html>`;
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(icon);
await page.screenshot({ path: join(root, "public/apple-touch-icon.png"), type: "png" });

// Static vision probe: blue circle + number 42 (must match STATIC_PROBE in src/lib/caps/image.ts)
const probe = `<!doctype html><html><body style="margin:0;background:#fff;width:320px;height:320px;position:relative;font-family:Arial,Helvetica,sans-serif">
<div style="position:absolute;left:96px;top:51px;width:128px;height:128px;border-radius:50%;background:#1e88e5"></div>
<div style="position:absolute;left:0;right:0;top:205px;text-align:center;font-size:90px;font-weight:bold;color:#111;line-height:1">42</div>
</body></html>`;
await page.setViewportSize({ width: 320, height: 320 });
await page.setContent(probe);
await page.screenshot({ path: join(root, "public/assets/vision-probe.png"), type: "png" });
await browser.close();
console.log("generated og.png, apple-touch-icon.png, assets/vision-probe.png");
