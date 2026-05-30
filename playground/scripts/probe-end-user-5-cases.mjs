#!/usr/bin/env node
// End-user-mode Ask Pulse probe — 5 cases through the DEFAULT UI
// (uiMode=pulse → PulseShell 3-tab strip). Uses the actual gn-input /
// gn-send composer the end user sees, not the v0 UnifiedAssistantSurface
// our automation harness forces.
//
// Headed, slow-mo, screenshot each case. Intent: let Rajesh visually
// verify the end-user experience that PulsePlay actually ships.

import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const CATALOG = join(REPO, "docs/scenarios/06_ask_pulse_complex_extreme_100.md");
const OUT_DIR = join(REPO, "docs/evidence/ask-pulse-100-2026-05-26");
const BASE = "http://127.0.0.1:7001";
const SLOW_MO = 500;

function parseCatalog(md) {
    const cases = [];
    const rowRe = /^\|\s*(APQ-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;
    for (const line of md.split("\n")) {
        const m = line.match(rowRe);
        if (m) cases.push({ id: m[1], complexity: m[2].split(" ")[0], useCase: m[3], layoutFocus: m[4], question: m[5].trim(), expected: m[6].trim() });
    }
    return cases;
}

async function showBanner(page, sc, idx, total, summary) {
    await page.evaluate(({ sc, idx, total, summary }) => {
        let b = document.getElementById("__enduser-banner__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__enduser-banner__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999",
                padding: "8px 12px", background: "rgba(15,23,42,0.94)", color: "#fff",
                font: "13px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
                borderRadius: "5px", pointerEvents: "none",
                boxShadow: "0 3px 12px rgba(0,0,0,0.35)", borderLeft: "5px solid #10b981",
            });
            document.body.appendChild(b);
        }
        b.textContent = `END-USER MODE [${idx + 1}/${total}] ${sc.id} ${sc.complexity} · ${summary}`;
    }, { sc, idx, total, summary });
}

async function seed(page) {
    await page.evaluate(() => {
        try { window.localStorage.clear(); } catch { /* swallow */ }
        // NO uiMode set → defaults to "pulse" (PulseShell 3-tab strip) — what the end user sees.
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default";
        ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    });
}

async function runOneCase(page, sc, idx, total) {
    const result = { caseId: sc.id, layoutFocus: sc.layoutFocus, verdict: "PENDING", firstPaintMs: null, completedMs: null, wallMs: null, issue: "" };
    const t0 = Date.now();

    try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
        await seed(page);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(1200);
        await showBanner(page, sc, idx, total, "selecting Ask Pulse tab…");

        // Click the Ask Pulse tab in the 3-tab strip.
        const askTab = page.locator('button:has-text("Ask Pulse")').first();
        if ((await askTab.count()) > 0) {
            await askTab.click();
            await page.waitForTimeout(800);
        }
        await page.screenshot({ path: join(OUT_DIR, `ENDUSER-${sc.id}-1-before-ask.png`), fullPage: false });

        // Find the PulseShell composer (gn-input textarea) and Send button.
        const composer = page.locator("textarea.gn-input").first();
        if ((await composer.count()) === 0) {
            result.verdict = "FAIL"; result.issue = "no gn-input composer on Ask Pulse pane";
            return result;
        }
        await composer.click();
        await composer.fill(sc.question);
        await page.waitForTimeout(400);
        await showBanner(page, sc, idx, total, "submitting…");

        const sendBtn = page.locator("button.gn-send").first();
        const sendHits = await sendBtn.count();
        if (sendHits === 0) {
            result.verdict = "FAIL"; result.issue = "no gn-send button";
            return result;
        }
        const tSubmit = Date.now();
        await sendBtn.click();

        // Wait for first paint — any element appearing inside .gn-chat-log
        const firstPaintDeadline = tSubmit + 20_000;
        while (Date.now() < firstPaintDeadline) {
            const paint = await page.evaluate(() => {
                const log = document.querySelector(".gn-chat-log, .gn-chat-area");
                if (!log) return false;
                return log.children.length > 0 || (log.textContent || "").trim().length > 0;
            });
            if (paint) { result.firstPaintMs = Date.now() - tSubmit; break; }
            await page.waitForTimeout(150);
        }

        // Wait for completion — chat-progress disappears, or response complete signal.
        const completionDeadline = tSubmit + 120_000;
        while (Date.now() < completionDeadline) {
            const done = await page.evaluate(() => {
                const progress = document.querySelector(".gn-chat-progress");
                const errored = document.querySelector(".gn-chat-error, [data-message-status='failed']");
                if (errored) return "failed";
                if (!progress) {
                    // No progress indicator visible — assume completed if there's content
                    const log = document.querySelector(".gn-chat-log, .gn-chat-area");
                    if (log && (log.textContent || "").trim().length > 20) return "completed";
                }
                return null;
            });
            if (done) { result.completedMs = Date.now() - tSubmit; result.verdict = done === "completed" ? "PASS" : "FAIL"; break; }
            await page.waitForTimeout(300);
        }
        if (!result.completedMs) {
            result.verdict = "FAIL"; result.issue = "no completion within 120s";
        }

        await page.waitForTimeout(800);
        await showBanner(page, sc, idx, total, `${result.verdict} ${result.completedMs ?? "—"}ms`);
        await page.screenshot({ path: join(OUT_DIR, `ENDUSER-${sc.id}-2-after-answer.png`), fullPage: false });
    } catch (err) {
        result.verdict = "THREW"; result.issue = err.message.slice(0, 200);
        await page.screenshot({ path: join(OUT_DIR, `ENDUSER-${sc.id}-threw.png`), fullPage: false }).catch(() => undefined);
    }
    result.wallMs = Date.now() - t0;
    return result;
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const md = await readFile(CATALOG, "utf-8");
    const all = parseCatalog(md);
    // Pick 5 spanning C3/C4/C5/C6 + varied layout focus.
    const picks = ["APQ-001", "APQ-006", "APQ-010", "APQ-021", "APQ-035"];
    const cases = picks.map(id => all.find(c => c.id === id)).filter(Boolean);

    const browser = await chromium.launch({ headless: false, slowMo: SLOW_MO, args: ["--window-position=80,80","--window-size=1500,1050"] });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    console.log(`[end-user mode] running ${cases.length} cases headed slowMo=${SLOW_MO}ms`);
    const results = [];
    for (let i = 0; i < cases.length; i++) {
        const sc = cases[i];
        const r = await runOneCase(page, sc, i, cases.length);
        results.push(r);
        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "THREW" ? "💥" : "❌";
        console.log(`${flag} [${sc.id}] ${sc.complexity} ${sc.layoutFocus.padEnd(28).slice(0,28)} → ${r.verdict}  first=${r.firstPaintMs ?? "—"}ms complete=${r.completedMs ?? "—"}ms wall=${r.wallMs}ms  ${r.issue}`);
    }
    await browser.close();
    console.log(`[done] screenshots → ${OUT_DIR}/ENDUSER-*.png`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
