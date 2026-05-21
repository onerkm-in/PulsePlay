# PulsePlay / Pulse PBI Sync Ledger

> Lightweight copy-port discipline. This is not a shared package and not hard enforcement. It makes drift visible.

## Rules

Changes to portable modules require:

1. A `sibling-sync` PR label.
2. A PR description line: `Pulse PBI copy-port: queued | done | N/A`.
3. This file updated with module version, last-synced commit, and sibling status.
4. The sibling repo takes the patch on its own cadence.

If Pulse PBI improves the same logic first, use the same flow in reverse and update this ledger when PulsePlay catches up.

## Portable Tiers

### Tier 1 - Pure Modules

Copy-port safe: no DOM, no React, no browser APIs, no fetch.

| Module | PulsePlay source | Owner side | Version | Last synced commit | Sibling status |
|---|---|---:|---:|---|---|
| chartAutoPick | `playground/src/visualization/chartAutoPick.ts` | PulsePlay | queued | N/A | queued |
| aiResultEnvelope | `playground/src/visualization/aiResultEnvelope.ts` | PulsePlay | queued | N/A | queued |
| resultToVizIntent | `playground/src/visualization/resultToVizIntent.ts` | PulsePlay | queued | N/A | queued |
| chartSpecValidation | `playground/src/visualization/chartSpecValidation.ts` | PulsePlay | queued | N/A | queued |

### Tier 2 - Shape Contracts

Zero-runtime or type-only contracts both projects should respect.

| Contract | Source | Owner side | Version | Last synced commit | Sibling status |
|---|---|---:|---:|---|---|
| AIResultEnvelope | `playground/src/visualization/aiResultEnvelope.ts` | PulsePlay | queued | N/A | queued |
| ChartRenderSpec | `playground/src/visualization/chartSpecValidation.ts` | PulsePlay | queued | N/A | queued |
| GovernanceAttestation | proxy response contract | PulsePlay proxy | queued | N/A | automatic fields after G3; fail-closed optional |

### Tier 3 - Proxy Upgrades

Pulse PBI gets these fields automatically when it calls the shared proxy.

| Upgrade | Source | Owner side | Version | Last synced commit | Sibling status |
|---|---|---:|---:|---|---|
| Every renderable backend path emits `governance.enforced` | proxy routes and tests | PulsePlay proxy | queued | N/A | automatic payload benefit after G3 |

### Tier 4 - Host-Specific

Do not copy-port as-is.

| Module | Reason |
|---|---|
| `bi-adapters/native/NativeCanvas.tsx` | React + PulsePlay host + ECharts runtime |
| `bi-adapters/native/nativeCapabilities.ts` | PulsePlay BI adapter capability surface; Pulse PBI has different constraints |
| PulsePlay layout/preset state | Top-level browser app; Pulse PBI lives inside Power BI Desktop visual sandbox |

## Copy-Port Checklist

- Confirm the module is pure: no DOM, React, fetch, localStorage, vendor SDK, or CSS imports.
- Keep public types serializable.
- Include tests with the port.
- Record intentional differences in the sibling PR.
- Update the changelog below.

## Changelog

| Module | Version | Change | Sibling status |
|---|---:|---|---|
| sync-ledger | 0.1 | Created sync ledger for native adapter G0. | N/A |

## Product Sync

This ledger covers code and shape contracts only. Feature-level drift, such as one project shipping a new insight section type before the other, is a roadmap coordination problem. Do not solve that with packaging in v0.x.

