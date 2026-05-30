// Probe the scroll behavior of the Ask Pulse chat area. Walks up the
// DOM tree from .gn-chat-area and reports each ancestor's height +
// computed overflow/min-height/flex props to identify which parent
// loses the height constraint and stops scroll from working.
import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";

async function main() {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
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
    const askTab = page.locator('button:has-text("Ask Pulse")').first();
    if (await askTab.count() > 0) { await askTab.click(); await page.waitForTimeout(800); }

    // Inject a tall message stub so we can see if scrolling works
    await page.evaluate(() => {
        const log = document.querySelector(".gn-chat-area, .gn-chat-log");
        if (!log) { console.log("[probe] no chat-area found"); return; }
        for (let i = 0; i < 20; i++) {
            const d = document.createElement("div");
            d.style.cssText = "background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;padding:24px;margin-bottom:16px;font-family:sans-serif;font-size:14px;";
            d.textContent = `Synthetic message ${i + 1}/20 — used to test if .gn-chat-area scrolls when content overflows its height. Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;
            log.appendChild(d);
        }
    });
    await page.waitForTimeout(800);

    const chain = await page.evaluate(() => {
        const el = document.querySelector(".gn-chat-area, .gn-chat-log");
        if (!el) return [];
        const out = [];
        let cur = el;
        let depth = 0;
        while (cur && depth < 12) {
            const cs = window.getComputedStyle(cur);
            const rect = cur.getBoundingClientRect();
            out.push({
                depth, tag: cur.tagName,
                class: typeof cur.className === "string" ? cur.className.slice(0, 60) : "",
                height: Math.round(rect.height),
                scrollH: cur.scrollHeight,
                clientH: cur.clientHeight,
                isScrollable: cur.scrollHeight > cur.clientHeight + 1,
                overflowY: cs.overflowY,
                minHeight: cs.minHeight,
                flex: cs.flex,
                display: cs.display,
            });
            cur = cur.parentElement;
            depth++;
        }
        return out;
    });
    console.log("[scroll chain from .gn-chat-area upward]");
    for (const c of chain) console.log(JSON.stringify(c));

    // Try to scroll the chat-area to confirm scroll works
    const scrolled = await page.evaluate(() => {
        const el = document.querySelector(".gn-chat-area, .gn-chat-log");
        if (!el) return { ok: false };
        const before = el.scrollTop;
        el.scrollTop = 500;
        const after = el.scrollTop;
        return { ok: true, before, after, moved: after - before };
    });
    console.log("[scroll attempt]", JSON.stringify(scrolled));

    await page.screenshot({ path: "d:/Working_Folder/Projects/PulsePlay/docs/evidence/ui-snapshot-2026-05-26/scroller-probe.png" });
    await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
