---
name: Pulse PBI sync
description: Lightweight copy-port sync ledger for pure visualization/result contracts between PulsePlay and the Pulse PBI sibling
type: feature
originSessionId: current
---

PulsePlay and Pulse PBI do not get a shared package in v0.x. Portable pure modules stay in `playground/src/visualization/` and are copy-ported when useful. Drift is made visible through `docs/PULSE_SYNC.md`.

Portable tiers:

- Tier 1: pure modules such as `chartAutoPick.ts`, `aiResultEnvelope.ts`, `resultToVizIntent.ts`, and `chartSpecValidation.ts`.
- Tier 2: serializable shape contracts: `AIResultEnvelope`, `ChartRenderSpec`, and governance attestation.
- Tier 3: proxy upgrades, especially `governance.enforced`, which Pulse PBI receives automatically in responses after G3.
- Tier 4: host-specific code such as `NativeCanvas.tsx` and native adapter capabilities. Do not copy as-is.

Process: PRs that change portable modules need a `sibling-sync` label, copy-port status in the PR description, and a `docs/PULSE_SYNC.md` changelog update.

