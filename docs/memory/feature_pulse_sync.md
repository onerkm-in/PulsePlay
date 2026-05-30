---
name: Pulse ecosystem sync
description: Lightweight cascade ledger for pure visualization/result contracts and proxy behavior across PulsePlay, Pulse PBI, and the future desktop EXE
type: feature
originSessionId: current
---

PulsePlay, Pulse PBI, and the future desktop EXE do not get a shared package in v0.x. Portable pure modules stay in `playground/src/visualization/` and are copy-ported when useful. Proxy/result/governance behavior is shared through one proxy contract. Drift is made visible through `docs/PULSE_SYNC.md`.

Portable tiers:

- Tier 1: pure modules such as `chartAutoPick.ts`, `aiResultEnvelope.ts`, `resultToVizIntent.ts`, `chartSpecValidation.ts`, and `sourceRef.ts`.
- Tier 2: serializable shape contracts: `AIResultEnvelope`, `ChartRenderSpec`, `DatabricksSourceRef`, and governance attestation.
- Tier 3: proxy upgrades, especially `governance.enforced`, which Pulse PBI receives automatically in responses after G3; G3 route wiring shipped 2026-05-21, while Pulse PBI fail-closed adoption remains host-specific.
- Tier 4: host-specific code such as `NativeCanvas.tsx` and native adapter capabilities. Do not copy as-is.

Process: PRs that change portable modules need a `sibling-sync` label, copy-port status in the PR description, desktop impact status where relevant, and a `docs/PULSE_SYNC.md` changelog update.

G2 shipped `chartAutoPick`, `aiResultEnvelope`, `resultToVizIntent`, and `chartSpecValidation` at version 0.1 in commit `9ff892a`. Pulse-ported chart helpers now import the shared chart-pick policy, so downstream behavior has been generalized upstream instead of duplicated.
