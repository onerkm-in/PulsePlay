#!/usr/bin/env node
// sync-from-pulseplay.mjs — materialize a .pbiviz-buildable src/ from the LIVE
// PulsePlay pulse brain. No copy lives in git; this regenerates it each build.
//
//   1. clean src/ + style/
//   2. copy playground/src/pulse/** -> src/**  (skip __tests__ only; the
//      _adapter SDK type-stubs ARE copied — some brain files import them by
//      relative path, while bare `powerbi-visuals-api` resolves to the real SDK)
//   3. rewrite cross-tree imports  ../{lib,components,visualization,features,
//      multipane,settings,featureFlags}  ->  ./_ext/...
//   4. write sandbox stubs under src/_ext/ for those cross-tree modules
//   5. copy the stylesheet
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const enabler = resolve(here, "..");
const repo = resolve(enabler, "..", "..");
const pulseSrc = join(repo, "playground", "src", "pulse");
const outSrc = join(enabler, "src");
const outStyle = join(enabler, "style");

rmSync(outSrc, { recursive: true, force: true });
rmSync(outStyle, { recursive: true, force: true });
mkdirSync(outSrc, { recursive: true });
mkdirSync(outStyle, { recursive: true });

const SKIP = new Set(["__tests__"]);
let copied = 0;
function walk(dir, rel = "") {
  for (const name of readdirSync(dir)) {
    const relPath = rel ? `${rel}/${name}` : name;
    if (SKIP.has(relPath) || SKIP.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) { walk(abs, relPath); continue; }
    if (relPath.endsWith(".test.ts") || relPath.endsWith(".test.tsx")) continue;
    if (name === "style") continue;
    const dest = join(outSrc, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, redirectCrossTree(readFileSync(abs, "utf8"), relPath));
    copied++;
  }
}
function redirectCrossTree(txt, relPath) {
  const depth = relPath.split("/").length - 1;
  const escape = "(?:\\.\\./){" + (depth + 1) + "}";
  const extDirs = "(lib|components|visualization|features|multipane|settings|featureFlags)";
  const toExtPrefix = "./" + "../".repeat(depth) + "_ext/";
  const re = new RegExp("((?:from|import)\\s+['\"])" + escape + extDirs, "g");
  return txt.replace(re, (_m, p1, d) => p1 + toExtPrefix + d);
}
walk(pulseSrc);
cpSync(join(pulseSrc, "style", "visual.less"), join(outStyle, "visual.less"));

// ── sandbox stubs ─────────────────────────────────────────────────────────
const ext = join(outSrc, "_ext");
mkdirSync(ext, { recursive: true });
const stub = (p, body) => { const f = join(ext, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body); };

stub("lib/renderMarkdown.tsx", `import * as React from "react";
export function renderMarkdown(md: any): any {
  if(!md) return null;
  const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const h=esc(String(md))
    .replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>")
    .replace(/\\*([^*]+)\\*/g,"<em>$1</em>")
    .replace(/\\\`([^\\\`]+)\\\`/g,"<code>$1</code>")
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/^\\s*[-*]\\s+(.*)$/gm,"<li>$1</li>")
    .replace(/(<li>[\\s\\S]*?<\\/li>)/g,"<ul>$1</ul>")
    .split(/\\n{2,}/).map(b=>/^<(ul|li|h\\d)/.test(b.trim())?b:"<p>"+b.replace(/\\n/g,"<br/>")+"</p>").join("");
  return React.createElement("div",{className:"gn-md",dangerouslySetInnerHTML:{__html:h}});
}
export default renderMarkdown;
`);

stub("lib/computeSurfaceContext.ts", `export function computeSurfaceContext(...a: any[]): any {
  const input = a[0] || {};
  const isConfigured = !!input.isConfigured;
  return { trustTone: isConfigured ? "medium" : "low", trustLabel: isConfigured ? "Source-grounded" : "Not configured",
    mode: input.mode || "Conversation", assistantProfile: input.assistantProfile || "", evidence: [], scopeText: input.scopeText || "" };
}
export default computeSurfaceContext;
`);

