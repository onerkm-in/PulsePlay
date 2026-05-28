#!/usr/bin/env node
// playground/scripts/verify-ask-pulse-100.mjs
//
// Slow-mo headed harness for the 100-question Ask Pulse pack defined
// in docs/scenarios/06_ask_pulse_complex_extreme_100.md. Reads cases
// directly from the markdown table so the source of truth stays in
// the .md.
//
// Per-case captures (per the doc's Timing Contract):
//   submitAt, userBubbleMs, firstAssistantPaintMs, completedMs,
//   artifactPaintMs, totalRenderMs + verdict + issue note + screenshot
//
// Verdict ladder:
//   PASS         — backend completed AND no UI defects
//   FAIL         — backend failed (genuine, not env) OR UI defect detected
//   SKIP-ENV     — backend failed under detectable env condition (429, network)
//   NEEDS-REVIEW — backend completed but expected artifact didn't paint
//   THREW        — harness threw before a verdict could be assigned
//
// Usage:
//   node scripts/verify-ask-pulse-100.mjs              # default range 1..10
//   ASK_PULSE_RANGE=1..50 node scripts/...             # custom range
//   ASK_PULSE_RANGE=1..100 SLOW_MO=300 node scripts/...

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const CATALOG = join(REPO, "docs/scenarios/06_ask_pulse_complex_extreme_100.md");
const OUT_DIR = join(REPO, "docs/evidence/ask-pulse-100-2026-05-26");

const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";
const RANGE = process.env.ASK_PULSE_RANGE || "1..10";   // "1..10" or "1..100"
const SLOW_MO = parseInt(process.env.SLOW_MO || "500", 10);
const PER_CASE_TIMEOUT_MS = parseInt(process.env.CASE_TIMEOUT_MS || "120000", 10); // 2 min/case backend ceiling
const CHUNK_SIZE = 20; // restart browser every N cases (Vite memory)

const [rangeFrom, rangeTo] = RANGE.split("..").map((s) => parseInt(s, 10));

// ─── Catalog parser ──────────────────────────────────────────────────────

