#!/usr/bin/env node
// Capture the ACTUAL questions PulsePlay's deterministic AI Insights plan sends
// to the proxy for powerbi-dwd, to see whether the builder emits segment or
// customer_name for the top-N.
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    const qs = [];
    page.on("request", req => {
        const u = req.url();
        if (/\/assistant\/conversations\/(start|pbi-)/.test(u) && req.method() === "POST") {
            try {
                const b = JSON.parse(req.postData() || "{}");
                const content = b.content || "";
                const m = content.match(/Question \(user input[^)]*\)\s*:\s*\n```\s*\n?([\s\S]+?)\n?```/) || content.match(/\[Question\]\s*\n([\s\S]+)$/);
                qs.push((m ? m[1] : content).trim().slice(0, 80));
            } catch { /* */ }
        }
    });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.evaluate(() => {
        try { localStorage.clear(); } catch { /* */ }
        localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
        localStorage.setItem("pulseplay:active-surface", "ai-insights");
        localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
        const k = "pulseplay:visual-settings:genieSettings"; const ex = JSON.parse(localStorage.getItem(k) || "{}");
        ex.assistantProfile = "powerbi-dwd"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
        localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.goto(BASE + "/?surface=ai-insights", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(20_000); // let auto-fire + any re-run send all stages
    console.log(`captured ${qs.length} insight questions:`);
    qs.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
    await browser.close();
}
main().catch(e => { console.error("[FAIL]", e); process.exit(1); });
