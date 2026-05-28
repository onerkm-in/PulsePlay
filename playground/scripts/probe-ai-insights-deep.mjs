// Focused AI Insights inspection — cold start, post-connect, mobile, ultrawide.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUT = "d:/Working_Folder/Projects/PulsePlay/docs/evidence/ai-insights-deep-2026-05-26";
const BASE = "http://127.0.0.1:7001";

async function snap(page, name, label) {
    await page.evaluate((label) => {
        let b = document.getElementById("__sn__");
        if (!b) { b = document.createElement("div"); b.id = "__sn__"; document.body.appendChild(b); }
        Object.assign(b.style, { position: "fixed", top: "8px", left: "8px", zIndex: "99999", padding: "6px 10px", background: "rgba(15,23,42,0.9)", color: "#fff", font: "12px ui-monospace", borderRadius: "4px" });
        b.textContent = label;
    }, label);
    await page.screenshot({ path: join(OUT, name + ".png"), fullPage: false });
}

async function probe(page) {
    return await page.evaluate(() => {
        const hero = document.querySelector(".gn-insights-placeholder");
        const heroRect = hero?.getBoundingClientRect();
        const ctaButtons = Array.from(document.querySelectorAll("button")).filter(b => /Connect AI assistant|Browse knowledge/i.test(b.textContent || "")).map(b => ({ text: (b.textContent || "").trim(), top: b.getBoundingClientRect().top }));
        const chrome = document.querySelectorAll('[data-testid="pp-panel-chrome-ai"]');
        const tabs = Array.from(document.querySelectorAll("button")).filter(b => /^(AI Insights|Ask Pulse|Dashboard)$/i.test((b.textContent || "").trim())).map(b => ({ label: (b.textContent || "").trim(), top: b.getBoundingClientRect().top, height: b.getBoundingClientRect().height }));
        return {
            heroTop: heroRect?.top,
            heroHeight: heroRect?.height,
            ctaButtons,
            chromeCount: chrome.length,
            tabs,
            viewportH: window.innerHeight,
            bodyOverflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        };
    });
}

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();

    // ─── 1. Cold start ─────────────────────────────
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const p1 = await probe(page);
    console.log("[1] cold-start AI Insights:", JSON.stringify(p1, null, 2));
    await snap(page, "01-cold-start", "1. Cold start — no profile");

    // ─── 2. With profile but still empty ──────────
    await page.evaluate(() => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "default");
        const k = "pulseplay:visual-settings:genieSettings";
        const ex = JSON.parse(window.localStorage.getItem(k) || "{}");
        ex.assistantProfile = "default"; ex.connectionMode = "proxy";
        ex.apiBaseUrl = window.location.origin + "/api";
        window.localStorage.setItem(k, JSON.stringify(ex));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const p2 = await probe(page);
    console.log("[2] post-connect AI Insights:", JSON.stringify(p2, null, 2));
    await snap(page, "02-post-connect", "2. With profile configured");

    // ─── 3. Mobile width ────────────────────────────
    await page.setViewportSize({ width: 412, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await snap(page, "03-mobile-412", "3. Mobile 412×900");

    // ─── 4. Ultra-wide ──────────────────────────────
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await snap(page, "04-ultra-1920", "4. Ultra-wide 1920×1080");

    // ─── 5. Hover state on CTAs ─────────────────────
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const cta = page.locator('button:has-text("Connect AI assistant")').first();
    if (await cta.count() > 0) {
        await cta.hover();
        await page.waitForTimeout(400);
        await snap(page, "05-cta-hover", "5. Hover on Connect AI");
    }

    await browser.close();
    console.log(`[done] → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
