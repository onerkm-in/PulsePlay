#!/usr/bin/env node
// Quick simple-to-medium Ask Pulse smoke. Hand-curated 20 questions
// covering: top-N, totals, trends, segments, time-window, basic
// comparison. End-user (PulseShell) surface, headed slow-mo so Rajesh
// can watch the responses + the new Round 18 (clarifier chip) +
// Round 19 (agent-mode collapse) + Round 20 (scrollbar visibility)
// land live.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/simple-medium-2026-05-26";
const BASE = "http://127.0.0.1:7001";
const SLOW_MO = parseInt(process.env.SLOW_MO || "500", 10);
const INTER_DELAY = parseInt(process.env.INTER_DELAY_MS || "3000", 10);
const COMP_CEILING_MS = 70_000;

const QUESTIONS = [
    // SIMPLE (single metric, no time, single dimension)
    { id: "SM-01", level: "simple", q: "What are the top 5 categories by sales?" },
    { id: "SM-02", level: "simple", q: "Show total profit by region." },
    { id: "SM-03", level: "simple", q: "How many orders do we have in total?" },
    { id: "SM-04", level: "simple", q: "Which sub-category has the highest profit margin?" },
    { id: "SM-05", level: "simple", q: "List the top 10 cities by sales." },
    { id: "SM-06", level: "simple", q: "What's the average discount across all orders?" },
    { id: "SM-07", level: "simple", q: "Show total sales by segment." },
    // MEDIUM (time window OR two dimensions OR ranking + filter)
    { id: "SM-08", level: "medium", q: "Compare Q3 vs Q4 sales for the most recent year." },
    { id: "SM-09", level: "medium", q: "Show monthly sales trend for 2017 by category." },
    { id: "SM-10", level: "medium", q: "Top 5 sub-categories with the biggest profit decline year over year." },
    { id: "SM-11", level: "medium", q: "Which region's sales grew the most last year?" },
    { id: "SM-12", level: "medium", q: "Show me the worst 5 cities by profit margin in 2017." },
    { id: "SM-13", level: "medium", q: "Compare Furniture vs Office Supplies vs Technology by sales and profit." },
    { id: "SM-14", level: "medium", q: "What discount level produces the highest sales without losing profit?" },
    // MEDIUM-COMPLEX (multi-dim + reasoning)
    { id: "SM-15", level: "medium-complex", q: "Which Segment x Region pockets are growing sales but losing margin? Show top 5." },
    { id: "SM-16", level: "medium-complex", q: "Find the months where high sales coincided with low profit margin — what are the likely drivers?" },
    { id: "SM-17", level: "medium-complex", q: "Compare Standard Class vs Second Class shipping on profit margin by Category." },
    { id: "SM-18", level: "medium-complex", q: "Identify the 5 customers with the most negative profit and explain by Sub-Category." },
    { id: "SM-19", level: "medium-complex", q: "Show seasonal sales pattern by month across all four years — call out any anomalies." },
    { id: "SM-20", level: "medium-complex", q: "Which Region's discount strategy is most efficient — highest profit per dollar of discount given?" },
];

const colorFor = (level) => level === "simple" ? "#10b981" : level === "medium" ? "#f97316" : "#a855f7";

async function banner(page, text, color) {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__sm__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__sm__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "6px 12px", background: "rgba(15,23,42,0.94)", color: "#fff",
                font: "12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
                borderRadius: "4px", pointerEvents: "none",
            });
            document.body.appendChild(b);
        }
        b.style.borderLeft = `4px solid ${color}`;
        b.textContent = text;
    }, { text, color });
}

