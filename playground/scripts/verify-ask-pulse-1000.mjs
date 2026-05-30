#!/usr/bin/env node
// playground/scripts/verify-ask-pulse-1000.mjs
//
// 1000-iteration Ask Pulse scale + UI-defect harness.
// = 100-question catalog × 10 iterations, headed slow-mo.
//
// Per-iteration: submit + wait for first-assistant-paint OR 8s ceiling,
// then UI defect probe + screenshot if anything fails. NO wait-for-
// completion — at 1000 cases × 30s = 8h, that's not feasible. Instead
// this measures:
//   - submit→firstPaint latency under sustained load
//   - rate-limit / 429 occurrences
//   - UI defects at scale (overflow, composer-hidden, ask-disabled)
//
// Wall time target: ~90-120 min (1000 × ~6s + chunk rotations).
//
// Usage:
//   node scripts/verify-ask-pulse-1000.mjs                 # default 1000
//   ASK_PULSE_ITERATIONS=5 node scripts/...                # smaller run
//   SLOW_MO=150 node scripts/...                           # faster mo

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const CATALOG = join(REPO, "docs/scenarios/06_ask_pulse_complex_extreme_100.md");
const OUT_DIR = join(REPO, "docs/evidence/ask-pulse-1000-2026-05-26");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const ITERATIONS = parseInt(process.env.ASK_PULSE_ITERATIONS || "10", 10);
const SLOW_MO = parseInt(process.env.SLOW_MO || "200", 10);
const FIRST_PAINT_CEILING_MS = parseInt(process.env.FIRST_PAINT_CEILING_MS || "20000", 10);
const INTER_CASE_DELAY_MS = parseInt(process.env.INTER_CASE_DELAY_MS || "800", 10); // spread Genie load
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "50", 10); // restart browser every N cases

function parseCatalog(md) {
    const cases = [];
    const rowRe = /^\|\s*(APQ-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;
    for (const line of md.split("\n")) {
        const m = line.match(rowRe);
        if (m) cases.push({ id: m[1], complexity: m[2].split(" ")[0], useCase: m[3], layoutFocus: m[4], question: m[5].trim() });
    }
    return cases;
}

async function showBanner(page, text, color = "#3b82f6") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__ap1000__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__ap1000__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "6px 10px", background: "rgba(15,23,42,0.92)", color: "#fff",
                font: "12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
                borderRadius: "4px", pointerEvents: "none",
            });
            document.body.appendChild(b);
        }
        b.style.borderLeft = `4px solid ${color}`;
        b.textContent = text;
    }, { text, color });
}

const complexityColor = (c) => ({ C3: "#3b82f6", C4: "#10b981", C5: "#f97316", C6: "#ef4444" }[c] || "#888");

