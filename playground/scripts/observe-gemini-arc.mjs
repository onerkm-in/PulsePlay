// Observable headed walkthrough of the 2026-06-02/03 Gemini master-spec arc.
// Watch: staged checklist (anchored under indicator) -> Composer Bridge ->
// strict-AAA theme -> tablet icon-nav -> mobile bottom-nav + sticky agent banner.
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const seed = async (page, theme) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.evaluate((theme) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor", "powerbi");
    localStorage.setItem("pulseplay:active-ai-profile", "default");
    localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
    const k = "pulseplay:visual-settings:genieSettings";
    const ex = JSON.parse(localStorage.getItem(k) || "{}");
    ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
    if (theme) ex.themeName = theme;
    localStorage.setItem(k, JSON.stringify(ex));
  }, theme);
};
const browser = await chromium.launch({ headless: false, slowMo: 220, args: ["--window-size=1480,960"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

console.log("① AI Insights — staged checklist (anchored under the Stage indicator)");
await seed(page, null);
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
await page.locator(".gn-progress-steps").first().waitFor({ state: "visible", timeout: 30000 }).catch(()=>{});
await sleep(4000);

console.log("② Composer Bridge — click the sparkle 'Ask Pulse about this card'");
const ask = page.locator(".gn-insights-provenance-action--ask").first();
await ask.waitFor({ state: "visible", timeout: 90000 }).catch(()=>console.log("   (no section footer yet — skipping)"));
if (await ask.isVisible().catch(()=>false)) {
  await ask.scrollIntoViewIfNeeded().catch(()=>{});
  await ask.click().catch(()=>{});
  await sleep(3500); // watch it land on Ask Pulse with the composer seeded
}

console.log("③ Strict-AAA theme — whole shell goes pure-black / 2px white / yellow");
await seed(page, "accessibility-aaa");
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(5000);

console.log("④ Tablet 800px — icon-only nav + single-column grid");
await seed(page, null);
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
await page.setViewportSize({ width: 800, height: 1100 });
await sleep(4000);

console.log("⑤ Mobile 390px — fixed bottom nav + sticky agent micro-banner");
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "domcontentloaded" });
await sleep(6000); // mid-run: the sticky '⚡ Stage X/N · … ■ Stop' banner shows
console.log("   tapping bottom-nav: Ask -> Insights");
await page.locator(".gn-mobile-nav-item", { hasText: "Ask" }).click().catch(()=>{});
await sleep(2500);
await page.locator(".gn-mobile-nav-item", { hasText: "Insights" }).click().catch(()=>{});
await sleep(2500);

console.log("✓ walkthrough complete — closing in 4s");
await sleep(4000);
await browser.close();
