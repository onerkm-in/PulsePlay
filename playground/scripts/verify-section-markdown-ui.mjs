// playground/scripts/verify-section-markdown-ui.mjs
//
// Slice 2 UI check: Settings → AI → "AI Insights sections" markdown editor.
// Typing `## Section` blocks parses into a live count + writes the canonical
// insightsCustomSections JSON (visible in the Advanced raw-JSON view), while
// preserving any pre-existing SQL section.

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
            // Seed a pre-existing SQL section so we can prove it's preserved.
            localStorage.setItem("pulseplay:visual-settings:genieSettings", JSON.stringify({
                assistantProfile: "genie-default",
                connectionMode: "proxy",
                apiBaseUrl: "/api",
                insightsCustomSections: JSON.stringify([
                    { name: "Revenue KPI", sql: "select sum(rev) from t", kind: "sql", resultRender: "kpi" },
                ]),
            }));
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    await page.goto(`${BASE}/settings/ai/ai-insights-sections`, { waitUntil: "networkidle", timeout: 18000 });
    await page.waitForTimeout(1200);

    const editor = page.locator("[data-testid='pp-section-md-textarea']");
    log(await editor.count() > 0, "Markdown section editor present");

    // The pre-existing SQL section should be reported as preserved.
    const status = page.locator("[data-testid='pp-section-md-status']");
    const statusText0 = await status.first().innerText().catch(() => "");
    log(/1 SQL section/i.test(statusText0), `Pre-existing SQL section reported as preserved (status: "${statusText0.replace(/\n/g, " ")}")`);

    // Type two markdown sections.
    await editor.first().fill("## Executive Brief\nSummarize revenue vs prior year.\n\n## Category Mix\nRank categories by margin.");
    await page.waitForTimeout(500);
    const statusText1 = await status.first().innerText().catch(() => "");
    log(/2 AI sections/i.test(statusText1), `Live count shows 2 AI sections (status: "${statusText1.replace(/\n/g, " ")}")`);
    log(/Executive Brief/.test(statusText1) && /Category Mix/.test(statusText1), "Section names listed in the status line");
    log(/1 SQL section/i.test(statusText1), "SQL section still preserved after editing AI sections");

    await page.screenshot({ path: `${OUT}/09-section-markdown-editor.png`, fullPage: false });

    // Open the Advanced raw JSON view and confirm the merged JSON has both kinds.
    const adv = page.getByText(/Advanced — raw sections JSON/i);
    if (await adv.count() > 0) {
        await adv.first().click();
        await page.waitForTimeout(300);
        const jsonTa = page.locator("textarea").filter({ hasText: "" });
        // Find the JSON textarea by its content.
        const rawVal = await page.evaluate(() => {
            const tas = Array.from(document.querySelectorAll("textarea"));
            const hit = tas.find(t => /"kind"\s*:\s*"sql"/.test(t.value) && /Executive Brief/.test(t.value));
            return hit ? hit.value : "";
        });
        log(/"kind":\s*"ai"/.test(rawVal) || /Executive Brief/.test(rawVal), "Raw JSON contains the new AI sections");
        log(/"kind":\s*"sql"/.test(rawVal), "Raw JSON still contains the preserved SQL section");
        await page.screenshot({ path: `${OUT}/10-section-markdown-raw-json.png`, fullPage: false });
    }

    await browser.close();
    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
