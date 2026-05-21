# ADR-0009 - Native BI Adapter Is a Renderer Only

**Status:** Accepted 2026-05-21

**Date:** 2026-05-21

## Context

PulsePlay's BI axis currently hosts vendor surfaces through `BIAdapter`: Power BI, Tableau, Qlik, Looker, Databricks AI/BI, Databricks Genie, and generic iframe adapters. The product direction now requires one more BI surface option: a native renderer for AI query results.

This is tempting to grow into a lightweight dashboarding product. That would be the wrong product. PulsePlay is an orchestration and experience layer. It does not build a semantic model, governance plane, or BI authoring surface.

The native adapter exists because many AI connector paths already return SQL plus rows or structured insight payloads. When the author has no vendor dashboard configured, or intentionally chooses a direct result canvas, PulsePlay needs to render the AI answer without pretending a BI tool exists.

## Decision

Add a `native` BI adapter as a renderer-only adapter. It implements `BIAdapter`, but it does not fetch data, execute queries, filter data, own permissions, or author dashboards.

The data path is:

1. Proxy/assistant returns an `AIResultEnvelope` with rows/schema/SQL or structured insight payload plus governance attestation.
2. `playground/src/visualization/` normalizes the envelope, picks chart intent, validates a serializable `ChartRenderSpec`, and chooses the runtime renderer.
3. `bi-adapters/native/` receives a render command and paints the result.

The adapter rejects commands outside the renderer vocabulary. Host UI reads `nativeCapabilities` and refuses to mount controls that the adapter says it cannot support.

## Consequences

Positive:

- PulsePlay can show useful BI canvas output even without a vendor dashboard.
- The adapter remains testable because chart selection and validation live outside it.
- The same pure chart-pick and result-envelope logic can be copy-ported to Pulse PBI without forcing a shared package.
- Governance is explicit in the payload contract instead of implied by hope.

Negative:

- We need a new visualization pipeline module family before the adapter can be useful.
- There is duplicated process work with Pulse PBI until a future shared package is justified.
- The frontend can fail closed on missing attestation, but it cannot detect a backend that falsely attests filtered rows.

## Governance Contract

The native adapter trusts rows only after the proxy attaches `governance.enforced === true`. In production, missing attestation blocks rendering. In dev/mock, rendering must show an explicit non-production state.

Every proxy backend path that can return renderable rows must have a test proving it attaches governance attestation. Native must have a fail-closed test for production mode plus missing attestation.

## Non-Goals

The native adapter does not support:

- authoring
- drag layout
- saved dashboards
- cross-filtering
- drill navigation
- semantic modeling
- live refresh
- sharing or permissions
- renderer-side RLS/OLS
- query execution

These are enforced by capabilities, command rejection, restricted imports, and contract tests.

## Pulse PBI Sync

Do not create `packages/viz-core` in v0.x. Keep pure modules in `playground/src/visualization/` and track copy-port status in `docs/PULSE_SYNC.md`.

Pulse PBI automatically receives governance attestation fields once the proxy emits them because it already consumes the proxy. Pulse PBI must still opt into any fail-closed rendering behavior itself.

## Related

- [Native BI Adapter feature spec](../feature_native_adapter.md)
- [Pulse PBI sync ledger](../PULSE_SYNC.md)
- [ADR-0008 - Unified Assistant Surface](0008-unified-assistant-surface.md)
- [BIAdapter contract](../../playground/src/biPanel/BIAdapter.ts)

