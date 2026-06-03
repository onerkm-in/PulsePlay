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
await page.locator("[data-testid='gn-insights-overflow-trigger']").first().waitFor({ state:"visible", timeout:40000 }).catch(()=>{});
await sleep(600);
await page.locator("[data-testid='gn-insights-overflow-trigger']").first().click().catch(()=>{});
await sleep(500);
const r = await page.evaluate(() => ({
  labels: [...document.querySelectorAll(".gn-insights-overflow-label")].map(e=>e.textContent),
  items: [...document.querySelectorAll(".gn-insights-overflow-pop .gn-insights-overflow-item-label")].map(e=>e.textContent),
  zIndex: (()=>{ const p=document.querySelector(".gn-insights-overflow-pop"); return p?getComputedStyle(p).zIndex:"?"; })(),
  standaloneRefresh: [...document.querySelectorAll(".gn-header-run-state .gn-pane-action-btn")].some(b=>/refresh/i.test(b.getAttribute("aria-label")||"")),
}));
console.log(JSON.stringify(r));
await page.screenshot({ path: `${OUT}/menu-refactored.png` });
await browser.close();
