# PulsePlay Ecosystem Sync Ledger

> Lightweight cascade discipline for PulsePlay, Pulse PBI, and the future desktop EXE. This is not a shared package and not hard enforcement. It makes drift visible before it becomes architectural debt.

## Rule

Every meaningful PulsePlay change must answer two questions before merge:

1. **Does this affect Pulse PBI?**
2. **Does this affect the future desktop EXE?**

The answer can be `N/A`, but it must be deliberate.

## Cascade Classes

| Class | Meaning | Required action |
|---|---|---|
| Shared proxy contract | Proxy route, result envelope, governance, audit, source-ref, auth, or client compatibility behavior changes | Update proxy docs/tests; assess Pulse PBI + desktop impact; prefer backward-compatible fields |
| Portable module | Pure code safe to copy-port: no DOM, React, browser APIs, fetch, vendor SDK, or CSS imports | Add `sibling-sync` label, update this ledger, copy-port or queue Pulse PBI patch |
| Host-specific UI | PulsePlay shell, Settings, layout, browser-only UX | Record Pulse PBI = N/A unless a shared contract/type changed; record desktop impact if the UI will appear in EXE |
| Desktop packaging | Local app server/proxy, encrypted data folder, browser launch, recon disclaimer, portable cache | Update future EXE notes/tests; Pulse PBI usually N/A |
| Documentation only | ADRs, guides, plans | Record if the doc changes ecosystem rules; otherwise N/A |

## PR Checklist Contract

Every PR description should include:

```text
Pulse PBI impact: N/A | queued | done | automatic via proxy | not affected because <reason>
Desktop EXE impact: N/A | queued | done | future DX consideration | not affected because <reason>
```

Use `queued` or `done` instead of `N/A` when the change affects copy-portable modules or future desktop behavior.

## Pulse PBI Copy-Port Rules

Changes to portable modules require:

1. A `sibling-sync` PR label.
2. A PR description line: `Pulse PBI copy-port: queued | done | N/A`.
3. This file updated with module version, last-synced commit, and sibling status.
4. The sibling repo takes the patch on its own cadence.

If Pulse PBI improves the same logic first, use the same flow in reverse and update this ledger when PulsePlay catches up.

## Pulse PBI Constraint Boundary

Pulse PBI is part of the ecosystem, but it is still a Power BI custom visual. It runs as a guest inside the Power BI report iframe/sandbox and keeps those limitations.

Respect these boundaries:

- Do copy-port pure modules and shape contracts when they are sandbox-safe.
- Do let Pulse PBI benefit from shared proxy response fields, governance attestation, source refs, and audit vocabulary.
- Do not assume Pulse PBI can use PulsePlay browser capabilities such as normal `fetch`, SSE/NDJSON streaming, Web Workers, Service Workers, large lazy-loaded chunks, unrestricted storage, popups, or top-level window APIs.
- Do not move PulsePlay-native UI or desktop runtime assumptions into Pulse PBI.
- Do not weaken PulsePlay because Pulse PBI cannot support a capability. Use capability-aware routes/adapters instead.

The right shape is shared backend truth and portable pure contracts, with host-specific runtime adapters.

## Portable Tiers

### Tier 1 - Pure Modules

Copy-port safe: no DOM, no React, no browser APIs, no fetch.

| Module | PulsePlay source | Owner side | Version | Last synced commit | Sibling status |
|---|---|---:|---:|---|---|
| chartAutoPick | `playground/src/visualization/chartAutoPick.ts` | PulsePlay | 0.1 | `9ff892a` | shipped 2026-05-21; pure module, copy-port safe; Pulse PBI adoption queued |
| aiResultEnvelope | `playground/src/visualization/aiResultEnvelope.ts` | PulsePlay | 0.1 | `9ff892a` | shipped 2026-05-21; pure module, copy-port safe; Pulse PBI adoption queued |
| resultToVizIntent | `playground/src/visualization/resultToVizIntent.ts` | PulsePlay | 0.1 | `9ff892a` | shipped 2026-05-21; pure module, copy-port safe; Pulse PBI adoption queued |
| chartSpecValidation | `playground/src/visualization/chartSpecValidation.ts` | PulsePlay | 0.1 | `9ff892a` | shipped 2026-05-21; pure module, copy-port safe; Pulse PBI adoption queued |

### Tier 2 - Shape Contracts

Zero-runtime or type-only contracts both projects should respect.

