// End-to-end drive of the built site against the mock server, with screenshots.
//   BASE=http://localhost:8788 MOCK=http://localhost:8787/v1 node scripts/e2e/run.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8788";
const MOCK = process.env.MOCK || "http://localhost:8787/v1";
const OUT = process.env.OUT || "/tmp/e2e";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, locale: "en-US" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// 1. Home (English is the default locale at /; the browser locale is en-US so nothing redirects), then zh via the toggle
await page.goto(`${BASE}/`);
await page.waitForSelector("h1");
await shot("01-home-en");
await page.getByRole("button", { name: /Language|语言/ }).click();
await page.waitForURL(/\/zh$/);
await page.waitForSelector("h1");
await shot("02-home-zh");
await page.getByRole("button", { name: /Language|语言/ }).click();
await page.waitForURL((u) => u.pathname === "/");
await page.goto(`${BASE}/docs/capabilities`);
await page.waitForSelector("h1");
await shot("03-docs-capabilities-en");
await page.goto(`${BASE}/privacy`);
await page.waitForSelector("h1");
await shot("04-privacy-en");

// 2. Models: add provider + models
await page.goto(`${BASE}/models`);
await page.getByRole("button", { name: /Got it/ }).click().catch(() => {});
await page.getByRole("button", { name: /Add provider/ }).first().click();
await page.getByRole("combobox").first().selectOption("custom");
await page.getByPlaceholder("https://api.example.com/v1").fill(MOCK);
await page.getByPlaceholder(/optional|sk-/).first().fill("sk-test-1234567890");
await page.getByRole("button", { name: "Save" }).click();
// Model form should open automatically for the first provider
await page.waitForSelector("text=Add model");
const addModel = async (id, label) => {
  const dlg = page.getByRole("dialog");
  if (!(await dlg.isVisible().catch(() => false))) await page.getByRole("button", { name: /^Add model$/ }).first().click();
  await page.getByRole("dialog").getByPlaceholder(/model-id|mock/).fill(id);
  if (label) await page.getByRole("dialog").getByLabel("Label").fill(label);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(200);
};
await addModel("mock-fast", "Fast");
await addModel("mock-thinker", "Thinker");
await addModel("mock-strict", "Strict");
await addModel("mock-slow", "Slow");
await page.getByRole("button", { name: /Connection test/ }).first().click();
await page.waitForSelector("text=/OK · \\d+ ms/");
await shot("05-models-en");
log("models added");

// 3. Performance test
await page.goto(`${BASE}/performance`);
await page.waitForSelector("text=Start performance test");
await page.getByRole("button", { name: "Reset" }).click();
await page.getByText("Non-streaming", { exact: true }).click();
await page.getByLabel("Runs", { exact: true }).fill("2");
await page.getByLabel("Max output tokens").fill("48");
await page.getByText("Compare both").click();
await page.getByLabel("Input size").selectOption("long");
await page.getByText("Advanced").click();
await page.getByLabel("Pause between requests (ms)").fill("50");
await page.getByLabel("Wait after warm-up (ms)").fill("300");
await page.getByRole("button", { name: /Start performance test/ }).click();
await page.waitForSelector("text=Running…");
await page.waitForTimeout(1500);
await shot("06-perf-running");
await page.waitForSelector("text=Running…", { state: "detached", timeout: 180000 });
await page.waitForTimeout(500);
await shot("07-perf-results");
log("performance done");
// custom prompt: counter + cache-length hint, no run
await page.getByRole("tab", { name: "Custom" }).click();
await page.getByPlaceholder(/Paste the prompt/).fill("Explain, in about two hundred words, why the sky is blue. " .repeat(6));
await page.waitForSelector("text=/≈ [0-9,]+ tokens · [0-9,]+ characters/");
await page.waitForSelector("text=/This prompt is about \\d+ tokens/");
await page.screenshot({ path: `${OUT}/07b-perf-custom-prompt.png`, clip: { x: 0, y: 0, width: 1360, height: 1500 } });
await page.getByRole("tab", { name: "Generated" }).click();
log("custom prompt ui ok");

// 4. Capabilities test (3 models)
await page.goto(`${BASE}/capabilities`);
await page.waitForSelector("text=Start capability test");
await page.getByRole("button", { name: "Select all" }).click();
await page.getByRole("button", { name: /Start capability test/ }).click();
await page.waitForTimeout(2500);
await shot("08-caps-running");
await page.waitForSelector("text=Running", { state: "detached", timeout: 300000 }).catch(() => {});
await page.waitForFunction(() => !document.body.innerText.includes("Pending") && !document.body.innerText.includes("Running"), null, { timeout: 300000 });
await page.waitForTimeout(500);
await shot("09-caps-results");
// open a detail drawer: the reasoning toggle cell of the second model
const cell = page.locator("td button").filter({ hasText: /disabled|Reasoning can/ }).first();
await cell.click();
await page.waitForSelector("[role=dialog]");
await shot("10-caps-detail");
await page.keyboard.press("Escape");
log("capabilities done");

// 5. Message formats
await page.goto(`${BASE}/messages`);
await page.waitForSelector("text=Start message format test");
await page.getByRole("button", { name: "Select all" }).click();
await page.getByRole("button", { name: /Start message format test/ }).click();
await page.waitForTimeout(500);
await page.waitForFunction(() => !document.body.innerText.includes("Pending") && !document.body.innerText.includes("Running"), null, { timeout: 180000 });
await page.waitForTimeout(500);
await shot("11-messages-results");
log("messages done");

// 6. Results page + dark mode + zh
await page.goto(`${BASE}/results`);
await page.waitForSelector("text=Results");
await page.locator("li button").first().click();
await page.waitForTimeout(400);
await shot("12-results-en");
await page.getByRole("button", { name: /Theme/ }).click(); // system -> light
await page.getByRole("button", { name: /Theme/ }).click(); // light -> dark
await page.waitForTimeout(300);
await shot("13-results-dark");
await page.getByRole("button", { name: /Language|语言/ }).click();
await page.waitForURL(/\/results/);
await page.waitForTimeout(400);
await shot("14-results-zh-dark");
await page.goto(`${BASE}/performance`);
await page.waitForSelector("h1");
await page.waitForTimeout(400);
await shot("15-perf-zh-dark");

// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/models`);
await page.waitForSelector("h1");
await page.waitForTimeout(300);
await shot("16-models-mobile-zh");

// dump the full local state (no secrets) so it can be reused as demo data
const dump = await page.evaluate(() => ({ results: localStorage.getItem("wlcu:results"), providers: localStorage.getItem("wlcu:providers") }));
const { writeFileSync } = await import("node:fs");
writeFileSync(`${OUT}/state.json`, JSON.stringify(dump));
// dump a little state for assertions
const state = await page.evaluate(() => {
  const r = JSON.parse(localStorage.getItem("wlcu:results") || "{}");
  return (r.state?.sessions ?? []).map((s) => ({ kind: s.kind, status: s.status, models: s.models.length, results: Object.fromEntries(Object.entries(s.results).map(([k, v]) => [k, s.kind === "performance" ? { samples: v.samples.length, ok: v.samples.filter((x) => x.ok).length, voice: v.scores?.[0]?.grade } : Object.fromEntries(Object.entries(v.outcomes).map(([id, o]) => [id, o.status]))])) }));
});
console.log(JSON.stringify(state, null, 1));
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
