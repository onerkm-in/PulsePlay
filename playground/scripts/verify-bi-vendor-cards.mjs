// playground/scripts/verify-bi-vendor-cards.mjs
//
// Verify the card-based BI vendor picker in Settings → BI → Provider:
//   - vendor cards render (one per allowed vendor)
//   - the current vendor's card is selected
//   - clicking a different card switches the selection (and updates biVendor)
//   - the separate Surface-mode control still renders (axes kept distinct)

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

    await page.goto(`${BASE}/settings/bi/provider`, { waitUntil: "networkidle", timeout: 18000 });
    await page.waitForTimeout(1200);

    const cards = page.locator("[data-testid^='pp-vendor-card-']");
    const n = await cards.count();
    log(n >= 2, `Vendor cards render (count=${n})`);

    const pbiCard = page.locator("[data-testid='pp-vendor-card-powerbi']");
    log(await pbiCard.getAttribute("data-selected") === "true", "Current vendor (powerbi) card is selected");

    // Switch to a different vendor card.
    const targetId = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("[data-testid^='pp-vendor-card-']"));
        const other = cards.find(c => c.getAttribute("data-selected") !== "true");
        return other ? other.getAttribute("data-testid").replace("pp-vendor-card-", "") : null;
    });
    if (targetId) {
        await page.locator(`[data-testid='pp-vendor-card-${targetId}']`).click();
        await page.waitForTimeout(500);
        const nowSelected = await page.locator(`[data-testid='pp-vendor-card-${targetId}']`).getAttribute("data-selected");
        log(nowSelected === "true", `Clicking the '${targetId}' card selects it`);
        const pbiStill = await pbiCard.getAttribute("data-selected");
        log(pbiStill !== "true", "Previous (powerbi) card de-selects (single-select)");
    } else {
        log(false, "No alternative vendor card to switch to");
    }

    // Surface mode control still present (distinct axis preserved).
    const surfaceMode = await page.getByText(/Surface mode/i).count();
    log(surfaceMode > 0, "Surface-mode control still present (vendor vs mode axes kept distinct)");

    await page.screenshot({ path: `${OUT}/13-bi-vendor-cards.png`, fullPage: false });
    await browser.close();

    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