| Contract | Source | Owner side | Version | Last synced commit | Sibling status |
|---|---|---:|---:|---|---|
| AIResultEnvelope | `playground/src/visualization/aiResultEnvelope.ts` | PulsePlay | 0.2 | G3a | shipped 2026-05-21; includes `sourceRef?: DatabricksSourceRef`; G3a narrowed `governance?: unknown` → `governance?: GovernanceAttestation` (optional in type; env-agnostic guard) |
| ChartRenderSpec | `playground/src/visualization/chartSpecValidation.ts` | PulsePlay | 0.1 | `9ff892a` | shipped 2026-05-21; inline data only, external URLs rejected |
| DatabricksSourceRef | `playground/src/visualization/sourceRef.ts` | PulsePlay | 0.1 | `4b818b2` | shipped 2026-05-21; pure module, copy-port safe; Pulse PBI adoption queued |
| GovernanceAttestation | `playground/src/visualization/governance.ts` + `proxy/lib/governance.js` + `proxy/server.js` | PulsePlay (split) | 0.2 (G3) | `58b8bbf` / `17e1597` | G3 complete 2026-05-21: frontend guard validates shape only; proxy builder is the only sanctioned attestation producer; every renderable backend path emits `governance.enforced === true`; native adapter fails closed in production/required-governance mode and marks dev previews explicitly |

### Tier 3 - Proxy Upgrades

Pulse PBI and the future desktop EXE get these fields automatically when they call the shared proxy contract. Desktop may bundle the proxy physically, but it still uses the same proxy logic and response shapes.

| Upgrade | Source | Owner side | Version | Last synced commit | Sibling status |
|---|---|---:|---:|---|---|
| Every renderable backend path emits `governance.enforced` | proxy routes and tests | PulsePlay proxy | 0.1 | `58b8bbf` | automatic payload benefit via the shared proxy; Pulse PBI/desktop receive the field when they call these routes, but each host still chooses when to fail closed |
| Client identity headers (`X-Pulse-Client`, version, request id) | proxy request/audit contract | PulsePlay proxy | 0.1 | `22db943` | automatic via proxy; Pulse PBI/desktop clients should send headers when adopted |

### Tier 3.5 - Desktop EXE Cascade

These changes are not copy-ported to Pulse PBI, but they must be assessed for the desktop artifact once DX1 starts.

| Area | PulsePlay source | Desktop consequence | Version | Last synced commit | Status |
|---|---|---|---:|---|---|
| Proxy routes and connector clients | `proxy/` | Bundled proxy must keep same behavior; no lite proxy fork | queued | N/A | PX1/G3 first |
| Static app build | `playground/` | EXE serves built app through inbuilt local app server | queued | N/A | DX1 future |
| Settings and first-run setup | `playground/src/settings/`, `playground/src/components/FirstRunWizard.tsx` | EXE uses same setup UX with recon disclaimer and local encrypted persistence; G5 `biSurfaceMode` must smoke `auto` with no embed config under bundled proxy/private browser | 0.1 | G5 | Author switch shipped in PulsePlay; DX smoke queued |
| Local persistence model | future `desktop/` plus Settings stores | Sensitive local state moves to encrypted colocated `PulsePlayData/` where needed | queued | N/A | DX2 future |
| Browser launch | future `desktop/` | Prefer Chrome incognito, then Edge InPrivate, Firefox private, Brave, then default-browser fallback | queued | N/A | DX1 future |

### Tier 4 - Host-Specific

Do not copy-port as-is.

| Module | Reason |
|---|---|
| `playground/src/visualization/NativeCanvas.tsx` | React + PulsePlay host + ECharts runtime |
| `bi-adapters/native/nativeCapabilities.ts` | PulsePlay BI adapter capability surface; Pulse PBI has different constraints |
| PulsePlay layout/preset state | Top-level browser app; Pulse PBI lives inside Power BI Desktop visual sandbox |
| Desktop EXE launcher/runtime | Tauri/local-process/browser-launch concerns; not relevant to Pulse PBI |

## Copy-Port Checklist

- Confirm the module is pure: no DOM, React, fetch, localStorage, vendor SDK, or CSS imports.
- Keep public types serializable.
- Include tests with the port.
- Record intentional differences in the sibling PR.
- Update the changelog below.

## Desktop Cascade Checklist

Use this checklist for any change that future desktop EXE users would experience or depend on:

