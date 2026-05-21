---
name: Native BI adapter
description: Renderer-only native BI adapter architecture locked 2026-05-21; G3 governance route attestations and native fail-closed gate shipped; G4 native canvas + ECharts MVP shipped with renderSpec audit patch
type: feature
originSessionId: current
---

PulsePlay will add a `native` BI adapter beside vendor adapters. It is renderer-only: AI result in, chart/table out. It does not execute queries, author dashboards, save layouts, cross-filter, drill, model data, or own permissions/RLS/OLS.

The result pipeline lives outside the adapter in `playground/src/visualization/`: `aiResultEnvelope.ts`, `resultToVizIntent.ts`, `chartAutoPick.ts`, and `chartSpecValidation.ts`. The adapter receives `renderResult` or `renderSpec` commands and rejects non-renderer commands.

G1 shipped `bi-adapters/native/` as a loadable skeleton: `NativeBIAdapter`, `nativeCapabilities`, `nativeCommands`, `nativeEvents`, registry wiring, no-embed readiness handling, and tests proving hard non-goals. G3 shipped proxy attestations across renderable backend paths plus a native fail-closed render gate. G4 shipped the React/ECharts native canvas in `playground/src/visualization/NativeCanvas.tsx`: attested AI result envelopes render as empty/text/table/KPI/chart states, and `renderSpec` now validates/compiles inline portable specs instead of only acknowledging the command.

Author switch: `biSurfaceMode: "auto" | "native" | "vendor"`. `auto` prefers a configured vendor and falls back to native when no vendor config exists. Switching remounts the BI adapter; the host keeps latest/pinned result state.

Governance: renderable payloads must include `governance.enforced === true`. Missing attestation blocks native rendering in production. The frontend trusts the proxy once attested; backend/data-layer misconfiguration cannot be repaired in the adapter.

G-track:

- G0 docs/ADR/sync ledger.
- G1 adapter skeleton and capabilities. Shipped 2026-05-21 (`48d966a`).
- G2 visualization pipeline MVP.
- G4 native canvas and ECharts MVP. Shipped 2026-05-21 (`5e2a420`) with follow-up renderSpec audit patch.
- G5 author switch/card.
- G6 native T2 fusion-lite.
