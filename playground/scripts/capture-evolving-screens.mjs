// playground/scripts/capture-evolving-screens.mjs
//
// Screenshots of the evolving surfaces after the 2026-05-28 changes:
//   1. Cold boot → Workbench (default), no surface chip
//   2. Settings → Display → Surface → "Chat surface" toggle (author control)
//   3. With Chat enabled → top-bar Workbench⇄Chat chip appears
//   4. After flipping to Chat → v0 surface, chip flips back to Workbench
//
// Also asserts the gate: chip absent when allowChatSurface off, present when on.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:7001";
const OUT = "screenshots/evolving";

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
            localStorage.removeItem("pulseplay:ui-mode");
            // NOTE: do NOT wipe genieSettings here — addInitScript runs on
            // EVERY navigation, so wiping would erase the allowChatSurface
            // toggle we set mid-test. A fresh context already starts with no
            // genieSettings (allowChatSurface defaults off), so no wipe needed.
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    const results = [];
    const log = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? "✅" : "❌"} ${msg}`); };

    // 1. Cold boot → Workbench, no chip.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 25000 });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/01-workbench-default-no-chip.png`, fullPage: false });
    const chipBefore = await page.locator("[data-testid='pp-surface-mode-chip']").count();
    const wbTabs = await page.locator("#gn-tab-insights, .gn-header-tab").count();
    log(wbTabs > 0, `Cold boot = Workbench (gn tabs count=${wbTabs})`);
    log(chipBefore === 0, `Workbench⇄Chat chip HIDDEN by default (count=${chipBefore}, expect 0)`);

    // 2. Settings → Display → Surface → Chat surface toggle.
    await page.goto(`${BASE}/settings/preferences/chat-surface`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/02-settings-surface-chat-toggle.png`, fullPage: true });
    // Find the checkbox by its label text.
    const chatToggle = page.getByText(/Allow end users to switch to the Chat surface/i);
    log(await chatToggle.count() > 0, "Settings → Display → Surface → 'Chat surface' control present");

    // Toggle it ON.
    const checkbox = page.locator("input[type='checkbox']").filter({ has: page.locator(":scope") });
    // More robust: click the label.
    const label = page.locator("label", { hasText: /Allow end users to switch to the Chat surface/i }).first();
    if (await label.count() > 0) {
        await label.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/03-settings-chat-enabled.png`, fullPage: true });
        log(true, "Toggled 'Chat surface' ON");
    } else {
        log(false, "Could not locate the Chat-surface label to toggle");
    }

    // 3. Back to app → chip should now appear.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(2000);
    const chipAfter = await page.locator("[data-testid='pp-surface-mode-chip']").count();
    log(chipAfter > 0, `After enabling Chat: Workbench⇄Chat chip VISIBLE (count=${chipAfter})`);
    await page.screenshot({ path: `${OUT}/04-workbench-with-chip.png`, fullPage: false });

    // 4. Flip the chip to Chat → v0 surface renders.
    if (chipAfter > 0) {
        await page.locator("[data-testid='pp-surface-mode-chip']").click();
        await page.waitForTimeout(2000);
        const v0 = await page.locator("section.pp-ai-sidebar").count();
        log(v0 > 0, `After flipping chip: Chat (v0) surface renders (section.pp-ai-sidebar count=${v0})`);
        await page.screenshot({ path: `${OUT}/05-chat-surface-active.png`, fullPage: false });
    }

    await browser.close();
    const passed = results.filter(r => r.ok).length;
    console.log(`\n${passed === results.length ? "✔ PASS" : "✘ CHECK"} — ${passed}/${results.length}`);
    console.log(`Screenshots in ${OUT}/`);
    if (passed !== results.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
