#!/usr/bin/env node
// playground/scripts/verify-tab-uniformity.mjs
//
// Side-by-side screenshot of all 3 tabs at the SAME viewport so the
// uniformity gaps are visible at a glance. Also re-enumerates the
// per-tab toolbar affordances and computes a uniformity verdict per
// cross-cutting verb.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), ".uniformity-out");
const BASE = process.env.PULSEPLAY_BASE || "http://127.0.0.1:7001";
const PROFILE = process.env.PULSEPLAY_PROFILE || "default";

const log = [];
const record = (line) => { log.push(line); console.log(line); };

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    record(`[boot] HEADED Chromium @ slowMo=250ms — uniformity probe`);
    const browser = await chromium.launch({
        headless: false, slowMo: 250,
        args: ["--window-position=80,80", "--window-size=1500,1050"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => record(`[pageerror] ${err.message}`));

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        const k = "pulseplay:visual-settings:genieSettings";
        const existing = JSON.parse(window.localStorage.getItem(k) || "{}");
        existing.assistantProfile = profile;
        window.localStorage.setItem(k, JSON.stringify(existing));
        window.localStorage.setItem("pulseplay:tab-visibility", JSON.stringify({ aiInsights: true, askPulse: true, dashboard: true }));
        window.localStorage.removeItem("pulseplay:ui-mode");
    }, PROFILE);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);

    const tabs = [
        { id: "ai-insights", click: "#gn-tab-insights", label: "AI Insights" },
        { id: "ask-pulse",   click: "#gn-tab-chat",     label: "Ask Pulse" },
        { id: "dashboard",   click: "#gn-tab-dashboard",label: "Dashboard" },
    ];

    const findings = [];

    for (const t of tabs) {
        record(`\n══ ${t.id} — ${t.label} ══`);
        await page.locator(t.click).click().catch(() => {});
        await page.waitForTimeout(800);

        const obs = await page.evaluate(() => {
            const headerBtns = Array.from(document.querySelectorAll("button"))
                .filter(b => {
                    const r = b.getBoundingClientRect();
                    return r.top < 220 && r.width > 0 && r.height > 0;
                })
                .map(b => ({
                    label: b.getAttribute("aria-label") || b.getAttribute("title") || (b.textContent || "").trim().slice(0, 50),
                }));
            // Empty-state quality heuristic.
            const main = document.querySelector('main') || document.body;
            const txt = (main.textContent || "").toLowerCase();
            return {
                headerBtns,
                emptyStateHasIcon:     !!document.querySelector('svg[class*="icon"], svg[width="14"], svg[width="16"]'),
                hasConnectCTA:         /connect (ai|bi|knowledge)/i.test(txt),
                hasBrowseCTA:          /browse (knowledge|packs)/i.test(txt),
                hasCrossTabReference:  /ask pulse a question/i.test(txt) && document.querySelector("#gn-tab-chat") === null
                                       || /ask pulse a question/i.test(txt),
                bodyTextSample:        txt.slice(0, 200),
            };
        });
        record(`[${t.id}] header buttons (${obs.headerBtns.length}):`);
        for (const b of obs.headerBtns) record(`     • ${b.label}`);
        record(`[${t.id}] empty-state has Connect CTA: ${obs.hasConnectCTA}`);
        record(`[${t.id}] empty-state has Browse CTA:  ${obs.hasBrowseCTA}`);
        record(`[${t.id}] orphan "Ask Pulse a question" copy in body: ${obs.hasCrossTabReference}`);
        await page.screenshot({ path: join(OUT_DIR, `${t.id}.png`), fullPage: false });
        findings.push({ id: t.id, label: t.label, ...obs });
    }

    // Uniformity verdict.
    record(`\n══════ UNIFORMITY VERDICT ══════`);
    const verbs = ["Maximize", "Minimize", "Pop out", "Pin", "Show all", "Show both", "Open ", "Show history"];
    for (const v of verbs) {
        const hits = findings.map(f => ({
            label: f.label,
            has: f.headerBtns.some(b => b.label.toLowerCase().includes(v.toLowerCase())),
        }));
        const allHave = hits.every(h => h.has);
        const someHave = hits.some(h => h.has);
        const verdict = allHave ? "✅ on all 3" : someHave ? "⚠️ MIXED" : "—";
        record(`"${v}": ${hits.map(h => `${h.label}=${h.has?"Y":"N"}`).join("  ")}  → ${verdict}`);
    }

    record(`\n══════ NAMING PATTERN CHECK ══════`);
    record(`Today's labels use PANE names ("AI panel", "BI panel") not TAB names.`);
    record(`Per the 2026-05-25 directive, the correct pattern is "Maximize {tab name}".`);
    record(`Detected occurrences of pane-name patterns:`);
    for (const f of findings) {
        const panePatterns = f.headerBtns
            .filter(b => /AI panel|BI panel/.test(b.label))
            .map(b => b.label);
        record(`  ${f.label}: ${panePatterns.length} pane-name labels — ${JSON.stringify(panePatterns)}`);
    }

    record(`\n══════ EMPTY-STATE QUALITY CHECK ══════`);
    record(`AI Insights polish target: icon + headline + bullets + Connect CTA + Browse CTA`);
    for (const f of findings) {
        record(`  ${f.label}: connect=${f.hasConnectCTA} browse=${f.hasBrowseCTA} orphan-copy=${f.hasCrossTabReference}`);
        record(`    body sample: "${f.bodyTextSample.slice(0, 140)}…"`);
    }

    record(`\n[done] watch your screen — closing in 4 seconds`);
    await page.waitForTimeout(4000);
    await writeFile(join(OUT_DIR, "uniformity.log"), log.join("\n"), "utf-8");
    await writeFile(join(OUT_DIR, "findings.json"), JSON.stringify(findings, null, 2), "utf-8");
    await browser.close();
}

main().catch(async (err) => {
    console.error("[FAIL]", err);
    process.exitCode = 1;
});
