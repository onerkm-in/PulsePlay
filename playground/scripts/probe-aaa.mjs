import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function seed(page) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.evaluate(() => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor", "powerbi");
    localStorage.setItem("pulseplay:active-ai-profile", "default");
    localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
    const k = "pulseplay:visual-settings:genieSettings";
    const ex = JSON.parse(localStorage.getItem(k) || "{}");
    ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
    ex.themeName = "accessibility-aaa";
    localStorage.setItem(k, JSON.stringify(ex));
  });
}
const browser = await chromium.launch({ headless: true });
for (const [w,h,name] of [[1440,900,"desktop"],[390,844,"mobile"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await seed(page);
  await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await sleep(7000);
  await page.screenshot({ path: `${OUT}/aaa-${name}.png` });
  console.log(`shot aaa-${name}.png`);
  await ctx.close();
}
await browser.close();
console.log("done");
