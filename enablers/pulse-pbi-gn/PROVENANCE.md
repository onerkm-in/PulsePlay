# PulsePlay AI for Power BI — provenance & architecture

**What this is.** The Power BI custom-visual (`.pbiviz`) enabler, **built from PulsePlay's live `pulse` brain** — not a fork, not a snapshot. The source of truth is [`playground/src/pulse`](../../playground/src/pulse). This folder is the thin **PBI packaging shell** that wraps that brain into a `.pbiviz`.

**Why it exists.** The previously-run visual (`genieChatVisual`, "UniBridge AI for Power BI") lived in an external repo and froze 2026-05-10, drifting a month behind PulsePlay's web Ask Pulse / AI Insights (e.g. the upgraded "Adjust" dropdown). This enabler ends that drift: it packages whatever is current in `playground/src/pulse`, so the visual stays in lockstep with PulsePlay.

## How the brain becomes a .pbiviz

`playground/src/pulse/visual.tsx` already exports `class Visual implements IVisual` (constructor / update / getFormattingModel / destroy) — it *is* a Power BI visual, made browser-runnable via thin `_adapter/` stubs for the PBI SDK. This shell flips those seams the other way:

| Seam (in PulsePlay) | Web app | This .pbiviz build |
|---|---|---|
| `import "powerbi-visuals-api"` | tsconfig alias → `_adapter` type stub | **no alias → real npm `powerbi-visuals-api`** |
| `import "...formattingmodel"` | `_adapter` stub | **real `powerbi-visuals-utils-formattingmodel`** |
| `PulseHostStub` | browser host impl | the real `IVisualHost` PBI provides |
| heavy web-only cross-tree imports (`../lib/buildEChartsOption`, `../components/workbench/EChartsRenderer`, `../visualization/translators`, perf instrumentation, surface connectors, …) | full web modules | **sandbox stubs** (lighter chart render; no Web Workers / SSE) to fit the ~350 KB cap + XHR-only sandbox |

`src/` and `style/` here are **generated** by `scripts/sync-from-pulseplay.mjs` (gitignored — never hand-edited). The build is `npm run sync` → `pbiviz package`.

## Identity

`pbiviz.json` keeps **`name: dwdForBI` + `guid: genieChatVisual87799…`** (same as the prior build) so re-importing the produced `.pbiviz` **updates the visual in place** in Power BI Desktop — no re-binding. Only `displayName`/`description`/`version` change to PulsePlay branding (v2.1.0.0). `capabilities.json` is committed (the data-role + settings + WebAccess manifest) and must track `playground/src/pulse/settings.ts`.

## Status (Phase 1)

- [x] Manifest + build config (`pbiviz.json`, `package.json`, `tsconfig.json`, `.gitignore`)
- [ ] `capabilities.json` (baseline from the prior build, reconciled to current `settings.ts`)
- [ ] `scripts/sync-from-pulseplay.mjs` (copy brain + resolve/stub cross-tree imports)
- [ ] First `pbiviz package` — verify it builds, **fits ≤350 KB**, AI Insights renders, "Adjust" dropdown present, scroll works in the sandbox
- [ ] Retire the unused `.rx-*` `enablers/pulse-pbi` once this is proven

**Preserves** the AI Insights sections you're satisfied with (same `.gn-*` code) and **brings** the upgraded "Adjust" dropdown — because both live in the current `playground/src/pulse`.
