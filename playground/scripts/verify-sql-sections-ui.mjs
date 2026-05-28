// playground/scripts/verify-sql-sections-ui.mjs
//
// Slice 3 UI check: Settings → AI → "SQL sections".
//   - Add a SQL section, set name/SQL/render.
//   - DML SQL triggers the deterministic client-side lint (no network).
//   - The section persists into insightsCustomSections JSON, preserving any
//     pre-existing AI section.
//   - The Validate button wires (shows validating → result/error).

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/evolving";
const KEY = "pulseplay:visual-settings:genieSettings";

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
            // Seed one AI section so we can prove it's preserved when adding SQL.
            localStorage.setItem("pulseplay:visual-settings:genieSettings", JSON.stringify({
                assistantProfile: "genie-default",
                connectionMode: "proxy",
                apiBaseUrl: "/api",
                insightsCustomSections: JSON.stringify([
                    { name: "Executive Brief", instruction: "Summarize the quarter.", kind: "ai" },
                ]),
            }));
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };
    const readSections = () => page.evaluate((k) => {
        try { return JSON.parse(JSON.parse(localStorage.getItem(k) || "{}").insightsCustomSections || "[]"); }
        catch { return []; }
    }, KEY);

    await page.goto(`${BASE}/settings/ai/sql-sections`, { waitUntil: "networkidle", timeout: 18000 });
    await page.waitForTimeout(1200);

    const editor = page.locator("[data-testid='pp-sql-sections-editor']");
    log(await editor.count() > 0, "SQL sections editor present");

    const addBtn = page.locator("[data-testid='pp-sql-section-add']");
    log(await addBtn.count() > 0, "'Add SQL section' button present");
    await addBtn.first().click();
    await page.waitForTimeout(300);
    log(await page.locator("[data-testid='pp-sql-section-0']").count() > 0, "A SQL section row appears after Add");

    // Fill name + a DML SQL to trigger the deterministic client-side lint.
    await page.locator("[data-testid='pp-sql-section-0'] input[type='text']").first().fill("Revenue KPI");
    await page.locator("[data-testid='pp-sql-section-0-sql']").fill("DROP TABLE sales");
    await page.waitForTimeout(300);
    await page.locator("[data-testid='pp-sql-section-0-validate']").click();
    await page.waitForTimeout(400);
    const lintText = await page.locator("[data-testid='pp-sql-section-0']").innerText();
    log(/forbidden|DML|read-only/i.test(lintText), `DML SQL caught by client-side lint (badge: "${lintText.split("\n").find(l => /forbidden|DML|read-only/i.test(l)) || ""}")`);

    await page.screenshot({ path: `${OUT}/11-sql-section-lint.png`, fullPage: false });

    // Replace with a clean SELECT and confirm it persists into the JSON
    // (alongside the preserved AI section).
    await page.locator("[data-testid='pp-sql-section-0-sql']").fill("select sum(revenue) as total from sales");
    await page.waitForTimeout(400);
    const sections = await readSections();
    const names = sections.map(s => s.name);
    log(names.includes("Executive Brief"), `Pre-existing AI section preserved (sections: ${names.join(", ")})`);
    const sqlSec = sections.find(s => s.name === "Revenue KPI");
    log(!!sqlSec && sqlSec.kind === "sql", "New SQL section persisted with kind:sql");
    log(!!sqlSec && /select sum\(revenue\)/i.test(sqlSec.sql || ""), "SQL body persisted");

    // Validate the clean SELECT (network) — observe the wiring resolves to a
    // result or a clean error (proxy/warehouse may not be live in this env).
    await page.locator("[data-testid='pp-sql-section-0-validate']").click();
    await page.waitForTimeout(2500);
    const afterValidate = await page.locator("[data-testid='pp-sql-section-0']").innerText();
    const resolved = /✓|✗|Returned|error|status|Proxy|Network|cancelled/i.test(afterValidate);
    log(resolved, `Validate wired — resolved to a result/error badge (observed: "${afterValidate.split("\n").slice(-1)[0]}")`);

    await page.screenshot({ path: `${OUT}/12-sql-section-validate.png`, fullPage: false });

    await browser.close();
    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
