// Area: cross-cutting chrome. Mobile viewport (responsive overflow + tap
// targets), the bundle switcher, BI-vendor adapters (Y axis), and detach/dock.
// Catches the responsive + vendor-panel + global-chrome class of issues the
// per-connector area doesn't exercise.

import { SEV, sleep } from "../lib/harness.mjs";

const BI_VENDORS = ["powerbi", "tableau", "qlik", "looker", "generic-iframe"];
const DESKTOP = { width: 1400, height: 950 };
const MOBILE = { width: 390, height: 844 };

export async function runChrome(h) {
  // ---- 1. Mobile viewport (390px) — responsive overflow + tappable nav ----
  await h.banner("Mobile viewport · 390px", "#db2777");
  await h.page.setViewportSize(MOBILE);
  for (const surface of ["ai-insights", "ask-pulse", "dashboard"]) {
    await h.configure({ connector: "powerbi-dwd", vendor: "powerbi", surface });
    await sleep(1500);
    const shot = await h.shot(`mobile-${surface}`);
    h.steps.push({ area: "chrome:mobile", name: surface, shot });
    const m = await h.page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      // tap targets: tab buttons should be >= ~40px high (WCAG 2.5.5-ish)
      const tabs = [...document.querySelectorAll("button, [role='tab'], a")].filter(el => {
        const t = (el.textContent || "").trim();
        return /AI Insights|Ask Pulse|Dashboard/i.test(t);
      });
      const smallTaps = tabs.filter(el => el.getBoundingClientRect().height < 32).length;
      const navReachable = tabs.some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top < window.innerHeight; });
      return { overflow, smallTaps, navReachable, tabCount: tabs.length };
    });
    if (m.overflow) h.finding("chrome:mobile", SEV.WARN, `Horizontal overflow at 390px (${surface})`, "", shot);
    if (m.tabCount > 0 && !m.navReachable) h.finding("chrome:mobile", SEV.WARN, `Primary nav not reachable at 390px (${surface})`, "", shot);
    if (m.smallTaps > 0) h.finding("chrome:mobile", SEV.INFO, `${m.smallTaps} small tap target(s) at 390px (${surface})`, "", shot);
    await h.scanAesthetics(`chrome:mobile:${surface}`, { dark: false });
  }
  await h.page.setViewportSize(DESKTOP);
  h.drainRuntimeErrors();

  // ---- 2. Bundle switcher (the global [BI ⇄ AI] chip) ----
  await h.banner("Bundle switcher", "#2563eb");
  await h.configure({ connector: "default", vendor: "powerbi", surface: "ai-insights" });
  await sleep(1500);
  const bundle = await h.page.evaluate(() => {
    const el = document.querySelector(".pp-bundle, [class*='pp-bundle']");
    return { present: !!el, text: el ? (el.textContent || "").trim().slice(0, 40) : "" };
  });
  const bundleShot = await h.shot("bundle-switcher");
  h.steps.push({ area: "chrome:bundle", name: "switcher", shot: bundleShot });
  if (!bundle.present) h.finding("chrome:bundle", SEV.WARN, "Bundle switcher chip not found", "", bundleShot);

  // ---- 3. Detach / dock (best-effort — the comparison primitive) ----
  await h.banner("Detach / dock", "#0891b2");
  const detachBtn = h.page.locator("[aria-label*='detach' i], button[title*='detach' i], button:has-text('Detach')").first();
  const hasDetach = await detachBtn.count();
  if (hasDetach) {
    await detachBtn.click().catch(() => {});
    await sleep(1200);
    const detachShot = await h.shot("detach");
    h.steps.push({ area: "chrome:detach", name: "detach", shot: detachShot });
    const crashed = await h.page.evaluate(() => /something went wrong|cannot read/i.test(document.body.innerText || ""));
    if (crashed) h.finding("chrome:detach", SEV.WARN, "Detach left the surface in an error state", "", detachShot);
    // try to re-dock
    const dock = h.page.locator("[aria-label*='dock' i], button:has-text('Dock'), button:has-text('Re-dock')").first();
    if (await dock.count()) { await dock.click().catch(() => {}); await sleep(800); }
  } else {
    h.finding("chrome:detach", SEV.INFO, "No detach control found on this surface (may be per-pane/hover)", "");
  }
  h.drainRuntimeErrors();

  // ---- 4. BI-vendor adapters (Y axis) ----
  for (const vendor of BI_VENDORS) {
    await h.banner(`BI vendor · ${vendor}`, "#16a34a");
    await h.configure({ connector: "default", vendor, surface: "dashboard" });
    await sleep(2200);
    const shot = await h.shot(`vendor-${vendor}`);
    h.steps.push({ area: "chrome:vendor", name: vendor, shot });
    const v = await h.page.evaluate(() => {
      const text = document.body.innerText || "";
      return {
        hasIframe: !!document.querySelector("iframe"),
        hasPanel: !!document.querySelector(".pp-bi-panel__container, [class*='bi-panel'], .pp-canvas, [data-tile-id]"),
        errorCard: /failed to embed|could not load|something went wrong/i.test(text),
        emptyState: /Pulse Canvas|Embedded BI|Ask Pulse can render/i.test(text),
      };
    });
    if (v.errorCard) h.finding("chrome:vendor", SEV.WARN, `${vendor}: BI panel error card`, "", shot);
    else if (!v.hasIframe && !v.hasPanel && !v.emptyState) h.finding("chrome:vendor", SEV.INFO, `${vendor}: no panel/iframe/empty-state detected`, "", shot);
    await h.scanAesthetics(`chrome:vendor:${vendor}`, { dark: false });
    h.drainRuntimeErrors();
  }
}
