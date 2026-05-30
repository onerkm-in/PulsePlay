#!/usr/bin/env node
// Pinpoint which ancestor caps the AI Insights KPI / attention sections at
// ~700px. Loads the app (briefing is cached → fast), then for the KPI-snapshot
// section card walks up the DOM logging className + clientWidth + computed
// max-width / width / display so we know exactly what CSS to change.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 980 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:active-surface", "ai-insights");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });

    // Wait until a KPI card or the KPI SNAPSHOT heading is present (cache or live)
    const deadline = Date.now() + 200_000;
    let found = false;
    while (Date.now() < deadline) {
        found = await page.evaluate(() => {
            const hasKpi = !!document.querySelector(".gn-kpi-card");
            const hasHeading = Array.from(document.querySelectorAll("*")).some(e => /KPI SNAPSHOT/i.test(e.childNodes.length === 1 ? (e.textContent || "") : ""));
            return hasKpi || hasHeading;
        });
        if (found) break;
        await page.waitForTimeout(1000);
    }

    const report = await page.evaluate(() => {
        const card = document.querySelector(".gn-kpi-card");
        const out = { foundCard: !!card, chain: [], viewport: window.innerWidth };
        let el = card;
        let depth = 0;
        while (el && depth < 18) {
            const cs = getComputedStyle(el);
            out.chain.push({
                depth,
                tag: el.tagName.toLowerCase(),
                cls: (el.className || "").toString().slice(0, 80),
                clientWidth: el.clientWidth,
                maxWidth: cs.maxWidth,
                width: cs.width,
                display: cs.display,
                gridCols: cs.gridTemplateColumns && cs.gridTemplateColumns !== "none" ? cs.gridTemplateColumns.slice(0, 60) : "",
                margin: cs.margin,
                alignSelf: cs.alignSelf,
            });
            el = el.parentElement;
            depth++;
        }
        return out;
    });

    console.log("foundCard:", report.foundCard, "viewport:", report.viewport);
    for (const n of report.chain) {
        console.log(`[${String(n.depth).padStart(2)}] w=${String(n.clientWidth).padStart(4)} max=${n.maxWidth.padEnd(8)} disp=${n.display.padEnd(12)} ${n.gridCols ? "grid=" + n.gridCols + " " : ""}${n.tag}.${n.cls}`);
    }
    await browser.close();
}
main().catch((e) => { console.error("[FAIL]", e); process.exit(1); });
