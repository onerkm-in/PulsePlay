// One-off: capture the configuration-relevant UI surfaces for the PDF guide.
// Credential-free — the UI chrome renders without live connectors.
//   node scripts/_capture-config-guide.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "..", "docs", "config-guide-assets", "shots");
const BASE = "http://127.0.0.1:7001";

const SHOTS = [
    { slug: "01-app-home",              path: "/" },
    { slug: "02-settings-setup",        path: "/settings/setup" },
    { slug: "03-ai-overview",           path: "/settings/ai" },
    { slug: "04-ai-connector-catalogue",path: "/settings/ai/connector-catalogue" },
    { slug: "05-ai-model-agent",        path: "/settings/ai/model-agent" },
    { slug: "06-ai-connection-test",    path: "/settings/ai/connection-test" },
    { slug: "07-bi-overview",           path: "/settings/bi" },
    { slug: "08-bi-provider",           path: "/settings/bi/provider" },
    { slug: "09-bi-embed",              path: "/settings/bi/embed" },
    { slug: "10-bi-authentication",     path: "/settings/bi/authentication" },
];

async function main() {
    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 1380, height: 940 },
        deviceScaleFactor: 2,
    });
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem("pulseplay:ai-profile", "genie-default");
            localStorage.setItem("pulseplay:bi-vendor", "powerbi");
            localStorage.setItem("pulseplay:api-base-url", "/api");
            localStorage.setItem("pulseplay:settings-last-group", "ai");
            localStorage.setItem("pulseplay:setup-wizard-dismissed", "true");
        } catch { /* ignore */ }
    });
    const page = await ctx.newPage();
    for (const s of SHOTS) {
        const url = `${BASE}${s.path}`;
        process.stdout.write(`→ ${s.slug.padEnd(28)} ${s.path}\n`);
        try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
        } catch (e) { console.warn(`  [warn] ${e.message}`); }
        await page.waitForTimeout(1400);
        await page.screenshot({ path: join(OUT, `${s.slug}.png`), fullPage: false });
    }
    await browser.close();
    console.log(`\nDone → ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
