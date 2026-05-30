#!/usr/bin/env node
// Diagnose why the ColorRulesBanner preset <select> is/ isn't present after an
// AI Insights briefing. Reports the 3 gate conditions so we can tell a real
// regression from correct conditional suppression.
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
        ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25_000 });
    const dl = Date.now() + 120_000;
    while (Date.now() < dl) {
        const ok = await page.evaluate(() => !!document.querySelector('[data-section="KPI SNAPSHOT"]:not(.gn-insights-section--placeholder)') && document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length === 0);
        if (ok) break; await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500);
    const diag = await page.evaluate(() => {
        const sel = document.querySelector("select[aria-label='Metric direction preset']");
        const settingsRaw = localStorage.getItem("pulseplay:visual-settings:genieSettings") || "{}";
        let rules = "";
        try { rules = JSON.parse(settingsRaw).metricDirectionRules || ""; } catch { /* */ }
        const text = document.body.innerText || "";
        const hasStatusEmoji = text.includes("🟢") || text.includes("🟡") || text.includes("🔴");
        // KPI badge glyphs (rendered status, separate from markdown emoji)
        const kpiBadges = document.querySelectorAll('[data-section="KPI SNAPSHOT"] .gn-kpi-card').length;
        const bannerNoColor = /No status colors on this briefing/.test(text);
        return { selectPresent: !!sel, metricDirectionRules: rules, hasStatusEmoji, kpiBadges, bannerNoColor };
    });
    console.log("ColorRulesBanner gate diagnosis:");
    console.log("  preset <select> present:        ", diag.selectPresent);
    console.log("  'No status colors' banner shown:", diag.bannerNoColor);
    console.log("  metricDirectionRules set:       ", diag.metricDirectionRules ? `YES (${diag.metricDirectionRules.length} chars)` : "no");
    console.log("  briefing has 🟢/🟡/🔴 emoji:      ", diag.hasStatusEmoji);
    console.log("  KPI cards rendered:             ", diag.kpiBadges);
    const expectedHidden = diag.metricDirectionRules || diag.hasStatusEmoji;
    console.log(`\nVERDICT: ${diag.selectPresent ? "banner PRESENT (preset testable)" : expectedHidden ? "banner CORRECTLY SUPPRESSED (rules set or briefing already colored) — not a bug" : "banner ABSENT but conditions say it SHOULD show — REAL ISSUE"}`);
    // Capture what the section classes ACTUALLY are, to resolve the KPI=0 anomaly.
    const classes = await page.evaluate(() => {
        const secs = [...document.querySelectorAll('[data-section]')].map(s => (s.getAttribute("data-section") || "") + (s.className.includes("placeholder") ? "(ph)" : ""));
        const cardClasses = [...new Set([...document.querySelectorAll('[data-section="KPI SNAPSHOT"] *')].map(e => e.className).filter(c => typeof c === "string" && /card|kpi|metric/i.test(c)))].slice(0, 8);
        return { sections: secs, cardClasses };
    });
    console.log("  sections present:", JSON.stringify(classes.sections));
    console.log("  KPI child card-ish classes:", JSON.stringify(classes.cardClasses));
    await import("node:fs/promises").then(fs => fs.mkdir("d:/Working_Folder/Projects/PulsePlay/docs/evidence/color-banner", { recursive: true }));
    await page.screenshot({ path: "d:/Working_Folder/Projects/PulsePlay/docs/evidence/color-banner/ai-insights.png", fullPage: true });
    await browser.close();
}
main().catch(e => { console.error("[FAIL]", e); process.exit(1); });
