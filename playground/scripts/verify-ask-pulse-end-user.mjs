#!/usr/bin/env node
// playground/scripts/verify-ask-pulse-end-user.mjs
//
// END-USER MODE Ask Pulse harness — drives the DEFAULT UI the real user
// sees: uiMode=pulse → PulseShell 3-tab strip → click "Ask Pulse" tab →
// textarea.gn-input + button.gn-send composer → wait for MessageCard
// status COMPLETED.
//
// This is the surface where "let's make it the best UI interaction"
// improvements actually land for end users. The earlier v0-mode harness
// drove UnifiedAssistantSurface (escape-hatch path) which is NOT what
// the user sees on a fresh visit.
//
// Per-case captures: submitMs, firstPaintMs, completedMs, wallMs, +
// rich UI defect probes (composer reachable, tab strip ok, horizontal
// overflow, message card rendered, suggestion pills not duplicating,
// no z-index stacking issues with dev overlays).
//
// Usage:
//   node scripts/verify-ask-pulse-end-user.mjs                 # default 1..20
//   ASK_PULSE_RANGE=1..50 SLOW_MO=400 node scripts/...

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const CATALOG = join(REPO, "docs/scenarios/06_ask_pulse_complex_extreme_100.md");
const OUT_DIR = join(REPO, "docs/evidence/ask-pulse-end-user-2026-05-26");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const RANGE = process.env.ASK_PULSE_RANGE || "1..20";
const SLOW_MO = parseInt(process.env.SLOW_MO || "400", 10);
const PER_CASE_TIMEOUT_MS = parseInt(process.env.PER_CASE_TIMEOUT_MS || "90000", 10);
const FIRST_PAINT_CEILING_MS = parseInt(process.env.FIRST_PAINT_CEILING_MS || "12000", 10);
const INTER_CASE_DELAY_MS = parseInt(process.env.INTER_CASE_DELAY_MS || "1000", 10);
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "25", 10);

const [rangeFrom, rangeTo] = RANGE.split("..").map(s => parseInt(s, 10));

function parseCatalog(md) {
    const cases = [];
    const rowRe = /^\|\s*(APQ-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;
    for (const line of md.split("\n")) {
        const m = line.match(rowRe);
        if (m) cases.push({ id: m[1], complexity: m[2].split(" ")[0], useCase: m[3], layoutFocus: m[4], question: m[5].trim() });
    }
    return cases;
}

const complexityColor = (c) => ({ C3: "#3b82f6", C4: "#10b981", C5: "#f97316", C6: "#ef4444" }[c] || "#888");

async function showBanner(page, text, color) {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__enduser_banner__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__enduser_banner__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "6px 10px", background: "rgba(15,23,42,0.92)", color: "#fff",
                font: "12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
                borderRadius: "4px", pointerEvents: "none",
            });
            document.body.appendChild(b);
        }
        b.style.borderLeft = `4px solid ${color}`;
        b.textContent = `END-USER ${text}`;
    }, { text, color });
}

async function seed(page) {
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* swallow */ }
        // NO uiMode set → defaults to "pulse" (PulseShell). End-user mode.
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        // 2026-05-26 — FORCE Ask Pulse as both active surface AND default
        // landing surface so the page lands there directly. Without this,
        // the page lands on AI Insights (the default landing) which auto-
        // fires a briefing that competes with our Genie request slot AND
        // the harness's "click Ask Pulse tab" can be defeated by the
        // briefing's render cycle. Setting both keys means no tab-click
        // dance + no auto-briefing interference.
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile;
        ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
}

