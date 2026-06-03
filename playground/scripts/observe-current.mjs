// Headed, watchable walkthrough of the CURRENT UI (post Row-2 restructure + menu refactor).
import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const seed = async (page, vendor, theme) => {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:25000 });
  await page.evaluate(({vendor,theme}) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor", vendor);
    localStorage.setItem("pulseplay:active-ai-profile","default");
    localStorage.setItem("pulseplay:default-landing-surface","ai-insights");
    const k="pulseplay:visual-settings:genieSettings";
    const ex=JSON.parse(localStorage.getItem(k)||"{}");
    ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
    if (theme==="dark") { ex.darkMode=true; localStorage.setItem("pulseplay:theme-mode","dark"); }
    if (theme==="aaa") ex.themeName="accessibility-aaa";
    localStorage.setItem(k, JSON.stringify(ex));
  }, {vendor,theme});
};
const browser = await chromium.launch({ headless:false, slowMo:200, args:["--window-size=1480,960","--window-position=40,40"] });
const ctx = await browser.newContext({ viewport:{ width:1440, height:900 } });
const page = await ctx.newPage();

console.log("① AI Insights — single Row 2: context pill inline + agent status (right) + checklist dropdown");
await seed(page,"powerbi",null);
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil:"domcontentloaded", timeout:25000 });
await page.locator(".gn-header-run-state .gn-insights-progress-wrap--header").waitFor({ state:"visible", timeout:45000 }).catch(()=>{});
await sleep(3500);

console.log("② ⋮ menu — Data Portability + Canvas Utilities (no window-mgmt)");
await page.locator("[data-testid='gn-insights-overflow-trigger']").first().click().catch(()=>{});
await sleep(3500);
await page.keyboard.press("Escape").catch(()=>{});

console.log("③ Wait for completion — agent status auto-hides, Row 2 goes calm");
const dl=Date.now()+150000;
while(Date.now()<dl){ const busy=await page.locator(".gn-header-run-state .gn-insights-progress-wrap--header").isVisible().catch(()=>false); const secs=await page.locator('[data-section]:not(.gn-insights-section--placeholder)').count(); if(!busy&&secs>=2)break; await sleep(2000);}
await sleep(2500);

console.log("④ Composer Bridge — sparkle 'Ask Pulse about this card' seeds the composer");
const ask = page.locator(".gn-insights-provenance-action--ask").first();
if (await ask.isVisible().catch(()=>false)) { await ask.click().catch(()=>{}); await sleep(3500); }

console.log("⑤ Dark theme");
await seed(page,"powerbi","dark");
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil:"domcontentloaded", timeout:25000 });
await sleep(4000);

console.log("⑥ Accessibility-AAA theme — pure black / 2px white / yellow");
await seed(page,"powerbi","aaa");
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil:"domcontentloaded", timeout:25000 });
await sleep(4000);

console.log("⑦ Dashboard (native) — collapsed ⚙ Context pill, click to expand");
await seed(page,"native",null);
await page.goto(`${BASE}/?surface=dashboard`, { waitUntil:"domcontentloaded", timeout:25000 });
await sleep(2500);
await page.locator(".gn-context-setup__trigger").last().click().catch(()=>{});
await sleep(3500);

console.log("✓ done — closing in 4s");
await sleep(4000);
await browser.close();
