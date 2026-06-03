#!/usr/bin/env node
// Pinpoint the dark-mode narrative font visibility bug. Loads in dark mode,
// gets an Ask Pulse answer + the AI Insights briefing, and reports the computed
// text color / background / contrast of every narrative text node — flags any
// transparent-fill or low-contrast text.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/dark-narrative/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";

const sample = (sel) => `(${(() => {
    const parseRGB = (s) => { const m = (s || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); };
    const effBg = (el) => { let n = el; while (n && n !== document.documentElement) { const bg = parseRGB(getComputedStyle(n).backgroundColor); if (bg && bg.a >= 0.5) return bg; n = n.parentElement; } return { r: 13, g: 17, b: 23, a: 1 }; };
    const out = [];
    document.querySelectorAll(SEL).forEach(el => {
        const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
        if (!direct || direct.length < 3) return;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
        const fg = parseRGB(cs.color); const tfc = cs.webkitTextFillColor; const bg = effBg(el);
        const transparent = tfc === "rgba(0, 0, 0, 0)" || tfc === "transparent" || (fg && fg.a === 0);
        const cr = fg ? Math.round(ratio(fg, bg) * 100) / 100 : 0;
        out.push({ text: direct.slice(0, 36), color: cs.color, fill: tfc, transparent, ratio: cr, cls: (el.className || "").toString().slice(0, 50) });
    });
    return JSON.stringify(out.slice(0, 12));
}).toString().replace("SEL", JSON.stringify(sel))})()`;

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 150, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 940 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:active-ai-profile", profile);
        localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api"; ex.darkMode = true;
        localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);

    // Ask a question → narrative answer
    await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("Which region has the highest sales and why does it matter?");
    await page.waitForTimeout(200);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
    const dl = Date.now() + 120_000;
    while (Date.now() < dl) { const busy = await page.evaluate(() => { const m = document.querySelectorAll(".gn-msg--assistant"); const l = m[m.length - 1]; return l ? !!l.querySelector(".gn-chat-progress, .gn-progress-active") : true; }); if (!busy) break; await page.waitForTimeout(400); }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT_DIR, "01-chat-dark.png") }).catch(() => {});

    for (const [label, sel] of [
        ["chat .gn-msg-body", ".gn-msg-body, .gn-msg-body *"],
        ["chat narrative md", ".gn-msg--assistant p, .gn-msg--assistant li, .gn-msg--assistant span, .pp-md, .pp-md *"],
        ["answer narrative section", ".gn-answer-section--narrative *, .gn-narrative, .gn-narrative *"],
    ]) {
        const res = await page.evaluate(new Function("return " + sample(sel))());
        console.log(`\n[${label}]`);
        for (const r of JSON.parse(res)) console.log(`  ratio=${String(r.ratio).padStart(5)} ${r.transparent ? "TRANSPARENT-FILL " : ""}color=${r.color} fill=${r.fill} "${r.text}" .${r.cls}`);
    }
    await page.waitForTimeout(2000);
    await ctx.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    console.log(`\n[done] → ${OUT_DIR}`);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
