# Native BI Adapter - Renderer-Only Architecture

> Status: G5 complete, 2026-05-21. The adapter is loadable and guarded; the visualization pipeline, Databricks source refs, proxy governance attestations, native fail-closed gate, React/ECharts canvas, and author-facing `auto/native/vendor` BI surface switch are shipped. Native T2 fusion-lite is queued for G6.

## Decision

PulsePlay will ship a `native` BI adapter beside the vendor adapters (`powerbi`, `tableau`, `qlik`, `looker`, `generic-iframe`). The native adapter is a renderer only: the AI result is the canvas, and the adapter renders that result as a chart or table.

The native adapter is not a BI authoring product. It does not model datasets, execute queries, manage permissions, save dashboards, cross-filter visuals, or provide drag layout. Those are hard non-goals enforced by code, tests, and import boundaries.

## Architecture

```text
AI connector / proxy response
  |
  v
AIResultEnvelope
  rows, schema, sql, structured insight payload,
  governance attestation
  |
  v
playground/src/visualization/
  aiResultEnvelope.ts
  resultToVizIntent.ts
  chartAutoPick.ts
  chartSpecValidation.ts
  ChartRenderSpec
  |
  v
bi-adapters/native/
  NativeBIAdapter.ts
  nativeCapabilities.ts
  nativeCommands.ts
  nativeEvents.ts

playground/src/visualization/
  NativeCanvas.tsx        (G4)
```

The visualization pipeline lives in `playground/src/visualization/`, not inside the adapter. The adapter receives a normalized `AIResultEnvelope` or an already validated `ChartRenderSpec`, then renders. This keeps the adapter boring and testable.

No shared monorepo package is created in v0.x. If the Pulse PBI sibling needs the same pure logic, it copy-ports Tier 1 modules through `docs/PULSE_SYNC.md`. A package earns its keep only after real reuse pressure appears.

## BIAdapter Surface

The native adapter still satisfies the existing `BIAdapter` contract.

G1 `mount(container, config)` created a lightweight DOM empty state and proved the adapter lifecycle. G4 replaced this with the React/ECharts `NativeCanvas` mounted from `playground/src/visualization/` so React/ECharts resolve from the playground runtime while `bi-adapters/native/*.ts` stays plain TypeScript.

`send(command)` accepts only renderer commands:

- `renderResult`
- `renderSpec`
- `clear`
- `setTheme`
- `resize`

Unsupported commands are rejected, including:

- `setFilter`
- `drill`
- `saveLayout`
- `executeQuery`
- `createMeasure`

`on(event, handler)` emits:

- `ready`
- `rendered`
- `error`
- `view-context`

`destroy()` unmounts and clears listeners.

## Author Switch

G5 added a deployment/session runtime choice:

```ts
type BiSurfaceMode = "auto" | "native" | "vendor";
```

Resolution:

- `native`: always mount the native adapter.
- `vendor`: mount the configured vendor adapter; surface configuration error if none is configured.
- `auto`: prefer configured vendor; fall back to native when no vendor config exists.

The UI belongs in the existing BI surface picker as another card, not in a separate settings island. Native should read as "Native result canvas" and explain that it renders AI query results directly.

Current implementation: `biVendor` is still the author's vendor/config intent. `biSurfaceMode` is persisted separately under `pulseplay:bi-surface-mode`; the shell derives `runtimeBiVendor` from mode + vendor + embed config and emits requested/runtime telemetry attributes. Settings -> BI, Quick Setup, and v0 mode expose compact Auto/Vendor/Native controls. Vendor config is preserved when native is forced.

Switching between native and vendor remounts the BI adapter. The host keeps the AI conversation and latest/pinned result state, then feeds the current result into native after mount. No hot-swap bridge.

## Latest Result vs Pinned Result

Native renders the latest renderable AI result by default.

Ask Pulse history needs an explicit "Pin to canvas" affordance. Pinning a result makes that result the native canvas until the user unpins or pins another result. Newer questions still appear in the AI timeline, but they do not replace the canvas while a pin is active.

State ownership:

- Latest result: host conversation/result store.
- Pinned result id: host layout/result state.
- Native adapter: receives the selected result/spec, renders it, and emits view context.

The adapter does not own result history.

## Empty, Loading, Error

Native needs first-class states:

