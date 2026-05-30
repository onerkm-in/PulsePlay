// Step 8 audit probe — verifies the HANDOVER claims about the new
// Split Workspace Setup: 5 gates, no horizontal overflow at 1440/390,
// no direct iframe in the Setup preview. Runs against the already-
// running Vite dev server at http://127.0.0.1:5173/. Read-only.
import { chromium } from "playwright";

const BASE = process.env.PP_BASE_URL || "http://127.0.0.1:5173/";
const TARGET = new URL("settings/setup", BASE).toString();

const browser = await chromium.launch({ headless: true });
const results = {};

async function probe(width, height, label) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    try {
        await page.goto(TARGET, { waitUntil: "networkidle", timeout: 15000 });
        // Give React Query / lazy chunks a moment to settle
        await page.waitForTimeout(800);
        const probe = await page.evaluate(() => {
            const gates = document.querySelectorAll(".pp-setup-gate");
            const iframes = document.querySelectorAll(".pp-setup-preview-iframe, .pp-setup-preview__body iframe");
            const allIframes = document.querySelectorAll("iframe");
            const bodyScrollWidth = document.body.scrollWidth;
            const innerWidth = window.innerWidth;
            return {
                gateCount: gates.length,
                directIframeCountInPreview: iframes.length,
                allIframesOnPage: allIframes.length,
                bodyScrollWidth,
                innerWidth,
                overflow: bodyScrollWidth - innerWidth,
            };
        });
        results[label] = { ...probe, consoleErrors: consoleErrors.slice(0, 10) };
    } catch (err) {
        results[label] = { error: String(err?.message || err), consoleErrors: consoleErrors.slice(0, 10) };
    } finally {
        await ctx.close();
    }
}

await probe(1440, 900, "desktop_1440");
await probe(390, 844, "mobile_390");

await browser.close();
console.log(JSON.stringify(results, null, 2));
