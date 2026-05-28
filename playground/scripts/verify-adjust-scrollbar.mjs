// playground/scripts/verify-adjust-scrollbar.mjs
//
// Verifies the Adjust dropdown (gn-adjust-menu-pop) in Workbench now caps
// its height and scrolls when the suggestion + preset list overflows.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/evolving";

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    // Shorter viewport height so the long Adjust list is guaranteed to overflow.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 620 } });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
            localStorage.removeItem("pulseplay:ui-mode");
            // Mark the profile configured enough that the Insights tab shows
            // the Adjust button (isConfigured gate). genieSettings carries the
            // proxy connection mode + assistant profile.
            localStorage.setItem("pulseplay:visual-settings:genieSettings", JSON.stringify({
                assistantProfile: "genie-default",
                connectionMode: "proxy",
                apiBaseUrl: "/api",
            }));
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "networkidle", timeout: 25000 });
    await page.waitForTimeout(2500);

    const adjustBtn = page.locator(".gn-header-adjust");
    const hasAdjust = await adjustBtn.count();
    log(hasAdjust > 0, `Adjust button present on Insights tab (count=${hasAdjust})`);
    if (hasAdjust === 0) {
        console.log("  · Adjust button not shown (profile not 'configured' in this state) — cannot open menu");
        await page.screenshot({ path: `${OUT}/06-adjust-no-button.png`, fullPage: false });
        await browser.close();
        return;
    }

    await adjustBtn.first().click();
    await page.waitForTimeout(400);
    const pop = page.locator(".gn-adjust-menu-pop");
    log(await pop.count() > 0, "Adjust menu opened (gn-adjust-menu-pop present)");

    const metrics = await pop.first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
            overflowY: cs.overflowY,
            maxHeight: cs.maxHeight,
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
            itemCount: el.querySelectorAll(".gn-adjust-menu-item").length,
        };
    });
    log(metrics.overflowY === "auto" || metrics.overflowY === "scroll", `overflow-y is scrollable (${metrics.overflowY})`);
    log(metrics.scrollHeight > metrics.clientHeight, `content overflows the capped height (scrollHeight=${metrics.scrollHeight} > clientHeight=${metrics.clientHeight}) → scrollbar active`);
    console.log(`  · ${metrics.itemCount} menu items, maxHeight=${metrics.maxHeight}`);

    // Prove it actually scrolls — scroll to bottom and confirm last item reachable.
    const scrolled = await pop.first().evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return el.scrollTop > 0;
    });
    log(scrolled, "Menu scrolls (scrollTop moved past 0) — bottom presets reachable");

    await page.screenshot({ path: `${OUT}/06-adjust-menu-scrollbar.png`, fullPage: false });
    await browser.close();

    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
