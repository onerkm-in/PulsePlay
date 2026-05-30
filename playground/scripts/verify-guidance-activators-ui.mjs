// playground/scripts/verify-guidance-activators-ui.mjs
//
// Slice 1 UI check: Settings → AI → Domain guidance shows the greyed-out
// activator placeholder, and the ⓘ help button beside it opens a tooltip
// listing the recognized keywords.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/evolving";

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    await page.goto(`${BASE}/settings/ai/response-behavior`, { waitUntil: "networkidle", timeout: 18000 });
    await page.waitForTimeout(1200);

    // Find the Domain guidance textarea by its placeholder content.
    const ta = page.locator("textarea").filter({ hasText: "" });
    const domainTa = page.locator("textarea[placeholder*='Numeric Formatting']");
    const found = await domainTa.count();
    log(found > 0, `Domain guidance textarea shows the activator placeholder (count=${found})`);

    if (found > 0) {
        const ph = await domainTa.first().getAttribute("placeholder");
        log(!!ph && ph.includes("## Masking"), "Placeholder includes the ## Masking example");
        log(!!ph && ph.includes("## Numeric Formatting"), "Placeholder includes the ## Numeric Formatting example");
        await domainTa.first().scrollIntoViewIfNeeded();
    }

    // The ⓘ help button beside the "Domain guidance" label.
    const helpBtn = page.locator("button[aria-label='Guidance keyword help']");
    const hasHelp = await helpBtn.count();
    log(hasHelp > 0, `ⓘ help button present beside Domain guidance (count=${hasHelp})`);

    await page.screenshot({ path: `${OUT}/07-domain-guidance-placeholder.png`, fullPage: false });

    if (hasHelp > 0) {
        // HelpTip opens on hover/focus (and toggles on click). Hover is the
        // reliable trigger for the portal tooltip.
        await helpBtn.first().hover();
        await page.waitForTimeout(250);
        await helpBtn.first().focus().catch(() => {});
        await page.waitForTimeout(400);
        const tip = page.locator("[role='tooltip']");
        const tipVisible = await tip.count();
        log(tipVisible > 0, "ⓘ help tooltip opens");
        if (tipVisible > 0) {
            const txt = await tip.first().innerText();
            log(/numeric formatting/i.test(txt), "Tooltip explains Numeric Formatting");
            log(/masking/i.test(txt), "Tooltip explains Masking");
            log(/unity catalog/i.test(txt), "Tooltip carries the honest UC-masking caveat");
        }
        await page.screenshot({ path: `${OUT}/08-domain-guidance-help-open.png`, fullPage: false });
    }

    await browser.close();
    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
