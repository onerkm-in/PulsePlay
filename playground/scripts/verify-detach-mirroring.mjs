#!/usr/bin/env node
// Quick live smoke: Pop-out should mirror the main pane (not mount a second pane).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".mirror-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 600,
        args: ["--window-position=80,80", "--window-size=1500,1050"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => console.log(`[pageerror] ${err.message.slice(0, 100)}`));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        window.localStorage.setItem("pulseplay:ui-mode", "pulse");
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default";
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const sentinel = `dedock mirror sentinel ${Date.now()}`;
    await page.evaluate((text) => {
        const source = document.querySelector(".pp-app__sidebar")
            ?? document.querySelector('[data-testid="pp-panel-chrome-ai"]')
            ?? document.querySelector("[data-pane='ai']");
        const node = document.createElement("div");
        node.setAttribute("data-detach-mirror-sentinel", "true");
        node.textContent = text;
        source?.appendChild(node);
    }, sentinel);

    // T1 — baseline: AI pane visible in main slot.
    const before = await page.evaluate(() => ({
        aiChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]').length,
        biChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-bi"]').length,
        floatSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
    }));
    console.log(`[T1 before] aiChrome=${before.aiChrome} biChrome=${before.biChrome} float=${before.floatSlot}`);
    await page.screenshot({ path: join(OUT_DIR, "T1-before-popout.png"), fullPage: false });

    // T2 — click Pop-out through the accessible action first; fall back to
    // the toolbar position only for older builds that have not surfaced the
    // same action in the active AI row.
    const popOut = page.getByRole("button", { name: /Pop out AI panel as window/i }).first();
    if (await popOut.count()) {
        await popOut.click();
    } else {
        await page.locator('[data-testid="pp-top-right-toolbar"] button').nth(4).click();
    }
    await page.waitForTimeout(1200);

    const after = await page.evaluate(() => ({
        aiChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]').length,
        biChrome: document.querySelectorAll('[data-testid="pp-panel-chrome-bi"]').length,
        floatSlot: document.querySelectorAll('[data-testid="pp-screen-floating-slot"]').length,
        liveMirror: document.querySelectorAll('[data-testid="pp-live-pane-mirror"]').length,
        sentinelInMirror: Boolean(document.querySelector('[data-testid="pp-live-pane-mirror"] [data-detach-mirror-sentinel="true"]')),
    }));
    console.log(`[T2 after Pop-out] aiChrome=${after.aiChrome} biChrome=${after.biChrome} float=${after.floatSlot} liveMirror=${after.liveMirror} sentinelInMirror=${after.sentinelInMirror}`);
    await page.screenshot({ path: join(OUT_DIR, "T2-after-popout-mirrored.png"), fullPage: false });

    // EXPECTED with live mirroring: source pane count does not increase, one
    // floating slot appears, and the source sentinel is cloned into the mirror.
    const mirroringOK = after.aiChrome === before.aiChrome
        && after.floatSlot === 1
        && after.liveMirror === 1
        && after.sentinelInMirror;
    console.log(`\n[VERDICT] Mirroring works: ${mirroringOK ? "PASS" : "FAIL"} (aiChrome ${before.aiChrome} -> ${after.aiChrome}, float slot ${before.floatSlot} -> ${after.floatSlot}, liveMirror=${after.liveMirror}, sentinelInMirror=${after.sentinelInMirror})`);

    if (!mirroringOK) {
        process.exitCode = 1;
    }

    console.log("[done] closing in 5s");
    await page.waitForTimeout(5000);
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
