#!/usr/bin/env node
// playground/scripts/verify-unified-sprint-smoke.mjs
//
// Focused smoke for the unified-screen sprint (9290d92 → 530c3eb):
//   1. App boots without console errors
//   2. PulsePlayScreen mounts with the three named slot wrappers
//   3. Default uiMode behavior — observe what mounts cold (no localStorage seed)
//   4. Settings → AI has no UI mode picker; Preferences has no UI mode picker
//   5. AI-assisted suggest panel (Thread A) still works when uiMode=v0
//   6. TrustBadge (Thread B) still renders on a UnifiedAssistantSurface reply
//
// Reuses the patterns from verify-sprint-abcd.mjs but doesn't depend on
// its old A/B/C/D state-seed assumption.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".verify-sprint-unified-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const log = [];
const errors = [];
const record = (line) => { log.push(line); console.log(line); };

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();

    page.on("console", (msg) => {
        if (msg.type() === "error") {
            errors.push(`[console:error] ${msg.text()}`);
            record(`[browser:error] ${msg.text()}`);
        }
    });
    page.on("pageerror", (err) => {
        errors.push(`[pageerror] ${err.message}`);
        record(`[browser:pageerror] ${err.message}`);
    });

    // ── STEP 1: cold boot, NO localStorage seed ──────────────────────
    record(`[1] cold-boot navigate to ${BASE}/`);
    await page.context().clearCookies();
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    // Make sure storage is empty BEFORE asserting default mount
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.reload({ waitUntil: "networkidle" });
    // Dismiss FirstRunWizard if it pops up so we can see the screen
    const wizardDismiss = page.locator('button:has-text("Skip"), button:has-text("Close"), button:has-text("Later"), button[aria-label*="Close" i]').first();
    if (await wizardDismiss.count() > 0) {
        await wizardDismiss.click().catch(() => undefined);
        await page.waitForTimeout(400);
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT_DIR, "01-cold-boot.png"), fullPage: false });
    const title = await page.title();
    record(`[1] title=${JSON.stringify(title)}`);

    // ── STEP 2: PulsePlayScreen + slot wrappers in DOM ──────────────
    const probe1 = await page.evaluate(() => ({
        pulseScreen: document.querySelectorAll('[data-testid="pp-screen"]').length,
        floatingSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
        mainSlot: document.querySelectorAll('[data-testid="pp-screen-main-slot"]').length,
        dockSlot: document.querySelectorAll('[data-testid="pp-screen-dock-slot"]').length,
        pulseShell: document.querySelectorAll('.gn-shell, [class*="gn-shell"], [class*="PulseShell"]').length,
        unifiedSurface: document.querySelectorAll('.pp-ai-sidebar, [class*="pp-ai-sidebar"]').length,
        askButtons: document.querySelectorAll('button.pp-ai-sidebar__ask').length,
        wizardPresent: document.querySelectorAll('[class*="FirstRunWizard"], [data-testid*="wizard" i]').length,
        bodyClasses: document.body.className.slice(0, 200),
    }));
    record(`[2] cold-boot DOM probe: ${JSON.stringify(probe1, null, 2)}`);
    const observedUiModeCold = await page.evaluate(() => localStorage.getItem("pulseplay:ui-mode") || "<unset>");
    record(`[2] cold-boot ui-mode in storage: ${observedUiModeCold}`);

    // ── STEP 3: /settings/ai — no UI mode picker ────────────────────
    record(`[3] navigating to /settings/ai`);
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.screenshot({ path: join(OUT_DIR, "03-settings-ai.png"), fullPage: true });
    const aiText = await page.evaluate(() => document.body.innerText);
    const hasUiModePickerInAi = /\bUI mode\b/i.test(aiText)
        && /\b(Pulse|v0|Classic|Sidebar)\b/i.test(aiText);
    const aiUiModeLineCount = (aiText.match(/UI mode/gi) || []).length;
    record(`[3] Settings → AI: text matches "UI mode" ${aiUiModeLineCount} times; appears with picker-style label nearby: ${hasUiModePickerInAi}`);

    // ── STEP 3b: /settings/preferences — confirm picker removed ────
    record(`[3b] navigating to /settings/preferences`);
    await page.goto(BASE + "/settings/preferences", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.screenshot({ path: join(OUT_DIR, "03b-settings-preferences.png"), fullPage: true });
    const prefsText = await page.evaluate(() => document.body.innerText);
    const prefsUiModeLineCount = (prefsText.match(/UI mode/gi) || []).length;
    // Look for a button group with Pulse / Sidebar labels which would indicate a picker
    const prefsPickerHits = await page.locator('button:has-text("Pulse"), button:has-text("Sidebar"), button:has-text("v0"), button:has-text("Classic")').count();
    record(`[3b] Settings → Preferences: "UI mode" ${prefsUiModeLineCount} times; picker-style button hits: ${prefsPickerHits}`);

    // ── STEP 4: enable v0 escape-hatch + seed profile so Thread A works ─
    record(`[4] seeding pulseplay:ui-mode=v0 + profile=${PROFILE} for Thread A/B`);
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate((profile) => {
        localStorage.setItem("pulseplay:ui-mode", "v0");
        localStorage.setItem("pulseplay:active-ai-profile", profile);
        const rules = [
            { name: "Revenue", higherIsBetter: true, greenPct: 40, amberPct: 20, redPct: 5 },
            { name: "Churn %", higherIsBetter: false, greenPct: 5, amberPct: 10, redPct: 15 },
            { name: "Sales", higherIsBetter: true, greenPct: 50, amberPct: 25, redPct: 10 },
            { name: "Profit", higherIsBetter: true, greenPct: 30, amberPct: 15, redPct: 5 },
        ];
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        existing.insightsMetricDirections = JSON.stringify(rules);
        localStorage.setItem(k, JSON.stringify(existing));
    }, PROFILE);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // Re-probe the screen markers under v0 mode
    const probe2 = await page.evaluate(() => ({
        pulseScreen: document.querySelectorAll('[data-testid="pp-screen"]').length,
        floatingSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
        mainSlot: document.querySelectorAll('[data-testid="pp-screen-main-slot"]').length,
        dockSlot: document.querySelectorAll('[data-testid="pp-screen-dock-slot"]').length,
        pulseShell: document.querySelectorAll('.gn-shell, [class*="gn-shell"]').length,
        unifiedSurface: document.querySelectorAll('.pp-ai-sidebar, [class*="pp-ai-sidebar"]').length,
        askButtons: document.querySelectorAll('button.pp-ai-sidebar__ask').length,
    }));
    record(`[4] post-seed-v0 DOM probe: ${JSON.stringify(probe2, null, 2)}`);
    await page.screenshot({ path: join(OUT_DIR, "04-v0-mode.png"), fullPage: false });

    // ── STEP 5: Thread A — AI-assisted suggest panel still works ────
    record(`[5] navigating to /settings/ai for Thread A re-test`);
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });

    const selects = await page.locator("select").all();
    record(`[5] total <select> on /settings/ai: ${selects.length}`);
    let authoringSelect = null;
    for (const sel of selects) {
        const options = await sel.locator("option").allTextContents();
        if (options.some((o) => /AI-assisted/i.test(o))) { authoringSelect = sel; break; }
    }
    if (!authoringSelect) {
        record(`[5] FAIL: no Authoring mode select with 'AI-assisted' option`);
    } else {
        await authoringSelect.scrollIntoViewIfNeeded();
        await authoringSelect.selectOption("ai-assisted");
        await page.waitForTimeout(800);
        const panel = page.locator(".gn-setup-ai-assist");
        const panelCount = await panel.count();
        record(`[5] .gn-setup-ai-assist panels visible after selecting AI-assisted: ${panelCount}`);
        if (panelCount > 0) {
            await page.screenshot({ path: join(OUT_DIR, "05-thread-a-suggest.png"), fullPage: true });
        }
    }

    // ── STEP 6: Thread B — TrustBadge on a chat reply ───────────────
    record(`[6] navigating to / to drive Ask Pulse → TrustBadge`);
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(500);
    // Click Ask Pulse tab if present
    const askPulseTab = page.locator('button:has-text("Ask Pulse"), a:has-text("Ask Pulse")').first();
    if (await askPulseTab.count() > 0) {
        await askPulseTab.click().catch(() => undefined);
        await page.waitForTimeout(500);
    }
    const composer = page.locator('textarea').first();
    if (await composer.count() === 0) {
        record(`[6] FAIL: no composer textarea (uiMode escape-hatch may not have taken)`);
    } else {
        await composer.fill("Top 3 categories by sales. Markdown table: Category, Sales.");
        const askBtn = page.locator('button.pp-ai-sidebar__ask').first();
        if (await askBtn.count() === 0) {
            record(`[6] FAIL: no AISidebar Ask button`);
        } else {
            await askBtn.click();
            record(`[6] Ask clicked; waiting up to 180s for entry completion`);
            const deadline = Date.now() + 180_000;
            let final = null;
            while (Date.now() < deadline) {
                await page.waitForTimeout(2000);
                const entryStatus = await page.evaluate(() => {
                    const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
                    const last = entries[entries.length - 1];
                    return last ? last.getAttribute("data-status") : null;
                });
                if (entryStatus === "completed" || entryStatus === "failed") {
                    final = entryStatus;
                    break;
                }
            }
            record(`[6] final entry status: ${final || "still-pending"}`);
            await page.screenshot({ path: join(OUT_DIR, "06-thread-b-reply.png"), fullPage: true });
            const badges = await page.locator('[data-testid="trust-badge"]').all();
            record(`[6] TrustBadge instances on the reply: ${badges.length}`);
            for (const b of badges.slice(0, 8)) {
                const status = await b.getAttribute("data-status");
                const text = await b.textContent();
                record(`[6]   data-status="${status}" text="${(text||"").trim()}"`);
            }
        }
    }

    record(`[done] console errors observed: ${errors.length}`);
    await writeFile(join(OUT_DIR, "verify.log"), log.join("\n"), "utf-8");
    await writeFile(join(OUT_DIR, "errors.log"), errors.join("\n"), "utf-8");
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    await writeFile(join(OUT_DIR, "verify.log"), log.join("\n") + "\n[FATAL] " + err.stack, "utf-8").catch(() => undefined);
    process.exitCode = 1;
});
