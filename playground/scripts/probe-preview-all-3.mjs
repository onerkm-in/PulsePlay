#!/usr/bin/env node
// Preview smoke — tours AI Insights, Ask Pulse, Dashboard surfaces at
// desktop (1440x900) and mobile (390x844) viewports per Codex's uniformity
// handoff. Captures per-surface screenshots + verifies presence of:
//   • surface tab strip
//   • context strip (Surface / mode / Assistant / Source / Scope / Trust)
//   • composer (Ask Pulse only)
// Reports console errors + page errors per surface.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/preview-all-3-${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";

const VIEWPORTS = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
];

const SURFACES = [
    { id: "ai-insights", label: "AI Insights" },
    { id: "ask-pulse", label: "Ask Pulse" },
    { id: "dashboard", label: "Dashboard" },
];

async function banner(page, text, color = "#10b981") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__prv__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__prv__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "6px 10px", background: "rgba(15,23,42,0.92)", color: "#fff",
                font: "12px ui-monospace, monospace", borderRadius: "4px",
                pointerEvents: "none", borderLeft: `4px solid ${color}`,
            });
            document.body.appendChild(b);
        }
        b.textContent = text;
    }, { text, color });
}

async function inspect(page) {
    return await page.evaluate(() => {
        // Surface tab strip (Pulse internal nav: AI Insights / Ask Pulse / Dashboard)
        const tabs = Array.from(document.querySelectorAll("button")).filter(b =>
            /^(AI Insights|Ask Pulse|Dashboard)$/i.test((b.textContent || "").trim())
        ).map(b => {
            const r = b.getBoundingClientRect();
            return {
                label: (b.textContent || "").trim(),
                visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.top < window.innerHeight,
                rect: { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) },
                ariaSelected: b.getAttribute("aria-selected"),
            };
        });

        // Context strip — look for the shared grammar facts
        const contextStrip = document.querySelector(".gn-surface-context, .gn-context-strip, .pp-surface-context, .pp-context-strip, [data-testid*='context-strip'], [data-testid*='surface-context']");
        const contextStripPresent = !!contextStrip;
        const contextStripText = contextStrip ? (contextStrip.textContent || "").trim().slice(0, 240) : null;

        // Composer (Ask Pulse only)
        const composer = document.querySelector("textarea.gn-input, textarea.pp-ai-sidebar__input");
        let composerInfo = null;
        if (composer) {
            const r = composer.getBoundingClientRect();
            composerInfo = {
                present: true,
                visible: r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0,
                rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
            };
        }

        // Horizontal overflow check (mobile concern)
        const horizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;

        // Top-right toolbar overlap with tabs (Codex's flagged mobile bug)
        // 2026-05-27 — fixed false positive: require BOTH vertical Y range
        // overlap AND horizontal X range collision. Tabs that share a Y
        // range with the toolbar but sit left of it don't actually collide.
        const topRightTb = document.querySelector("[data-testid='pp-top-right-toolbar'], .pp-top-right-toolbar");
        let toolbarOverlapsTabs = false;
        if (topRightTb && tabs.length > 0) {
            const tbRect = topRightTb.getBoundingClientRect();
            for (const t of tabs) {
                const tabRect = (document.querySelectorAll("button") || []);
                // Get the actual button rect for this tab — find by text match
                const btnList = Array.from(document.querySelectorAll("button"));
                const tabBtn = btnList.find(b => (b.textContent || "").trim() === t.label);
                if (!tabBtn) continue;
                const r = tabBtn.getBoundingClientRect();
                const vOverlap = r.top < tbRect.bottom && r.bottom > tbRect.top;
                const hOverlap = r.left < tbRect.right && r.right > tbRect.left;
                if (vOverlap && hOverlap) {
                    toolbarOverlapsTabs = true;
                    break;
                }
            }
        }

        return {
            tabs,
            contextStripPresent,
            contextStripText,
            composer: composerInfo,
            horizontalOverflow,
            toolbarOverlapsTabs,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            bodyScrollH: document.documentElement.scrollHeight,
        };
    });
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: 200,
        args: ["--window-position=80,80"],
    });

    const results = [];

    try {
        for (const vp of VIEWPORTS) {
            console.log(`\n=== Viewport: ${vp.name} (${vp.width}×${vp.height}) ===`);
            const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
            const page = await ctx.newPage();
            const consoleErrs = [];
            const pageErrs = [];
            page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 180)); });
            page.on("pageerror", (e) => pageErrs.push(e.message.slice(0, 180)));

            try {
                // One-time setup
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

                for (const s of SURFACES) {
                    console.log(`  [${vp.name}] visiting ${s.label}`);
                    await page.goto(`${BASE}/?surface=${s.id}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
                    await page.waitForTimeout(1800);
                    await banner(page, `Preview · ${vp.name} ${vp.width}×${vp.height} · ${s.label}`, "#a855f7");
                    await page.waitForTimeout(300);

                    const info = await inspect(page);
                    const screenshot = `${vp.name}-${s.id}.png`;
                    await page.screenshot({ path: join(OUT_DIR, screenshot), fullPage: false });

                    // Per-surface verdict
                    const tabsTappable = info.tabs.every(t => t.visible);
                    const composerNeeded = s.id === "ask-pulse";
                    const composerVisible = composerNeeded ? (info.composer?.visible === true) : true;
                    const noOverflow = !info.horizontalOverflow;
                    const noOverlap = !info.toolbarOverlapsTabs;

                    const verdict = (tabsTappable && composerVisible && noOverflow && noOverlap)
                        ? "PASS"
                        : "FAIL";

                    console.log(`     ${verdict}  tabs-tappable=${tabsTappable}  composer-visible=${composerVisible}  no-overflow=${noOverflow}  no-overlap=${noOverlap}  context-strip=${info.contextStripPresent}  errs=${consoleErrs.length}/${pageErrs.length}`);

                    results.push({
                        viewport: vp.name,
                        surface: s.id,
                        verdict,
                        tabsTappable,
                        composerVisible: composerNeeded ? composerVisible : "n/a",
                        contextStripPresent: info.contextStripPresent,
                        contextStripText: info.contextStripText,
                        horizontalOverflow: info.horizontalOverflow,
                        toolbarOverlapsTabs: info.toolbarOverlapsTabs,
                        consoleErrCount: consoleErrs.length,
                        pageErrCount: pageErrs.length,
                        info,
                        screenshot,
                    });
                }
            } finally {
                await ctx.close().catch(() => undefined);
            }
        }
    } finally {
        await browser.close().catch(() => undefined);
    }

    console.log("\n=== Summary ===");
    for (const r of results) {
        console.log(`${r.verdict.padEnd(6)} ${r.viewport.padEnd(8)} ${r.surface.padEnd(12)} composer=${r.composerVisible} context-strip=${r.contextStripPresent} overflow=${r.horizontalOverflow} overlap=${r.toolbarOverlapsTabs}`);
    }
    const pass = results.filter(r => r.verdict === "PASS").length;
    const fail = results.filter(r => r.verdict === "FAIL").length;
    console.log(`\n[totals] ${pass} PASS · ${fail} FAIL  (of ${results.length})`);

    await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ pass, fail, total: results.length, results }, null, 2));
    console.log(`[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