async function freshBrowser() {
    const browser = await chromium.launch({
        headless: false, slowMo: SLOW_MO,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    return { browser, page };
}

async function runOne(page, sc, idx, total, iter) {
    const r = {
        i: idx, iter, caseId: sc.id, complexity: sc.complexity,
        submitMs: null, firstPaintMs: null, wallMs: null,
        verdict: "PENDING", issue: "", saw429: false, network500: 0,
        ui: { composerVisible: null, askVisible: null, overflowX: null, hasEntries: null },
    };
    const tStart = Date.now();
    let saw429 = false;
    let network500 = 0;
    const onResp = (resp) => {
        if (resp.url().includes("/api/assistant") || resp.url().includes("/assistant/conversations")) {
            if (resp.status() === 429) saw429 = true;
            if (resp.status() >= 500) network500++;
        }
    };
    page.on("response", onResp);

    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.evaluate((profile) => {
            try { window.localStorage.clear(); } catch { /* swallow */ }
            window.localStorage.setItem("pulseplay:ui-mode", "v0");
            window.localStorage.setItem("pulseplay:active-ai-profile", profile);
            window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
            ex.assistantProfile = profile; ex.connectionMode = "proxy";
            ex.apiBaseUrl = window.location.origin + "/api";
            window.localStorage.setItem(k, JSON.stringify(ex));
        }, PROFILE);
        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(400);

        const composer = page.locator("textarea").first();
        if ((await composer.count()) === 0) {
            r.verdict = "FAIL"; r.issue = "no composer"; return r;
        }
        await composer.fill(sc.question);

        const askBtn = page.locator("button.pp-ai-sidebar__ask").first();
        if ((await askBtn.count()) === 0) {
            r.verdict = "FAIL"; r.issue = "no ask button"; return r;
        }

        const tSubmit = Date.now();
        r.submitMs = tSubmit - tStart;
        await askBtn.click();
        await showBanner(page, `[${idx + 1}/${total} iter${iter}] ${sc.id} ${sc.complexity} submitting…`, complexityColor(sc.complexity));

        const deadline = tSubmit + FIRST_PAINT_CEILING_MS;
        while (Date.now() < deadline) {
            const seen = await page.evaluate(() => {
                const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
                if (entries.length === 0) return null;
                const last = entries[entries.length - 1];
                const status = last.getAttribute("data-status");
                if (status === "streaming" || status === "completed" || status === "failed") return status;
                const narr = last.querySelector(".pp-ai-sidebar__narrative");
                if (narr && (narr.textContent || "").trim().length > 0) return "paint";
                return null;
            });
            if (seen) { r.firstPaintMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(120);
        }

        const ui = await page.evaluate(() => {
            const composer = document.querySelector("textarea");
            const composerRect = composer ? composer.getBoundingClientRect() : null;
            const composerVisible = composerRect ? (composerRect.bottom > 0 && composerRect.top < window.innerHeight) : false;
            const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
            const askBtn = document.querySelector("button.pp-ai-sidebar__ask");
            const askVisible = askBtn ? askBtn.offsetParent !== null : false;
            const entries = document.querySelectorAll('[data-testid^="pp-ai-entry-"]').length;
            return { composerVisible, overflowX, askVisible, hasEntries: entries > 0 };
        });
        r.ui = ui;
        r.saw429 = saw429; r.network500 = network500;

        const defects = [];
        if (!ui.composerVisible) defects.push("composer-hidden");
        if (ui.overflowX) defects.push("h-overflow");
        if (!ui.askVisible) defects.push("ask-hidden");
        if (!ui.hasEntries) defects.push("no-entry-mounted");

        if (saw429) { r.verdict = "SKIP-ENV"; r.issue = "429 rate-limit"; }
        else if (defects.length > 0) { r.verdict = "FAIL"; r.issue = defects.join(","); }
        else if (r.firstPaintMs === null) { r.verdict = "NEEDS-REVIEW"; r.issue = `no paint within ${FIRST_PAINT_CEILING_MS}ms`; }
        else { r.verdict = "PASS"; }

        await showBanner(page, `[${idx + 1}/${total} iter${iter}] ${sc.id} ${r.verdict} ${r.firstPaintMs ?? "—"}ms`, complexityColor(sc.complexity));
        if (r.verdict !== "PASS") {
            await page.screenshot({ path: join(OUT_DIR, `${String(idx + 1).padStart(4, "0")}-${sc.id}-iter${iter}-${r.verdict.toLowerCase()}.png`), fullPage: false }).catch(() => undefined);
        }
    } catch (err) {
        r.verdict = "THREW"; r.issue = err.message.slice(0, 200);
    } finally {
        page.off("response", onResp);
        r.wallMs = Date.now() - tStart;
    }
    return r;
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const md = await readFile(CATALOG, "utf-8");
    const cases = parseCatalog(md);
    const total = cases.length * ITERATIONS;
    console.log(`[start] ${total} iterations (${cases.length} cases × ${ITERATIONS}) headed slowMo=${SLOW_MO}ms`);

    const results = [];
    const counts = { PASS: 0, FAIL: 0, "SKIP-ENV": 0, "NEEDS-REVIEW": 0, THREW: 0 };
    let { browser, page } = await freshBrowser();
    let casesSinceChunk = 0;

    let globalIdx = 0;
    for (let iter = 1; iter <= ITERATIONS; iter++) {
        for (const sc of cases) {
            if (casesSinceChunk >= CHUNK_SIZE) {
                console.log(`[chunk] rotating browser at ${globalIdx + 1}/${total}`);
                await browser.close().catch(() => {});
                ({ browser, page } = await freshBrowser());
                casesSinceChunk = 0;
            }
            const r = await runOne(page, sc, globalIdx, total, iter);
            results.push(r);
            counts[r.verdict] = (counts[r.verdict] || 0) + 1;
            casesSinceChunk++;
            // 2026-05-26 — inter-case delay to spread Genie load. Without
            // it, the proxy fires ~6 requests per second at the Genie
            // space and triggers HTTP 429 rate-limiting around case 20.
            if (INTER_CASE_DELAY_MS > 0) await new Promise(r => setTimeout(r, INTER_CASE_DELAY_MS));

            const flag = r.verdict === "PASS" ? "✅" : r.verdict === "SKIP-ENV" ? "⏭️" : r.verdict === "NEEDS-REVIEW" ? "⚠️" : "❌";
            if (globalIdx < 10 || globalIdx % 50 === 0 || r.verdict !== "PASS") {
                console.log(`${flag} [${String(globalIdx + 1).padStart(4, "0")}/${total}] iter${iter} ${r.caseId} ${r.complexity} ${r.verdict.padEnd(12)} first=${r.firstPaintMs ?? "—"}ms wall=${r.wallMs}ms ${r.issue}`);
            }

            // Periodic checkpoint write so we don't lose data if interrupted
            if ((globalIdx + 1) % 100 === 0) {
                await writeFile(join(OUT_DIR, `checkpoint-${globalIdx + 1}.json`), JSON.stringify({ counts, lastIdx: globalIdx + 1 }, null, 2)).catch(() => undefined);
                const completedSoFar = results.filter(x => x.firstPaintMs !== null).map(x => x.firstPaintMs).sort((a, b) => a - b);
                if (completedSoFar.length > 0) {
                    const p50 = completedSoFar[Math.floor(completedSoFar.length * 0.5)];
                    const p95 = completedSoFar[Math.floor(completedSoFar.length * 0.95)] || completedSoFar[completedSoFar.length - 1];
                    console.log(`[checkpoint @ ${globalIdx + 1}] counts=${JSON.stringify(counts)}  firstPaint p50=${p50}ms p95=${p95}ms`);
                }
            }
            globalIdx++;
        }
    }
    await browser.close().catch(() => {});

    // ── Final stats ───────────────────────────────────────────────────
    const completed = results.filter(r => r.firstPaintMs !== null).map(r => r.firstPaintMs).sort((a, b) => a - b);
    const stat = (arr) => arr.length === 0 ? { p50: null, p95: null, max: null } : {
        p50: arr[Math.floor(arr.length * 0.5)],
        p95: arr[Math.floor(arr.length * 0.95)] || arr[arr.length - 1],
        max: arr[arr.length - 1],
    };
    const s = stat(completed);
    const summary = [
        `=== Ask Pulse 1000 — final ===`,
        `Total: ${total}`,
        `counts: PASS=${counts.PASS} NEEDS-REVIEW=${counts["NEEDS-REVIEW"] || 0} FAIL=${counts.FAIL} SKIP-ENV=${counts["SKIP-ENV"] || 0} THREW=${counts.THREW || 0}`,
        `firstPaintMs (over ${completed.length} cases that painted): p50=${s.p50}ms p95=${s.p95}ms max=${s.max}ms`,
        `429 occurrences: ${results.filter(r => r.saw429).length}`,
        `5xx occurrences: ${results.filter(r => r.network500 > 0).length}`,
    ].join("\n");
    console.log("\n" + summary);

    await writeFile(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
    await writeFile(join(OUT_DIR, "summary.txt"), summary);
    console.log(`[done] artifacts → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
