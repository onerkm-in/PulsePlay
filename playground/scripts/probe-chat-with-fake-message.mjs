// Verify the compact-mode blank-space fix by injecting a synthetic
// chat message and confirming it renders at the TOP of the chat-area
// (not pushed down by the empty WelcomeSection wrapper).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/ui-snapshot-2026-05-26";
const BASE = "http://127.0.0.1:7001";

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        window.localStorage.clear();
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default"; ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const ask = page.locator('button').filter({ hasText: /^Ask Pulse$/ }).first();
    if (await ask.count() > 0) { await ask.click(); await page.waitForTimeout(900); }

    // Inject a synthetic message into the chat area, then probe positions.
    await page.evaluate(() => {
        const log = document.querySelector(".gn-chat-area, .gn-chat-log");
        if (!log) return;
        const wrap = document.createElement("div");
        wrap.className = "gn-msg gn-msg--user";
        wrap.innerHTML = '<div class="gn-bubble" style="background:linear-gradient(135deg,#1a6fd4,#1260b8);color:#fff;padding:10px 16px;border-radius:18px 18px 4px 18px;max-width:min(75%,680px);">Synthetic user question — testing that messages start at the top of the chat-area instead of being pushed to the bottom by an empty welcome wrapper.</div>';
        log.appendChild(wrap);
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "compact-blank-space-fix.png"), fullPage: false });

    const probe = await page.evaluate(() => {
        const welcome = document.querySelector(".gn-welcome");
        const msg = document.querySelector(".gn-msg");
        const log = document.querySelector(".gn-chat-area, .gn-chat-log");
        return {
            welcomeHeight: welcome ? Math.round(welcome.getBoundingClientRect().height) : null,
            welcomeIsCompact: welcome ? welcome.classList.contains("gn-welcome--compact") : null,
            firstMessageTop: msg ? Math.round(msg.getBoundingClientRect().top) : null,
            logTop: log ? Math.round(log.getBoundingClientRect().top) : null,
            logHeight: log ? Math.round(log.getBoundingClientRect().height) : null,
        };
    });
    console.log(JSON.stringify(probe, null, 2));
    await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
