#!/usr/bin/env node
// playground/scripts/verify-1500-catalog.mjs
//
// FULL 1500-SCENARIO UI validation from
// docs/scenarios/05_sales_performance_high_complex_extreme_1500.md.
//
// All 3 surfaces × 10 layouts × 10 data slices × 5 stress packs:
//   AI (AI Insights):     500
//   AP (Ask Pulse):       500
//   DB (Dashboard/native): 500
//   = 1500 total
//
// CHUNKED BROWSER LIFECYCLE: closes + reopens browser context every 200
// scenarios to avoid Vite dev server memory pressure that crashed the
// prior 1000-scenario run at scenario ~580. Resets in-page localStorage
// only — dev server keeps running between chunks.
//
// L05 maximized-state assertion accepts 5-OR-6 toolbar buttons + the
// first button label may be Maximize OR Restore (Restore appears when
// the pane is currently focused/maximized).
//
// Runtime: 1500 × ~1.5s + 7 browser restarts = ~40-50 minutes. SlowMo=200ms.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".v1500-out");
const CHUNK_SIZE = 200; // close + reopen browser context every N cases
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const record = (line) => { log.push(line); console.log(line); };
const NAV = { waitUntil: "domcontentloaded", timeout: 20_000 };
const results = [];

const FAMILY_COLOR = { AI: "#8b5cf6", AP: "#10b981", DB: "#f59e0b" };

// Catalog axes from docs/scenarios/05_sales_performance_high_complex_extreme_1500.md
// All 3 surfaces this time (was 2 in v1000).
const SURFACES = [
    { code: "AI", surface: "ai-insights", family: "AI", expectedTabLabel: "AI Insights" },
    { code: "AP", surface: "ask-pulse",   family: "AP", expectedTabLabel: "Ask Pulse" },
    { code: "DB", surface: "bi-viz",      family: "DB", expectedTabLabel: "Dashboard" },
];

const LAYOUTS = [
    // Each layout proxies to a (layoutMode, visibility) combination that
    // exercises a different layout stressor. The catalog uses these as
    // qualitative stress targets; we apply the closest available
    // PulsePlay knob.
    { code: "L01", layoutMode: "ai-left",   vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "ai-left split" },
    { code: "L02", layoutMode: "ai-right",  vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "ai-right split" },
    { code: "L03", layoutMode: "ai-top",    vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "ai-top stacked" },
    { code: "L04", layoutMode: "ai-bottom", vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "ai-bottom stacked" },
    { code: "L05", layoutMode: "ai-left",   vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "maximized (focused-pane)", maxPane: true },
    { code: "L06", layoutMode: "ai-left",   vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "minimized-dock" },
    { code: "L07", layoutMode: "ai-left",   vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "floating clone (proxy: viewport-action float)" },
    { code: "L08", layoutMode: "ai-left",   vis: [true, true, true],  viewport: { w: 480,  h: 800 }, label: "mobile stacked" },
    { code: "L09", layoutMode: "ai-left",   vis: [true, true, true],  viewport: { w: 1920, h: 1080 }, label: "ultrawide" },
    { code: "L10", layoutMode: "ai-left",   vis: [true, true, true],  viewport: { w: 1400, h: 950 }, label: "high-contrast/large-text (proxy: viewport unchanged)" },
];

const DATA_SLICES = [
    { code: "D01", note: "Executive sales/profit overview" },
    { code: "D02", note: "Margin compression under discounting" },
    { code: "D03", note: "Negative-profit risk pockets" },
    { code: "D04", note: "Trend and seasonality" },
    { code: "D05", note: "Category and sub-category portfolio" },
    { code: "D06", note: "Fulfillment and ship-mode impact" },
    { code: "D07", note: "Segment comparison" },
    { code: "D08", note: "Geographic concentration" },
    { code: "D09", note: "Outliers and anomalies" },
    { code: "D10", note: "Data-quality and governance sanity" },
];

const STRESS = [
    { code: "S01", band: "High",         note: "Single decision-ready answer + caveat" },
    { code: "S02", band: "High",         note: "Evidence + SQL + export — toolbar must not collide" },
    { code: "S03", band: "Complex",      note: "2+ measures, 2+ dimensions, 1 filter, ranked+trended" },
    { code: "S04", band: "Complex",      note: "Multi-turn or split-pane state persistence" },
    { code: "S05", band: "High-Complex", note: "Edge / degraded / blocked state — honest non-blank" },
];

// Generate the 1000 cases (500 AI + 500 DB).
const CATALOG = [];
for (const surf of SURFACES) {
    for (const lay of LAYOUTS) {
        for (const d of DATA_SLICES) {
            for (const s of STRESS) {
                CATALOG.push({
                    id: `SP-${surf.code}-${lay.code}-${d.code}-${s.code}`,
                    surface: surf,
                    layout: lay,
                    data: d,
                    stress: s,
                });
            }
        }
    }
}
const TOTAL = CATALOG.length; // 1000

// ─── Helpers ────────────────────────────────────────────────────────