async function clean(page) {
    await page.evaluate(() => {
        try { window.localStorage.clear(); } catch { /* swallow */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default"; ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    });
}

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({
        headless: false, slowMo: SLOW_MO,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    const results = [];
    const counts = { PASS: 0, FAIL: 0, "SKIP-ENV": 0 };

    for (let i = 0; i < QUESTIONS.length; i++) {
        const sc = QUESTIONS[i];
        const r = { id: sc.id, level: sc.level, q: sc.q, verdict: "PENDING", firstPaintMs: null, completedMs: null, wallMs: null, notes: "", saw429: false };
        const tStart = Date.now();
        let saw429 = false;
        const onResp = (resp) => {
            if (resp.url().includes("/api/assistant") || resp.url().includes("/assistant/conversations")) {
                if (resp.status() === 429) saw429 = true;
            }
        };
        page.on("response", onResp);

        try {
            await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
            await clean(page);
            await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
            await page.waitForTimeout(900);
            await banner(page, `[${i + 1}/${QUESTIONS.length}] ${sc.id} (${sc.level}) → click Ask Pulse…`, colorFor(sc.level));

            const ask = page.locator('button').filter({ hasText: /^Ask Pulse$/ }).first();
            if (await ask.count() > 0) { await ask.click(); await page.waitForTimeout(700); }

            const composer = page.locator("textarea.gn-input").first();
            await composer.fill(sc.q);
            const send = page.locator("button.gn-send").first();
            const tSubmit = Date.now();
            await send.click();
            await banner(page, `[${i + 1}/${QUESTIONS.length}] ${sc.id} (${sc.level}) submitting: "${sc.q.slice(0, 60)}…"`, colorFor(sc.level));

            // First paint
            const fpDeadline = tSubmit + 15_000;
            while (Date.now() < fpDeadline) {
                const seen = await page.evaluate(() => {
                    if (document.querySelector(".gn-chat-progress")) return true;
                    const a = document.querySelector(".gn-msg--assistant .gn-bubble");
                    if (a && (a.textContent || "").trim().length > 0) return true;
                    return false;
                });
                if (seen) { r.firstPaintMs = Date.now() - tSubmit; break; }
                await page.waitForTimeout(150);
            }

            // Completion
            const compDeadline = tSubmit + COMP_CEILING_MS;
            while (Date.now() < compDeadline) {
                const done = await page.evaluate(() => {
                    const progress = document.querySelector(".gn-chat-progress");
                    const msg = document.querySelectorAll(".gn-msg--assistant");
                    const last = msg[msg.length - 1];
                    const len = last ? (last.textContent || "").trim().length : 0;
                    if (!progress && len > 30) return true;
                    return false;
                });
                if (done) { r.completedMs = Date.now() - tSubmit; break; }
                await page.waitForTimeout(300);
            }

            r.saw429 = saw429;
            if (saw429) { r.verdict = "SKIP-ENV"; r.notes = "429"; }
            else if (r.completedMs == null) { r.verdict = "FAIL"; r.notes = "no completion in 70s"; }
            else { r.verdict = "PASS"; }

            // Pause so user can see + check for clarifier chip / reasoning disclosure / scrollbar
            await page.waitForTimeout(1500);
            await banner(page, `[${i + 1}/${QUESTIONS.length}] ${sc.id} (${sc.level}) ${r.verdict} ${r.completedMs ?? "—"}ms`, colorFor(sc.level));
            await page.screenshot({
                path: join(OUT, `${sc.id}-${r.verdict.toLowerCase()}.png`),
                fullPage: false,
            }).catch(() => undefined);
        } catch (err) {
            r.verdict = "FAIL"; r.notes = err.message.slice(0, 160);
        } finally {
            page.off("response", onResp);
            r.wallMs = Date.now() - tStart;
        }
        results.push(r);
        counts[r.verdict] = (counts[r.verdict] || 0) + 1;

        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "SKIP-ENV" ? "⏭️" : "❌";
        console.log(`${flag} [${String(i + 1).padStart(2, "0")}/${QUESTIONS.length}] ${sc.id} ${sc.level.padEnd(15)} ${r.verdict.padEnd(10)} first=${r.firstPaintMs ?? "—"}ms cplt=${r.completedMs ?? "—"}ms wall=${r.wallMs}ms ${r.notes}`);
        if (INTER_DELAY > 0) await new Promise(r => setTimeout(r, INTER_DELAY));
    }
    await browser.close();

    const completed = results.map(r => r.completedMs).filter(v => typeof v === "number").sort((a, b) => a - b);
    const first = results.map(r => r.firstPaintMs).filter(v => typeof v === "number").sort((a, b) => a - b);
    const stat = (arr) => arr.length === 0 ? { p50: null, p95: null, max: null } : { p50: arr[Math.floor(arr.length * 0.5)], p95: arr[Math.floor(arr.length * 0.95)] || arr[arr.length - 1], max: arr[arr.length - 1] };

    const summary = [
        `=== Simple-to-Medium Ask Pulse smoke — 20 cases ===`,
        ``,
        `Verdicts: PASS=${counts.PASS}  FAIL=${counts.FAIL}  SKIP-ENV=${counts["SKIP-ENV"] || 0}`,
        ``,
        `By level:`,
        ...["simple", "medium", "medium-complex"].map(l => {
            const sub = results.filter(r => r.level === l);
            const p = sub.filter(r => r.verdict === "PASS").length;
            return `  ${l.padEnd(15)} ${p}/${sub.length} PASS`;
        }),
        ``,
        `firstPaintMs (${first.length}): p50=${stat(first).p50}ms p95=${stat(first).p95}ms`,
        `completedMs  (${completed.length}): p50=${stat(completed).p50}ms p95=${stat(completed).p95}ms max=${stat(completed).max}ms`,
        `429 occurrences: ${results.filter(r => r.saw429).length}`,
    ].join("\n");
    console.log("\n" + summary);
    await writeFile(join(OUT, "results.json"), JSON.stringify(results, null, 2));
    await writeFile(join(OUT, "summary.txt"), summary);
    console.log(`[done] → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
