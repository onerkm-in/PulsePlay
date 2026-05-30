#!/usr/bin/env node
// Headed validation for the BundleSwitcher (ADR-0011). Verifies the chained
// chip renders the bound pair, opens the menu, and switching a bundle swaps
// BOTH axes (biVendor + activeAiProfile). Screenshots before/after.
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/bundle-switcher";
const slow = process.argv.includes("--headed");

async function main() {
    const browser = await chromium.launch({ headless: !slow, slowMo: slow ? 350 : 0, args: ["--window-size=1500,1000"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
        localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = "powerbi-dwd"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);
    await import("node:fs/promises").then(fs => fs.mkdir(OUT, { recursive: true }));

    const results = [];
    const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); };

    const chip = page.locator(".pp-bundle-switcher__chip").first();
    const visible = await chip.count() > 0 && await chip.isVisible();
    rec("chip renders in top bar", visible);
    if (!visible) { await page.screenshot({ path: OUT + "/no-chip.png" }); await browser.close(); return summarize(results); }

    const chipText = (await chip.innerText()).replace(/\s+/g, " ").trim();
    rec("chip shows bound pair (Power BI ⇄ Semantic Q&A)", /Power BI/.test(chipText) && /Semantic Q&A/.test(chipText), chipText);
    await page.screenshot({ path: OUT + "/1-before.png" });

    await chip.click();
    await page.waitForTimeout(400);
    const menu = page.locator(".pp-bundle-switcher__menu");
    rec("menu opens on click", await menu.count() > 0 && await menu.isVisible());
    const options = page.locator(".pp-bundle-switcher__menu [role='option']");
    const optCount = await options.count();
    rec("menu lists ≥2 bundles", optCount >= 2, `${optCount} bundles`);
    const optTexts = (await options.allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim());
    rec("includes Power BI × Genie", optTexts.some(t => /Power BI × Genie/.test(t)), optTexts.join(" | "));
    await page.screenshot({ path: OUT + "/2-menu-open.png" });

    // Switch to the Genie bundle
    const genieOpt = options.filter({ hasText: "Power BI × Genie" }).first();
    await genieOpt.click();
    await page.waitForTimeout(700);
    const newProfile = await page.evaluate(() => localStorage.getItem("pulseplay:active-ai-profile"));
    rec("switching swaps the AI brain (active-ai-profile → default)", newProfile === "default", `now=${newProfile}`);
    const newVendor = await page.evaluate(() => localStorage.getItem("pulseplay:bi-vendor"));
    rec("BI surface stays powerbi (same-vendor switch)", newVendor === "powerbi", `now=${newVendor}`);
    const chipText2 = (await chip.innerText()).replace(/\s+/g, " ").trim();
    rec("chip now shows Power BI ⇄ Genie", /Power BI/.test(chipText2) && /Genie/.test(chipText2), chipText2);
    await page.screenshot({ path: OUT + "/3-after-switch.png" });

    await browser.close();
    return summarize(results);
}
function summarize(results) {
    const pass = results.filter(r => r.ok).length;
    console.log(`\n${pass}/${results.length} checks passed`);
    process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error("[FAIL]", e); process.exit(1); });
