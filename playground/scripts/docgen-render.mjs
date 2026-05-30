// playground/scripts/docgen-render.mjs
//
// Renders the briefing HTML documents to PDF via Playwright/Chromium (no npm
// installs — the corporate TLS chain blocks the registry). Usage:
//   node scripts/docgen-render.mjs <input.html> <output.pdf> [deck|a4|flyer]
//
// - a4    : A4 portrait, normal margins (detailed briefing / flyer-portrait)
// - deck  : 16:9 landscape "slide" pages (1280×720), zero margin (the deck)
// - flyer : A4 portrait, zero margin edge-to-edge (marketing flyer)

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

async function main() {
    const [, , inPath, outPath, mode = "a4"] = process.argv;
    if (!inPath || !outPath) {
        console.error("usage: docgen-render.mjs <input.html> <output.pdf> [deck|a4|flyer]");
        process.exit(2);
    }
    const url = pathToFileURL(resolve(inPath)).href;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Let webfonts + layout settle.
    await page.waitForTimeout(600);

    const common = { path: resolve(outPath), printBackground: true };
    let opts;
    if (mode === "deck") {
        opts = { ...common, width: "1280px", height: "720px", landscape: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } };
    } else if (mode === "flyer") {
        opts = { ...common, format: "A4", margin: { top: 0, right: 0, bottom: 0, left: 0 } };
    } else {
        opts = { ...common, format: "A4", margin: { top: "14mm", right: "0mm", bottom: "14mm", left: "0mm" } };
    }
    await page.pdf(opts);
    await browser.close();
    console.log(`✔ ${outPath} (${mode})`);
}

main().catch(e => { console.error(e); process.exit(1); });
