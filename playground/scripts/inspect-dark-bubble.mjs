#!/usr/bin/env node
// Inspect why the assistant answer bubble is WHITE in dark mode. Uses the
// instant powerbi-dwd (DAX) profile so we don't wait on Genie. Reports, for the
// answer bubble + its ancestors, the computed bg, whether it's inside
// .gn-shell--dark, and how --gn-surface-raised / --gn-surface resolve.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";

async function main() {
    const browser = await chromium.launch({ headless: false, args: ["--window-position=60,40", "--window-size=1500,1000"] });
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
    // wait for an assistant bubble with content
    const dl = Date.now() + 40_000;
    while (Date.now() < dl) { const ok = await page.evaluate(() => { const m = document.querySelectorAll(".gn-msg--assistant .gn-bubble"); const l = m[m.length - 1]; return l && (l.textContent || "").length > 30 && !l.querySelector(".gn-chat-progress, .gn-progress-active"); }); if (ok) break; await page.waitForTimeout(400); }
    await page.waitForTimeout(800);

    const report = await page.evaluate(() => {
        const bubble = (() => { const m = document.querySelectorAll(".gn-msg--assistant .gn-bubble"); return m[m.length - 1]; })();
        if (!bubble) return { err: "no bubble" };
        const out = { ppTheme: document.documentElement.dataset.ppTheme, rootHasShellDark: !!document.querySelector(".gn-shell--dark"), bubbleInDarkShell: !!bubble.closest(".gn-shell--dark"), chain: [] };
        let el = bubble; let depth = 0;
        while (el && el !== document.documentElement && depth < 10) {
            const cs = getComputedStyle(el);
            out.chain.push({ depth, tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 60), bg: cs.backgroundColor, surfaceRaised: cs.getPropertyValue("--gn-surface-raised").trim(), surface: cs.getPropertyValue("--gn-surface").trim(), color: cs.color });
            el = el.parentElement; depth++;
        }
        // also what shell element carries the dark class
        const shell = document.querySelector(".gn-shell");
        out.shellClass = shell ? (shell.className || "").toString().slice(0, 80) : "(no .gn-shell)";
        return out;
    });
    console.log("ppTheme:", report.ppTheme, "| anyShellDark:", report.rootHasShellDark, "| bubbleInDarkShell:", report.bubbleInDarkShell);
    console.log("shell class:", report.shellClass);
    console.log("bubble→ancestors:");
    for (const n of report.chain) console.log(`  [${n.depth}] bg=${n.bg.padEnd(22)} --gn-surface-raised=${(n.surfaceRaised || "·").padEnd(20)} --gn-surface=${(n.surface || "·").padEnd(20)} ${n.tag}.${n.cls}`);
    await import("node:fs/promises").then(fs => fs.mkdir("d:/Working_Folder/Projects/PulsePlay/docs/evidence/dark-fix", { recursive: true }));
    await page.screenshot({ path: "d:/Working_Folder/Projects/PulsePlay/docs/evidence/dark-fix/after.png" }).catch(() => {});
    await page.waitForTimeout(1500);
    await browser.close();
}
main().catch(e => { console.error("[FAIL]", e); process.exit(1); });
