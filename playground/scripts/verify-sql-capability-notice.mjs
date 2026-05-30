// playground/scripts/verify-sql-capability-notice.mjs
//
// #2 capability greying: the SQL sections editor surfaces a "requires a
// connected profile" notice (and disables Validate) when no AI profile is
// connected, and hides it once one is — instead of a cryptic Validate error.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/evolving";
const GENIE_KEY = "pulseplay:visual-settings:genieSettings";

async function freshPage(browser, seed = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript((s) => {
        try {
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
            for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
        } catch { /* ignore */ }
    }, seed);
    return { ctx, page: await ctx.newPage() };
}

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    // 1. NO profile connected → notice present, Validate disabled.
    {
        const { ctx, page } = await freshPage(browser, {}); // no ai-profile, empty genieSettings
        await page.goto(`${BASE}/settings/ai/sql-sections`, { waitUntil: "domcontentloaded", timeout: 18000 });
        await page.waitForTimeout(1200);
        const notice = page.locator("[data-testid='pp-sql-capability-notice']");
        log(await notice.count() > 0, "No profile → capability notice shown");
        const txt = await notice.first().innerText().catch(() => "");
        log(/warehouse/i.test(txt) && /AI .* Provider/i.test(txt), "Notice explains the requirement + where to fix it");
        // Add a section; Validate should be disabled.
        await page.locator("[data-testid='pp-sql-section-add']").click();
        await page.waitForTimeout(300);
        const validateDisabled = await page.locator("[data-testid='pp-sql-section-0-validate']").isDisabled();
        log(validateDisabled, "Validate disabled while no profile connected");
        await page.screenshot({ path: `${OUT}/14-sql-capability-notice.png`, fullPage: false });
        await ctx.close();
    }

    // 2. Profile connected → notice gone, Validate enabled.
    {
        const { ctx, page } = await freshPage(browser, {
            "pulseplay:ai-profile": "genie-default",
            [GENIE_KEY]: JSON.stringify({ assistantProfile: "genie-default", connectionMode: "proxy", apiBaseUrl: "/api" }),
        });
        await page.goto(`${BASE}/settings/ai/sql-sections`, { waitUntil: "domcontentloaded", timeout: 18000 });
        await page.waitForTimeout(1200);
        log(await page.locator("[data-testid='pp-sql-capability-notice']").count() === 0, "Profile connected → notice hidden");
        await page.locator("[data-testid='pp-sql-section-add']").click();
        await page.waitForTimeout(300);
        const enabled = !(await page.locator("[data-testid='pp-sql-section-0-validate']").isDisabled());
        log(enabled, "Validate enabled once a profile is connected");
        await ctx.close();
    }

    await browser.close();
    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
