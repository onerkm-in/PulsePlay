import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const seed = async (page, vendor, dark) => {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:25000 });
  await page.evaluate(({vendor,dark}) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor", vendor);
    localStorage.setItem("pulseplay:active-ai-profile","default");
    if (dark){ localStorage.setItem("pulseplay:theme-mode","dark"); }
    const k="pulseplay:visual-settings:genieSettings";
    const ex=JSON.parse(localStorage.getItem(k)||"{}");
    ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
    if (dark) ex.darkMode=true;
    localStorage.setItem(k, JSON.stringify(ex));
  }, {vendor,dark});
};
const browser = await chromium.launch({ headless: true });
const check = async (surface, vendor, dark, shot) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 850 } });
  const page = await ctx.newPage();
  await seed(page, vendor, dark);
  await page.goto(`${BASE}/?surface=${surface}`, { waitUntil:"domcontentloaded", timeout:25000 });
  await sleep(3500);
  const r = await page.evaluate(() => {
    const f = document.querySelector(".gn-app-footer");
    return {
      footer: !!f, footerText: f?.innerText?.replace(/\s+/g," ").trim().slice(0,70),
      footerBottom: f?getComputedStyle(f).bottom:null, footerBg: f?getComputedStyle(f).backgroundColor:null,
      contextPills: document.querySelectorAll(".gn-context-setup__trigger, .pp-surface-context, .gn-header-row--bottom .gn-context-setup").length,
      screenControls: document.querySelectorAll(".pp-top-right-toolbar .pp-window-controls__btn").length,
    };
  });
  console.log(`${surface}/${vendor}/${dark?"dark":"light"}: ${JSON.stringify(r)}`);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}.png` });
  await ctx.close();
};
await check("ai-insights","powerbi",false,"hostfooter-aiinsights");
await check("dashboard","native",false,"hostfooter-dashboard");
await check("ai-insights","powerbi",true,"hostfooter-dark");
await browser.close();
