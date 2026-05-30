#!/usr/bin/env node
// Watchable check: after scrolling UP to read a previous answer, asking a new
// question must pull the conversation back to the bottom (the new question +
// incoming answer), not leave the user stranded in history.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/chat-autoscroll/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

async function banner(page, text, color = "#06b6d4") {
    await page.evaluate(({ text, color }) => {
        let b = document.getElementById("__wt__");
        if (!b) { b = document.createElement("div"); b.id = "__wt__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", right: "8px", zIndex: "99999", padding: "10px 14px", background: "rgba(15,23,42,0.95)", color: "#fff", font: "14px ui-monospace, monospace", borderRadius: "6px", pointerEvents: "none", borderLeft: `5px solid ${color}` });
        b.textContent = text;
    }, { text, color });
}
const SCROLLER = ".gn-chat-log, .gn-chat-area";

async function ask(page, q) {
    await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill(q);
    await page.waitForTimeout(300);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
}
async function waitDone(page, t = 120_000) {
    const dl = Date.now() + t;
    while (Date.now() < dl) {
        const busy = await page.evaluate(() => {
            const m = document.querySelectorAll(".gn-msg--assistant");
            const last = m[m.length - 1];
            return last ? !!last.querySelector(".gn-chat-progress, .gn-progress-active") : true;
        });
        if (!busy) return true;
        await page.waitForTimeout(400);
    }
    return false;
}
async function scrollMetrics(page) {
    return page.evaluate((sel) => {
        const n = document.querySelector(sel.split(",")[0].trim()) || document.querySelector(sel.split(",")[1].trim());
        if (!n) return null;
        return { scrollTop: Math.round(n.scrollTop), scrollHeight: n.scrollHeight, clientHeight: n.clientHeight, distFromBottom: Math.round(n.scrollHeight - (n.scrollTop + n.clientHeight)) };
    }, SCROLLER);
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 300, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 900 } });
    const page = await ctx.newPage();

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { window.localStorage.clear(); } catch { /* */ }
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        window.localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2000);

    let verdict = "FAIL";
    try {
        await banner(page, "Auto-scroll · asking Q1…", "#06b6d4");
        await ask(page, "What is the total sales by region?");
        await waitDone(page);
        await page.waitForTimeout(1500);

        // Scroll UP to the top to simulate reading the previous answer.
        await banner(page, "Auto-scroll · scrolled UP to read history (top of conversation)…", "#f59e0b");
        await page.evaluate((sel) => {
            const n = document.querySelector(sel.split(",")[0].trim()) || document.querySelector(sel.split(",")[1].trim());
            if (n) n.scrollTo({ top: 0 });
        }, SCROLLER);
        await page.waitForTimeout(1500);
        const before = await scrollMetrics(page);
        console.log("after scroll-up:", JSON.stringify(before));
        await page.screenshot({ path: join(OUT_DIR, "01-scrolled-up.png") }).catch(() => {});

        // Now ask Q2 — the view should jump down to it.
        await banner(page, "Auto-scroll · asking Q2 — view should snap DOWN to the new question", "#06b6d4");
        await ask(page, "Top 5 customers by total sales");
        await page.waitForTimeout(1800); // let the smooth scroll land
        const afterSubmit = await scrollMetrics(page);
        console.log("after submit Q2:", JSON.stringify(afterSubmit));
        await page.screenshot({ path: join(OUT_DIR, "02-after-submit.png") }).catch(() => {});

        // PASS if we moved meaningfully down from the top after submitting.
        const movedDown = before && afterSubmit && (afterSubmit.scrollTop > before.scrollTop + 200);
        await waitDone(page);
        await page.waitForTimeout(1500);
        const afterAnswer = await scrollMetrics(page);
        console.log("after Q2 answer:", JSON.stringify(afterAnswer));
        await page.screenshot({ path: join(OUT_DIR, "03-after-answer.png") }).catch(() => {});

        verdict = movedDown ? "PASS" : "FAIL";
        await banner(page, `Auto-scroll ${verdict} · onSubmit scrollTop ${before?.scrollTop} → ${afterSubmit?.scrollTop}`, verdict === "PASS" ? "#10b981" : "#ef4444");
        await page.waitForTimeout(2500);
        console.log(`\nVERDICT: ${verdict} (scrollTop ${before?.scrollTop} → ${afterSubmit?.scrollTop} on submit)`);
    } finally {
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
    }
    console.log(`[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
