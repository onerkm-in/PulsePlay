#!/usr/bin/env node
// playground/scripts/verify-ask-pulse-visual.mjs
//
// Ask Pulse VISUALIZATION smoke harness for the 1250-case catalog
// (docs/scenarios/07_ask_pulse_visual_extreme_1000.md). Runs against
// the END-USER PulseShell surface (textarea.gn-input + button.gn-send).
//
// Per-case captures (per doc Timing And Verdict Fields):
//   submitAt, userBubbleMs, firstAssistantPaintMs,
//   visualFirstPaintMs, artifactTabsMs, completedMs, verdict,
//   issueClass, notes
//
// Verdict ladder (per doc Pass Rules):
//   PASS            — visual renders OR clearly-equivalent visual with
//                     readable labels, no stale artifacts, no console errors
//   UNSUPPORTED-OK  — honest "unsupported chart family" + truthful fallback
//   FAIL            — blank visual, broken canvas, stale data, stuck spinner,
//                     invented capability, UI crash
//   SKIP-ENV        — backend / cred / network blocks visualization path
//   NEEDS-REVIEW    — renders but needs human readability inspection
//
// Usage:
//   node scripts/verify-ask-pulse-visual.mjs                   # default first 25
//   APV_RANGE=1..100 SLOW_MO=200 node scripts/...              # visual-family sweep
//   APV_RANGE=1..1250 INTER_DELAY_MS=2000 node scripts/...     # full extreme

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const CATALOG = join(REPO, "docs/scenarios/07_ask_pulse_visual_extreme_1000.md");
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_DIR = join(REPO, `docs/evidence/ask-pulse-visual-1250-${TODAY}`);

const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const RANGE = process.env.APV_RANGE || "1..25";
const SLOW_MO = parseInt(process.env.SLOW_MO || "250", 10);
const FIRST_PAINT_CEILING_MS = parseInt(process.env.FIRST_PAINT_CEILING_MS || "20000", 10);
const VISUAL_PAINT_CEILING_MS = parseInt(process.env.VISUAL_PAINT_CEILING_MS || "60000", 10);
const COMPLETION_CEILING_MS = parseInt(process.env.COMPLETION_CEILING_MS || "90000", 10);
const INTER_DELAY_MS = parseInt(process.env.INTER_DELAY_MS || "1500", 10);
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "30", 10);

const [rangeFrom, rangeTo] = RANGE.split("..").map(s => parseInt(s, 10));

// ─── Catalog parser ─────────────────────────────────────────────────────
function parseCatalog(md) {
    const cases = [];
    const rowRe = /^\|\s*(APV-\d{4})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;
    for (const line of md.split("\n")) {
        const m = line.match(rowRe);
        if (m) {
            // Extract just the user question, dropping the "[Instruction for Claude:] … [User Question:] …" framing.
            let prompt = m[5];
            const uqIdx = prompt.indexOf("[User Question:]");
            if (uqIdx >= 0) prompt = prompt.slice(uqIdx + "[User Question:]".length).trim();
            cases.push({
                id: m[1],
                visualTarget: m[2],
                domain: m[3],
                stressor: m[4],
                question: prompt,
                primaryCheck: m[6].trim(),
            });
        }
    }
    return cases;
}

