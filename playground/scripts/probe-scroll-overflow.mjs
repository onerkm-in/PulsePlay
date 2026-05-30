// Reproduce the user's "no scroll bar" with an expanded Databricks
// Genie Trace disclosure, then walk the parent chain to find which
// container is overflowing its viewport-constrained ancestor.
import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";

async function main() {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
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
    await page.waitForTimeout(1200);
    const ask = page.locator('button').filter({ hasText: /^Ask Pulse$/ }).first();
    if (await ask.count() > 0) { await ask.click(); await page.waitForTimeout(800); }

    // Inject tall content into chat-area to force overflow
    await page.evaluate(() => {
        const log = document.querySelector(".gn-chat-area, .gn-chat-log");
        if (!log) return;
        // Big enough to definitely overflow
        for (let i = 0; i < 30; i++) {
            const d = document.createElement("div");
            d.style.cssText = "background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:18px;margin-bottom:10px;font:14px sans-serif;";
            d.textContent = `Synthetic line ${i + 1}/30 — forcing chat-area to overflow so we can see whether the scrollbar appears.`;
            log.appendChild(d);
        }
    });
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
        const out = [];
        let cur = document.querySelector(".gn-chat-area, .gn-chat-log");
        let depth = 0;
        while (cur && depth < 14) {
            const cs = window.getComputedStyle(cur);
            const rect = cur.getBoundingClientRect();
            out.push({
                depth, tag: cur.tagName,
                class: typeof cur.className === "string" ? cur.className.slice(0, 60) : "",
                rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) },
                scrollH: cur.scrollHeight,
                clientH: cur.clientHeight,
                overflowY: cs.overflowY,
                minHeight: cs.minHeight,
                maxHeight: cs.maxHeight,
                flex: cs.flex,
                display: cs.display,
                scrollable: cur.scrollHeight > cur.clientHeight + 1,
            });
            cur = cur.parentElement;
            depth++;
        }
        return {
            viewportH: window.innerHeight,
            documentScrollH: document.documentElement.scrollHeight,
            bodyOverflow: window.getComputedStyle(document.body).overflowY,
            chain: out,
        };
    });
    console.log(JSON.stringify(result, null, 2));
    await page.screenshot({ path: "d:/Working_Folder/Projects/PulsePlay/docs/evidence/ui-snapshot-2026-05-26/scrollbar-probe.png", fullPage: false });
    await page.waitForTimeout(3000);
    await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
