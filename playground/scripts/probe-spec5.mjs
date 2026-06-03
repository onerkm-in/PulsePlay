import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 850 } });
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
await sleep(3500);
const before = await page.evaluate(() => ({
  footer: document.querySelector(".gn-app-footer")?.innerText?.replace(/\s+/g," ").trim(),
  themeToggle: !!document.querySelector(".gn-header-run-state button[aria-label*='theme']"),
  gearGone: !document.querySelector(".gn-header-run-state button[aria-label='Open PulsePlay Settings']"),
  screenControls: document.querySelectorAll(".pp-top-right-toolbar .pp-window-controls__btn").length,
  isDark: document.documentElement.dataset.ppTheme === "dark" || !!document.querySelector(".gn-shell--dark"),
}));
console.log("BEFORE:", JSON.stringify(before));
// click theme toggle
await page.locator(".gn-header-run-state button[aria-label*='theme']").first().click().catch(()=>{});
await sleep(1500);
const after = await page.evaluate(() => ({
  isDark: document.documentElement.dataset.ppTheme === "dark" || !!document.querySelector(".gn-shell--dark"),
  footerBg: getComputedStyle(document.querySelector(".gn-app-footer")).backgroundColor,
}));
console.log("AFTER toggle:", JSON.stringify(after));
await page.screenshot({ path: `${OUT}/spec5-after-toggle.png` });
await browser.close();
