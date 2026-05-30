#!/usr/bin/env node
// List every visible element with a near-WHITE background in dark mode (the
// "white blaze"), with class + size, so we can pinpoint the un-themed surfaces.
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
        localStorage.setItem("pulseplay:active-surface", "ask-pulse");
        localStorage.setItem("pulseplay:default-landing-surface", "ask-pulse");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = "powerbi-dwd"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api"; ex.darkMode = true;
        localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(2500);
    await page.locator("textarea.gn-input, textarea.pp-ai-sidebar__input").first().fill("Total sales by region");
    await page.waitForTimeout(200);
    await page.locator("button.gn-send, button.pp-ai-sidebar__ask").first().click();
    const dl = Date.now() + 40_000;
    while (Date.now() < dl) { const ok = await page.evaluate(() => { const m = document.querySelectorAll(".gn-msg--assistant .gn-bubble"); const l = m[m.length - 1]; return l && (l.textContent || "").length > 30; }); if (ok) break; await page.waitForTimeout(400); }
    await page.waitForTimeout(1000);

    const whites = await page.evaluate(() => {
        const parse = s => { const m = (s || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
        const out = [];
        document.querySelectorAll("*").forEach(el => {
            const cs = getComputedStyle(el);
            const bg = parse(cs.backgroundColor);
            const img = cs.backgroundImage || "";
            const solidWhite = bg && bg.a >= 0.5 && bg.r >= 235 && bg.g >= 235 && bg.b >= 235;
            // gradients expose white via backgroundImage, not backgroundColor
            const gradWhite = /rgba?\(\s*2(?:3[5-9]|[4-5]\d)\s*,\s*2(?:3[5-9]|[4-5]\d)\s*,\s*2(?:3[5-9]|[4-5]\d)/.test(img) || /#f{3,6}|#f8fafc|#fafafa|255,\s*255,\s*255/.test(img);
            if (!solidWhite && !gradWhite) return;
            const r = el.getBoundingClientRect();
            if (r.width < 40 || r.height < 20) return; // skip tiny
            out.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 64), w: Math.round(r.width), h: Math.round(r.height), bg: solidWhite ? cs.backgroundColor : "grad:" + img.slice(0, 40) });
        });
        // dedupe by class, keep largest
        const seen = new Map();
        for (const o of out) { const key = o.tag + "." + o.cls; if (!seen.has(key) || seen.get(key).w * seen.get(key).h < o.w * o.h) seen.set(key, o); }
        return [...seen.values()].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 20);
    });
    console.log(`white/near-white surfaces in dark mode (${whites.length}):`);
    for (const w of whites) console.log(`  ${String(w.w).padStart(4)}x${String(w.h).padStart(4)}  ${w.bg.padEnd(20)} ${w.tag}.${w.cls}`);
    await browser.close();
}
main().catch(e => { console.error("[FAIL]", e); process.exit(1); });
