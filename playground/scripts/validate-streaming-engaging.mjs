#!/usr/bin/env node
// Watchable showcase of the live streaming treatment: shimmer verb + glyph
// glow + bar sweep while the run is ACTIVE. Asks a question and lingers on the
// streaming state (headed, slow), grabbing a few frames so the animated
// progress widget is captured mid-flight.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/streaming-engaging/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 250, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 900 } });
    const page = await ctx.newPage();

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2000);

    let frames = 0, sawActive = false, sawShimmer = false;
    try {
        await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("Sales trend over the past quarters");
        await page.waitForTimeout(300);
        await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();

        // Capture frames while the run is active.
        const dl = Date.now() + 60_000;
        while (Date.now() < dl) {
            const st = await page.evaluate(() => {
                const active = document.querySelector(".gn-progress--active");
                if (!active) return { active: false };
                const label = active.querySelector(".gn-progress-active-label");
                const cs = label ? getComputedStyle(label) : null;
                return {
                    active: true,
                    // background-clip:text shimmer leaves text fill transparent
                    shimmer: cs ? (cs.webkitTextFillColor === "rgba(0, 0, 0, 0)" || cs.webkitTextFillColor === "transparent") : false,
                    hasBarSweep: !!active.querySelector(".gn-progress-bar"),
                    labelText: label ? label.textContent.slice(0, 60) : "",
                };
            });
            if (st.active) {
                sawActive = true;
                if (st.shimmer) sawShimmer = true;
                if (frames < 4) {
                    await page.screenshot({ path: join(OUT_DIR, `active-${frames}.png`) }).catch(() => {});
                    frames++;
                }
            } else if (sawActive) {
                break; // run finished
            }
            await page.waitForTimeout(900);
        }
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(OUT_DIR, "final.png") }).catch(() => {});
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    console.log(`sawActive=${sawActive} sawShimmer=${sawShimmer} frames=${frames}`);
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