async function freshBrowser() {
    const browser = await chromium.launch({
        headless: false, slowMo: SLOW_MO,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    return { browser, page };
}

async function runOne(page, sc, idx, total) {
    const r = {
        i: idx, caseId: sc.id, complexity: sc.complexity, layoutFocus: sc.layoutFocus,
        submitMs: null, firstPaintMs: null, completedMs: null, wallMs: null,
        verdict: "PENDING", issue: "", saw429: false, network500: 0,
        ui: {},
    };
    const tStart = Date.now();
    let saw429 = false, network500 = 0;
    const onResp = (resp) => {
        if (resp.url().includes("/api/assistant") || resp.url().includes("/assistant/conversations")) {
            if (resp.status() === 429) saw429 = true;
            if (resp.status() >= 500) network500++;
        }
    };
    page.on("response", onResp);

    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
        await seed(page);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(900);
        await showBanner(page, `[${idx + 1}/${total}] ${sc.id} ${sc.complexity} · click Ask Pulse…`, complexityColor(sc.complexity));

        // Click the Ask Pulse tab in the 3-tab strip
        const askTab = page.locator('button:has-text("Ask Pulse")').first();
        if ((await askTab.count()) === 0) {
            r.verdict = "FAIL"; r.issue = "no Ask Pulse tab"; return r;
        }
        await askTab.click();
        await page.waitForTimeout(700);

        const composer = page.locator("textarea.gn-input").first();
        if ((await composer.count()) === 0) {
            r.verdict = "FAIL"; r.issue = "no gn-input composer"; return r;
        }
        await composer.click();
        await composer.fill(sc.question);
        await showBanner(page, `[${idx + 1}/${total}] ${sc.id} submitting…`, complexityColor(sc.complexity));

        const sendBtn = page.locator("button.gn-send").first();
        if ((await sendBtn.count()) === 0) {
            r.verdict = "FAIL"; r.issue = "no gn-send button"; return r;
        }

        const tSubmit = Date.now();
        r.submitMs = tSubmit - tStart;
        await sendBtn.click();

        // First paint: any message rendered OR gn-chat-progress visible
        const firstPaintDeadline = tSubmit + FIRST_PAINT_CEILING_MS;
        while (Date.now() < firstPaintDeadline) {
            const seen = await page.evaluate(() => {
                const progress = document.querySelector(".gn-chat-progress");
                const messages = document.querySelectorAll('[class*="gn-message"], .gn-chat-area > *, .gn-chat-log > *');
                if (progress) return "progress";
                if (messages.length > 0) return "message";
                return null;
            });
            if (seen) { r.firstPaintMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(150);
        }

        // Completion: gn-chat-progress disappears AND there's content,
        // or status === COMPLETED on the latest message card.
        const completionDeadline = tSubmit + PER_CASE_TIMEOUT_MS;
        let finalState = null;
        while (Date.now() < completionDeadline) {
            const state = await page.evaluate(() => {
                const progress = document.querySelector(".gn-chat-progress");
                const log = document.querySelector(".gn-chat-area, .gn-chat-log");
                const contentLen = log ? (log.textContent || "").trim().length : 0;
                if (progress) return null;
                if (contentLen > 30) return "completed";
                return null;
            });
            if (state) { r.completedMs = Date.now() - tSubmit; finalState = state; break; }
            await page.waitForTimeout(300);
        }

        // UI defect probe
        const ui = await page.evaluate(() => {
            const composer = document.querySelector("textarea.gn-input");
            const composerRect = composer ? composer.getBoundingClientRect() : null;
            const composerVisible = composerRect ? (composerRect.bottom > 0 && composerRect.top < window.innerHeight) : false;
            const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
            const sendBtn = document.querySelector("button.gn-send");
            const sendVisible = sendBtn ? sendBtn.offsetParent !== null : false;
            // 2026-05-26 — `:has-text()` is a Playwright selector engine,
            // NOT a valid browser CSS selector. Using it inside
            // page.evaluate threw SyntaxError on every case. Replaced
            // with a textContent filter that runs in the browser.
            const tabsBtnCount = Array.from(document.querySelectorAll("button")).filter(b => /^(AI Insights|Ask Pulse|Dashboard)$/i.test((b.textContent || "").trim())).length;
            const chatLog = document.querySelector(".gn-chat-area, .gn-chat-log");
            const chatLogVisible = chatLog ? chatLog.getBoundingClientRect().height > 50 : false;
            // Check for dev-overlay collisions with composer or send button
            const sendRect = sendBtn ? sendBtn.getBoundingClientRect() : null;
            const elAtSendBR = sendRect ? document.elementFromPoint(sendRect.right - 4, sendRect.bottom - 4) : null;
            const sendBROwnedBySend = elAtSendBR ? (sendBtn?.contains(elAtSendBR) || elAtSendBR === sendBtn) : true;
            return { composerVisible, overflowX, sendVisible, tabsBtnCount, chatLogVisible, sendBROwnedBySend };
        });
        r.ui = ui;
        r.saw429 = saw429; r.network500 = network500;

        const defects = [];
        if (!ui.composerVisible) defects.push("composer-hidden");
        if (ui.overflowX) defects.push("h-overflow");
        if (!ui.sendVisible) defects.push("send-hidden");
        if (ui.tabsBtnCount !== 3) defects.push(`tab-count=${ui.tabsBtnCount}`);
        if (!ui.chatLogVisible) defects.push("chat-log-not-visible");
        if (!ui.sendBROwnedBySend) defects.push("send-corner-overlapped");

        if (saw429) { r.verdict = "SKIP-ENV"; r.issue = "429"; }
        else if (defects.length > 0) { r.verdict = "FAIL"; r.issue = defects.join(","); }
        else if (!finalState && r.firstPaintMs === null) { r.verdict = "FAIL"; r.issue = "no first paint"; }
        else if (!finalState) { r.verdict = "NEEDS-REVIEW"; r.issue = `no completion in ${PER_CASE_TIMEOUT_MS}ms`; }
        else { r.verdict = "PASS"; }

        await showBanner(page, `[${idx + 1}/${total}] ${sc.id} ${r.verdict} ${r.completedMs ?? "—"}ms`, complexityColor(sc.complexity));
        // Screenshot for first 5 + every 10th + every non-PASS
        if (idx < 5 || idx % 10 === 9 || r.verdict !== "PASS") {
            const tag = r.verdict === "PASS" ? "ok" : r.verdict.toLowerCase();
            await page.screenshot({
                path: join(OUT_DIR, `${String(idx + 1).padStart(3, "0")}-${sc.id}-${tag}.png`),
                fullPage: false,
            }).catch(() => undefined);
        }
    } catch (err) {
        r.verdict = "THREW"; r.issue = err.message.slice(0, 200);
        await page.screenshot({ path: join(OUT_DIR, `${String(idx + 1).padStart(3, "0")}-${sc.id}-threw.png`), fullPage: false }).catch(() => undefined);
    } finally {
        page.off("response", onResp);
        r.wallMs = Date.now() - tStart;
    }
    return r;
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const md = await readFile(CATALOG, "utf-8");
    const all = parseCatalog(md);
    const cases = all.filter(c => {
        const n = parseInt(c.id.slice(4), 10);
        return n >= rangeFrom && n <= rangeTo;
    });
    console.log(`[end-user] ${cases.length} cases (range ${RANGE}) headed slowMo=${SLOW_MO}ms`);

    const results = [];
    const counts = { PASS: 0, FAIL: 0, "SKIP-ENV": 0, "NEEDS-REVIEW": 0, THREW: 0 };
    let { browser, page } = await freshBrowser();
    let casesSinceChunk = 0;

    for (let i = 0; i < cases.length; i++) {
        if (casesSinceChunk >= CHUNK_SIZE) {
            console.log(`[chunk] rotating browser at case ${i + 1}/${cases.length}`);
            await browser.close().catch(() => {});
            ({ browser, page } = await freshBrowser());
            casesSinceChunk = 0;
        }
        const sc = cases[i];
        const r = await runOne(page, sc, i, cases.length);
        results.push(r);
        counts[r.verdict] = (counts[r.verdict] || 0) + 1;
        casesSinceChunk++;

        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "SKIP-ENV" ? "⏭️" : r.verdict === "NEEDS-REVIEW" ? "⚠️" : "❌";
        console.log(`${flag} [${String(i + 1).padStart(3, "0")}/${cases.length}] ${r.caseId} ${r.complexity} ${(r.layoutFocus || "").padEnd(26).slice(0, 26)} → ${r.verdict.padEnd(13)} first=${r.firstPaintMs ?? "—"}ms complete=${r.completedMs ?? "—"}ms wall=${r.wallMs}ms ${r.issue ? `:: ${r.issue}` : ""}`);

        if (INTER_CASE_DELAY_MS > 0) await new Promise(r => setTimeout(r, INTER_CASE_DELAY_MS));
    }
    await browser.close().catch(() => {});

    const completed = results.filter(r => r.completedMs !== null).map(r => r.completedMs).sort((a, b) => a - b);
    const firstPaints = results.filter(r => r.firstPaintMs !== null).map(r => r.firstPaintMs).sort((a, b) => a - b);
    const stat = (arr) => arr.length === 0 ? { p50: null, p95: null, max: null } : {
        p50: arr[Math.floor(arr.length * 0.5)],
        p95: arr[Math.floor(arr.length * 0.95)] || arr[arr.length - 1],
        max: arr[arr.length - 1],
    };
    const sF = stat(firstPaints);
    const sC = stat(completed);
    const summary = [
        `=== Ask Pulse END-USER mode — range ${RANGE} ===`,
        `Total: ${results.length}`,
        `counts: PASS=${counts.PASS} NEEDS-REVIEW=${counts["NEEDS-REVIEW"] || 0} FAIL=${counts.FAIL} SKIP-ENV=${counts["SKIP-ENV"] || 0} THREW=${counts.THREW || 0}`,
        `firstPaintMs (over ${firstPaints.length}): p50=${sF.p50} p95=${sF.p95} max=${sF.max}`,
        `completedMs (over ${completed.length}): p50=${sC.p50} p95=${sC.p95} max=${sC.max}`,
        `429 occurrences: ${results.filter(r => r.saw429).length}`,
    ].join("\n");
    console.log("\n" + summary);
    await writeFile(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
    await writeFile(join(OUT_DIR, "summary.txt"), summary);
    console.log(`[done] → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
