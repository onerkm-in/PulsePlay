// Headless runtime smoke: bundle the synced visual, mount it in jsdom with a
// mock IVisualHost + a synthetic dataView, assert it renders without throwing.
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>', { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
try { Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true }); } catch { /* node 24 navigator is read-only; jsdom window.navigator still available */ }
// Force jsdom's realm classes onto global — Node 24 ships its own Event/
// CustomEvent/EventTarget, and a cross-realm event makes window.dispatchEvent
// throw. Override unconditionally so the bundle and jsdom share one realm.
for (const k of ["HTMLElement","Element","Node","Event","CustomEvent","EventTarget","MouseEvent","KeyboardEvent","DOMParser","XMLHttpRequest","getComputedStyle","requestAnimationFrame","cancelAnimationFrame","MutationObserver","localStorage","sessionStorage","CSSStyleSheet"]) {
  if (window[k] !== undefined) { try { global[k] = window[k]; } catch { /* read-only global */ } }
}
global.ResizeObserver = window.ResizeObserver || class { observe(){} unobserve(){} disconnect(){} };
window.matchMedia = window.matchMedia || (() => ({ matches:false, media:"", addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){return false;} }));
global.matchMedia = window.matchMedia;
global.requestAnimationFrame = global.requestAnimationFrame || ((cb)=>setTimeout(()=>cb(Date.now()),0));
global.cancelAnimationFrame = global.cancelAnimationFrame || ((id)=>clearTimeout(id));
// jsdom doesn't implement layout/scroll methods the visual exercises.
for (const proto of [window.HTMLElement.prototype, window.Element.prototype]) {
  proto.scrollTo = proto.scrollTo || function(){};
  proto.scrollBy = proto.scrollBy || function(){};
  proto.scrollIntoView = proto.scrollIntoView || function(){};
}

const res = await build({
  entryPoints: ["src/visual.tsx"],
  bundle: true, format: "cjs", platform: "browser", write: false, jsx: "automatic", logLevel: "error",
  loader: { ".less":"empty", ".css":"empty", ".png":"dataurl", ".svg":"text" },
  define: { "process.env.NODE_ENV": '"production"', "global": "globalThis" },
});
const code = res.outputFiles[0].text;
const mod = { exports: {} };
new Function("module","exports","require", code)(mod, mod.exports, require);
const Visual = mod.exports.Visual || (mod.exports.default && mod.exports.default.Visual);
if (!Visual) { console.error("NO Visual export. keys:", Object.keys(mod.exports)); process.exit(1); }

const localizationManager = { getDisplayName: (s)=>s };
const host = {
  createLocalizationManager: () => localizationManager,
  persistProperties: () => {},
  applyJsonFilter: () => {},
  colorPalette: { getColor: () => ({ value: "#2563eb" }), isHighContrast: false, foreground:{value:"#111"}, background:{value:"#fff"} },
  tooltipService: { enabled:()=>false, show(){}, hide(){}, move(){} },
  eventService: { renderingStarted(){}, renderingFinished(){}, renderingFailed(){} },
  createSelectionManager: () => ({ select:()=>Promise.resolve([]), clear:()=>Promise.resolve(), getSelectionIds:()=>[], registerOnSelectCallback(){} }),
  createSelectionIdBuilder: () => ({ withCategory(){return this;}, withMeasure(){return this;}, createSelectionId:()=>({}) }),
  locale: "en-US", hostCapabilities: {}, instanceId: "smoke",
};
const element = window.document.getElementById("root");
const dataView = {
  metadata: { columns: [], objects: { genieSettings: { apiBaseUrl: "/api", assistantProfile: "foundation" } } },
  categorical: {
    categories: [{ source: { displayName: "Region", roles: { category: true } }, values: ["West","East","South"] }],
    values: Object.assign([{ source: { displayName: "Total Sales", roles: { measure: true } }, values: [100,200,300] }], { grouped: () => [] }),
  },
};

let err = null;
try {
  const v = new Visual({ element, host });
  v.update({ viewport: { width: 900, height: 600 }, dataViews: [dataView], type: 2, viewMode: 0, editMode: 0, operationKind: 0, isInFocus: false });
  await new Promise((r) => setTimeout(r, 400));
} catch (e) { err = e; }

const html = element.innerHTML || "";
console.log("\n=== SMOKE RESULT ===");
console.log("threw on mount :", err ? "YES" : "no");
if (err) console.log("  ->", (err.stack || err.message || String(err)).split("\n").slice(0, 6).join("\n  "));
console.log("child nodes    :", element.children.length);
console.log(".gn-shell      :", html.includes("gn-shell") ? "present ✓" : "ABSENT");
console.log("tabs/insights  :", /insights|ask pulse|chat/i.test(html) ? "present ✓" : "absent");
console.log("html length    :", html.length);
process.exit(err ? 1 : 0);
