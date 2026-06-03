import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const seed = async (page, dark) => {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:25000 });
  await page.evaluate((dark) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor","powerbi");
    localStorage.setItem("pulseplay:active-ai-profile","default");
    localStorage.setItem("pulseplay:default-landing-surface","ai-insights");
    if (dark) localStorage.setItem("pulseplay:theme-mode","dark");
    const k="pulseplay:visual-settings:genieSettings";
    const ex=JSON.parse(localStorage.getItem(k)||"{}");
    ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
    if (dark) ex.darkMode=true;
    localStorage.setItem(k, JSON.stringify(ex));
  }, dark);
};
const browser = await chromium.launch({ headless: true });
for (const dark of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  const page = await ctx.newPage();
  await seed(page, dark);
  await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil:"domcontentloaded", timeout:25000 });
  // wait until a couple sections render (idle-ish) so Row 2 utilities are visible
  const dl=Date.now()+120000;
  while(Date.now()<dl){ const secs=await page.locator('[data-section]:not(.gn-insights-section--placeholder)').count(); if(secs>=2)break; await sleep(2000);}
  await sleep(1500);
  const inv = await page.evaluate(() => {
    const f = document.querySelector(".gn-app-footer");
    const fcs = f ? getComputedStyle(f) : null;
    const metaBtns = [...document.querySelectorAll(".gn-header-run-state .gn-pane-action-btn")].map(b=>b.getAttribute("aria-label"));
    return {
      ctxPillInRow2: !!document.querySelector(".gn-header-row--bottom .gn-context-setup__trigger"),
      footerExists: !!f, footerText: f?.innerText?.replace(/\s+/g," ").trim().slice(0,80),
      footerBg: fcs?.backgroundColor, footerBottom: fcs?.bottom, footerH: fcs?.height,
      utilityBtns: metaBtns,
    };
  });
  console.log(`${dark?"DARK ":"LIGHT"}: ${JSON.stringify(inv)}`);
  await page.screenshot({ path: `${OUT}/footer-${dark?"dark":"light"}.png` });
  await ctx.close();
}
await browser.close();
