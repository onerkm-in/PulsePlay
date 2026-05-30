// Verifies the heartbeat animation fires in the Connected state. Seeds
// localStorage with a native-canvas BI surface + an AI profile so the
// pill flips to --ok, then captures the computed animation on the dot.
import { chromium } from "playwright";

const BASE = process.env.PP_BASE_URL || "http://127.0.0.1:5173/";
const TARGET = new URL("settings/setup", BASE).toString();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Seed localStorage so both halves register as connected:
//  - bi-surface-mode = "native" satisfies the BI half (no embed needed)
//  - active-ai-profile = "default" satisfies the AI half
await page.addInitScript(() => {
    window.localStorage.setItem("pulseplay:bi-surface-mode", "native");
    window.localStorage.setItem("pulseplay:active-ai-profile", "default");
});

await page.goto(TARGET, { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(800);

const probe = await page.evaluate(() => {
    const pill = document.querySelector(".pp-setup__pill");
    const chip = pill?.querySelector(".pp-settings-chip");
    const chipDot = pill?.querySelector(".pp-settings-chip__dot");
    const chipLabel = pill?.querySelector(".pp-settings-chip__label");
    const subtitle = document.querySelector(".pp-setup__subtitle");
    const dotStyle = chipDot ? window.getComputedStyle(chipDot) : null;
    return {
        pillTone: chip ? Array.from(chip.classList).find(c => c.startsWith("pp-settings-chip--")) : null,
        pillLabel: chipLabel?.textContent ?? null,
        subtitleText: subtitle?.textContent?.trim() ?? null,
        heartbeat: dotStyle ? {
            animationName: dotStyle.animationName,
            animationDuration: dotStyle.animationDuration,
            animationIterationCount: dotStyle.animationIterationCount,
            animationTimingFunction: dotStyle.animationTimingFunction,
        } : null,
    };
});

await browser.close();
console.log(JSON.stringify(probe, null, 2));