- Does it require a deployed proxy instead of the inbuilt bundled proxy? If yes, redesign or mark explicitly unsupported for EXE.
- Does it persist sensitive data in browser localStorage/sessionStorage? If yes, decide whether DX2 must migrate it to encrypted `PulsePlayData/`.
- Does it assume multi-user hosting, public callback URLs, or admin-managed secrets? If yes, add an EXE-specific setup/readiness state.
- Does it change proxy routes, result envelopes, auth, governance, or audit? If yes, mark Desktop EXE impact as `queued` until the bundled proxy path is updated/tested.
- Does it add a browser feature that may behave differently in private/incognito mode? If yes, add a DX smoke note.

## Changelog

| Module | Version | Change | Sibling status |
|---|---:|---|---|
| sync-ledger | 0.1 | Created sync ledger for native adapter G0. | N/A |
| sync-ledger | 0.2 | Expanded ledger from Pulse PBI-only copy-porting to ecosystem cascade tracking for Pulse PBI and future desktop EXE. | Pulse PBI + desktop checklist active |
| sync-ledger | 0.3 | PB0 folder-convergence shipped: Pulse PBI source snapshot now lives at `enablers/pulse-pbi/`. Sync mechanism unchanged — copy-port discipline + ledger entries — but the sibling is now in the same checkout. Refresh procedure documented in `enablers/pulse-pbi/PROVENANCE.md`. | Pulse PBI source now in tree at upstream commit `9e3b7b6` |
| proxy-client-contract | 0.1 | PX1 client identity headers, `/clients/compatibility`, response echo headers, and client-aware audit context. | Automatic via proxy; Pulse PBI/desktop adoption is header wiring only |
| DatabricksSourceRef | 0.1 | G2.5 typed Databricks source-ref contract: discriminated union over genie-space, metric-view, uc-function, view, and table; per-kind type guards; `sourceRefDisplayLabel` formatter; table variant carries the `raw-table-bypasses-curated-views` warning at the type level. Pure module, no DOM/fetch/React. | Copy-port queued for Pulse PBI |
| visualization-pipeline | 0.1 | G2 pure result-to-chart pipeline: `AIResultEnvelope`, `resultToVizIntent`, `chartAutoPick`, and `chartSpecValidation`; Pulse-ported chart helpers now import the shared policy instead of duplicating it; workbench chart tabs validate specs before rendering. | Copy-port queued for Pulse PBI; desktop inherits through PulsePlay app bundle |
| governance-contract | 0.1 (G3a) | G3a contract slice: frontend `GovernanceAttestation` type + `isGovernanceAttestation` env-agnostic guard; proxy `buildGovernanceAttestation` builder that enforces `enforced: true`, validates authority allowlist, sanitizes subjectRef/requestId, forbids `authority: "mock"` in production; `AIResultEnvelope.governance` narrowed from `unknown` to optional `GovernanceAttestation`. | Proxy contract benefits Pulse PBI + desktop once routes wire |
| governance-contract | 0.2 (G3) | G3b/G3c/G3d completion: every renderable proxy backend path now stamps proxy-built attestation; registry-driven route mapping covers all 10 backend ids; user subject refs are hashed, SP refs reuse existing SP hash, Genie emits real `sourceRef` when available; native adapter fails closed in production/required-governance mode and dev/mock missing-attestation results render only as `ungoverned-result-preview`. | Automatic via proxy for Pulse PBI/desktop payloads; host fail-closed adoption remains host-specific |
| bi-surface-mode | 0.1 (G5) | PulsePlay host-specific BI author switch: persisted `biSurfaceMode` (`auto/native/vendor`) resolves requested vendor config into runtime BI surface without deleting vendor setup. | Pulse PBI N/A (host UI); desktop inherits through future app bundle and needs DX smoke for auto-native fallback |
| native-fusion-lite | 0.1 (G6) | PulsePlay host-specific native T2 fusion-lite: NativeCanvas docks AI commentary beside chart/KPI/table bodies when an attested envelope has renderable rows plus an answer, with all wrappers bound by `data-result-id`. | Pulse PBI N/A (vendor T2 handled by custom visual); desktop inherits through future app bundle and needs DX smoke |
| integrity-sweep | 0.1 | 2026-05-21 multi-agent sweep fixed admin auth-mode parity, SQL preview CTE validation, governance registry override protection, streaming error redaction, Quick Setup mountable embed configs, and Pulse PBI CI lint/unit coverage. | Pulse PBI gets CI coverage now; shared-proxy adoption still queued |

## Product Sync

This ledger covers code, shape contracts, proxy behavior, and desktop impact classification. Feature-level drift, such as one project shipping a new insight section type before the other, is still a roadmap coordination problem. Do not solve that with packaging in v0.x.
