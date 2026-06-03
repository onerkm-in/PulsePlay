import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:25000 });
await page.evaluate(() => {
  try { localStorage.clear(); } catch {}
  localStorage.setItem("pulseplay:bi-vendor","powerbi");
  localStorage.setItem("pulseplay:active-ai-profile","default");
  localStorage.setItem("pulseplay:default-landing-surface","ai-insights");
  const k="pulseplay:visual-settings:genieSettings";
  const ex=JSON.parse(localStorage.getItem(k)||"{}");
  ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
  localStorage.setItem(k, JSON.stringify(ex));
});
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil:"domcontentloaded", timeout:25000 });
// wait for the agent status to actually appear in Row 2 run-state
const status = page.locator(".gn-header-run-state .gn-insights-progress-wrap--header");
await status.waitFor({ state:"visible", timeout:45000 }).catch(()=>console.log("status never appeared in Row2"));
await sleep(800);
const inv = await page.evaluate(() => ({
  ctxPillInRow2: !!document.querySelector(".gn-header-row--bottom .gn-context-setup__trigger"),
  agentStatusInRow2: !!document.querySelector(".gn-header-run-state .gn-insights-progress-wrap--header"),
  viewOptionItems: document.querySelectorAll(".gn-insights-overflow-item").length,
}));
console.log("RUNNING invariants:", JSON.stringify(inv));
await page.screenshot({ path: `${OUT}/restructure-running.png` });
// open ⋮ menu to show folded view-options
const ovf = page.locator("[data-testid='gn-insights-overflow-trigger']").first();
await ovf.click().catch(()=>{});
await sleep(500);
await page.screenshot({ path: `${OUT}/restructure-overflow-menu.png` });
const items = await page.locator(".gn-insights-overflow-pop .gn-insights-overflow-item-label").allInnerTexts().catch(()=>[]);
console.log("⋮ menu items:", JSON.stringify(items));
await browser.close();
