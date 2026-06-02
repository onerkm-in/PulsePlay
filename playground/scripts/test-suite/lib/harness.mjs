// PulsePlay observable UI test harness — shared library.
//
// Goal: a watchable (headed) browser test module that walks every feature x
// connector x surface x theme x palette x preset, screenshots each state, and
// captures BOTH functional errors (console/page/network) AND aesthetic issues
// (white-in-dark, low contrast, horizontal overflow, clipped/overlapping text,
// empty surfaces). Produces a consolidated JSON + Markdown report.
//
// This file is connector/surface-agnostic plumbing. Area tests live in
// ../areas/*.mjs and the orchestrator is ../run.mjs.

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const BASE = "http://127.0.0.1:7001";

export const CONNECTORS = {
  default:        { label: "Genie (default)",          vendor: "powerbi", kind: "genie" },
  "powerbi-dwd":  { label: "Power BI semantic-model",  vendor: "powerbi", kind: "deterministic" },
  foundation:     { label: "Foundation Model",         vendor: "powerbi", kind: "foundation" },
  supervisor:     { label: "Supervisor (local)",       vendor: "powerbi", kind: "supervisor" },
};

export const SURFACES = ["ai-insights", "ask-pulse", "dashboard"];

// Settings → Appearance theme ids (PreferencesAppearance.tsx)
export const THEMES = ["default", "corporate-blue", "forest", "slate-dark", "high-contrast"];
// On-chart palettes (chartPalettes.ts)
export const PALETTES = ["vibrant", "cool", "warm", "pastel", "earthy", "bold"];
// Layout presets (layoutPresets.ts)
export const PRESETS = ["balanced", "split-mix", "bi-focus", "insights-focus", "ask-focus"];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Severity ranking for findings. */
export const SEV = { CRIT: "CRITICAL", WARN: "WARNING", INFO: "INFO" };

export class Harness {
  constructor(opts = {}) {
    this.headed = !!opts.headed;
    this.slowMo = opts.headed ? (opts.slowMo ?? 180) : 0;
    this.outDir = opts.outDir;
    this.findings = [];   // { area, severity, title, detail, shot }
    this.steps = [];      // { area, name, shot, ms }
    this.browser = null;
    this.ctx = null;
    this.page = null;
    this._consoleErrs = [];
    this._pageErrs = [];
    this._netFails = [];
  }

  async start() {
    await mkdir(this.outDir, { recursive: true });
    this.browser = await chromium.launch({ headless: !this.headed, slowMo: this.slowMo, args: ["--window-size=1500,1000"] });
    this.ctx = await this.browser.newContext({ viewport: { width: 1400, height: 950 } });
    this.page = await this.ctx.newPage();
    const p = this.page;
    p.on("console", (m) => { if (m.type() === "error") this._consoleErrs.push(m.text().slice(0, 240)); });
    p.on("pageerror", (e) => this._pageErrs.push(String(e?.message || e).slice(0, 240)));
    p.on("requestfailed", (r) => { const u = r.url(); if (u.includes("/api/")) this._netFails.push(`${r.failure()?.errorText || "?"} ${u.replace(BASE, "").slice(0, 90)}`); });
    p.on("response", (r) => { const u = r.url(); if (u.includes("/api/") && r.status() >= 400) this._netFails.push(`HTTP ${r.status()} ${u.replace(BASE, "").slice(0, 90)}`); });
  }

  /** Drain captured runtime errors since last drain (so findings attribute to the right area). */
  drainRuntimeErrors() {
    const out = { console: [...new Set(this._consoleErrs)], page: [...new Set(this._pageErrs)], net: [...new Set(this._netFails)] };
    this._consoleErrs = []; this._pageErrs = []; this._netFails = [];
    return out;
  }

  finding(area, severity, title, detail = "", shot = "") {
    this.findings.push({ area, severity, title, detail: String(detail).slice(0, 400), shot });
    const tag = severity === SEV.CRIT ? "✗" : severity === SEV.WARN ? "⚠" : "·";
    console.log(`    ${tag} [${severity}] ${title}${detail ? " — " + String(detail).slice(0, 120) : ""}`);
  }

