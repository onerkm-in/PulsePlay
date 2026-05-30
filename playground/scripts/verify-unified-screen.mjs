#!/usr/bin/env node
// playground/scripts/verify-unified-screen.mjs
//
// HEADED playwright smoke for the 2026-05-25 unified-screen sprint.
// Drives the local dev server (http://127.0.0.1:7001) in a visible
// Chromium window with slow-mo so the operator can WATCH each step
// happen on their desktop. Captures screenshots + a verify.log into
// playground/scripts/.unified-out/ as the durable evidence.
//
// What this verifies (today's 9 commits 9290d92 → 530c3eb):
//   1. App boots without console errors
//   2. Default chat surface is UnifiedAssistantSurface (NOT PulseShell)
//      — confirms Step 1's uiMode default flip + Step 1.5's rename
//   3. PulsePlayScreen + slot wrappers render in DOM
//      — confirms Step 2 architecture
//   4. Settings → AI no longer shows the "UI mode" picker
//      — confirms Step 1's removal
//   5. AI-assisted suggest panel still works (Thread A regression check)
//   6. Chat reply still renders TrustBadge (Thread B regression check)
//   7. PROBE: localStorage["pulseplay:ui-mode"]="pulse" still mounts
//      PulseShell as the dev-tools escape hatch (Step 1 contract)

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".unified-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const log = [];
const record = (line) => { log.push(line); console.log(line); };

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`[boot] launching HEADED Chromium @ slowMo=500ms — watch your screen`);
    const browser = await chromium.launch({
        headless: false,
        slowMo: 500,           // 500ms between every action — watchable
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    page.on("console", (msg) => {
        if (msg.type() === "error") record(`[browser:error] ${msg.text()}`);
    });
    page.on("pageerror", (err) => record(`[browser:pageerror] ${err.message}`));

    try {
        await runStep1Boot(page);
        await runStep2DefaultIsV0(page);
        await runStep3PulsePlayScreenInDom(page);
        await runStep4SettingsAi(page);
        await runStep5AiAssistedPanel(page);
        await runStep6ChatBadgeRegression(page);
        await runStep7EscapeHatchProbe(page);
    } catch (err) {
        record(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
    }

    record(`[done] watch your screen — closing in 5 seconds`);
    await page.waitForTimeout(5000);
    await writeFile(join(OUT_DIR, "verify.log"), log.join("\n"), "utf-8");
    await browser.close();
}

// ─── Step 1: Boot ────────────────────────────────────────────────────────
async function runStep1Boot(page) {
    record(`\n[Step 1] Boot — navigate to ${BASE}/`);
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    // Seed an active AI profile so the app considers itself set up.
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(existing));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change", { detail: { objectName: "genieSettings" } }));
    }, PROFILE);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT_DIR, "01-boot.png"), fullPage: false });
    const title = await page.title();
    record(`[Step 1] document.title = ${JSON.stringify(title)} — screenshot 01-boot.png`);
}

// ─── Step 2: Default uiMode is v0 (UnifiedAssistantSurface mounts) ───────
async function runStep2DefaultIsV0(page) {
    record(`\n[Step 2] Default uiMode should be v0 → UnifiedAssistantSurface mounts (NOT PulseShell)`);
    // Verify the ui-mode storage key is either "v0" or unset (defaults to v0).
    const storedUiMode = await page.evaluate(() => window.localStorage.getItem("pulseplay:ui-mode"));
    record(`[Step 2] localStorage["pulseplay:ui-mode"] = ${JSON.stringify(storedUiMode)} (null is the v0 default)`);
    // UnifiedAssistantSurface keeps the legacy CSS class .pp-ai-sidebar__ask
    // for its Ask button — that's our v0 marker. PulseShell has no such class.
    const askButtonCount = await page.locator(".pp-ai-sidebar__ask").count();
    const pulseTabsCount = await page.locator('button:has-text("Ask Pulse")').count();
    record(`[Step 2] .pp-ai-sidebar__ask buttons in DOM: ${askButtonCount} (>0 means v0/UnifiedAssistantSurface)`);
    record(`[Step 2] "Ask Pulse" tab buttons: ${pulseTabsCount} (0 means PulseShell tab strip is NOT mounted)`);
}

// ─── Step 3: PulsePlayScreen + slot wrappers render ──────────────────────
async function runStep3PulsePlayScreenInDom(page) {
    record(`\n[Step 3] PulsePlayScreen architecture — Step 2 contract`);
    const screenCount = await page.locator('[data-testid="pp-screen"]').count();
    const floatSlotCount = await page.locator('[data-testid="pp-screen-floating-slot"]').count();
    const mainSlotCount = await page.locator('[data-testid="pp-screen-main-slot"]').count();
    const dockSlotCount = await page.locator('[data-testid="pp-screen-dock-slot"]').count();
    record(`[Step 3] [data-testid="pp-screen"]              count: ${screenCount} (expect 1)`);
    record(`[Step 3] [data-testid="pp-screen-floating-slot"] count: ${floatSlotCount} (expect 0 when nothing floating)`);
    record(`[Step 3] [data-testid="pp-screen-main-slot"]     count: ${mainSlotCount} (expect 1 — main is required)`);
    record(`[Step 3] [data-testid="pp-screen-dock-slot"]     count: ${dockSlotCount} (expect 0 when nothing minimized)`);
    // Confirm display: contents on the wrapper (CSS-neutral contract).
    const display = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="pp-screen"]');
        return el ? getComputedStyle(el).display : "<missing>";
    });
    record(`[Step 3] PulsePlayScreen wrapper computed display: ${display} (expect "contents")`);
}

