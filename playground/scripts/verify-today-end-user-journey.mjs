#!/usr/bin/env node
// playground/scripts/verify-today-end-user-journey.mjs
//
// HEADED end-user journey — simulates a brand-new user opening
// PulsePlay for the first time. Slower than the probe (~10 min) on
// purpose so you can actually watch the screen, not chase the cursor.
//
// What this is NOT: a checklist of data-testid clicks.
// What this IS: real onboarding flow → conversational question →
// follow-up → exploring Settings → trying a different surface. The
// kind of session a first-time user would have.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";
const TYPE_DELAY_MS = 40;          // realistic typing speed
const REACT_PAUSE_MS = 1200;        // brief pause after a UI change settles
const READ_PAUSE_MS  = 6000;        // pause for the watcher to actually read
const LONG_READ_MS   = 9000;        // pause after big screen changes

function story(narration) {
    // Terminal-side narration so the watcher knows what's happening
    // without staring at the URL bar.
    console.log(`\n  ▸ ${narration}`);
}

async function pause(page, ms, why) {
    if (why) console.log(`    (${why})`);
    await page.waitForTimeout(ms);
}

async function typeNatural(locator, text) {
    await locator.click();
    await locator.fill(""); // clear any existing content cleanly
    await locator.pressSequentially(text, { delay: TYPE_DELAY_MS });
}

