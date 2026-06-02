#!/usr/bin/env node
// Interactive live-exploration driver (NOT an assertion smoke).
// Walks AI Insights -> Ask Pulse -> Dashboard for ONE connector, screenshotting
// every meaningful state and capturing console/page/network errors so a human
// (or Claude) can review what the live app actually rendered.
//
//   node scripts/live-explore.mjs --connector=default --vendor=powerbi [--ask="..."] [--dark] [--headed]
//
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const arg = (k, d) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.split("=").slice(1).join("=") : d; };
const flag = (k) => process.argv.includes(`--${k}`);

const BASE = "http://127.0.0.1:7001";
const CONNECTOR = arg("connector", "default");
const VENDOR = arg("vendor", "powerbi");
const ASK = arg("ask", "What were total sales by segment?");
const DARK = flag("dark");
const HEADED = flag("headed");
const OUT = `d:/Working_Folder/Projects/PulsePlay/docs/evidence/live-explore/${CONNECTOR}${DARK ? "-dark" : ""}`;

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, args: ["--window-size=1500,1000"] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();

  const consoleErrs = [], pageErrs = [], netFails = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 240)); });
  page.on("pageerror", (e) => pageErrs.push(String(e?.message || e).slice(0, 240)));
  page.on("requestfailed", (r) => { const u = r.url(); if (u.includes("/api/")) netFails.push(`${r.failure()?.errorText || "?"} ${u.slice(0, 120)}`); });
  page.on("response", (r) => { const u = r.url(); if (u.includes("/api/") && r.status() >= 400) netFails.push(`HTTP ${r.status()} ${u.slice(0, 120)}`); });

  const shot = async (name) => { const p = join(OUT, name); await page.screenshot({ path: p, fullPage: false }).catch(() => {}); log(`  📸 ${name}`); };

  // ---- seed storage: choose vendor + connector + theme ----
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.evaluate(({ vendor, connector, dark }) => {
    try { localStorage.clear(); } catch { /* */ }
    localStorage.setItem("pulseplay:bi-vendor", vendor);
    localStorage.setItem("pulseplay:active-ai-profile", connector);
    localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
    const k = "pulseplay:visual-settings:genieSettings";
    const ex = JSON.parse(localStorage.getItem(k) || "{}");
    ex.assistantProfile = connector; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
    if (dark) ex.themeMode = "dark";
    localStorage.setItem(k, JSON.stringify(ex));
    if (dark) localStorage.setItem("pulseplay:theme-mode", "dark");
  }, { vendor: VENDOR, connector: CONNECTOR, dark: DARK });

  log(`\n=== LIVE EXPLORE — connector=${CONNECTOR} vendor=${VENDOR}${DARK ? " (dark)" : ""} ===`);

  // ---------- AI INSIGHTS ----------
  log("\n[1] AI Insights");
  await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await sleep(2500);
  await shot("01-ai-insights-initial.png");
  // wait for sections to settle (cap 90s)
  const dl = Date.now() + 90_000;
  let settled = false;
  while (Date.now() < dl) {
    const st = await page.evaluate(() => {
      const ph = document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length;
      const secs = document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)').length;
      return { ph, secs };
    });
    if (st.ph === 0 && st.secs >= 2) { settled = true; break; }
    await sleep(2000);
  }
  await sleep(1500);
  await shot("02-ai-insights-settled.png");
  const insightsDiag = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const sections = [...document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)')].map(s => s.getAttribute("data-section"));
    return {
      sectionCount: sections.length, sections,
      hasFallback: /I can answer questions like|no measure/i.test(text),
      tables: document.querySelectorAll('[data-section] table').length,
      kpiTiles: document.querySelectorAll('.gn-kpi-tile').length,
      charts: document.querySelectorAll('[data-section] canvas, [data-section] svg.echarts-for-react, [data-section] .gn-chart').length,
      whiteSurfaces: DARK_CHECK(),
    };
    function DARK_CHECK() { return null; }
  });
  log(`  sections(${insightsDiag.sectionCount}): ${insightsDiag.sections.join(", ")}`);
  log(`  tables=${insightsDiag.tables} kpiTiles=${insightsDiag.kpiTiles} charts=${insightsDiag.charts} fallback=${insightsDiag.hasFallback} settled=${settled}`);

  // ---------- ASK PULSE ----------
  log("\n[2] Ask Pulse");
  await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await sleep(2000);
  await shot("03-ask-pulse-empty.png");
  const composer = page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first();
  let askDiag = { posted: false };
  if (await composer.count()) {
    await composer.fill(ASK);
    await sleep(200);
    await shot("04-ask-pulse-typed.png");
    const send = page.locator("button.gn-send, button.pp-ai-sidebar__ask").first();
    const t0 = Date.now();
    await send.click().catch(() => {});
    askDiag.posted = true;
    const adl = t0 + 70_000;
    let answer = null;
    while (Date.now() < adl) {
      const p = await page.evaluate(() => {
        const msgs = document.querySelectorAll(".gn-msg--assistant, [data-testid^='pp-ai-entry-']");
        const last = msgs[msgs.length - 1];
        if (!last) return null;
        const text = (last.textContent || "").trim();
        const rows = last.querySelectorAll("table tr").length;
        const progress = !!last.querySelector(".gn-chat-progress, .gn-progress-active");
        const err = /could not complete this request|share the support code|something went wrong|Proxy Offline/i.test(text);
        const charts = last.querySelectorAll("canvas, .gn-chart, svg").length;
        return { len: text.length, rows, progress, err, charts, text: text.slice(0, 160) };
      });
      if (p && p.err) { answer = { ...p, ms: Date.now() - t0, error: true }; break; }
      if (p && !p.progress && (p.len > 40 || p.rows > 0)) { answer = { ...p, ms: Date.now() - t0 }; break; }
      await sleep(400);
    }
    await sleep(1200);
    await shot("05-ask-pulse-answer.png");
    askDiag = { ...askDiag, ...answer };
    log(`  answered in ${answer?.ms ?? "—"}ms · rows=${answer?.rows ?? 0} charts=${answer?.charts ?? 0} err=${!!answer?.error}`);
    log(`  preview: ${answer?.text || "(none)"}`);
  } else {
    log("  ✗ no composer found");
  }

  // ---------- DASHBOARD ----------
  log("\n[3] Dashboard");
  await page.goto(BASE + "/?surface=dashboard", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await sleep(3000);
  await shot("06-dashboard.png");
  const dashDiag = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return {
      hasIframe: !!document.querySelector("iframe"),
      hasCanvasTiles: document.querySelectorAll('.pp-canvas-tile, [data-tile-id]').length,
      modeLabels: /Embedded BI|Pulse Canvas/i.test(text),
    };
  });
  log(`  iframe=${dashDiag.hasIframe} canvasTiles=${dashDiag.hasCanvasTiles} modeLabels=${dashDiag.modeLabels}`);

  // ---------- report ----------
  const report = { connector: CONNECTOR, vendor: VENDOR, dark: DARK, insightsDiag, askDiag, dashDiag, consoleErrs: [...new Set(consoleErrs)], pageErrs: [...new Set(pageErrs)], netFails: [...new Set(netFails)] };
  await writeFile(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  log(`\n--- errors ---`);
  log(`  console errors: ${report.consoleErrs.length}`);
  report.consoleErrs.slice(0, 8).forEach(e => log(`    · ${e}`));
  log(`  page errors: ${report.pageErrs.length}`);
  report.pageErrs.slice(0, 8).forEach(e => log(`    · ${e}`));
  log(`  api failures: ${report.netFails.length}`);
  report.netFails.slice(0, 8).forEach(e => log(`    · ${e}`));
  log(`\n[done] → ${OUT}`);

  if (HEADED) await sleep(2000);
  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
