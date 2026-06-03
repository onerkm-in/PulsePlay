import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
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
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(3000);
const r = await page.evaluate(() => {
  const box = (sel) => { const e=document.querySelector(sel); if(!e) return null; const b=e.getBoundingClientRect(); return {top:Math.round(b.top),bottom:Math.round(b.bottom),left:Math.round(b.left),right:Math.round(b.right),h:Math.round(b.height)}; };
  return {
    toolbar: box(".pp-top-right-toolbar"),
    rowTop: box(".gn-header-row--top"),
    rowBottom: box(".gn-header-row--bottom"),
    runState: box(".gn-header-run-state"),
    readyPill: box(".gn-connected") || box("[class*='connected']") || box("[class*='status']"),
    header: box(".gn-header"),
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