// ─── Step 4: Settings → AI — no UI mode picker ───────────────────────────
async function runStep4SettingsAi(page) {
    record(`\n[Step 4] Settings → AI — UI mode picker should be GONE (Step 1 removal)`);
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(800);
    // Expand any collapsed <details> so we see the full settings tree.
    await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await page.waitForTimeout(300);
    // The OLD picker had a ButtonGroup with options "Pulse" and "v0".
    // After Step 1, that picker is gone entirely.
    const pulseOption = await page.locator('button[aria-pressed]:has-text("Pulse")').count();
    const v0Option = await page.locator('button[aria-pressed]:has-text("v0")').count();
    record(`[Step 4] "Pulse" button option count: ${pulseOption} (expect 0 — picker removed)`);
    record(`[Step 4] "v0" button option count:    ${v0Option} (expect 0 — picker removed)`);
    await page.screenshot({ path: join(OUT_DIR, "04-settings-ai.png"), fullPage: true });
    record(`[Step 4] captured 04-settings-ai.png`);
}

// ─── Step 5: AI-assisted suggest panel (Thread A regression) ────────────
async function runStep5AiAssistedPanel(page) {
    record(`\n[Step 5] Thread A — AI-assisted suggest panel (regression check)`);
    // Already on /settings/ai. Find the Authoring mode select.
    const selects = await page.locator("select").all();
    let authoringSelect = null;
    for (const sel of selects) {
        const options = await sel.locator("option").allTextContents();
        if (options.some((o) => /AI-assisted/i.test(o))) { authoringSelect = sel; break; }
    }
    if (!authoringSelect) {
        record(`[Step 5] FAIL: no Authoring mode select found — Thread A regression`);
        return;
    }
    await authoringSelect.selectOption("ai-assisted");
    await page.waitForTimeout(800);
    const panelCount = await page.locator(".gn-setup-ai-assist").count();
    record(`[Step 5] .gn-setup-ai-assist panel count after switching to ai-assisted: ${panelCount} (expect 1)`);
    await page.screenshot({ path: join(OUT_DIR, "05-ai-assisted-panel.png"), fullPage: true });
    record(`[Step 5] captured 05-ai-assisted-panel.png`);
}

// ─── Step 6: TrustBadge on chat reply (Thread B regression) ─────────────
async function runStep6ChatBadgeRegression(page) {
    record(`\n[Step 6] Thread B — TrustBadge on chat reply (regression check)`);
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(600);
    const composer = page.locator("textarea").first();
    if ((await composer.count()) === 0) {
        record(`[Step 6] FAIL: no composer textarea on home — chat surface didn't mount`);
        return;
    }
    await composer.fill("Top 3 categories by sales in one sentence.");
    const askBtn = page.locator("button.pp-ai-sidebar__ask").first();
    if ((await askBtn.count()) === 0) {
        record(`[Step 6] FAIL: no Ask button (.pp-ai-sidebar__ask) — UnifiedAssistantSurface not mounted`);
        return;
    }
    record(`[Step 6] clicking Ask; waiting up to 90s for Genie completion (cold warehouse possible)…`);
    await askBtn.click();
    const deadline = Date.now() + 90_000;
    let final = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        final = await page.evaluate(() => {
            const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
            const last = entries[entries.length - 1];
            return last ? last.getAttribute("data-status") : null;
        });
        if (final === "completed" || final === "failed") break;
    }
    record(`[Step 6] final entry status: ${final || "still-pending"}`);
    const badgeCount = await page.locator('[data-testid="trust-badge"]').count();
    record(`[Step 6] TrustBadge count after reply: ${badgeCount} (expect ≥1 if reply completed)`);
    if (badgeCount > 0) {
        const status = await page.locator('[data-testid="trust-badge"]').first().getAttribute("data-status");
        const text = await page.locator('[data-testid="trust-badge"]').first().textContent();
        record(`[Step 6] first TrustBadge: data-status="${status}" text="${(text||"").trim()}"`);
    }
    await page.screenshot({ path: join(OUT_DIR, "06-chat-with-badge.png"), fullPage: true });
    record(`[Step 6] captured 06-chat-with-badge.png`);
}

// ─── Step 7: 🔍 PROBE — escape hatch: localStorage opt-in to pulse ──────
async function runStep7EscapeHatchProbe(page) {
    record(`\n[Step 7] 🔍 PROBE — PulseShell escape hatch (set localStorage["pulseplay:ui-mode"]="pulse")`);
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:ui-mode", "pulse");
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // PulseShell renders an internal tab strip with "Ask Pulse" / "AI Insights" / "Dashboard".
    const pulseTabsCount = await page.locator('button:has-text("Ask Pulse")').count();
    const askBtnCount = await page.locator(".pp-ai-sidebar__ask").count();
    record(`[Step 7] After ui-mode=pulse + reload:`);
    record(`[Step 7]   "Ask Pulse" tab buttons: ${pulseTabsCount} (expect ≥1 — PulseShell mounted)`);
    record(`[Step 7]   .pp-ai-sidebar__ask count: ${askBtnCount} (expect 0 — UnifiedAssistantSurface NOT mounted)`);
    await page.screenshot({ path: join(OUT_DIR, "07-escape-hatch-pulse.png"), fullPage: true });
    record(`[Step 7] captured 07-escape-hatch-pulse.png`);
    // Reset so subsequent runs don't inherit the pulse mode.
    await page.evaluate(() => { window.localStorage.removeItem("pulseplay:ui-mode"); });
    record(`[Step 7] escape hatch cleared (ui-mode storage removed)`);
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
