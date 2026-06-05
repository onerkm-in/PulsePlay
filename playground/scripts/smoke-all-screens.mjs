#!/usr/bin/env node
// Content-aware, anti-blank smoke for every PulsePlay surface.
//
//   node scripts/smoke-all-screens.mjs
//   (requires the proxy on :7000 and the dev server on :7001)
//
// It SETS UP real content on each screen first (refreshes the briefing, asks a
// question, triggers Dashboard auto-seed, opens Settings) and then asserts that
// SPECIFIC content is present. A screen that loads but stays blank FAILS — it
// does not pass. This is the regression guard for: express-5 proxy + react-19 +
// echarts-6 render path, per-surface connectors (3 dropdowns incl. Dashboard),
// live AI Insights (deterministic PBI), a live Ask Pulse chart, the empty-
// Dashboard auto-seed, and Settings. Exits non-zero on any failure.
//
// Connectors used: powerbi-dwd (deterministic DAX — content-guaranteed, no LLM)
// and foundation (a binding example). Genie is serverless-blocked on the free
// workspace, so this smoke does not depend on it.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.PP_BASE || "http://127.0.0.1:7001";
const OUT = process.env.PP_OUT || join(tmpdir(), "pulseplay-smoke", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
// CI mode: run only the CREDENTIAL-FREE checks (boot, no console errors, Settings,
// connector bar, echarts-6 fixture paint) — the dep-bump regression class. The
// live-data checks (AI Insights briefing / Ask Pulse chart / Dashboard auto-seed)
// need real Power BI / Azure creds CI doesn't have, so they're skipped under PP_CI.
const CI = process.env.PP_CI === "1";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
const consoleErrs = [];
await ctx.addInitScript((ci) => {
  try {
    if (!sessionStorage.getItem("__sk_clean")) {
      localStorage.removeItem("pulseplay:canvas-tiles");
      localStorage.removeItem("pulseplay:surface-connectors");
      for (const k of Object.keys(localStorage)) if (k.startsWith("pulseplay:dashboard-autoseeded:")) localStorage.removeItem(k);
      sessionStorage.setItem("__sk_clean", "1");
    }
    localStorage.setItem("pulseplay:bi-vendor", "powerbi");
    localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
    // Flag ON so the per-surface connector bar renders (a structural check).
    localStorage.setItem("pulseplay:feature-flags", JSON.stringify({ multiConnectorPanes: true, dashboardAutoSeed: true }));
    // In CI there is no configured backend profile — DON'T set an active
    // connector (that would make surfaces probe a non-existent profile and emit
    // console errors, failing the zero-errors check). Locally, wire powerbi-dwd.
    if (!ci) {
      localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
      const k = "pulseplay:visual-settings:genieSettings";
      const ex = JSON.parse(localStorage.getItem(k) || "{}");
      ex.assistantProfile = "powerbi-dwd"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
      localStorage.setItem(k, JSON.stringify(ex));
    }
  } catch { /* */ }
}, CI);
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 160)); });
page.on("pageerror", e => consoleErrs.push("PAGEERROR: " + String(e?.message || e).slice(0, 160)));

console.log(`\n=== SMOKE (content-aware, anti-blank) → ${OUT} ===\n`);

// 1. App boots (express5 proxy + react19 + echarts6 bundle)
await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(2500);
check("App boots (proxy/react/bundle load)", (await page.evaluate(() => (document.body.innerText || "").includes("PulsePlay"))));

// 2. Per-surface connector bar — 3 dropdowns, bindable
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="surface-connector-ai-insights"]');
  return el && el.querySelectorAll("option").length > 1;
}, { timeout: 15000 }).catch(() => { /* */ });
const dd = await page.evaluate(() => ({
  ins: !!document.querySelector('[data-testid="surface-connector-ai-insights"]'),
  ask: !!document.querySelector('[data-testid="surface-connector-ask-pulse"]'),
  dash: !!document.querySelector('[data-testid="surface-connector-bi-viz"]'),
}));
check("Per-surface bar shows all 3 dropdowns (incl. Dashboard)", dd.ins && dd.ask && dd.dash, JSON.stringify(dd));
if (!CI) {
  // Binding-persist needs selectable profile options (real config) → local only.
  await page.selectOption('[data-testid="surface-connector-ai-insights"]', "powerbi-dwd").catch(() => { /* */ });
  await page.selectOption('[data-testid="surface-connector-ask-pulse"]', "foundation").catch(() => { /* */ });
  await page.selectOption('[data-testid="surface-connector-bi-viz"]', "powerbi-dwd").catch(() => { /* */ });
  await sleep(500);
  const bound = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("pulseplay:surface-connectors") || "{}"); } catch { return {}; } });
  check("Per-surface bindings persist (3 surfaces)", bound["ai-insights"] === "powerbi-dwd" && bound["ask-pulse"] === "foundation" && bound["bi-viz"] === "powerbi-dwd", JSON.stringify(bound));
}