async function main() {
    console.log("Launching headed Chromium — a window will appear on your desktop.");
    console.log("This is a 10-minute scripted end-user journey. Just watch.\n");

    const browser = await chromium.launch({
        headless: false,
        slowMo: 350,
        args: ["--window-size=1400,900", "--window-position=120,80"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    // ─── Act 1: First impression ─────────────────────────────────────
    console.log("━━━ ACT 1 — First impression ━━━");
    story("A new user opens PulsePlay for the first time. They have no setup yet.");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, READ_PAUSE_MS, "they take in what they're looking at");

    // If wizard appeared, walk through it. If not (already dismissed),
    // we'll see the empty state and use the CTA path.
    const wizard = page.locator('[data-testid="pp-first-run-wizard"]').first();
    const wizardAppeared = (await wizard.count()) > 0;

    if (wizardAppeared) {
        story("The First-Run Wizard greeted them. They start by picking a persona.");
        await pause(page, READ_PAUSE_MS, "they read the persona cards");

        const analyst = page.locator('[data-testid="pp-first-run-persona-analyst"]').first();
        if (await analyst.count() > 0) {
            await analyst.click();
            await pause(page, REACT_PAUSE_MS);
        }
        story("Analyst selected. They click Continue.");
        await page.locator('button:has-text("Continue")').first().click();
        await pause(page, READ_PAUSE_MS, "Step 2 — pick a BI vendor and an AI connector");

        // Step 2 — pick whatever vendor + connector is available
        const firstVendor = page.locator('[data-testid^="pp-first-run-vendor-"]').first();
        if (await firstVendor.count() > 0) {
            await firstVendor.click();
            await pause(page, REACT_PAUSE_MS);
        }
        story("They picked the first available BI vendor.");
        const firstConnector = page.locator('[data-testid^="pp-first-run-connector-"]').first();
        if (await firstConnector.count() > 0) {
            await firstConnector.click();
            await pause(page, REACT_PAUSE_MS);
        }
        story("They picked an AI connector. Both axes set — moving on.");
        await pause(page, READ_PAUSE_MS - 2000);
        await page.locator('button:has-text("Continue")').first().click();
        await pause(page, READ_PAUSE_MS, "Step 3 — embed config (they decide to skip the probe)");

        // Step 3 — Continue without testing
        const skipBtn = page.locator('button:has-text("Continue without testing")').first();
        if (await skipBtn.count() > 0) {
            await skipBtn.click();
        } else {
            // Fall back to the Continue button if "skip test" isn't visible
            await page.locator('button:has-text("Continue")').first().click();
        }
        await pause(page, READ_PAUSE_MS, "Step 4 — they see a suggested first question");

        // Step 4 — "Done & ask"
        const doneAskBtn = page.locator('button:has-text("Done & ask")').first();
        if (await doneAskBtn.count() > 0) {
            story("They like the suggested question. Clicking 'Done & ask' to fire it.");
            await doneAskBtn.click();
        } else {
            await page.locator('button:has-text("Done")').first().click();
        }
        await pause(page, REACT_PAUSE_MS);
    } else {
        story("(No wizard — falling back to the empty-state CTA path.)");
    }

    await pause(page, LONG_READ_MS, "wizard closed, the real app is visible now");

    // ─── Act 2: First question ───────────────────────────────────────
    console.log("\n━━━ ACT 2 — Asking the first real question ━━━");
    story("They see the assistant surface. Time to type a real question.");
    await pause(page, READ_PAUSE_MS, "they scan the context strip — Assistant, Source, Trust");

    // Make sure we're on the Ask Pulse-style surface (v0). If the wizard's
    // auto-submit already fired, history will have an entry — that's fine.
    const composer = page.locator('textarea').first();
    if (await composer.count() === 0) {
        story("(No composer found — surface may be PulseShell. Clicking Ask Pulse tab.)");
        const askTab = page.locator('button:has-text("Ask Pulse")').first();
        if (await askTab.count() > 0) {
            await askTab.click();
            await pause(page, REACT_PAUSE_MS);
        }
    }

    // Check if an auto-submit already happened from the wizard's "Done & ask"
    const existingEntries = await page.locator('[data-testid^="pp-ai-entry-"]').count();
    if (existingEntries === 0) {
        story("Typing: 'What stood out in sales last quarter?'");
        await typeNatural(page.locator('textarea').first(), "What stood out in sales last quarter?");
        await pause(page, READ_PAUSE_MS, "they re-read their question, then click Ask");
        await page.locator('button.pp-ai-sidebar__ask').first().click();
    } else {
        story(`(${existingEntries} entry already in flight from the wizard's auto-submit.)`);
    }

    // Wait for the reply
    story("Waiting for Genie to answer…");
    const deadline = Date.now() + 90_000;
    let finalStatus = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        finalStatus = await page.evaluate(() => {
            const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
            const last = entries[entries.length - 1];
            return last ? last.getAttribute("data-status") : null;
        });
        if (finalStatus === "completed" || finalStatus === "failed") break;
    }
    story(`Reply arrived — status: ${finalStatus}.`);
    await pause(page, LONG_READ_MS, "they read the answer + check the Trust badge");

    // ─── Act 3: Follow-up question ───────────────────────────────────
    console.log("\n━━━ ACT 3 — Follow-up question ━━━");
    story("They have a follow-up. Typing it into the same composer.");
    await typeNatural(page.locator('textarea').first(), "Which of those was the biggest surprise?");
    await pause(page, READ_PAUSE_MS, "they review, then click Ask");
    await page.locator('button.pp-ai-sidebar__ask').first().click();

    story("Waiting for the follow-up reply…");
    const deadline2 = Date.now() + 90_000;
    let followStatus = null;
    while (Date.now() < deadline2) {
        await page.waitForTimeout(2000);
        const n = await page.locator('[data-testid^="pp-ai-entry-"]').count();
        if (n >= 2) {
            followStatus = await page.evaluate(() => {
                const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
                const last = entries[entries.length - 1];
                return last ? last.getAttribute("data-status") : null;
            });
            if (followStatus === "completed" || followStatus === "failed") break;
        }
    }
    story(`Follow-up status: ${followStatus}.`);
    await pause(page, LONG_READ_MS, "they read the follow-up answer");

    // ─── Act 4: Exploring Settings ───────────────────────────────────
    console.log("\n━━━ ACT 4 — Exploring Settings ━━━");
    story("Curiosity strikes. They want to see what Settings looks like.");
    await page.goto(BASE + "/settings/ai", { waitUntil: "networkidle" });
    await pause(page, LONG_READ_MS, "they read the AI settings page");

    story("They navigate to the Display sub-page under Preferences.");
    await page.goto(BASE + "/settings/preferences", { waitUntil: "networkidle" });
    await pause(page, LONG_READ_MS, "they see the per-tab visibility model");

    // ─── Act 5: Trying the escape hatch ──────────────────────────────
    console.log("\n━━━ ACT 5 — Power-user escape hatch ━━━");
    story("They're curious about the 'pulse' escape hatch. They open DevTools mentally and flip the flag.");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.setItem("pulseplay:ui-mode", "pulse"));
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, LONG_READ_MS, "PulseShell is mounted — 3-tab strip, briefing-heritage chrome");

    story("OK that was the escape hatch. They flip back to the default.");
    await page.evaluate(() => localStorage.removeItem("pulseplay:ui-mode"));
    await page.reload({ waitUntil: "networkidle" });
    await pause(page, READ_PAUSE_MS, "back to the v0 default surface");

    // ─── Done ────────────────────────────────────────────────────────
    console.log("\n━━━ End of journey ━━━");
    story("Demo complete. Closing the browser in 8 seconds — feel free to interact with it.");
    await pause(page, 8000);
    await browser.close();
    console.log("\nDone. Window closed.");
}

main().catch(async (err) => {
    console.error("\n[FATAL]", err.message);
    process.exitCode = 1;
});
