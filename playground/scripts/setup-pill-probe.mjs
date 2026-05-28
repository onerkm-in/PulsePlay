// One-shot check for the UX-ARCH-0B.1.5 + .1.6 changes — pill + subtitle.
// Loads /settings/setup, inspects the pill, captures computed style on the
// green dot to prove the heartbeat keyframe is wired.
import { chromium } from "playwright";

const BASE = process.env.PP_BASE_URL || "http://127.0.0.1:5173/";
const TARGET = new URL("settings/setup", BASE).toString();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto(TARGET, { waitUntil: "networkidle", timeout: 15000 });
await page.waitForTimeout(800);

const probe = await page.evaluate(() => {
    const pill = document.querySelector(".pp-setup__pill");
    if (!pill) return { found: false };
    const chip = pill.querySelector(".pp-settings-chip");
    const chipDot = pill.querySelector(".pp-settings-chip__dot");
    const chipLabel = pill.querySelector(".pp-settings-chip__label");
    const previewLink = pill.querySelector(".pp-setup__pill-action");
    const dotStyle = chipDot ? window.getComputedStyle(chipDot) : null;
    const subtitle = document.querySelector(".pp-setup__subtitle");
    const anchors = document.querySelectorAll(".pp-setup__anchor");
    const searchInput = document.querySelector(".pp-setup__search-input");
    return {
        found: true,
        pillStructure: {
            chipPresent: !!chip,
            chipToneClass: chip ? Array.from(chip.classList).find(c => c.startsWith("pp-settings-chip--")) : null,
            chipLabelText: chipLabel?.textContent ?? null,
            previewLinkText: previewLink?.textContent?.trim() ?? null,
            previewLinkHref: previewLink?.getAttribute("href") ?? null,
        },
        heartbeat: dotStyle ? {
            animationName: dotStyle.animationName,
            animationDuration: dotStyle.animationDuration,
            animationIterationCount: dotStyle.animationIterationCount,
            animationTimingFunction: dotStyle.animationTimingFunction,
        } : null,
        subtitleText: subtitle?.textContent?.trim() ?? null,
        anchorCount: anchors.length,
        anchorLabels: Array.from(anchors).map(a => a.textContent?.trim() ?? ""),
        searchInputPresent: !!searchInput,
        searchInputPlaceholder: searchInput?.getAttribute("placeholder") ?? null,
        consoleErrors: [],
    };
});

probe.consoleErrors = consoleErrors.slice(0, 10);
await browser.close();
console.log(JSON.stringify(probe, null, 2));