  /** On-screen banner so a human watching the headed browser knows what's running. */
  async banner(text, color = "#2563eb") {
    try {
      await this.page.evaluate(({ text, color }) => {
        let el = document.getElementById("__pp_test_banner");
        if (!el) {
          el = document.createElement("div");
          el.id = "__pp_test_banner";
          el.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:6px 14px;font:600 13px/1.4 system-ui,sans-serif;color:#fff;text-align:center;pointer-events:none;box-shadow:0 1px 6px rgba(0,0,0,.3);transition:background .2s";
          document.body.appendChild(el);
        }
        el.style.background = color;
        el.textContent = "🧪 " + text;
      }, { text, color });
    } catch { /* page may be navigating */ }
  }

  async shot(name) {
    const file = `${name}.png`;
    await this.page.screenshot({ path: join(this.outDir, file), fullPage: false }).catch(() => {});
    console.log(`    📸 ${file}`);
    return file;
  }

  /** Seed vendor/connector/theme/palette/preset into localStorage, then load a surface. */
  async configure({ connector, vendor, surface = "ai-insights", theme, dark, palette, preset } = {}) {
    await this.page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await this.page.evaluate((o) => {
      try { localStorage.clear(); } catch { /* */ }
      if (o.vendor) localStorage.setItem("pulseplay:bi-vendor", o.vendor);
      if (o.connector) localStorage.setItem("pulseplay:active-ai-profile", o.connector);
      localStorage.setItem("pulseplay:default-landing-surface", o.surface || "ai-insights");
      const k = "pulseplay:visual-settings:genieSettings";
      const ex = JSON.parse(localStorage.getItem(k) || "{}");
      if (o.connector) ex.assistantProfile = o.connector;
      ex.connectionMode = "proxy";
      ex.apiBaseUrl = location.origin + "/api";
      if (o.theme) ex.themeName = o.theme;
      if (typeof o.dark === "boolean") ex.darkMode = o.dark;
      localStorage.setItem(k, JSON.stringify(ex));
      if (o.dark) localStorage.setItem("pulseplay:theme-mode", "dark");
      if (o.palette) localStorage.setItem("pulseplay:chart-palette", o.palette);
    }, { connector, vendor, surface, theme, dark, palette, preset });
    const url = `${BASE}/?surface=${surface || "ai-insights"}`;
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await sleep(1500);
  }

