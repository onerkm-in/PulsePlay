---
name: Native BI adapter
description: Renderer-only native BI adapter architecture locked 2026-05-21; native renders AI query results, governance stays behind proxy/data layer, and BI authoring scope is explicitly out
type: feature
originSessionId: current
---

PulsePlay will add a `native` BI adapter beside vendor adapters. It is renderer-only: AI result in, chart/table out. It does not execute queries, author dashboards, save layouts, cross-filter, drill, model data, or own permissions/RLS/OLS.

The result pipeline lives outside the adapter in `playground/src/visualization/`: `aiResultEnvelope.ts`, `resultToVizIntent.ts`, `chartAutoPick.ts`, and `chartSpecValidation.ts`. The adapter receives `renderResult` or `renderSpec` commands and rejects non-renderer commands.

Author switch: `biSurfaceMode: "auto" | "native" | "vendor"`. `auto` prefers a configured vendor and falls back to native when no vendor config exists. Switching remounts the BI adapter; the host keeps latest/pinned result state.

Governance: renderable payloads must include `governance.enforced === true`. Missing attestation blocks native rendering in production. The frontend trusts the proxy once attested; backend/data-layer misconfiguration cannot be repaired in the adapter.

G-track:

- G0 docs/ADR/sync ledger.
- G1 adapter skeleton and capabilities.
- G2 visualization pipeline MVP.
- G3 governance attestation across proxy backend paths.
- G4 native canvas and ECharts MVP.
- G5 author switch/card.
- G6 native T2 fusion-lite.