// Steps 3-5 need real credentials (live Power BI / Azure) → local only, skipped in CI.
if (!CI) {
// 3. AI Insights — real briefing (not blank / not error / not only-fallback)
await page.locator("button", { hasText: /^AI Insights$/i }).first().click({ timeout: 5000 }).catch(() => { /* */ });
await sleep(1000);
await page.locator('button[aria-label*="Refresh"]').first().click({ timeout: 3000 }).catch(() => { /* */ });
let ins = {}; let dl = Date.now() + 75000;
while (Date.now() < dl) {
  ins = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return {
      hasRealNumber: /2,297,201|1,161,401|Total Sales/i.test(text),
      sections: document.querySelectorAll("[data-section], .gn-insights-section").length,
      errorCard: /could not complete|insight run stopped|something went wrong/i.test(text),
      running: /Capturing the KPI|Connecting to AI|Reading the headline/i.test(text),
    };
  });
  if (ins.hasRealNumber && !ins.running) break;
  await sleep(1500);
}
await sleep(1200);
await page.screenshot({ path: join(OUT, "1-ai-insights.png") });
check("AI Insights renders a REAL briefing (not blank/error/fallback)", ins.hasRealNumber && !ins.errorCard, `sections=${ins.sections} realNum=${ins.hasRealNumber} error=${ins.errorCard}`);

// 4. Ask Pulse — ask a question, get a REAL chart answer (echarts6), not empty
await page.locator("button", { hasText: /^Ask Pulse$/i }).first().click({ timeout: 5000 }).catch(() => { /* */ });
await sleep(1000);
await page.evaluate(() => { try { const m = JSON.parse(localStorage.getItem("pulseplay:surface-connectors") || "{}"); m["ask-pulse"] = "powerbi-dwd"; localStorage.setItem("pulseplay:surface-connectors", JSON.stringify(m)); window.dispatchEvent(new CustomEvent("pulseplay:surface-connectors-change", { detail: m })); } catch { /* */ } });
await sleep(600);
await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("Show total sales by segment").catch(() => { /* */ });
await sleep(200);
await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click().catch(() => { /* */ });
let ask = {}; dl = Date.now() + 50000;
while (Date.now() < dl) {
  ask = await page.evaluate(() => {
    const m = document.querySelectorAll(".gn-msg--assistant, [data-testid^='pp-ai-entry-']");
    const last = m[m.length - 1];
    return {
      running: !!document.querySelector(".gn-progress--active, .gn-progress-bar-fill"),
      chart: last ? last.querySelectorAll(".gn-chart canvas, canvas").length : 0,
      rows: last ? last.querySelectorAll("table tr").length : 0,
      len: last ? (last.textContent || "").trim().length : 0,
    };
  });
  if (!ask.running && (ask.chart > 0 || ask.rows > 1)) break;
  await sleep(700);
}
await sleep(1200);
await page.screenshot({ path: join(OUT, "2-ask-pulse.png") });
check("Ask Pulse returns a REAL chart answer (echarts paints, not empty)", ask.chart > 0 && ask.len > 0, `chart=${ask.chart} rows=${ask.rows} len=${ask.len}`);

// 5. Dashboard — auto-seed fills it; real chart tiles, not the blank placeholder
await page.locator("button", { hasText: /^Dashboard$/i }).first().click({ timeout: 5000 }).catch(() => { /* */ });
let dash = {}; dl = Date.now() + 45000;
while (Date.now() < dl) {
  dash = await page.evaluate(() => ({ tiles: JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]").length }));
  if (dash.tiles >= 3) { await sleep(2500); break; }
  await sleep(1000);
}
await sleep(1500);
dash = await page.evaluate(() => ({
  tiles: JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]").length,
  canvases: document.querySelectorAll("canvas").length,
  blankPlaceholderOnly: /Ask Pulse can render governed charts/i.test(document.body.innerText || "") && document.querySelectorAll("canvas").length === 0,
}));
await page.screenshot({ path: join(OUT, "3-dashboard.png") });
check("Dashboard AUTO-SEEDED with real charts (not the blank Pulse Canvas)", dash.tiles >= 1 && dash.canvases >= 1 && !dash.blankPlaceholderOnly, `tiles=${dash.tiles} canvases=${dash.canvases}`);
} // end !CI live-data checks

// 5b. echarts-6 fixture paint (NO backend) — the credential-free chart-render
// regression guard. native-canvas-smoke.html mounts NativeCanvas with a fixed
// sample envelope; assert a real <canvas> with non-blank pixels.
await page.goto(BASE + "/native-canvas-smoke.html", { waitUntil: "networkidle", timeout: 20000 }).catch(() => { /* */ });
await sleep(1500);
const echarts = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return { found: false, nonBlank: 0 };
  try {
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let nonBlank = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) nonBlank++;
    return { found: true, nonBlank, w: c.width, h: c.height };
  } catch { return { found: true, nonBlank: -1 }; }
});
await page.screenshot({ path: join(OUT, "5b-echarts-fixture.png") });
check("echarts-6 paints a chart from fixture data (no backend)", echarts.found && echarts.nonBlank > 100, JSON.stringify(echarts));

// 6. Settings — renders real config content, not blank
await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
await sleep(2000);
const settings = await page.evaluate(() => {
  const text = document.body.innerText || "";
  return { len: text.length, hasCatalogue: /Connector catalogue|Connector|AI Setup|BI Setup/i.test(text), error: /something went wrong|cannot read/i.test(text) };
});
await page.screenshot({ path: join(OUT, "4-settings.png") });
check("Settings renders real content (not blank/error)", settings.len > 300 && settings.hasCatalogue && !settings.error, `len=${settings.len}`);

// 7. No frontend console/page errors across the whole run
const uniqErrs = [...new Set(consoleErrs)];
check("Zero frontend console/page errors", uniqErrs.length === 0, uniqErrs.slice(0, 3).join(" | "));

await browser.close();
const passed = results.filter(r => r.pass).length;
console.log(`\n=== SMOKE RESULT: ${passed}/${results.length} passed ===`);
await writeFile(join(OUT, "_smoke.txt"), results.map(r => `${r.pass ? "PASS" : "FAIL"}  ${r.name}`).join("\n") + `\n\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
