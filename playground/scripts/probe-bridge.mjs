import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const OUT = "D:/Working_Folder/Artifacts/PulsePly_ref/Screenshots-Dev-Genmini-reference";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25000 });
await page.evaluate(() => {
  try { localStorage.clear(); } catch {}
  localStorage.setItem("pulseplay:bi-vendor", "powerbi");
  localStorage.setItem("pulseplay:active-ai-profile", "default");
  localStorage.setItem("pulseplay:default-landing-surface", "ai-insights");
  const k = "pulseplay:visual-settings:genieSettings";
  const ex = JSON.parse(localStorage.getItem(k) || "{}");
  ex.assistantProfile = "default"; ex.connectionMode = "proxy"; ex.apiBaseUrl = location.origin + "/api";
  localStorage.setItem(k, JSON.stringify(ex));
});
await page.goto(`${BASE}/?surface=ai-insights`, { waitUntil: "domcontentloaded", timeout: 25000 });
// wait for the sparkle bridge button (appears once a section + footer render)
const btn = page.locator(".gn-insights-provenance-action--ask").first();
try { await btn.waitFor({ state: "visible", timeout: 90000 }); }
catch { console.log("NO ask button appeared"); await browser.close(); process.exit(1); }
console.log("ask button visible; clicking");
await btn.click();
await sleep(800);
const result = await page.evaluate(() => {
  const activeTab = document.querySelector("#gn-tab-chat[aria-selected='true']") ? "chat" : (document.querySelector("#gn-tab-insights[aria-selected='true']") ? "insights" : "?");
  const ta = document.querySelector("textarea.gn-input, textarea.pp-ai-sidebar__input");
  return { activeTab, seeded: ta ? ta.value : "(no textarea)", focused: document.activeElement === ta };
});
console.log("RESULT:", JSON.stringify(result));
await page.screenshot({ path: `${OUT}/bridge-seeded.png` });
console.log("shot bridge-seeded.png");
await browser.close();
