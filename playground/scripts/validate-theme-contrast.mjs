#!/usr/bin/env node
// Font visibility audit: for every theme preset × {light, dark}, measure WCAG
// text-contrast on every visible text element across the shell, and flag any
// that fall below the AA threshold (4.5 normal, 3.0 large). Catches the
// "dark preset selected with the dark toggle OFF" hazard (light-mode token set
// → light text on light surfaces) and any other low-contrast text.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO = "d:/Working_Folder/Projects/PulsePlay";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(REPO, `docs/evidence/theme-contrast/${RUN_ID}`);
const BASE = "http://127.0.0.1:7001";
const PROFILE = "default";
const PRESETS = ["default", "corporate-blue", "forest", "slate-dark", "high-contrast", "custom"];

async function setTheme(page, themeName, darkMode) {
    await page.evaluate(({ themeName, darkMode }) => {
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.themeName = themeName; ex.darkMode = darkMode;
        window.localStorage.setItem(k, JSON.stringify(ex));
        window.dispatchEvent(new CustomEvent("pulseplay:visual-settings-change"));
    }, { themeName, darkMode });
    await page.waitForTimeout(700);
}

// Runs in the page: compute WCAG contrast for every visible text element.
const auditFn = () => {
    const parseRGB = (s) => {
        const m = (s || "").match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map(x => parseFloat(x.trim()));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => { // composite fg(with alpha) over bg(opaque)
        const a = fg.a;
        return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
    };
    const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); };
    const pageDark = document.documentElement.dataset.ppTheme === "dark";
    const pageBase = pageDark ? { r: 13, g: 17, b: 23, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    // Returns the effective opaque background, or null if a gradient/image
    // background is encountered (can't measure contrast reliably — skip).
    const effBg = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
            const cs = getComputedStyle(node);
            if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // gradient/image
            const bg = parseRGB(cs.backgroundColor);
            if (bg && bg.a >= 0.5) return bg.a < 1 ? over(bg, pageBase) : bg;
            node = node.parentElement;
        }
        return pageBase;
    };
    const fails = [];
    let checked = 0;
    const els = document.querySelectorAll("button, a, span, p, h1, h2, h3, h4, label, td, th, li, div");
    for (const el of els) {
        // direct text only
        const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
        if (!direct || direct.length < 2) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") continue;
        const fg0 = parseRGB(cs.color);
        if (!fg0) continue;
        const bg = effBg(el);
        if (!bg) continue; // gradient/image background — can't measure
        const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
        const cr = ratio(fg, bg);
        const size = parseFloat(cs.fontSize);
        const bold = (parseInt(cs.fontWeight) || 400) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const threshold = large ? 3.0 : 4.5;
        checked++;
        if (cr < threshold) {
            fails.push({ text: direct.slice(0, 40), ratio: Math.round(cr * 100) / 100, size, threshold, fg: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
        }
    }
    fails.sort((a, b) => a.ratio - b.ratio);
    return { checked, failCount: fails.length, worst: fails.slice(0, 6) };
};

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 120, args: ["--window-position=60,40", "--window-size=1560,1080"] });
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 920 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate((profile) => {
        window.localStorage.setItem("pulseplay:active-ai-profile", profile);
        window.localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = profile; ex.connectionMode = "proxy"; ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    }, PROFILE);

    const report = [];
    for (const theme of PRESETS) {
        for (const dark of [false, true]) {
            await setTheme(page, theme, dark);
            await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
            await page.waitForTimeout(1600);
            const res = await page.evaluate(auditFn);
            const tag = `${theme}-${dark ? "dark" : "light"}`;
            report.push({ tag, ...res });
            const flag = res.failCount > 0 ? `  ⚠ ${res.failCount} LOW-CONTRAST` : "  ok";
            console.log(`${tag.padEnd(24)} checked=${String(res.checked).padStart(3)}${flag}`);
            if (res.failCount > 0) {
                for (const f of res.worst) console.log(`     ${String(f.ratio).padStart(5)}:1  "${f.text}"  ${f.fg} on ${f.bg} (${f.size}px, need ${f.threshold})`);
            }
            await page.screenshot({ path: join(OUT_DIR, `${tag}.png`) }).catch(() => {});
        }
    }
    await writeFile(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
    const totalFails = report.reduce((s, r) => s + r.failCount, 0);
    console.log(`\nVERDICT: ${totalFails === 0 ? "PASS — all text meets AA" : `FAIL — ${totalFails} low-contrast text instances across ${report.filter(r => r.failCount).length} theme combos`}`);
    console.log(`[done] → ${OUT_DIR}`);
    await ctx.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
}
main().catch(e => { console.error("[FAIL]", e); process.exitCode = 1; });
