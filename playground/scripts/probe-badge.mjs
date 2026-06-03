import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:7001";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lum = (r,g,b)=>{const a=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];};
const ratio=(c1,c2)=>{const L1=lum(...c1),L2=lum(...c2);const a=Math.max(L1,L2),b=Math.min(L1,L2);return (a+0.05)/(b+0.05);};
const parse=(s)=>s.match(/\d+(\.\d+)?/g).map(Number).slice(0,3);
const browser = await chromium.launch({ headless: true });
for (const dark of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:25000 });
  await page.evaluate((dark) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("pulseplay:bi-vendor","native");
    localStorage.setItem("pulseplay:active-ai-profile","default");
    if (dark) localStorage.setItem("pulseplay:theme-mode","dark");
    const k="pulseplay:visual-settings:genieSettings";
    const ex=JSON.parse(localStorage.getItem(k)||"{}");
    ex.assistantProfile="default"; ex.connectionMode="proxy"; ex.apiBaseUrl=location.origin+"/api";
    if (dark) ex.darkMode = true;
    localStorage.setItem(k, JSON.stringify(ex));
  }, dark);
  await page.goto(`${BASE}/?surface=dashboard`, { waitUntil:"domcontentloaded", timeout:25000 });
  await sleep(2500);
  const info = await page.evaluate(() => {
    const b = document.querySelector(".gn-surface-context__badge");
    if (!b) return null;
    const cs = getComputedStyle(b);
    let el=b, bg="rgba(0,0,0,0)";
    while(el){ const c=getComputedStyle(el).backgroundColor; if(c&&!/rgba?\(0, 0, 0, 0\)|transparent/.test(c)){bg=c;break;} el=el.parentElement; }
    return { text: cs.color, backdrop: bg, label: b.textContent };
  });
  if (info) console.log(`${dark?"DARK ":"LIGHT"}: "${info.label}" text=${info.text} backdrop=${info.backdrop} ~${ratio(parse(info.text),parse(info.backdrop)).toFixed(1)}:1`);
  else console.log(`${dark?"DARK":"LIGHT"}: no badge`);
  await ctx.close();
}
await browser.close();
