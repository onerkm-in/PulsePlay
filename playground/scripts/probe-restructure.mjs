import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const seed = async (page, vendor, dark) => {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.evaluate(({vendor,dark}) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor", vendor);
    localStorage.setItem("pulseplay:active-ai-profile","default");
    localStorage.setItem("pulseplay:default-landing-surface","ai-insights");
    if (dark) localStorage.setItem("pulseplay:theme-mode","dark");
    const k="pulseplay:visual-settings:genieSettings";
    const ex=JSON.parse(localStorage.getItem(k)||"{}");
    ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
    if (dark) ex.darkMode = true;
    localStorage.setItem(k, JSON.stringify(ex));
  }, {vendor,dark});
};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
// RUNNING (Row 2 single row + agent status)
await seed(page, "powerbi", false);
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil:"domcontentloaded", timeout:25000 });
await sleep(4000);
const inv = await page.evaluate(() => ({
  ctxPillInRow2: !!document.querySelector(".gn-header-row--bottom .gn-context-setup__trigger"),
  contextLineRemoved: document.querySelectorAll(".gn-context-bar .gn-context-progress").length === 0,
  separateContextBar: document.querySelectorAll(".gn-shell .gn-context-bar").length, // pulse shell context bar should be 0 now
  standaloneToolbar: document.querySelectorAll(".pp-top-right-toolbar").length,
  agentStatusInRow2: !!document.querySelector(".gn-header-run-state .gn-insights-progress-wrap--header"),
}));
console.log("RUNNING invariants:", JSON.stringify(inv));
await page.screenshot({ path: `${OUT}/restructure-running.png` });
// open the ⋮ menu
const ovf = page.locator("[data-testid='gn-insights-overflow-trigger']").first();
if (await ovf.isVisible().catch(()=>false)) { await ovf.click(); await sleep(400); await page.screenshot({ path: `${OUT}/restructure-overflow-menu.png` }); console.log("overflow menu captured"); }
// COMPLETE (agent status hidden)
const dl = Date.now()+150000; let done=false;
while (Date.now()<dl){ const busy=await page.locator(".gn-header-run-state .gn-insights-progress-wrap--header").isVisible().catch(()=>false); const secs=await page.locator('[data-section]:not(.gn-insights-section--placeholder)').count(); if(!busy&&secs>=2){done=true;break;} await sleep(2000);}
await sleep(800);
await page.screenshot({ path: `${OUT}/restructure-complete.png` });
console.log("COMPLETE: agent status hidden =", done);
await ctx.close();
// DARK dashboard (critical fix)
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await ctx2.newPage();
await seed(p2, "native", true);
await p2.goto(`${BASE}/?surface=dashboard`, { waitUntil:"domcontentloaded", timeout:25000 });
await sleep(3000);
await p2.screenshot({ path: `${OUT}/restructure-dark-dashboard.png` });
const bg = await p2.evaluate(() => { const e=document.querySelector(".gn-context-bar"); return e ? getComputedStyle(e).backgroundColor : "none"; });
console.log("DARK dashboard .gn-context-bar bg =", bg);
await browser.close();
