// Headed LIVE walkthrough of the final layout (host footer + theme toggle + screen controls).
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const seed = async (page, vendor) => {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:25000 });
  await page.evaluate((vendor) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor", vendor);
    localStorage.setItem("pulseplay:active-ai-profile","default");
    localStorage.setItem("pulseplay:default-landing-surface","ai-insights");
    const k="pulseplay:visual-settings:genieSettings";
    const ex=JSON.parse(localStorage.getItem(k)||"{}");
    ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
    localStorage.setItem(k, JSON.stringify(ex));
  }, vendor);
};
const browser = await chromium.launch({ headless:false, slowMo:240, args:["--window-size=1480,940","--window-position=30,30"] });
const ctx = await browser.newContext({ viewport:{ width:1440, height:880 } });
const page = await ctx.newPage();

console.log("① AI Insights — Row 2 (nav | Adjust | 🔄 ☀️ ⋮ | screen controls) + host footer at the bottom");
await seed(page,"powerbi");
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil:"domcontentloaded", timeout:25000 });
await page.locator(".gn-header-run-state .gn-insights-progress-wrap--header").waitFor({ state:"visible", timeout:45000 }).catch(()=>{});
await sleep(4000);

console.log("② Theme toggle (sun/moon) — click → whole app + footer flip to dark");
await page.locator(".gn-header-run-state button[aria-label*='theme']").first().click().catch(()=>{});
await sleep(3500);
console.log("   ...and back to light");
await page.locator(".gn-header-run-state button[aria-label*='theme']").first().click().catch(()=>{});
await sleep(3000);

console.log("③ ⋮ menu — Data Portability (Copy md / Copy HTML / Print)");
await page.locator("[data-testid='gn-insights-overflow-trigger']").first().click().catch(()=>{});
await sleep(3000);
await page.keyboard.press("Escape").catch(()=>{});

console.log("④ Let it finish — agent status hides; footer 'AI configured · No BI fields' stays");
const dl=Date.now()+150000;
while(Date.now()<dl){ const busy=await page.locator(".gn-header-run-state .gn-insights-progress-wrap--header").isVisible().catch(()=>false); const secs=await page.locator('[data-section]:not(.gn-insights-section--placeholder)').count(); if(!busy&&secs>=2)break; await sleep(2000);}
await sleep(2500);

console.log("⑤ Composer Bridge — sparkle seeds Ask Pulse (footer unchanged)");
const ask = page.locator(".gn-insights-provenance-action--ask").first();
if (await ask.isVisible().catch(()=>false)) { await ask.click().catch(()=>{}); await sleep(3000); }

console.log("⑥ Dashboard (native) — SAME footer context, no pane pill");
await seed(page,"native");
await page.goto(`${BASE}/?surface=dashboard`, { waitUntil:"domcontentloaded", timeout:25000 });
await sleep(3500);

console.log("✓ done — closing in 4s");
await sleep(4000);
await browser.close();
