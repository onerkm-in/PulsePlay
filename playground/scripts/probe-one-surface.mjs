#!/usr/bin/env node
// Single-surface preview probe — opens ONE surface at ONE viewport, holds
// the browser visible for ~10s for inspection, captures one screenshot,
// then exits cleanly. Used for incremental review-then-fix workflow.
//
// Usage:
//   node scripts/probe-one-surface.mjs --surface ai-insights --viewport desktop
//   node scripts/probe-one-surface.mjs --surface ask-pulse   --viewport mobile

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const BASE = "http://127.0.0.1:7001";

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, val, idx, arr) => {
        if (val.startsWith("--")) acc.push([val.slice(2), arr[idx + 1]]);
        return acc;
    }, [])
);
const surfaceId = args.surface || "ai-insights";
const viewportName = args.viewport || "desktop";
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
};
const vp = VIEWPORTS[viewportName] || VIEWPORTS.desktop;

const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/one-surface-${viewportName}-${surfaceId}-${RUN_ID}`);

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: 250,
        args: ["--window-position=80,80"],
    });
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const consoleErrs = [];
    const pageErrs = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 200)));

    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.evaluate(() => {
            try { window.localStorage.clear(); } catch { /* swallow */ }
            window.localStorage.setItem("pulseplay:active-ai-profile", "default");
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
            ex.assistantProfile = "default";
            ex.connectionMode = "proxy";
            ex.apiBaseUrl = window.location.origin + "/api";
            window.localStorage.setItem(k, JSON.stringify(ex));
        });

        console.log(`[probe] ${viewportName} ${vp.width}×${vp.height} · /?surface=${surfaceId}`);
        await page.goto(`${BASE}/?surface=${surfaceId}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(2000);

        // If --wait-content (or surface=ai-insights), poll for the briefing
        // to finish drafting before capturing. AI Insights' staged
        // orchestrator can take 30-120s; we wait for skeleton loaders to
        // disappear and real section headers to appear.
        const waitForContent = surfaceId === "ai-insights" || "wait-content" in args;
        if (waitForContent) {
            console.log("[probe] waiting for content to render (briefing drafting can take up to 180s)…");
            const deadline = Date.now() + 180_000;
            let lastSig = "";
            while (Date.now() < deadline) {
                const sig = await page.evaluate(() => {
                    const drafting = document.querySelector(".gn-progress-active, .gn-chat-progress, .gn-skeleton, [data-status='drafting']");
                    const skeleton = document.querySelectorAll("[class*='skeleton'], [class*='shimmer']").length;
                    const sections = document.querySelectorAll(".gn-insights-section, [data-section-id], h2, .gn-stage-trace").length;
                    const draftingText = (document.body.innerText || "").match(/drafting|working out|generating|please wait/i) ? 1 : 0;
                    return { drafting: !!drafting, skeleton, sections, draftingText, len: (document.body.innerText || "").length };
                });
                const sigKey = `${sig.drafting}|${sig.skeleton}|${sig.sections}|${sig.draftingText}|${Math.floor(sig.len / 100)}`;
                if (sigKey !== lastSig) {
                    console.log(`  [poll] drafting=${sig.drafting} skeleton=${sig.skeleton} sections=${sig.sections} draftingText=${sig.draftingText} bodyLen=${sig.len}`);
                    lastSig = sigKey;
                }
                if (!sig.drafting && sig.skeleton === 0 && sig.draftingText === 0 && (sig.sections >= 3 || sig.len > 800)) {
                    console.log("  [poll] content settled — capturing");
                    break;
                }
                await page.waitForTimeout(1500);
            }
            await page.waitForTimeout(2000); // final settle
        }

        await page.evaluate(({ viewport, surface, w, h }) => {
            const b = document.createElement("div");
            b.style.cssText = "position:fixed;top:8px;left:8px;right:8px;z-index:99999;padding:6px 10px;background:rgba(15,23,42,0.92);color:#fff;font:12px ui-monospace,monospace;border-radius:4px;border-left:4px solid #a855f7;pointer-events:none;";
            b.textContent = `Preview · ${viewport} ${w}×${h} · ${surface}`;
            document.body.appendChild(b);
        }, { viewport: viewportName, surface: surfaceId, w: vp.width, h: vp.height });

        await page.waitForTimeout(800);
        const screenshot = `${viewportName}-${surfaceId}.png`;
        await page.screenshot({ path: join(OUT_DIR, screenshot), fullPage: false });
        console.log(`[probe] screenshot → ${join(OUT_DIR, screenshot)}`);

        // Hold browser open briefly for user inspection
        await page.waitForTimeout(3000);

        // Also capture a full-page screenshot for context
        await page.screenshot({ path: join(OUT_DIR, `${viewportName}-${surfaceId}-fullpage.png`), fullPage: true });

        await writeFile(join(OUT_DIR, "info.json"), JSON.stringify({
            viewport: viewportName, surface: surfaceId, viewportSize: vp,
            consoleErrs, pageErrs, screenshotPath: join(OUT_DIR, screenshot),
        }, null, 2));

        console.log(`[done] consoleErrs=${consoleErrs.length} pageErrs=${pageErrs.length}`);
        console.log(`[done] artifacts → ${OUT_DIR}`);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
