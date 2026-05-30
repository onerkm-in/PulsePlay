#!/usr/bin/env node
// playground/scripts/verify-presets-and-autodetect-headed.mjs
//
// HEADED demo for today's latest insights work:
//   * Custom-section preset picker (SWOT/BCG/RFM/Pareto/Superstore)
//     ported into Settings → AI
//   * Bundled metric-direction rules — picking SWOT writes BOTH
//     insightsCustomSections AND metricDirectionRules in one click
//   * MetricDirectionAutoDetectChip — chip appears in Settings → AI
//     once the discovery snapshot has classified measures
//
// Total runtime ~5-7 minutes. Window pops up on your desktop; sit back.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";
const READ_PAUSE = 5500;
const ACTION_PAUSE = 2500;

function story(msg) {
    const t = new Date().toISOString().substring(11, 19);
    console.log(`  [${t}] ▸ ${msg}`);
}
async function pause(page, ms, why) {
    if (why) console.log(`    (${why})`);
    await page.waitForTimeout(ms);
}

async function main() {
    console.log("Launching headed Chromium — a window will pop up on your desktop.\n");

    const browser = await chromium.launch({
        headless: false,
        slowMo: 400,
        args: ["--window-size=1400,900", "--window-position=120,80"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", e => errors.push(e.message));

    // ─── Setup ───────────────────────────────────────────────────────
    console.log("━━━ Setup ━━━");
    story("Cold boot — clear localStorage, configure profile + ui-mode=pulse + /api prefix.");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        localStorage.setItem("pulseplay:active-ai-profile", "default");
        localStorage.setItem("pulseplay:ui-mode", "pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(localStorage.getItem(k) || "{}");
        existing.assistantProfile = "default";
        existing.connectionMode = "proxy";
        existing.apiBaseUrl = window.location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(existing));
    });
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 2500, "discovery prewarm fires on AI Insights mount");

    const wizardDismiss = page.locator('button[aria-label="Skip setup and close"]').first();
    if (await wizardDismiss.count() > 0) {
        await wizardDismiss.click().catch(() => undefined);
        await pause(page, 800);
    }

    // ─── Trigger discovery so the auto-detect chip will have data ──
    story("Letting App.tsx + AI Insights prewarm the discovery snapshot.");
    await pause(page, 3500, "wait for snapshot to land in sessionStorage");

    // ─── Open Settings → AI ──────────────────────────────────────────
    console.log("\n━━━ Scenario 1 — Open Settings → AI ━━━");
    story("Navigating to /settings/ai");
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle" });
    await pause(page, READ_PAUSE, "scroll-friendly read of the page");

    // Scroll to the Response behavior section so the user sees the new pickers
    story("Scrolling down to the Response behavior section (where the new pickers live).");
    await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll("h2, h3, .gn-setup-section-title, [class*='SectionTitle']"));
        const target = headings.find(h => /Response behavior/i.test(h.textContent || ""));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    await pause(page, READ_PAUSE, "Response behavior section — look for the new preset pickers");

    // ─── Scenario 2 — Pick SWOT preset (bundled rules demo) ────────
    console.log("\n━━━ Scenario 2 — Pick SWOT preset (bundles rules) ━━━");
    story("Find the Custom sections preset library dropdown.");
    const presetSelect = page.locator('select[aria-label="Custom sections preset library"]').first();
    if (await presetSelect.count() === 0) {
        story("⚠ Preset dropdown not found — selector aria-label may differ. Falling back to first .gn-setup-preset-library select.");
        await pause(page, READ_PAUSE);
    } else {
        await presetSelect.scrollIntoViewIfNeeded();
        await pause(page, 1200);

        // Capture current state of the two fields BEFORE applying
        const beforeState = await page.evaluate(() => {
            const sectionsArea = document.querySelector('textarea[placeholder*="headline"]');
            const rulesArea = document.querySelector('textarea[placeholder*="Revenue: higher is better"]');
            return {
                sectionsBefore: sectionsArea?.value?.length || 0,
                rulesBefore: rulesArea?.value?.length || 0,
            };
        });
        story(`Before picking SWOT: customSections=${beforeState.sectionsBefore} chars, metricRules=${beforeState.rulesBefore} chars`);

        story("Selecting 'SWOT analysis' from the dropdown.");
        await presetSelect.selectOption({ label: "SWOT analysis" });
        await pause(page, 1500);
        story("Clicking 'Apply sections' button.");
        const applyBtn = page.locator('button:has-text("Apply sections")').first();
        await applyBtn.click();
        await pause(page, 1500);

        const afterState = await page.evaluate(() => {
            const sectionsArea = document.querySelector('textarea[placeholder*="headline"]');
            const rulesArea = document.querySelector('textarea[placeholder*="Revenue: higher is better"]');
            return {
                sectionsAfter: sectionsArea?.value?.length || 0,
                rulesAfter: rulesArea?.value?.length || 0,
                sectionsText: (sectionsArea?.value || "").substring(0, 120),
                rulesText: (rulesArea?.value || "").substring(0, 200),
            };
        });
        story(`After SWOT apply: customSections=${afterState.sectionsAfter} chars, metricRules=${afterState.rulesAfter} chars`);
        story(`  rules now: "${afterState.rulesText.replace(/\n/g, ' | ')}"`);
        if (afterState.rulesAfter > 0) {
            story("✅ Bundled rules wrote successfully (both fields populated in one click).");
        } else {
            story("⚠ Bundled rules did NOT populate. Check the wiring.");
        }
        await pause(page, READ_PAUSE, "compare before/after; both fields should now be populated");
    }

    // ─── Scenario 3 — Try a different preset (BCG) ─────────────────
    console.log("\n━━━ Scenario 3 — Switch to BCG matrix preset ━━━");
    story("Switching dropdown to 'BCG growth-share matrix'.");
    if (await presetSelect.count() > 0) {
        await presetSelect.selectOption({ label: "BCG growth-share matrix" });
        await pause(page, 1500);
        await page.locator('button:has-text("Apply sections")').first().click();
        await pause(page, 1500);
        const bcgState = await page.evaluate(() => {
            const rulesArea = document.querySelector('textarea[placeholder*="Revenue: higher is better"]');
            return {
                rules: (rulesArea?.value || "").substring(0, 200),
            };
        });
        story(`BCG rules: "${bcgState.rules.replace(/\n/g, ' | ')}"`);
        await pause(page, READ_PAUSE, "rules should differ from SWOT — BCG has Share %, Growth %");
    }

    // ─── Scenario 4 — Auto-detect chip ───────────────────────────────
    console.log("\n━━━ Scenario 4 — Metric direction auto-detect chip ━━━");
    story("Scrolling to the Metric direction preset library leaf to look for the auto-detect chip.");
    await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll("label, .pp-leaf-label, [class*='LeafLabel']"));
        const target = labels.find(l => /Metric direction preset library/i.test(l.textContent || ""));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    await pause(page, 2000);

    const chipState = await page.evaluate(() => {
        const chip = document.querySelector('[data-testid="pp-metric-autodetect-chip"]');
        return {
            present: !!chip,
            title: chip?.querySelector('.pp-metric-autodetect-chip__title')?.textContent?.trim() || null,
            subtitle: chip?.querySelector('.pp-metric-autodetect-chip__subtitle')?.textContent?.trim() || null,
        };
    });
    if (chipState.present) {
        story(`✅ Auto-detect chip is present.`);
        story(`   title:    "${chipState.title}"`);
        story(`   subtitle: "${chipState.subtitle}"`);
        await pause(page, READ_PAUSE, "chip should show 'Auto-detected from dataset (N metrics)'");

        story("Clicking 'Apply rules' on the chip.");
        const chipApply = page.locator('[data-testid="pp-metric-autodetect-chip-apply"]').first();
        if (await chipApply.count() > 0) {
            await chipApply.click();
            await pause(page, 1500);
            const afterChipApply = await page.evaluate(() => {
                const rulesArea = document.querySelector('textarea[placeholder*="Revenue: higher is better"]');
                return (rulesArea?.value || "").substring(0, 220);
            });
            story(`Rules after auto-apply: "${afterChipApply.replace(/\n/g, ' | ')}"`);
            await pause(page, READ_PAUSE, "rules should now reflect bound BI measure names from the snapshot");
        }
    } else {
        story("⚠ Auto-detect chip is NOT present. Likely cause: discovery snapshot has no biMetadata.visibleMeasures yet.");
        story("   This can happen on cold-boot sessions where AI Insights hasn't run yet.");
        await pause(page, READ_PAUSE);
    }

    // ─── Done ────────────────────────────────────────────────────────
    console.log("\n━━━ End of demo ━━━");
    console.log(`Console errors observed: ${errors.length}`);
    for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);

    story("Holding browser open for 10s — inspect freely.");
    await pause(page, 10_000);
    await browser.close();
    console.log("\nDone.");
}

main().catch(async err => {
    console.error("\n[FATAL]", err.message);
    process.exitCode = 1;
});
