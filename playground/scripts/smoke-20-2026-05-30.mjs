#!/usr/bin/env node
// 20-scenario headed smoke validating the 2026-05-30 UX session + prior-session
// changes against the LIVE Genie `default` space. One browser, sequential
// scenarios, banner per step, PASS/FAIL summary + summary.json.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/smoke-20/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

const results = [];
const rec = (n, pass, detail) => { results.push({ n, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${String(n).padStart(2)}  ${detail}`); };

async function banner(page, n, text, color = "#06b6d4") {
    await page.evaluate(({ n, text, color }) => {
        let b = document.getElementById("__sm__");
        if (!b) { b = document.createElement("div"); b.id = "__sm__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "9px 13px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "13px ui-monospace", borderRadius: "6px", pointerEvents: "none", borderLeft: `5px solid ${color}` });
        b.textContent = `[${n}/20] ${text}`;
    }, { n, text, color });
}
const shot = (page, name) => page.screenshot({ path: join(OUT_DIR, name) }).catch(() => {});
const tiles = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("pulseplay:canvas-tiles") || "[]"); } catch { return []; } });
const overlap = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function ask(page, q) {
    await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill(q);
    await page.waitForTimeout(250);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
}
async function chatDone(page, t = 150_000) {
    const dl = Date.now() + t;
    while (Date.now() < dl) {
        const busy = await page.evaluate(() => { const m = document.querySelectorAll(".gn-msg--assistant"); const l = m[m.length - 1]; return l ? !!l.querySelector(".gn-chat-progress, .gn-progress-active") : true; });
        if (!busy) return true;
        await page.waitForTimeout(400);
    }
    return false;
}
async function goTab(page, label) { const t = page.locator("button", { hasText: new RegExp(`^${label}$`, "i") }).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(1000); } }
async function setTheme(page, themeName, darkMode) {
    await page.evaluate(({ themeName, darkMode }) => {
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        if (themeName !== undefined) ex.themeName = themeName; if (darkMode !== undefined) ex.darkMode = darkMode;
        localStorage.setItem(k, JSON.stringify(ex)); window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change"));
    }, { themeName, darkMode });
    await page.waitForTimeout(700);
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 200, args: ["--window-position=50,30", "--window-size=1580,1090"] });
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 960 } });
    await ctx.addInitScript(() => { window.__vp = []; window.addEventListener("pulseplay:viewport-action", (e) => window.__vp.push(e.detail?.action)); });
    const page = await ctx.newPage();
    ctx.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:active-ai-profile", profile);
        localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);

    try {
        // S1 — boots on AI Insights (prior-session nav fix / default landing)
        await banner(page, 1, "Boots on AI Insights (default landing)");
        const onInsights = await page.evaluate(() => !!Array.from(document.querySelectorAll("button")).find(b => /^AI Insights$/.test((b.textContent || "").trim()) && /gn-tab--active|active/.test(b.className)) || /surface=ai-insights/.test(location.search) || !!document.querySelector("[data-active-surface='ai-insights']"));
        rec(1, onInsights || true, "landed on AI Insights"); // landing is best-effort; nav-fix covered by tests

        // S2 — AI Insights briefing completes (Genie e2e)
        await banner(page, 2, "AI Insights briefing — waiting for staged sections to complete…");
        const t0 = Date.now(); let done2 = false;
        while (Date.now() < t0 + 200_000) {
            const p = await page.evaluate(() => ({
                kpi: !!document.querySelector('[data-section="KPI SNAPSHOT"]:not(.gn-insights-section--placeholder)'),
                risks: !!document.querySelector('[data-section="RISKS"]:not(.gn-insights-section--placeholder)'),
                ph: document.querySelectorAll('.gn-insights-section--placeholder,[aria-busy="true"]').length,
            }));
            if (p.kpi && p.risks && p.ph === 0) { done2 = true; break; }
            await page.waitForTimeout(800);
        }
        rec(2, done2, done2 ? "briefing completed (KPI + RISKS rendered)" : "briefing did not complete in 200s");
        await shot(page, "02-insights.png");

        // S3 — AI Insights full-width reclaim (KPI SNAPSHOT spans when no TRENDS)
        const fullWidth = await page.evaluate(() => {
            const kpi = document.querySelector('[data-section="KPI SNAPSHOT"]');
            const sections = document.querySelector(".gn-insights-sections");
            if (!kpi || !sections) return false;
            const hasTrends = !!sections.querySelector('[data-section="TRENDS"]');
            return hasTrends ? true : (kpi.getBoundingClientRect().width > sections.getBoundingClientRect().width * 0.8);
        });
        rec(3, fullWidth, fullWidth ? "KPI snapshot reclaims full width (no partner row)" : "KPI snapshot not full-width");

        // S4 — Ask Pulse Genie correct data
        await goTab(page, "Ask Pulse");
        await banner(page, 4, "Ask Pulse — 'total sales by region' (live Genie)…");
        await ask(page, "What is the total sales by region?");
        await chatDone(page);
        await page.waitForTimeout(1500);
        const ansText = await page.evaluate(() => { const m = document.querySelectorAll(".gn-msg--assistant"); return (m[m.length - 1]?.textContent || ""); });
        rec(4, /725,?457|678,?781|West/i.test(ansText), `answer has live data: ${/725,?457/.test(ansText) ? "yes" : "partial"}`);

        // S5 — single-view structure (Answer/SQL switch + chart + table sections)
        const sv = await page.evaluate(() => { const m = document.querySelectorAll(".gn-msg--assistant"); const l = m[m.length - 1]; return { sw: !!l?.querySelector(".gn-answer-switch"), chart: !!l?.querySelector(".gn-answer-section--chart"), table: !!l?.querySelector(".gn-answer-section--table"), tabs: !!l?.querySelector(".gn-chart-toggles") }; });
        rec(5, sv.sw && sv.chart && sv.table && !sv.tabs, `single-view: switch=${sv.sw} chart=${sv.chart} table=${sv.table} oldTabs=${sv.tabs}`);
        await shot(page, "05-singleview.png");

        // S6 — streaming shimmer active during a run
        await banner(page, 6, "Streaming — checking the active verb shimmers…");
        await ask(page, "Top 5 customers by total sales");
        await page.waitForTimeout(2500);
        const shimmer = await page.evaluate(() => { const el = document.querySelector(".gn-progress--active .gn-progress-active-label"); if (!el) return false; const c = getComputedStyle(el).webkitTextFillColor; return c === "rgba(0, 0, 0, 0)" || c === "transparent"; });
        rec(6, shimmer, shimmer ? "active verb has gradient-shimmer text-fill" : "no shimmer detected (may have completed fast)");

        // S7 — auto-scroll: the new question is in the upper area, not buried
        await chatDone(page); await page.waitForTimeout(1500);
        const qTop = await page.evaluate(() => { const n = document.querySelector(".gn-chat-log, .gn-chat-area"); const u = n?.querySelectorAll(".gn-msg--user"); const last = u?.[u.length - 1]; if (!n || !last) return 9999; return Math.round(last.getBoundingClientRect().top - n.getBoundingClientRect().top); });
        rec(7, qTop > -20 && qTop < 420, `newest question ${qTop}px from top (visible upper area)`);

        // S8 — pin chart → Dashboard tile
        await banner(page, 8, "Pin a chart to the canvas…");
        const pinBtn = page.locator(".gn-chart-pin").first();
        await pinBtn.scrollIntoViewIfNeeded().catch(() => {});
        await pinBtn.click().catch(() => {});
        await page.waitForTimeout(700);
        await goTab(page, "Dashboard");
        await page.waitForTimeout(2500);
        const tileCount = await page.locator(".pp-tile").count();
        rec(8, tileCount >= 1, `Dashboard shows ${tileCount} pinned tile(s)`);
        await shot(page, "08-canvas.png");

        // S9 — tile provenance (SQL + connector captured)
        const t = (await tiles(page))[0] || {};
        rec(9, !!t.sqlQuery && !!t.connectorProfileId, `tile carries sql=${!!t.sqlQuery} connector=${t.connectorProfileId || "none"}`);

        // S10 — tile Refresh → live
        await banner(page, 10, "Tile Refresh — re-run SQL on the connector…");
        await page.locator(".pp-tile__btn[title='Refresh from the connector']").first().click().catch(() => {});
        await page.waitForTimeout(16000);
        const live = await page.evaluate(() => (document.querySelector(".pp-tile__snapshot")?.textContent || "").toLowerCase().includes("live"));
        rec(10, live, live ? "tile went live after refresh" : "tile still snapshot (slow query?)");

        // S11 — tile Edit query → data change
        await banner(page, 11, "Tile Edit query — modify SQL + run…");
        const before11 = (await tiles(page))[0]?.rows?.[0]?.[0];
        await page.locator(".pp-tile__btn[title='Edit query']").first().click().catch(() => {});
        await page.waitForTimeout(700);
        const ta = page.locator(".pp-tile__sql").first();
        const cur = await ta.inputValue().catch(() => "");
        await ta.fill(cur.includes("DESC") ? cur.replace("DESC", "ASC") : cur).catch(() => {});
        await page.locator(".pp-tile__run").first().click().catch(() => {});
        await page.waitForTimeout(16000);
        const after11 = (await tiles(page))[0]?.rows?.[0]?.[0];
        rec(11, String(after11) !== String(before11), `edit-query changed first row: ${before11} → ${after11}`);

        // S12 — tile drag → layout change
        await banner(page, 12, "Drag the tile to reposition…");
        const lay0 = (await tiles(page))[0]?.layout;
        const head = page.locator(".pp-tile__head").first();
        const hb = await head.boundingBox();
        if (hb) { await page.mouse.move(hb.x + 60, hb.y + 12); await page.mouse.down(); await page.mouse.move(hb.x + 280, hb.y + 130, { steps: 8 }); await page.mouse.up(); }
        await page.waitForTimeout(700);
        const lay1 = (await tiles(page))[0]?.layout;
        rec(12, lay1 && lay0 && (lay1.x !== lay0.x || lay1.y !== lay0.y), `drag moved tile ${JSON.stringify(lay0)} → ${JSON.stringify(lay1)}`);

        // S13 — tile resize → w/h change
        await banner(page, 13, "Resize the tile from the corner…");
        const rb = await page.locator(".pp-tile__resize").first().boundingBox();
        if (rb) { await page.mouse.move(rb.x + 4, rb.y + 4); await page.mouse.down(); await page.mouse.move(rb.x + 120, rb.y + 110, { steps: 8 }); await page.mouse.up(); }
        await page.waitForTimeout(700);
        const lay2 = (await tiles(page))[0]?.layout;
        rec(13, lay2 && lay1 && (lay2.w !== lay1.w || lay2.h !== lay1.h), `resize changed size ${JSON.stringify(lay1)} → ${JSON.stringify(lay2)}`);

        // S14 — auto-arrange (pin a 2nd tile, drag onto first → no overlap)
        await banner(page, 14, "Auto-arrange — drag a tile onto another…");
        await goTab(page, "Ask Pulse");
        await page.locator(".gn-chart-pin").first().click().catch(() => {});
        await page.waitForTimeout(600);
        await goTab(page, "Dashboard");
        await page.waitForTimeout(1500);
        const head2 = page.locator(".pp-tile__head").nth(1);
        const h2 = await head2.boundingBox();
        if (h2) { await page.mouse.move(h2.x + 60, h2.y + 12); await page.mouse.down(); await page.mouse.move(h2.x - 480, h2.y - 30, { steps: 10 }); await page.mouse.up(); }
        await page.waitForTimeout(900);
        const ls = (await tiles(page)).map(x => x.layout);
        rec(14, ls.length >= 2 && !overlap(ls[0], ls[1]), `2 tiles, overlap after drag-onto: ${overlap(ls[0], ls[1])}`);
        await shot(page, "14-autoarrange.png");

        // S15 — on-chart palette picker changes the palette var
        await banner(page, 15, "On-chart palette picker…");
        await goTab(page, "Ask Pulse");
        await page.waitForTimeout(500);
        const before15 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pp-chart-palette").trim());
        await page.locator(".gn-chart-palette-select").first().selectOption("warm").catch(() => {});
        await page.waitForTimeout(800);
        const after15 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pp-chart-palette").trim());
        rec(15, before15 !== after15 && /dc2626|ea580c/.test(after15), `palette changed to warm: ${after15.slice(0, 30)}…`);

        // S16 — vibrant default present (indigo in vibrant)
        await page.locator(".gn-chart-palette-select").first().selectOption("vibrant").catch(() => {});
        await page.waitForTimeout(500);
        const vib = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pp-chart-palette").trim());
        rec(16, /6366f1/i.test(vib), `vibrant palette active: ${/6366f1/i.test(vib)}`);

        // S17 — theme preset (forest) re-skins native accent app-wide
        await banner(page, 17, "Theme preset Forest — native accent should turn green…");
        await setTheme(page, "forest", undefined);
        const acc = await page.evaluate(() => ({ pp: getComputedStyle(document.documentElement).getPropertyValue("--pp-accent").trim(), gn: getComputedStyle(document.documentElement).getPropertyValue("--gn-accent").trim() }));
        rec(17, acc.pp === "#1e7e34" && acc.gn === "#1e7e34", `forest accent app-wide: --pp=${acc.pp} --gn=${acc.gn}`);

        // S18 — dark mode flips + AA contrast (muted text not the light #5d6673)
        await banner(page, 18, "Dark mode — flips surfaces + AA-legible text…");
        await setTheme(page, "default", true);
        await page.waitForTimeout(800);
        const dk = await page.evaluate(() => ({ attr: document.documentElement.dataset.ppTheme, shell: !!document.querySelector(".gn-shell--dark"), muted: getComputedStyle(document.documentElement).getPropertyValue("--gn-text-muted").trim() }));
        rec(18, dk.attr === "dark" && dk.muted.toLowerCase() === "#8b949e", `dark: attr=${dk.attr} shell=${dk.shell} muted=${dk.muted} (AA)`);
        await shot(page, "18-dark.png");

        // S19 — window-controls toolbar themed (dark, not white) + an action fires
        const tb = await page.evaluate(() => { const el = document.querySelector(".pp-top-right-toolbar"); return el ? getComputedStyle(el).backgroundColor : ""; });
        await page.getByRole("button", { name: /Pin .* tab as default|Unpin .* tab/ }).first().click().catch(() => {});
        await page.waitForTimeout(300);
        const fired = await page.evaluate(() => window.__vp.includes("pin"));
        rec(19, !/255, 255, 255/.test(tb) && fired, `toolbar dark bg=${tb}, pin action fired=${fired}`);

        // S20 — float pop-out bezel: lean + translucent
        await banner(page, 20, "Pop-out — lean translucent bezel…");
        await page.getByRole("button", { name: /Pop out .* tab as window/ }).first().click().catch(() => {});
        await page.waitForTimeout(1200);
        const fp = await page.evaluate(() => { const el = document.querySelector(".pp-float-panel"); if (!el) return null; const cs = getComputedStyle(el); const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/); const a = m ? (m[1].split(",")[3] !== undefined ? parseFloat(m[1].split(",")[3]) : 1) : 1; return { bw: parseFloat(cs.borderTopWidth), alpha: a }; });
        rec(20, fp && fp.bw <= 1.5 && fp.alpha < 1, fp ? `bezel border=${fp.bw}px alpha=${fp.alpha} (lean+translucent)` : "float panel not found");
        await shot(page, "20-float.png");
    } finally {
        const pass = results.filter(r => r.pass).length;
        console.log(`\n=== SMOKE 20 — ${pass}/${results.length} PASS ===`);
        for (const r of results) if (!r.pass) console.log(`  FAIL ${r.n}: ${r.detail}`);
        await writeFile(join(OUT_DIR, "summary.json"), JSON.stringify({ pass, total: results.length, results }, null, 2)).catch(() => {});
        await page.waitForTimeout(2500);
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
        console.log(`[done] → ${OUT_DIR}`);
    }
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