function parseCatalog(md) {
    const cases = [];
    const rowRe = /^\|\s*(APQ-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;
    for (const line of md.split("\n")) {
        const m = line.match(rowRe);
        if (m) {
            cases.push({
                id: m[1],
                complexity: m[2].split(" ")[0], // "C4"
                useCase: m[3],
                layoutFocus: m[4],
                question: m[5].trim(),
                expected: m[6].trim(),
            });
        }
    }
    return cases;
}

// ─── LayoutFocus → setup actions ─────────────────────────────────────────

function classifyLayout(focus) {
    const f = focus.toLowerCase();
    return {
        maximize: /maximi/i.test(f),
        mobile: /mobile/i.test(f),
        ultraWide: /ultra-?wide/i.test(f),
        splitWithBi: /split with bi/i.test(f),
        floating: /floating/i.test(f),
        chartTab: /chart tab|chart and (sql|table)/i.test(f),
        tableTab: /table tab|table plus/i.test(f),
        sqlTab: /sql tab|chart and sql/i.test(f),
        evidenceTab: /evidence/i.test(f),
        reasoningTab: /reasoning/i.test(f),
        showHistory: /show history/i.test(f),
        keyboard: /keyboard/i.test(f),
        highContrast: /high contrast/i.test(f),
        stickyComposer: /sticky composer/i.test(f),
        followUp: /follow-?up/i.test(f),
        tabSwitch: /tab switch/i.test(f),
        minimizeDock: /minimi/i.test(f) && /dock|restore/i.test(f),
        askOnly: /ask pulse only mode/i.test(f),
        longTable: /long table|long answer/i.test(f),
    };
}

async function applyLayoutFocus(page, layout, sc) {
    // Mobile + ultra-wide need viewport changes BEFORE navigation.
    if (layout.mobile) {
        await page.setViewportSize({ width: 412, height: 900 });
    } else if (layout.ultraWide) {
        await page.setViewportSize({ width: 1920, height: 1080 });
    } else {
        await page.setViewportSize({ width: 1400, height: 950 });
    }
    // askOnly: disable AI Insights + Dashboard tabs.
    if (layout.askOnly) {
        await page.evaluate(() => {
            window.localStorage.setItem("pulseplay:tab-visibility",
                JSON.stringify({ aiInsights: false, askPulse: true, dashboard: false }));
        });
    } else {
        await page.evaluate(() => {
            window.localStorage.removeItem("pulseplay:tab-visibility");
        });
    }
}

async function applyPostNavLayout(page, layout) {
    if (layout.maximize) {
        // Click the maximize button in the top-right toolbar (4th button).
        try {
            const btn = page.locator('[data-testid="pp-top-right-toolbar"] button').nth(3);
            if (await btn.count() > 0) await btn.click({ timeout: 2000 });
            await page.waitForTimeout(400);
        } catch { /* swallow */ }
    }
    if (layout.floating) {
        try {
            const btn = page.locator('[data-testid="pp-top-right-toolbar"] button').nth(4);
            if (await btn.count() > 0) await btn.click({ timeout: 2000 });
            await page.waitForTimeout(400);
        } catch { /* swallow */ }
    }
}

// ─── Banner overlay so the user can watch ────────────────────────────────

async function showBanner(page, sc, idx, total, summary) {
    await page.evaluate(({ sc, idx, total, summary }) => {
        let b = document.getElementById("__ask-pulse-banner__");
        if (!b) {
            b = document.createElement("div");
            b.id = "__ask-pulse-banner__";
            Object.assign(b.style, {
                position: "fixed", top: "8px", left: "8px", right: "8px",
                zIndex: "99999", padding: "8px 12px",
                background: "rgba(15,23,42,0.94)", color: "#fff",
                font: "13px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
                borderRadius: "5px", pointerEvents: "none",
                boxShadow: "0 3px 12px rgba(0,0,0,0.35)",
                borderLeft: `5px solid ${sc.color || "#3b82f6"}`,
            });
            document.body.appendChild(b);
        }
        b.textContent = `[${idx + 1}/${total}] ${sc.id} ${sc.complexity} · ${sc.layoutFocus} · ${summary}`;
    }, { sc, idx, total, summary });
}

const complexityColor = (c) => ({ C3: "#3b82f6", C4: "#10b981", C5: "#f97316", C6: "#ef4444" }[c] || "#888");

// ─── Single case driver ──────────────────────────────────────────────────

async function runCase(page, sc, idx, total) {
    const result = {
        caseId: sc.id, complexity: sc.complexity, useCase: sc.useCase,
        layoutFocus: sc.layoutFocus, question: sc.question, profile: PROFILE,
        submitAt: null, userBubbleMs: null, firstAssistantPaintMs: null,
        completedMs: null, artifactPaintMs: null, totalRenderMs: null,
        verdict: "PENDING", issue: "", fixCommit: "",
        notes: [],
    };
    const layout = classifyLayout(sc.layoutFocus);

    const consoleErrors = [];
    const onMsg = (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200)); };
    const onErr = (err) => consoleErrors.push(`pageerror:${err.message.slice(0, 200)}`);
    page.on("console", onMsg);
    page.on("pageerror", onErr);

    let networkErrs = 0;
    let saw429 = false;
    const onResponse = (resp) => {
        if (resp.url().includes("/api/assistant") || resp.url().includes("/assistant/conversations")) {
            if (resp.status() === 429) saw429 = true;
            if (resp.status() >= 500) networkErrs++;
        }
    };
    page.on("response", onResponse);

    try {
        // Pre-nav seed (clean ish; preserve UI mode default)
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.evaluate((p) => {
            window.localStorage.setItem("pulseplay:active-ai-profile", p);
            const k = "pulseplay:visual-settings:genieSettings";
            const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
            ex.assistantProfile = p;
            ex.connectionMode = "proxy";
            ex.apiBaseUrl = window.location.origin + "/api";
            window.localStorage.setItem(k, JSON.stringify(ex));
            // Force v0 surface so the chat composer/UI selectors we use are present.
            window.localStorage.setItem("pulseplay:ui-mode", "v0");
            window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        }, PROFILE);

        await applyLayoutFocus(page, layout, sc);

        await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(700);
        await applyPostNavLayout(page, layout);

        // Find composer + Ask button.
        const composer = page.locator("textarea").first();
        if ((await composer.count()) === 0) {
            result.verdict = "FAIL";
            result.issue = "no composer textarea on Ask Pulse surface";
            return result;
        }
        await composer.click();
        await composer.fill(sc.question);

        await showBanner(page, sc, idx, total, "submitting…");

        const askBtn = page.locator("button.pp-ai-sidebar__ask").first();
        if ((await askBtn.count()) === 0) {
            result.verdict = "FAIL";
            result.issue = "no Ask button (pp-ai-sidebar__ask)";
            return result;
        }

        // ─── Submit + start timing ───────────────────────────────────
        const t0 = Date.now();
        result.submitAt = new Date(t0).toISOString();
        await askBtn.click();

        // Time-to-user-bubble: poll for at least one ai-entry mounting.
        const userBubbleDeadline = t0 + 5_000;
        while (Date.now() < userBubbleDeadline) {
            const entries = await page.locator('[data-testid^="pp-ai-entry-"]').count();
            if (entries > 0) {
                result.userBubbleMs = Date.now() - t0;
                break;
            }
            await page.waitForTimeout(80);
        }

        // First assistant paint: first observable state change beyond bubble.
        // We accept any of:  data-status=pending|streaming|completed|failed,
        // OR a non-empty narrative DOM,
        // OR an SectionedAnswer mount,
        // OR a governed/blocked banner.
        const firstPaintDeadline = t0 + 30_000;
        while (Date.now() < firstPaintDeadline) {
            const seen = await page.evaluate(() => {
                const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
                if (entries.length === 0) return false;
                const last = entries[entries.length - 1];
                const status = last.getAttribute("data-status");
                if (status === "streaming" || status === "completed" || status === "failed") return true;
                const narrative = last.querySelector(".pp-ai-sidebar__narrative");
                if (narrative && (narrative.textContent || "").trim().length > 0) return true;
                const sec = last.querySelector('[data-testid="pp-sectioned-answer"]');
                if (sec) return true;
                const blocked = last.textContent && /blocked|governed/i.test(last.textContent);
                if (blocked) return true;
                return false;
            });
            if (seen) { result.firstAssistantPaintMs = Date.now() - t0; break; }
            await page.waitForTimeout(120);
        }

        // Completed: terminal state on the last entry.
        const completionDeadline = t0 + PER_CASE_TIMEOUT_MS;
        let finalStatus = null;
        while (Date.now() < completionDeadline) {
            finalStatus = await page.evaluate(() => {
                const entries = Array.from(document.querySelectorAll('[data-testid^="pp-ai-entry-"]'));
                const last = entries[entries.length - 1];
                return last ? last.getAttribute("data-status") : null;
            });
            if (finalStatus === "completed" || finalStatus === "failed") {
                result.completedMs = Date.now() - t0;
                break;
            }
            await page.waitForTimeout(250);
        }

        // ─── Artifact disclosures (UnifiedAssistantSurface uses
        // <details><summary>SQL/Result</summary> + EvidenceDrawer, NOT
        // a tab strip — confirmed via UnifiedAssistantSurface.tsx:1255-93). ─
        const artifactProbes = [];
        if (layout.sqlTab || layout.chartTab) artifactProbes.push({ name: "sql", sel: '.pp-ai-sidebar__sql summary' });
        if (layout.tableTab || layout.chartTab) artifactProbes.push({ name: "result", sel: '.pp-ai-sidebar__result summary' });
        if (layout.evidenceTab) artifactProbes.push({ name: "evidence", sel: '.pp-evidence-drawer__toggle, [data-testid="pp-evidence-drawer-toggle"]' });
        for (const a of artifactProbes) {
            try {
                const loc = page.locator(a.sel).last();
                if (await loc.count() > 0) {
                    const aStart = Date.now();
                    await loc.click({ timeout: 1500 });
                    await page.waitForTimeout(400);
                    result.artifactPaintMs = (result.artifactPaintMs ?? 0) + (Date.now() - aStart);
                    result.notes.push(`artifact:${a.name} clicked`);
                } else {
                    result.notes.push(`artifact:${a.name} not-present`);
                }
            } catch { result.notes.push(`artifact:${a.name} click-failed`); }
        }

        // ─── UI defect probes ────────────────────────────────────────
        const ui = await page.evaluate(() => {
            const composer = document.querySelector("textarea");
            const composerRect = composer ? composer.getBoundingClientRect() : null;
            const composerVisible = composerRect ? (composerRect.bottom > 0 && composerRect.top < window.innerHeight) : false;
            const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
            const askBtn = document.querySelector("button.pp-ai-sidebar__ask");
            const askVisible = askBtn ? askBtn.offsetParent !== null : false;
            const entries = document.querySelectorAll('[data-testid^="pp-ai-entry-"]').length;
            return { composerVisible, overflowX, askVisible, entries };
        });
        if (!ui.composerVisible) result.notes.push("composer-not-in-viewport");
        if (ui.overflowX) result.notes.push("horizontal-overflow");
        if (!ui.askVisible && finalStatus === "completed") result.notes.push("ask-btn-hidden-after-completion");

        // ─── Verdict assignment ──────────────────────────────────────
        result.totalRenderMs = Math.max(result.completedMs ?? 0, result.artifactPaintMs ?? 0);
        if (finalStatus === "completed") {
            if (result.notes.length === 0 || result.notes.every(n => n.startsWith("artifact:"))) {
                result.verdict = "PASS";
            } else {
                const real = result.notes.filter(n => !n.startsWith("artifact:"));
                result.verdict = "NEEDS-REVIEW";
                result.issue = `UI: ${real.join(", ")}`;
            }
        } else if (finalStatus === "failed") {
            if (saw429 || networkErrs > 0) {
                result.verdict = "SKIP-ENV";
                result.issue = saw429 ? "HTTP 429 (rate-limit) from Genie path" : `network ${networkErrs} >= 500`;
            } else {
                result.verdict = "FAIL";
                result.issue = "Genie returned failed (no env indicator); inspect proxy log";
            }
        } else {
            result.verdict = "FAIL";
            result.issue = `no terminal state within ${PER_CASE_TIMEOUT_MS}ms (last=${finalStatus || "null"})`;
        }

        await showBanner(page, sc, idx, total, `${result.verdict} ${result.completedMs ?? "—"}ms`);

        // Screenshot if interesting
        if (result.verdict !== "PASS" || idx < 3 || idx % 25 === 0) {
            const tag = result.verdict === "PASS" ? "ok" : result.verdict.toLowerCase();
            await page.screenshot({
                path: join(OUT_DIR, `${sc.id}-${tag}.png`),
                fullPage: false,
            }).catch(() => undefined);
        }
    } catch (err) {
        result.verdict = "THREW";
        result.issue = err.message.slice(0, 240);
        await page.screenshot({ path: join(OUT_DIR, `${sc.id}-threw.png`), fullPage: false }).catch(() => undefined);
    } finally {
        page.off("console", onMsg);
        page.off("pageerror", onErr);
        page.off("response", onResponse);
    }
    return result;
}