- Empty: "Ask Pulse a question to see results here" with an inline suggested-question chip.
- Loading: reserve the chart frame and show query/progress metadata when available.
- Render blocked: missing governance attestation, invalid chart spec, unsupported chart type, or no renderable rows.
- Error: adapter/runtime failure with support code when available.

These states are native-specific but should reuse the existing PulsePlay surface vocabulary so native and vendor dashboards feel like the same product family.

## Theme

Native should react to Preferences -> Appearance changes through CSS variables and the existing theme event flow. `setTheme` remains an adapter command for explicit host messages and tests, but normal theme updates should be automatic through `--pp-*` and `--gn-*` variables.

## Governance Contract

Rows reaching native must already reflect backend access control. The adapter does not filter rows or columns.

Every renderable row payload must carry:

```ts
governance: {
  enforced: true;
  authority: "unity-catalog" | "powerbi-semantic-model" | "warehouse" | "mock";
  subjectRef: string;
  requestId: string;
  rowLimitApplied?: number;
  columnPolicyApplied?: boolean;
}
```

Production native rendering fails closed when `governance.enforced !== true` or the attestation is missing. Dev/mock can render only with an explicit non-production state.

If the backend is misconfigured but still attests `enforced: true`, the frontend cannot repair that. The adapter trusts the proxy boundary once attested.

## Enforcement

Renderer-only is enforced in three layers:

1. Adapter capabilities:

```ts
{
  authoring: false,
  dragLayout: false,
  crossFilter: false,
  drill: false,
  semanticModeling: false,
  liveRefresh: false,
  permissions: false,
  queryExecution: false,
  persistence: false
}
```

2. Runtime command rejection. Unsupported commands reject and emit an adapter error. G1 tests cover BI commands and explicit drift commands such as `executeQuery`, `saveLayout`, and `createMeasure`.

3. CI boundaries. Contract tests prove forbidden commands stay rejected. G1 ships a Vitest import-boundary guard for `bi-adapters/native/**` so the adapter cannot import query clients, warehouse clients, vendor SDKs, drag/drop libraries, permission UI, or authoring/settings modules. A future ESLint `no-restricted-imports` rule can mirror this once the repo adopts ESLint for playground code.

## Pulse PBI Relationship

Pulse PBI benefits through the proxy and copy-portable pure modules, not a shared package.

Portable:

- `chartAutoPick.ts`
- `aiResultEnvelope.ts`
- `resultToVizIntent.ts`
- `chartSpecValidation.ts`
- `AIResultEnvelope`
- `ChartRenderSpec`
- governance attestation shape

Not portable:

- `NativeCanvas.tsx`
- native adapter capabilities
- PulsePlay-specific host UI and renderer wiring

Pulse PBI gets governance attestation fields automatically once the proxy emits them because it already uses the proxy. It does not get fail-closed rendering automatically; that remains a Pulse PBI adoption choice.

## BI-Tool Drift Tripwires

The native adapter starts becoming a lightweight BI product if a PR adds:

- draggable chart handles or grid layout
- saved layout/dashboard persistence
- cross-filtering or drill wires between visuals
- calculated fields, measure editors, or dataset modeling
- permissions, sharing, or RLS UI in the renderer
- scheduled/live refresh owned by the adapter

These are not "maybe later" features. They are scope-change tripwires and require an explicit direction shift.

## Native T2 Fusion

Native is the canonical PulsePlay T2 demo because both the chart and commentary are in-process. Power BI fusion remains handled by the Pulse PBI sibling as the vendor-specific flavor.

First slice: fusion-lite. Render one chart plus docked AI commentary cards bound to the same result id. Later, ECharts mark geometry can support anchored annotations. Multiple independent charts, saved layouts, and cross-filtering remain out of scope.

## Build Track

- G0: shipped. Architecture docs, ADR, Pulse sync ledger, agenda/memory updates.
- G1: shipped. Adapter skeleton, capabilities, command rejection tests, import-boundary guard, registry loadability, no-embed readiness.
- G2: `playground/src/visualization/` pipeline MVP and chart-pick extraction.
- G3: governance attestation contract across proxy backend paths and native fail-closed test. **Shipped 2026-05-21.**
- G4: native canvas plus ECharts MVP. **Shipped 2026-05-21.**
- G5: BI surface author switch (`auto/native/vendor`). **Shipped 2026-05-21.**
- G6: native T2 fusion-lite.