stub("lib/perfInstrumentation.ts", `export function stageStart(...a: any[]): any {}
export function stageEnd(...a: any[]): any {}
export function resetRun(...a: any[]): any {}
export function dumpRun(...a: any[]): any {}
`);

stub("lib/buildEChartsOption.ts", `export function buildEChartsOption(...a: any[]): any { return null; }
export default buildEChartsOption;
`);

stub("lib/chartPalettes.ts", `export const CHART_PALETTE_EVENT = "pulseplay:chart-palette";
export const CHART_PALETTES: any[] = [{ id:"default", label:"Default", colors:["#2563eb","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6"] }];
let _active = "default";
export function getActivePaletteId(): string { return _active; }
export function applyChartPalette(...a: any[]): any { _active = a[0]; }
`);

stub("lib/canvasTiles.ts", `export function addCanvasTile(...a: any[]): any { return false; }
`);

stub("components/workbench/EChartsRenderer.tsx", `import * as React from "react";
export function EChartsRenderer(props: any): any {
  const rows = (props && props.rows) || [];
  if(!rows.length) return React.createElement("div",{className:"gn-chart-empty"},"No chart data.");
  const vals = rows.map((r:any)=>Number(Array.isArray(r)?r[r.length-1]:r&&r.value)||0);
  const max = Math.max(1,...vals.map(Math.abs));
  return React.createElement("div",{className:"gn-svg-chart"},
    React.createElement("svg",{width:"100%",height:160,viewBox:"0 0 "+(vals.length*32)+" 160",preserveAspectRatio:"none"},
      vals.map((v:number,i:number)=>React.createElement("rect",{key:i,x:i*32+4,y:160-(Math.abs(v)/max*150),width:24,height:(Math.abs(v)/max*150),fill:"#2563eb"}))));
}
export default EChartsRenderer;
`);

stub("visualization/ChartRationalePill.tsx", `import * as React from "react";
export function ChartRationalePill(props: any): any {
  const why = props && (props.rationale || props.why);
  if(!why) return null;
  return React.createElement("span",{className:"gn-why-chart",title:String(why)},"Why this chart?");
}
export default ChartRationalePill;
`);

stub("visualization/translators/index.ts", `export function resolveChartSpec(...a: any[]): any { return null; }
`);

stub("visualization/chartIR.ts", `export function irMarkToChartKind(...a: any[]): any { return "bar"; }
export type ChartIR = any;
`);

stub("visualization/chartAutoPick.ts", `export function detectViewIntent(...a: any[]): any { return "auto"; }
export function formatCellForTooltip(...a: any[]): any { return String(a[0] ?? ""); }
export function formatChartDate(...a: any[]): any { return String(a[0] ?? ""); }
export function isRankOrIndexColumn(...a: any[]): any { return false; }
export function analyzeDataShape(...a: any[]): any { return {}; }
export const CHART_OPTIONS: any[] = [];
export type ChartKind = any; export type ChartSeriesPoint = any; export type ClusteredSeriesPoint = any;
export type DataShape = any; export type ForcedViewMode = any; export type ViewIntent = any;
`);

stub("features/config/useAskPulseHomeMeta.ts", `export function useAskPulseHomeMeta(...a: any[]): any {
  return { data: null, meta: null, loading: false, error: null };
}
export default useAskPulseHomeMeta;
`);

stub("multipane/surfaceConnectors.ts", `export const SURFACE_CONNECTORS_EVENT = "pulseplay:surface-connectors";
export function getSurfaceProfile(...a: any[]): any { return null; }
`);

stub("featureFlags.ts", `export const FEATURE_FLAGS_EVENT = "pulseplay:feature-flags";
`);

stub("settings/performanceLevers.ts", `export const PERFORMANCE_LEVERS_EVENT = "pulseplay:performance-levers";
export type PerformanceLevers = any;
export function loadPerformanceLevers(...a: any[]): any { return {}; }
export function getBackendStagingFromCadence(...a: any[]): any { return undefined; }
`);

stub("settings/pulseVisualSettingsStore.ts", `export function writePulseAiVisualSettingsPatch(...a: any[]): any {}
`);

console.log("[sync] copied " + copied + " brain files + " + readdirSync(ext).length + " _ext stub groups");
