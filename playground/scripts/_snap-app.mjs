import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addInitScript(() => {
  try {
    localStorage.setItem("pulseplay:ai-profile","genie-default");
    localStorage.setItem("pulseplay:bi-vendor","powerbi");
    localStorage.setItem("pulseplay:api-base-url","/api");
    localStorage.setItem("pulseplay:enabled-components","mix");
    localStorage.setItem("pulseplay:setup-wizard-dismissed","true");
  } catch {}
});
const p = await c.newPage();
await p.goto("http://127.0.0.1:7001/?surface=ai-insights",{waitUntil:"networkidle",timeout:20000});
await p.waitForTimeout(1500);
await p.screenshot({path:"screenshots/app-ai-insights-current.png",fullPage:false});
const info = await p.evaluate(()=>{
  const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map(t=>({label:t.textContent.trim(), vis: getComputedStyle(t).visibility, disp: getComputedStyle(t).display}));
  const switcher = document.querySelectorAll('.pp-surface-switcher').length;
  const btns = Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(t=>/insight|ask pulse|dashboard/i.test(t)).slice(0,20);
  return { tabCount: tabs.length, tabs, switcherCount: switcher, btns };
});
console.log(JSON.stringify(info,null,2));
await b.close();
