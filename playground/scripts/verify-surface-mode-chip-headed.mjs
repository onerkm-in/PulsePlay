#!/usr/bin/env node
// playground/scripts/verify-surface-mode-chip-headed.mjs
//
// HEADED demo for the new SurfaceModeChip (the "Chat ⇄ Workbench" pill
// in the top-right of the app bar). A Chromium window opens on your
// desktop; sit back and watch each scenario play out.
//
// 7 scenarios, ~6-8 min total runtime.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";
const READ_PAUSE = 5500;
const ACTION_PAUSE = 2500;

function story(msg) { console.log(`\n  ▸ ${msg}`); }
async function pause(page, ms, why) {
    if (why) console.log(`    (${why})`);
    await page.waitForTimeout(ms);
}

async function main() {
    console.log("Launching headed Chromium — a window will pop up on your desktop.");
    console.log("Watch the top-right of the header for the 'Chat ⇄ Workbench' chip.\n");

    const browser = await chromium.launch({
        headless: false,
        slowMo: 400,
        args: ["--window-size=1400,900", "--window-position=120,80"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    // ─── 1. Cold boot — v0 + chip visible ────────────────────────────
    console.log("\n━━━ Scenario 1 — Cold boot ━━━");
    story("Opening PulsePlay fresh (clearing localStorage).");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 1200);

    // Dismiss wizard if it shows
    const wizardDismiss = page.locator('button[aria-label="Skip setup and close"]').first();
    if (await wizardDismiss.count() > 0) {
        await wizardDismiss.click().catch(() => undefined);
        await pause(page, 800);
    }

    story("v0 (Chat) surface mounted. Look at the top-right header — the chip reads 'Chat ⇄ Workbench'.");
    await pause(page, READ_PAUSE, "take it in");

    // ─── 2. Hover the chip — show tooltip ────────────────────────────
    console.log("\n━━━ Scenario 2 — Hover the chip ━━━");
    story("Hovering over the chip — the tooltip explains what it does.");
    const chip = page.locator('[data-testid="pp-surface-mode-chip"]').first();
    await chip.hover();
    await pause(page, READ_PAUSE, "read the tooltip — 'Currently: Chat. Click to switch to Workbench…'");

    // ─── 3. Click the chip — flip to pulse ───────────────────────────
    console.log("\n━━━ Scenario 3 — Click to switch to Workbench ━━━");
    story("Clicking the chip — surface should flip live to PulseShell (no reload).");
    await chip.click();
    await pause(page, ACTION_PAUSE, "Suspense fallback briefly (first lazy load of PulseShell)");
    story("PulseShell mounted. Notice: 3-tab strip (AI Insights / Ask Pulse / Dashboard) is now visible.");
    story("The chip now reads 'Workbench ⇄ Chat' — you can flip back.");
    await pause(page, READ_PAUSE + 2000, "compare the two surfaces");

    // ─── 4. Click again — flip back to v0 ────────────────────────────
    console.log("\n━━━ Scenario 4 — Click to flip back to Chat ━━━");
    story("Clicking the chip again — back to v0 / single-pane Chat.");
    await chip.click();
    await pause(page, ACTION_PAUSE);
    story("Back on v0. The flip is instant after the first load (no more Suspense).");
    await pause(page, READ_PAUSE);

    // ─── 5. Set profile + ask a real Genie question ──────────────────
    console.log("\n━━━ Scenario 5 — Real Genie question (chip stays put) ━━━");
    story("Setting an AI profile so we can ask a real question.");
    await page.evaluate(() => {
        localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(localStorage.getItem(k) || "{}");
        existing.assistantProfile = "default";
        existing.connectionMode = "proxy";
        // /api prefix is required: Vite dev server only proxies /api/* → proxy.
        // Without /api, every assistant/* and /health request hits Vite and gets
        // SPA HTML (200) or 404, causing /health JSON.parse failure + API 404s.
        existing.apiBaseUrl = window.location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(existing));
    });
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, 2500, "let discovery settle");
    if (await wizardDismiss.count() > 0) { await wizardDismiss.click().catch(() => undefined); await pause(page, 500); }

    story("Profile set. Trust chip should promote from 'Setup needed' to 'AI configured · No BI fields'.");
    await pause(page, READ_PAUSE);

    story("Typing a question: 'What stood out in sales last quarter?'");
    const composer = page.locator('textarea').first();
    await composer.click();
    await composer.pressSequentially("What stood out in sales last quarter?", { delay: 35 });
    await pause(page, 1500);
    await page.locator('button.pp-ai-sidebar__ask').first().click();
    story("Waiting for Genie reply…");
    const deadline = Date.now() + 90_000;
    let final = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        final = await page.evaluate(() => {
            const e = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
            return e[e.length - 1]?.getAttribute("data-status") || null;
        });
        if (final === "completed" || final === "failed") break;
    }
    story(`Reply: ${final}. The chip is still in the top-right — accessible at any time.`);
    await pause(page, READ_PAUSE + 2500, "read the reply");

    // ─── 6. Flip mid-conversation — chat history survives ────────────
    console.log("\n━━━ Scenario 6 — Flip surfaces with chat history present ━━━");
    story("Clicking the chip with chat history visible — watch what happens.");
    await chip.click();
    await pause(page, ACTION_PAUSE);
    story("Now on Workbench (PulseShell). The chat history doesn't carry over — each surface owns its own.");
    story("Click Ask Pulse tab in PulseShell to see its own chat surface.");
    const askPulseTab = page.locator('button:has-text("Ask Pulse")').first();
    if (await askPulseTab.count() > 0) {
        await askPulseTab.click();
        await pause(page, READ_PAUSE, "different chat surface, but same underlying conversation if you start a new question");
    } else {
        await pause(page, READ_PAUSE);
    }

    story("Flipping back to Chat — original history should still be there.");
    await chip.click();
    await pause(page, ACTION_PAUSE);
    await pause(page, READ_PAUSE, "v0 chat history persists across flips");

    // ─── 7. Settings page — chip still visible ───────────────────────
    console.log("\n━━━ Scenario 7 — Chip on Settings page ━━━");
    story("Navigating to /settings/ai — the chip should still be in the top-right.");
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle" });
    await pause(page, READ_PAUSE, "chip is everywhere the app bar is");

    story("Back to home.");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await pause(page, ACTION_PAUSE);

    // ─── 8. Mobile — chip compacts ───────────────────────────────────
    console.log("\n━━━ Scenario 8 — Mobile viewport (390px) ━━━");
    story("Shrinking to 390px (mobile). The chip should compact — 'Chat ⇄' (target label hides).");
    await page.setViewportSize({ width: 390, height: 844 });
    await pause(page, READ_PAUSE, "still clickable, just shorter");

    story("Clicking the mobile chip — flip still works.");
    await chip.click();
    await pause(page, ACTION_PAUSE);
    story("Workbench at mobile width.");
    await pause(page, READ_PAUSE);

    // ─── Done ────────────────────────────────────────────────────────
    console.log("\n━━━ End of demo ━━━");
    story("Demo complete. Closing browser in 8s — feel free to interact with it.");
    await pause(page, 8000);
    await browser.close();
    console.log("\nDone.");
}

main().catch(async (err) => {
    console.error("[FATAL]", err.message);
    process.exitCode = 1;
});
