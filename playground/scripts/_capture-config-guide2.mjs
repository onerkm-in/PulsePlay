import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "..", "docs", "config-guide-assets", "shots");
const BASE = "http://127.0.0.1:7001";
const SHOTS = [
    { slug: "01-app-home", path: "/" },
    { slug: "11-ask-pulse", path: "/?surface=ask-pulse" },
    { slug: "12-dashboard", path: "/?surface=dashboard" },
];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1380, height: 940 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
    try {
        localStorage.setItem("pulseplay:ai-profile", "default");
        localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        localStorage.setItem("pulseplay:api-base-url", "/api");
        localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
    } catch { /* ignore */ }
});
const page = await ctx.newPage();
for (const s of SHOTS) {
    process.stdout.write(`→ ${s.slug} ${s.path}\n`);
    try { await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle", timeout: 20000 }); } catch (e) { console.warn(e.message); }
    await page.waitForTimeout(1600);
    await page.screenshot({ path: join(OUT, `${s.slug}.png`), fullPage: false });
}
await browser.close();
console.log("done");
