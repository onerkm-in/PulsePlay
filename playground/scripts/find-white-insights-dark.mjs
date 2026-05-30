#!/usr/bin/env node
// Verify AI Insights (narrative-heavy) has NO white blaze in dark mode.
// Genie profile, dark, land on ai-insights, wait for real KPI+RISKS sections,
// then scan solid + gradient whites and screenshot.
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:active-surface", "ai-insights");
        localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api"; ex.darkMode = true;
        localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25_000 });
    // wait for real sections (not placeholders)
    const dl = Date.now() + 120_000;
    while (Date.now() < dl) {
        const ok = await page.evaluate(() => !!document.querySelector('[data-section="KPI SNAPSHOT"]:not(.gn-insights-section--placeholder)') && !!document.querySelector('[data-section="RISKS"]:not(.gn-insights-section--placeholder)') && document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length === 0);
        if (ok) break; await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500);
    const whites = await page.evaluate(() => {
        const parse = s => { const m = (s || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
        const out = [];
        document.querySelectorAll("*").forEach(el => {
            const cs = getComputedStyle(el); const bg = parse(cs.backgroundColor); const img = cs.backgroundImage || "";
            const solid = bg && bg.a >= 0.5 && bg.r >= 235 && bg.g >= 235 && bg.b >= 235;
            const grad = /rgba?\(\s*2(?:3[5-9]|[4-5]\d)\s*,\s*2(?:3[5-9]|[4-5]\d)\s*,\s*2(?:3[5-9]|[4-5]\d)/.test(img) || /#f{3,6}|#f8fafc|#fafafa|#fafcff|255,\s*255,\s*255/.test(img);
            if (!solid && !grad) return;
            const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 18) return;
            out.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), bg: solid ? cs.backgroundColor : "grad" });
        });
        const seen = new Map();
        for (const o of out) { const key = o.tag + "." + o.cls; if (!seen.has(key) || seen.get(key).w * seen.get(key).h < o.w * o.h) seen.set(key, o); }
        return [...seen.values()].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 20);
    });
    console.log(`AI Insights dark — white surfaces (${whites.length}):`);
    for (const w of whites) console.log(`  ${String(w.w).padStart(4)}x${String(w.h).padStart(4)} ${String(w.bg).padEnd(12)} ${w.tag}.${w.cls}`);
    await import("node:fs/promises").then(fs => fs.mkdir("d:/Working_Folder/Projects/PulsePlay/docs/evidence/dark-fix", { recursive: true }));
    await page.screenshot({ path: "d:/Working_Folder/Projects/PulsePlay/docs/evidence/dark-fix/insights-after.png", fullPage: true });
    await browser.close();
}
main().catch(e => { console.error("[FAIL]", e); process.exit(1); });