// ─── Banner ─────────────────────────────────────────────────────────────
async function banner(page, text, color) {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__apv__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__apv__";
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

const visualColor = (t) => {
    const v = (t || "").toLowerCase();
    if (v.includes("map") || v.includes("geo") || v.includes("choropleth")) return "#10b981";
    if (v.includes("line") || v.includes("area") || v.includes("trend")) return "#3b82f6";
    if (v.includes("bar") || v.includes("column")) return "#f97316";
    if (v.includes("pie") || v.includes("donut") || v.includes("sunburst")) return "#a855f7";
    if (v.includes("table") || v.includes("heatmap") || v.includes("matrix")) return "#64748b";
    if (v.includes("scatter") || v.includes("bubble")) return "#ec4899";
    return "#0f172a";
};

// ─── Seed ───────────────────────────────────────────────────────────────
async function clean(page) {
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* swallow */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
}

// ─── Browser lifecycle ─────────────────────────────────────────────────
async function freshBrowser() {
    const browser = await chromium.launch({
        headless: false, slowMo: SLOW_MO,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    return { browser, page };
}

// ─── Single visualization case driver ──────────────────────────────────
async function runVisualCase(page, sc, idx, total) {
    const r = {
        caseId: sc.id, visualTarget: sc.visualTarget, domain: sc.domain, stressor: sc.stressor,
        profile: PROFILE, submitAt: null,
        userBubbleMs: null, firstAssistantPaintMs: null, visualFirstPaintMs: null,
        artifactTabsMs: null, completedMs: null, wallMs: null,
        verdict: "PENDING", issueClass: "", notes: "", saw429: false, networkErrs: 0,
    };
    const tStart = Date.now();
    let saw429 = false, networkErrs = 0;
    const consoleErrs = [];
    const pageErrs = [];
    const onResp = (resp) => {
        if (resp.url().includes("/api/assistant") || resp.url().includes("/assistant/conversations")) {
            if (resp.status() === 429) saw429 = true;
            if (resp.status() >= 500) networkErrs++;
        }
    };
    const onCons = (msg) => { if (msg.type() === "error") consoleErrs.push(msg.text().slice(0, 160)); };
    const onErr = (e) => pageErrs.push(e.message.slice(0, 160));
    page.on("response", onResp);
    page.on("console", onCons);
    page.on("pageerror", onErr);

    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await clean(page);
        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(700);
        await banner(page, `[${idx + 1}/${total}] ${sc.id} ${sc.visualTarget} · ${sc.domain.slice(0, 24)} · ready`, visualColor(sc.visualTarget));

        const askTab = page.locator('button').filter({ hasText: /^Ask Pulse$/ }).first();
        if (await askTab.count() > 0) { await askTab.click(); await page.waitForTimeout(500); }

        const composer = page.locator("textarea.gn-input").first();
        if (await composer.count() === 0) {
            r.verdict = "FAIL"; r.issueClass = "test-design"; r.notes = "no gn-input"; return r;
        }
        await composer.fill(sc.question);
        const send = page.locator("button.gn-send").first();
        if (await send.count() === 0) {
            r.verdict = "FAIL"; r.issueClass = "test-design"; r.notes = "no gn-send"; return r;
        }
        const tSubmit = Date.now();
        r.submitAt = new Date(tSubmit).toISOString();
        await send.click();
        await banner(page, `[${idx + 1}/${total}] ${sc.id} submitting…`, visualColor(sc.visualTarget));

        // User bubble paint
        const bubbleDeadline = tSubmit + 6_000;
        while (Date.now() < bubbleDeadline) {
            const userBubble = await page.evaluate(() => document.querySelector(".gn-msg--user .gn-bubble") !== null);
            if (userBubble) { r.userBubbleMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(80);
        }

        // First assistant paint (progress card OR any assistant content)
        const fpDeadline = tSubmit + FIRST_PAINT_CEILING_MS;
        while (Date.now() < fpDeadline) {
            const seen = await page.evaluate(() => {
                if (document.querySelector(".gn-chat-progress")) return "progress";
                const a = document.querySelector(".gn-msg--assistant .gn-bubble");
                if (a && (a.textContent || "").trim().length > 0) return "assistant";
                return null;
            });
            if (seen) { r.firstAssistantPaintMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(120);
        }

        // Visual first paint (chart / table / canvas / svg in the latest message)
        const vpDeadline = tSubmit + VISUAL_PAINT_CEILING_MS;
        while (Date.now() < vpDeadline) {
            const visualSeen = await page.evaluate(() => {
                const msg = document.querySelectorAll(".gn-msg--assistant");
                const last = msg[msg.length - 1];
                if (!last) return null;
                if (last.querySelector("canvas")) return "canvas";
                if (last.querySelector("svg")) return "svg";
                if (last.querySelector(".gn-chart-wrap, .gn-chart")) return "chart-wrap";
                if (last.querySelector(".gn-table, table")) return "table";
                return null;
            });
            if (visualSeen) { r.visualFirstPaintMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(200);
        }

        // Artifact tabs paint (Narrative/Chart/Table/SQL strip)
        const tabsCheck = await page.evaluate(() => {
            const toggles = document.querySelector(".gn-chart-toggles, .gn-tabs");
            return toggles ? toggles.children.length : 0;
        });
        if (tabsCheck >= 2) r.artifactTabsMs = Date.now() - tSubmit;

        // Completion
        const compDeadline = tSubmit + COMPLETION_CEILING_MS;
        while (Date.now() < compDeadline) {
            const state = await page.evaluate(() => {
                const progress = document.querySelector(".gn-chat-progress");
                const msg = document.querySelectorAll(".gn-msg--assistant");
                const last = msg[msg.length - 1];
                const contentLen = last ? (last.textContent || "").trim().length : 0;
                if (!progress && contentLen > 30) return "completed";
                return null;
            });
            if (state) { r.completedMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(300);
        }

        // ─── Verdict assignment ────────────────────────────────────
        const ui = await page.evaluate(() => {
            const composer = document.querySelector("textarea.gn-input");
            const send = document.querySelector("button.gn-send");
            const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
            const msg = document.querySelectorAll(".gn-msg--assistant");
            const last = msg[msg.length - 1];
            const lastText = last ? (last.textContent || "").trim() : "";
            const hasCanvas = last ? !!last.querySelector("canvas") : false;
            const hasSvg = last ? !!last.querySelector("svg") : false;
            const hasTable = last ? !!last.querySelector("table, .gn-table") : false;
            // Unsupported-OK detection: assistant mentions a fallback or unsupported
            const honestlyUnsupported = /not\s+supported|cannot\s+(create|render|produce)|unable\s+to\s+(create|render|generate)|here\'?s\s+a\s+(fallback|table|alternative)|using\s+a\s+(table|fallback)\s+instead/i.test(lastText);
            return {
                composerVisible: composer ? composer.offsetParent !== null : false,
                sendVisible: send ? send.offsetParent !== null : false,
                overflowX,
                hasCanvas, hasSvg, hasTable,
                lastTextLen: lastText.length,
                honestlyUnsupported,
            };
        });

        const defects = [];
        if (!ui.composerVisible) defects.push("composer-hidden");
        if (!ui.sendVisible) defects.push("send-hidden");
        if (ui.overflowX) defects.push("h-overflow");
        if (consoleErrs.length > 0) defects.push(`console-errs(${consoleErrs.length})`);
        if (pageErrs.length > 0) defects.push(`page-errs(${pageErrs.length})`);

        r.saw429 = saw429; r.networkErrs = networkErrs;

        if (saw429) {
            r.verdict = "SKIP-ENV"; r.issueClass = "backend-env"; r.notes = "429 rate-limit";
        } else if (networkErrs > 0) {
            r.verdict = "SKIP-ENV"; r.issueClass = "backend-env"; r.notes = `5xx ${networkErrs}`;
        } else if (defects.length > 0) {
            // 2026-05-26 — finer issue classification. console/page errors
            // map to chart-render or test-design depending on type;
            // composer/send hidden maps to layout-overflow; horizontal
            // overflow to layout-overflow. Lumped them all into
            // layout-overflow earlier which misled diagnosis.
            r.verdict = "FAIL";
            if (defects.some(d => d.startsWith("console-errs") || d.startsWith("page-errs"))) {
                r.issueClass = ui.hasCanvas || ui.hasSvg ? "chart-render" : "test-design";
            } else if (defects.some(d => d.includes("hidden"))) {
                r.issueClass = "layout-overflow";
            } else if (defects.some(d => d.includes("overflow"))) {
                r.issueClass = "layout-overflow";
            } else {
                r.issueClass = "test-design";
            }
            r.notes = defects.join(",");
        } else if (r.completedMs == null) {
            r.verdict = "FAIL"; r.issueClass = "performance"; r.notes = `no completion in ${COMPLETION_CEILING_MS}ms`;
        } else if (ui.honestlyUnsupported && !ui.hasCanvas && !ui.hasSvg && ui.hasTable) {
            r.verdict = "UNSUPPORTED-OK"; r.issueClass = "unsupported-visual"; r.notes = "honest fallback to table";
        } else if (!ui.hasCanvas && !ui.hasSvg && !ui.hasTable && r.completedMs > 5000) {
            r.verdict = "NEEDS-REVIEW"; r.issueClass = "chart-render"; r.notes = "no visual + no table after completion";
        } else if (r.visualFirstPaintMs == null) {
            r.verdict = "NEEDS-REVIEW"; r.issueClass = "chart-render"; r.notes = "visual probe didn't fire but content present";
        } else {
            r.verdict = "PASS";
        }

        await banner(page, `[${idx + 1}/${total}] ${sc.id} ${r.verdict} v=${r.visualFirstPaintMs ?? "—"}ms c=${r.completedMs ?? "—"}ms`, visualColor(sc.visualTarget));

        if (r.verdict !== "PASS" || idx < 5 || idx % 50 === 0) {
            const tag = r.verdict === "PASS" ? "ok" : r.verdict.toLowerCase();
            await page.screenshot({
                path: join(OUT_DIR, `${sc.id}-${tag}.png`),
                fullPage: false,
            }).catch(() => undefined);
        }
    } catch (err) {
        r.verdict = "FAIL"; r.issueClass = "test-design"; r.notes = `THREW: ${err.message.slice(0, 160)}`;
    } finally {
        page.off("response", onResp);
        page.off("console", onCons);
        page.off("pageerror", onErr);
        r.wallMs = Date.now() - tStart;
    }
    return r;
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const md = await readFile(CATALOG, "utf-8");
    const all = parseCatalog(md);
    const cases = all.filter(c => {
        const n = parseInt(c.id.slice(4), 10);
        return n >= rangeFrom && n <= rangeTo;
    });
    console.log(`[APV] ${cases.length} cases (range ${RANGE}) headed slowMo=${SLOW_MO}ms — parsed ${all.length} total APV-* from catalog`);

    const results = [];
    const counts = { PASS: 0, FAIL: 0, "SKIP-ENV": 0, "UNSUPPORTED-OK": 0, "NEEDS-REVIEW": 0 };
    let { browser, page } = await freshBrowser();
    let chunkN = 0;

    for (let i = 0; i < cases.length; i++) {
        if (chunkN >= CHUNK_SIZE) {
            console.log(`[chunk] rotating browser at case ${i + 1}/${cases.length}`);
            await browser.close().catch(() => {});
            ({ browser, page } = await freshBrowser());
            chunkN = 0;
        }
        const sc = cases[i];
        // 2026-05-26 — auto-recover from "browser closed" errors. APV-100
        // sweep had 10 false-FAILs because a browser instance died mid-run
        // and the next 9 cases threw before chunk rotation. Wrap with a
        // single retry: if the case throws AND the browser is dead, spawn
        // a fresh one and retry the same case.
        let r = await runVisualCase(page, sc, i, cases.length);
        if (r.verdict === "FAIL" && /browser has been closed|context.*been closed|page.*been closed/i.test(r.notes || "")) {
            console.log(`[recover] browser died at case ${i + 1}/${cases.length}, restarting browser + retry`);
            await browser.close().catch(() => {});
            ({ browser, page } = await freshBrowser());
            chunkN = 0;
            r = await runVisualCase(page, sc, i, cases.length);
        }
        results.push(r);
        counts[r.verdict] = (counts[r.verdict] || 0) + 1;
        chunkN++;

        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "UNSUPPORTED-OK" ? "🔄" : r.verdict === "SKIP-ENV" ? "⏭️" : r.verdict === "NEEDS-REVIEW" ? "⚠️" : "❌";
        console.log(`${flag} [${String(i + 1).padStart(4, "0")}/${cases.length}] ${sc.id} ${sc.visualTarget.padEnd(30).slice(0, 30)} ${r.verdict.padEnd(14)} v=${r.visualFirstPaintMs ?? "—"}ms c=${r.completedMs ?? "—"}ms ${r.notes ? `:: ${r.notes}` : ""}`);

        if ((i + 1) % 25 === 0) {
            const cp = { i: i + 1, counts };
            await writeFile(join(OUT_DIR, `checkpoint-${i + 1}.json`), JSON.stringify(cp, null, 2)).catch(() => undefined);
        }

        if (INTER_DELAY_MS > 0) await new Promise(r => setTimeout(r, INTER_DELAY_MS));
    }
    await browser.close().catch(() => {});

    // Final stats
    const visualMs = results.map(r => r.visualFirstPaintMs).filter(v => typeof v === "number").sort((a, b) => a - b);
    const completedMs = results.map(r => r.completedMs).filter(v => typeof v === "number").sort((a, b) => a - b);
    const stat = (arr) => arr.length === 0 ? { p50: null, p95: null, max: null } : {
        p50: arr[Math.floor(arr.length * 0.5)],
        p95: arr[Math.floor(arr.length * 0.95)] || arr[arr.length - 1],
        max: arr[arr.length - 1],
    };
    const sv = stat(visualMs), sc = stat(completedMs);

    // Issue-class breakdown
    const issueCounts = {};
    for (const r of results) {
        if (!r.issueClass) continue;
        issueCounts[r.issueClass] = (issueCounts[r.issueClass] || 0) + 1;
    }

    const summary = [
        `=== APV visualization smoke — range ${RANGE} ===`,
        `Total: ${results.length}`,
        ``,
        `Verdicts:  PASS=${counts.PASS}  UNSUPPORTED-OK=${counts["UNSUPPORTED-OK"] || 0}  NEEDS-REVIEW=${counts["NEEDS-REVIEW"] || 0}  FAIL=${counts.FAIL}  SKIP-ENV=${counts["SKIP-ENV"] || 0}`,
        ``,
        `visualFirstPaintMs (over ${visualMs.length}):  p50=${sv.p50} p95=${sv.p95} max=${sv.max}`,
        `completedMs       (over ${completedMs.length}):  p50=${sc.p50} p95=${sc.p95} max=${sc.max}`,
        ``,
        `Issue-class breakdown:`,
        ...Object.entries(issueCounts).map(([k, v]) => `  ${k.padEnd(20)} ${v}`),
        ``,
        `429 occurrences: ${results.filter(r => r.saw429).length}`,
        `5xx occurrences: ${results.filter(r => r.networkErrs > 0).length}`,
    ].join("\n");
    console.log("\n" + summary);
    await writeFile(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
    await writeFile(join(OUT_DIR, "summary.txt"), summary);
    const csv = [
        "caseId,visualTarget,domain,verdict,issueClass,userBubbleMs,firstAssistantPaintMs,visualFirstPaintMs,artifactTabsMs,completedMs,wallMs,notes",
        ...results.map(r => [r.caseId, JSON.stringify(r.visualTarget), JSON.stringify(r.domain), r.verdict, r.issueClass, r.userBubbleMs, r.firstAssistantPaintMs, r.visualFirstPaintMs, r.artifactTabsMs, r.completedMs, r.wallMs, JSON.stringify(r.notes || "")].join(",")),
    ].join("\n");
    await writeFile(join(OUT_DIR, "results.csv"), csv);
    console.log(`[done] → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