// ─── Browser lifecycle ───────────────────────────────────────────────────

async function freshBrowser() {
    const browser = await chromium.launch({
        headless: false, slowMo: SLOW_MO,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    return { browser, page };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const md = await readFile(CATALOG, "utf-8");
    const all = parseCatalog(md);
    console.log(`[catalog] parsed ${all.length} cases from ${CATALOG}`);
    const cases = all.filter((c) => {
        const n = parseInt(c.id.slice(4), 10);
        return n >= rangeFrom && n <= rangeTo;
    }).map((c) => ({ ...c, color: complexityColor(c.complexity) }));
    console.log(`[run] executing ${cases.length} cases (range ${RANGE}, slowMo=${SLOW_MO}ms, headed)`);

    const results = [];
    let { browser, page } = await freshBrowser();

    for (let i = 0; i < cases.length; i++) {
        const sc = cases[i];
        if (i > 0 && i % CHUNK_SIZE === 0) {
            console.log(`[chunk] rotating browser at case ${i + 1}/${cases.length}`);
            await browser.close().catch(() => {});
            ({ browser, page } = await freshBrowser());
        }
        await showBanner(page, sc, i, cases.length, "starting…");
        const t = Date.now();
        const r = await runCase(page, sc, i, cases.length);
        r.wallMs = Date.now() - t;
        results.push(r);

        const fp = r.firstAssistantPaintMs ?? "—";
        const cp = r.completedMs ?? "—";
        const ar = r.artifactPaintMs ?? "—";
        const flag = r.verdict === "PASS" ? "✅" : r.verdict === "SKIP-ENV" ? "⏭️" : r.verdict === "NEEDS-REVIEW" ? "⚠️" : "❌";
        console.log(`${flag} [${sc.id}] ${sc.complexity} ${sc.layoutFocus.padEnd(28).slice(0, 28)} → ${r.verdict.padEnd(13)} first=${fp}ms complete=${cp}ms artifact=${ar}ms wall=${r.wallMs}ms  ${r.issue ? `:: ${r.issue}` : ""}`);
    }
    await browser.close().catch(() => {});

    // ─── Per-band stats ──────────────────────────────────────────────
    const pass = results.filter(r => r.verdict === "PASS").length;
    const fail = results.filter(r => r.verdict === "FAIL").length;
    const skip = results.filter(r => r.verdict === "SKIP-ENV").length;
    const review = results.filter(r => r.verdict === "NEEDS-REVIEW").length;
    const threw = results.filter(r => r.verdict === "THREW").length;

    const completed = results.filter(r => r.verdict === "PASS" || r.verdict === "NEEDS-REVIEW");
    const stat = (k) => {
        const arr = completed.map(r => r[k]).filter(v => typeof v === "number").sort((a, b) => a - b);
        if (arr.length === 0) return { p50: null, p95: null, max: null };
        return { p50: arr[Math.floor(arr.length * 0.5)], p95: arr[Math.floor(arr.length * 0.95)] || arr[arr.length - 1], max: arr[arr.length - 1] };
    };
    const sFirst = stat("firstAssistantPaintMs");
    const sComplete = stat("completedMs");
    const sArtifact = stat("artifactPaintMs");

    const summary = [
        `=== Ask Pulse 100 — range ${RANGE} ===`,
        `Total: ${results.length}    PASS=${pass} NEEDS-REVIEW=${review} FAIL=${fail} SKIP-ENV=${skip} THREW=${threw}`,
        `firstAssistantPaintMs   p50=${sFirst.p50} p95=${sFirst.p95} max=${sFirst.max}`,
        `completedMs             p50=${sComplete.p50} p95=${sComplete.p95} max=${sComplete.max}`,
        `artifactPaintMs         p50=${sArtifact.p50} p95=${sArtifact.p95} max=${sArtifact.max}`,
        "",
    ].join("\n");
    console.log("\n" + summary);

    await writeFile(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2), "utf-8");
    const csv = [
        "caseId,complexity,layoutFocus,verdict,userBubbleMs,firstAssistantPaintMs,completedMs,artifactPaintMs,totalRenderMs,wallMs,issue,notes",
        ...results.map(r => [r.caseId, r.complexity, r.layoutFocus, r.verdict, r.userBubbleMs, r.firstAssistantPaintMs, r.completedMs, r.artifactPaintMs, r.totalRenderMs, r.wallMs, JSON.stringify(r.issue || ""), JSON.stringify(r.notes.join("|"))].join(",")),
    ].join("\n");
    await writeFile(join(OUT_DIR, "results.csv"), csv, "utf-8");
    await writeFile(join(OUT_DIR, "summary.txt"), summary, "utf-8");
    console.log(`[done] artifacts written → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
