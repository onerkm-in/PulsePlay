#!/usr/bin/env node
// AIINSIGHTS-P1 headed validation: AI Insights on the deterministic
// powerbi-semantic-model connector (powerbi-dwd) must render REAL DAX tables
// per section, NOT the "no measure" fallback in every section. Waits for the
// probe prefetch, forces a fresh deterministic run via Refresh, then asserts.
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/pbi-insights";
const slow = process.argv.includes("--headed");

async function main() {
    const browser = await chromium.launch({ headless: !slow, slowMo: slow ? 300 : 0, args: ["--window-size=1500,1000"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
        localStorage.setItem("pulseplay:active-surface", "ai-insights");
        localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = "powerbi-dwd"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await import("node:fs/promises").then(fs => fs.mkdir(OUT, { recursive: true }));

    const results = [];
    const rec = (n, ok, d = "") => { results.push({ n, ok }); console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); };

    // Real cold-load path: NO manual Refresh. The auto-run races the probe and
    // plans prose first; once the probe resolves we auto-trigger a deterministic
    // re-run. Wait for that re-run to settle and replace the first paint.
    const dl = Date.now() + 100_000;
    while (Date.now() < dl) {
        const done = await page.evaluate(() => {
            const ph = document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length;
            const secs = document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)').length;
            const txt = document.body.innerText || "";
            // settled = sections present, nothing pending, and a segment-based
            // (clean deterministic) section is showing
            return ph === 0 && secs >= 2 && /by segment/i.test(txt);
        });
        if (done) break; await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2500);

    const diag = await page.evaluate(() => {
        const text = document.body.innerText || "";
        const sections = [...document.querySelectorAll('[data-section]:not(.gn-insights-section--placeholder)')].map(s => s.getAttribute("data-section"));
        const tables = document.querySelectorAll('[data-section] table, [data-section] .gn-kpi-tile').length;
        return {
            sectionCount: sections.length,
            sections,
            hasFallback: /I can answer questions like/.test(text),
            // deterministic DAX heading signatures
            hasDaxHeadings: /by segment|over (year|quarter|month)|Top \d+ |\(\d+ groups\)/i.test(text),
            tables,
        };
    });
    const cleanPlan = await page.evaluate(() => {
        const t = document.body.innerText || "";
        return { bySegment: /by segment/i.test(t), customerNameTopN: /Top \d+ customer_name/i.test(t) };
    });
    rec("AI Insights rendered ≥2 sections", diag.sectionCount >= 2, `${diag.sectionCount}: ${diag.sections.join(", ")}`);
    rec("NO 'no measure' fallback text anywhere", !diag.hasFallback, diag.hasFallback ? "fallback STILL present" : "clean");
    rec("real DAX tables/headings present", diag.hasDaxHeadings || diag.tables > 0, `daxHeadings=${diag.hasDaxHeadings} tables=${diag.tables}`);
    rec("clean deterministic plan won (by-segment present)", cleanPlan.bySegment, cleanPlan.bySegment ? "segment grouper used" : "missing");
    rec("no prose-accidental customer_name top-N", !cleanPlan.customerNameTopN, cleanPlan.customerNameTopN ? "garbage still showing" : "clean");

    await page.screenshot({ path: OUT + "/ai-insights-deterministic.png", fullPage: true });
    await browser.close();
    const pass = results.filter(r => r.ok).length;
    console.log(`\n${pass}/${results.length} checks passed`);
    process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error("[FAIL]", e); process.exit(1); });
