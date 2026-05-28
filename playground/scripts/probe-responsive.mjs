// Multi-resolution responsive probe for Ask Pulse end-user UI.
// Loads default state on each viewport size, switches to Ask Pulse tab,
// captures DOM probe (overflow, composer visible, tab strip wraps,
// chat-log height, send button visible). Screenshots for visual review.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/responsive-2026-05-26";
const BASE = "http://127.0.0.1:7001";

const VIEWPORTS = [
    { name: "mobile-portrait-375x667",   width: 375,  height: 667  },
    { name: "mobile-portrait-412x900",   width: 412,  height: 900  },
    { name: "mobile-landscape-667x375",  width: 667,  height: 375  },
    { name: "tablet-portrait-768x1024",  width: 768,  height: 1024 },
    { name: "tablet-landscape-1024x768", width: 1024, height: 768  },
    { name: "laptop-1366x768",           width: 1366, height: 768  },
    { name: "laptop-1440x900",           width: 1440, height: 900  },
    { name: "desktop-1920x1080",         width: 1920, height: 1080 },
    { name: "ultrawide-2560x1080",       width: 2560, height: 1080 },
    { name: "ultrawide-3440x1440",       width: 3440, height: 1440 },
];

async function probeOne(page, viewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => {
        window.localStorage.clear();
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default"; ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.reload({ waitUntil: "networkidle", timeout: 25_000 });
    await page.waitForTimeout(1200);

    // ── 1. Home (AI Insights default) ─────────────────
    await page.screenshot({ path: join(OUT, `${viewport.name}-1-home.png`), fullPage: false });

    // ── 2. Click Ask Pulse ─────────────────────────────
    const askTab = page.locator('button').filter({ hasText: /^Ask Pulse$/ }).first();
    if (await askTab.count() > 0) { await askTab.click().catch(() => {}); await page.waitForTimeout(700); }
    await page.screenshot({ path: join(OUT, `${viewport.name}-2-ask-pulse.png`), fullPage: false });

    // ── 3. DOM probe ───────────────────────────────────
    const probe = await page.evaluate((vw) => {
        const composer = document.querySelector("textarea.gn-input");
        const send = document.querySelector("button.gn-send");
        const tabs = Array.from(document.querySelectorAll("button")).filter(b => /^(AI Insights|Ask Pulse|Dashboard)$/i.test((b.textContent || "").trim()));
        const tabsRect = tabs.length > 0 ? tabs.map(t => t.getBoundingClientRect()) : [];
        const tabsWrap = tabsRect.length > 1 && tabsRect.some((r, i) => i > 0 && r.top !== tabsRect[0].top);
        const log = document.querySelector(".gn-chat-area, .gn-chat-log");
        const composerRect = composer ? composer.getBoundingClientRect() : null;
        const sendRect = send ? send.getBoundingClientRect() : null;
        const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const overflowY = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const tabStripLeftmost = tabsRect.length > 0 ? Math.min(...tabsRect.map(r => r.left)) : null;
        const tabStripRightmost = tabsRect.length > 0 ? Math.max(...tabsRect.map(r => r.right)) : null;
        return {
            viewport: vw,
            composerVisible: composerRect ? (composerRect.bottom > 0 && composerRect.top < window.innerHeight && composerRect.width > 50) : false,
            composerWidth: composerRect ? Math.round(composerRect.width) : null,
            composerY: composerRect ? Math.round(composerRect.top) : null,
            sendVisible: sendRect ? (sendRect.bottom > 0 && sendRect.top < window.innerHeight && sendRect.width > 10) : false,
            sendX: sendRect ? Math.round(sendRect.left) : null,
            tabsCount: tabs.length,
            tabsWrap,
            tabStripLeftmost: tabStripLeftmost !== null ? Math.round(tabStripLeftmost) : null,
            tabStripRightmost: tabStripRightmost !== null ? Math.round(tabStripRightmost) : null,
            logVisible: log ? log.getBoundingClientRect().height > 50 : false,
            logHeight: log ? Math.round(log.getBoundingClientRect().height) : null,
            overflowX,
            overflowY,
        };
    }, viewport);
    return probe;
}

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 80 });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const results = [];
    for (const vp of VIEWPORTS) {
        console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===`);
        try {
            const r = await probeOne(page, vp);
            results.push(r);
            const flags = [];
            if (r.overflowX > 2) flags.push(`H-OVERFLOW ${r.overflowX}px`);
            if (!r.composerVisible) flags.push("COMPOSER-HIDDEN");
            if (!r.sendVisible) flags.push("SEND-HIDDEN");
            if (r.tabsWrap) flags.push("TABS-WRAPPED");
            if (r.tabsCount !== 3) flags.push(`TABS=${r.tabsCount}`);
            if (!r.logVisible) flags.push("LOG-HIDDEN");
            console.log(`  composer=${r.composerVisible} (${r.composerWidth}px @y${r.composerY}) | send=${r.sendVisible} | tabs=${r.tabsCount} ${r.tabsWrap ? "WRAPPED" : "OK"} | log=${r.logHeight}px | overflowX=${r.overflowX} | ${flags.length ? "⚠️ " + flags.join(", ") : "✅ clean"}`);
        } catch (err) {
            results.push({ viewport: vp, error: err.message.slice(0, 200) });
            console.log(`  💥 ${err.message.slice(0, 200)}`);
        }
    }
    await writeFile(join(OUT, "results.json"), JSON.stringify(results, null, 2));
    await browser.close();
    console.log(`\n[done] ${VIEWPORTS.length} viewports tested → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
