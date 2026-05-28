// Find why the composer is missing/off-screen during a chat in progress.
// Inject a synthetic progress card + suggestions and probe the
// chat-panel / chat-area / composer rects.
import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";

async function main() {
    const browser = await chromium.launch({ headless: false, slowMo: 150 });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
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

    // Submit a real question to get a real in-flight state
    const composer = page.locator("textarea.gn-input").first();
    await composer.fill("Top 3 categories by sales");
    const sendBtn = page.locator("button.gn-send").first();
    await sendBtn.click();
    await page.waitForTimeout(2000);

    const probe = await page.evaluate(() => {
        const panel = document.querySelector(".gn-chat-panel");
        const area = document.querySelector(".gn-chat-area, .gn-chat-log");
        const progress = document.querySelector(".gn-chat-progress");
        const suggestions = document.querySelector(".gn-suggestions");
        const compose = document.querySelector(".gn-compose");
        const composerInput = document.querySelector("textarea.gn-input");
        const sendBtn = document.querySelector("button.gn-send");
        const rect = (el) => el ? { top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom), height: Math.round(el.getBoundingClientRect().height) } : null;
        return {
            viewportH: window.innerHeight,
            chatPanel: rect(panel),
            chatArea: rect(area),
            progressCard: rect(progress),
            suggestions: rect(suggestions),
            compose: rect(compose),
            composerInput: rect(composerInput),
            sendBtn: rect(sendBtn),
            chatAreaScroll: area ? { scrollH: area.scrollHeight, clientH: area.clientHeight, scrollTop: area.scrollTop } : null,
        };
    });
    console.log(JSON.stringify(probe, null, 2));

    await page.screenshot({ path: "d:/Working_Folder/Projects/PulsePlay/docs/evidence/ui-snapshot-2026-05-26/composer-missing-probe.png", fullPage: false });
    await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
