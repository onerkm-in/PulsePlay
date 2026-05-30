#!/usr/bin/env node
// Tiny probe — load /?surface=ask-pulse, capture every console.error
// message verbatim, exit. Used to find what the 1 benign console
// error is across all surfaces.

import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:7001";

async function main() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    page.on("pageerror", (e) => errs.push(`PAGEERR: ${e.message}`));
    await page.goto(BASE + "/?surface=ask-pulse", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(3000);
    console.log(`[errors captured] ${errs.length}`);
    for (const [i, e] of errs.entries()) {
        console.log(`---[${i + 1}]---\n${e}\n`);
    }
    await browser.close();
}

main().catch((err) => { console.error("[FAIL]", err); process.exitCode = 1; });