  /** Run all aesthetic scanners against the current DOM; record findings. */
  async scanAesthetics(area, { dark = false } = {}) {
    const res = await this.page.evaluate((dark) => {
      const out = { whiteInDark: [], lowContrast: [], overflowX: false, clipped: [], emptyMain: false };
      const lum = (r, g, b) => { const a = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
      const parse = (c) => { const m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
      // horizontal overflow at document level
      out.overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      const all = [...document.querySelectorAll("body *")].slice(0, 4000);
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        const st = getComputedStyle(el);
        const bg = parse(st.backgroundColor);
        // white-in-dark: a large opaque near-white surface while dark mode is on
        if (dark && bg && bg.a > 0.9) {
          const L = lum(bg.r, bg.g, bg.b);
          if (L > 0.85 && r.width * r.height > 12000) {
            const sig = (el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 2).join(".") : el.tagName.toLowerCase());
            out.whiteInDark.push(`${sig} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        // low contrast: visible text vs its own background. Skip when a
        // gradient/image background is in play — backgroundColor is transparent
        // there so the luminance can't be computed reliably (was producing
        // false 1.0:1 hits on gradient tab/button chrome).
        const txt = (el.childNodes && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
        if (txt && st.backgroundImage === "none") {
          const fg = parse(st.color);
          let bgEl = el, bgc = parse(st.backgroundColor), gradient = false;
          let guard = 0;
          while (bgEl && (!bgc || bgc.a < 0.5) && guard++ < 6) {
            bgEl = bgEl.parentElement;
            if (bgEl) { const cs = getComputedStyle(bgEl); if (cs.backgroundImage !== "none") { gradient = true; break; } bgc = parse(cs.backgroundColor); }
          }
          if (!gradient && fg && bgc && bgc.a >= 0.5) {
            const L1 = lum(fg.r, fg.g, fg.b), L2 = lum(bgc.r, bgc.g, bgc.b);
            const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            const fs = parseFloat(st.fontSize) || 14;
            const min = fs >= 24 || (fs >= 18 && (st.fontWeight | 0) >= 700) ? 3 : 4.5;
            if (ratio < min - 0.2) {
              const t = (el.textContent || "").trim().slice(0, 24);
              out.lowContrast.push(`"${t}" ${ratio.toFixed(1)}:1 (need ${min})`);
            }
          }
        }
        // clipped text: content wider than box with hidden overflow
        if (txt && (st.overflow === "hidden" || st.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 30) {
          const t = (el.textContent || "").trim().slice(0, 24);
          if (t) out.clipped.push(`"${t}"`);
        }
      }
      // de-dup
      out.whiteInDark = [...new Set(out.whiteInDark)].slice(0, 12);
      out.lowContrast = [...new Set(out.lowContrast)].slice(0, 12);
      out.clipped = [...new Set(out.clipped)].slice(0, 10);
      return out;
    }, dark);

    if (dark && res.whiteInDark.length) this.finding(area, SEV.CRIT, "White surface in dark mode", res.whiteInDark.join(" | "));
    if (res.lowContrast.length) this.finding(area, SEV.WARN, "Low text contrast", res.lowContrast.slice(0, 6).join(" | "));
    if (res.overflowX) this.finding(area, SEV.WARN, "Horizontal overflow at page level", `scrollWidth>clientWidth`);
    if (res.clipped.length) this.finding(area, SEV.INFO, "Clipped/truncated text", res.clipped.join(" | "));
    return res;
  }

  async report(meta = {}) {
    const bySev = (s) => this.findings.filter((f) => f.severity === s);
    const summary = { crit: bySev(SEV.CRIT).length, warn: bySev(SEV.WARN).length, info: bySev(SEV.INFO).length, total: this.findings.length };
    const payload = { meta, summary, findings: this.findings, steps: this.steps };
    await writeFile(join(this.outDir, "report.json"), JSON.stringify(payload, null, 2));

    const lines = [];
    lines.push(`# PulsePlay UI Test Module — Report`);
    lines.push(``);
    lines.push(`- Run: ${meta.runId || ""}`);
    lines.push(`- Areas: ${(meta.areas || []).join(", ")}`);
    lines.push(`- Findings: **${summary.crit} critical**, ${summary.warn} warnings, ${summary.info} info`);
    lines.push(``);
    for (const sev of [SEV.CRIT, SEV.WARN, SEV.INFO]) {
      const fs = bySev(sev);
      if (!fs.length) continue;
      lines.push(`## ${sev} (${fs.length})`);
      for (const f of fs) lines.push(`- **${f.area}** — ${f.title}${f.detail ? `: ${f.detail}` : ""}${f.shot ? ` _(see ${f.shot})_` : ""}`);
      lines.push(``);
    }
    lines.push(`## Steps (${this.steps.length})`);
    for (const s of this.steps) lines.push(`- ${s.area} · ${s.name}${s.shot ? ` → ${s.shot}` : ""}${s.ms != null ? ` (${s.ms}ms)` : ""}`);
    await writeFile(join(this.outDir, "REPORT.md"), lines.join("\n"));
    console.log(`\n=== REPORT: ${summary.crit} critical · ${summary.warn} warn · ${summary.info} info → ${this.outDir} ===`);
    return payload;
  }

  async stop() {
    if (this.headed) await sleep(1200);
    await this.ctx?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
  }
}