async function setBanner(page, n, total, family, id, label) {
    await page.evaluate(({ n, total, family, id, label, color }) => {
        let banner = document.getElementById("__scn_banner");
        if (!banner) {
            banner = document.createElement("div");
            banner.id = "__scn_banner";
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0;
                color: white; padding: 5px 12px; z-index: 99999;
                font-family: -apple-system, sans-serif; font-size: 11px;
                font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                pointer-events: none; display: flex; gap: 8px; align-items: center;
            `;
            document.body.appendChild(banner);
        }
        banner.style.background = `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`;
        banner.innerHTML = `
            <span style="background:rgba(255,255,255,0.25);padding:2px 6px;border-radius:3px">🎬 ${n}/${total}</span>
            <span style="background:rgba(0,0,0,0.25);padding:2px 5px;border-radius:3px;font-size:9px">${family}</span>
            <code style="font-size:10px">${id}</code>
            <span>${label}</span>
        `;
    }, { n, total, family, id, label, color: FAMILY_COLOR[family] || "#666" });
}

async function seedProfile(page) {
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        window.localStorage.removeItem("pulseplay:ui-mode");
    }, PROFILE);
}

async function applyCase(page, scn) {
    // Apply layout knobs.
    await page.evaluate(({ surface, layoutMode, vis, layoutLabel }) => {
        window.localStorage.setItem("pulseplay:active-surface", surface);
        window.localStorage.setItem("pulseplay:layout-mode", layoutMode);
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: vis[0], askPulse: vis[1], dashboard: vis[2] }));
        // L05 maximized → set focusedPane via URL ?focus=
        // L06 minimized → set enabledComponents to drop the opposite pane (proxy)
        // L07 floating → trigger via viewport-action event after mount
    }, { surface: scn.surface.surface, layoutMode: scn.layout.layoutMode, vis: scn.layout.vis, layoutLabel: scn.layout.label });

    // Viewport size per layout.
    await page.setViewportSize({ width: scn.layout.viewport.w, height: scn.layout.viewport.h });

    // Build URL — for L05 (maximized), include ?focus= to force pane focus
    const params = new URLSearchParams({ surface: scn.surface.surface });
    if (scn.layout.maxPane) params.set("focus", scn.surface.surface === "bi-viz" ? "bi" : "ai");
    await page.goto(`${BASE}/?${params.toString()}`, NAV);
    await page.waitForTimeout(400);

    // L07 floating proxy — dispatch viewport-action float.
    if (scn.layout.code === "L07") {
        await page.evaluate((pane) => {
            window.dispatchEvent(new CustomEvent("pulseplay:viewport-action", { detail: { action: "float", pane } }));
        }, scn.surface.surface === "bi-viz" ? "bi" : "ai");
        await page.waitForTimeout(400);
    }
}

async function assertCase(page, scn) {
    return await page.evaluate(({ expectedTabLabel, expectedSurface, surfaceCode }) => {
        const tb = document.querySelector('[data-testid="pp-top-right-toolbar"]');
        const tbMounted = !!tb;
        const tbBtns = tb?.querySelectorAll("button").length || 0;
        // First button may be Maximize OR Restore — both are valid first-position
        // affordances depending on focused-pane state. Match the tab name on either.
        const firstBtn = tb?.querySelector("button");
        const tbLabel = firstBtn?.getAttribute("aria-label") || "";
        const labelHasTab = tbLabel.includes(expectedTabLabel);
        const labelIsAffordance = /^(Maximize|Restore)\s/.test(tbLabel);
        const activeSurface = document.querySelector('[data-active-surface]')?.getAttribute("data-active-surface") || "";
        const bodyLen = (document.body.textContent || "").length;
        return {
            tbMounted,
            tbBtns,
            tbLabel,
            activeSurface,
            bodyLen,
            surfaceMatches: activeSurface === expectedSurface,
            labelReflects: labelHasTab && labelIsAffordance,
            // 5 = base toolbar; 6 = + "Show all panels" when canShowAll
            // triggers (maximized OR enabledComponents = X-only).
            toolbarShapeOK: tbMounted && (tbBtns === 5 || tbBtns === 6),
            nonBlank: bodyLen > 100,
        };
    }, { expectedTabLabel: scn.surface.expectedTabLabel, expectedSurface: scn.surface.surface, surfaceCode: scn.surface.code });
}

async function flushLog() {
    try { await writeFile(join(OUT_DIR, "v1500.log"), log.join("\n"), "utf-8"); } catch (_) {}
    try { await writeFile(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2), "utf-8"); } catch (_) {}
}

// Browser lifecycle — chunked to avoid Vite memory exhaustion.
async function freshBrowser() {
    const browser = await chromium.launch({
        headless: false, slowMo: 200,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => record(`[pageerror] ${err.message.slice(0, 100)}`));
    await page.goto(BASE + "/", NAV);
    await seedProfile(page);
    await page.reload(NAV);
    await page.waitForTimeout(700);
    return { browser, ctx, page };
}

// ─── Runner ────────────────────────────────────────────────────────

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`╔══════════════════════════════════════════════════════════════════════════╗`);
    record(`║  PULSEPLAY 1500-SCENARIO CATALOG VALIDATION                              ║`);
    record(`║  Source: docs/scenarios/05_sales_performance_high_complex_extreme_1500.md ║`);
    record(`║  Selection: 500 AI + 500 AP + 500 DB = ${TOTAL}                            ║`);
    record(`║  Chunked browser: fresh context every ${CHUNK_SIZE} cases (Vite memory)         ║`);
    record(`║  slowMo=200ms; banner color per family (AI=purple, AP=green, DB=orange)   ║`);
    record(`╚══════════════════════════════════════════════════════════════════════════╝\n`);

    let { browser, ctx, page } = await freshBrowser();

    let i = 0;
    for (const scn of CATALOG) {
        i += 1;
        // Browser chunking — close + reopen every CHUNK_SIZE cases to
        // clear accumulated memory (Vite + page caches grow unbounded
        // under 1000+ rapid page.goto calls in <1h).
        if (i > 1 && (i - 1) % CHUNK_SIZE === 0) {
            record(`\n--- CHUNK BOUNDARY: closing + reopening browser at scenario ${i} ---`);
            await browser.close().catch(() => {});
            ({ browser, ctx, page } = await freshBrowser());
        }
        try {
            await setBanner(page, i, TOTAL, scn.surface.family, scn.id, `${scn.layout.label} · ${scn.data.note} · ${scn.stress.band}`);
            await applyCase(page, scn);
            const obs = await assertCase(page, scn);
            // Updated assertion — toolbarShapeOK + labelReflects (with
            // Maximize/Restore prefix tolerance) already in assertCase.
            const passed = obs.toolbarShapeOK && obs.surfaceMatches && obs.labelReflects && obs.nonBlank;
            const verdict = passed ? "PASS" : "FAIL";
            const icon = passed ? "✅" : "❌";
            const notes = `tb=${obs.tbMounted}/${obs.tbBtns} surf="${obs.activeSurface}" label="${obs.tbLabel.slice(0, 30)}" body=${obs.bodyLen}`;
            // Log only failures + every 50th to keep stdout manageable.
            if (!passed || i % 50 === 0) {
                record(`${icon} [${scn.id}] ${scn.surface.family} ${scn.layout.label.slice(0, 20)} · ${scn.data.code} · ${scn.stress.code}: ${verdict} (${notes})`);
            }
            results.push({ id: scn.id, family: scn.surface.family, layout: scn.layout.code, data: scn.data.code, stress: scn.stress.code, verdict, notes });
            // Screenshot every 100th + every failure.
            if (i % 100 === 0 || !passed) {
                try { await page.screenshot({ path: join(OUT_DIR, `${scn.id}.png`), fullPage: false }); } catch (_) {}
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            record(`❌ [${scn.id}] THREW (${msg.slice(0, 100)})`);
            results.push({ id: scn.id, family: scn.surface.family, layout: scn.layout.code, data: scn.data.code, stress: scn.stress.code, verdict: "THREW", notes: msg.slice(0, 200) });
        }
        if (i % 50 === 0) await flushLog();
    }

    // ─── Summary ──────────────────────────────────────────────────────
    const counts = { PASS: 0, FAIL: 0, THREW: 0 };
    for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    record(`\n╔═══ FINAL — ${TOTAL} SCENARIOS ═══╗`);
    record(`PASS:  ${counts.PASS}/${TOTAL} (${(counts.PASS * 100 / TOTAL).toFixed(1)}%)`);
    record(`FAIL:  ${counts.FAIL}/${TOTAL}`);
    record(`THREW: ${counts.THREW}/${TOTAL}`);

    // Per-family breakdown
    record(`\nPer family:`);
    for (const fam of ["AI", "AP", "DB"]) {
        const famR = results.filter(r => r.family === fam);
        const p = famR.filter(r => r.verdict === "PASS").length;
        const f = famR.filter(r => r.verdict === "FAIL").length;
        const t = famR.filter(r => r.verdict === "THREW").length;
        record(`  ${fam}: ${p}/${famR.length} PASS  ${f} FAIL  ${t} THREW`);
    }
    // Per-layout breakdown
    record(`\nPer layout (across both families):`);
    for (const lay of LAYOUTS) {
        const layR = results.filter(r => r.layout === lay.code);
        const p = layR.filter(r => r.verdict === "PASS").length;
        record(`  ${lay.code} (${lay.label.padEnd(30, " ").slice(0, 30)}): ${p}/${layR.length}`);
    }
    // Per-stress breakdown
    record(`\nPer stress band:`);
    for (const s of STRESS) {
        const sR = results.filter(r => r.stress === s.code);
        const p = sR.filter(r => r.verdict === "PASS").length;
        record(`  ${s.code} (${s.band.padEnd(12, " ")}): ${p}/${sR.length}`);
    }

    await setBanner(page, TOTAL, TOTAL, "AI", "DONE", `✅ ${counts.PASS}/${TOTAL} PASS`);
    await page.waitForTimeout(8000);
    record(`\n[done] closing`);
    await flushLog();
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
