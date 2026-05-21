# Pulse PBI — Power BI Custom Visual Enabler

> **What this is.** A snapshot of the Pulse PBI custom visual project, imported into the PulsePlay repo as a sibling **enabler** per [ADR-0010 — PulsePlay Ecosystem Artifact Strategy](../../docs/adr/0010-artifact-strategy.md). One repo checkout now contains every enabler PulsePlay ships alongside (web app, native renderer, future desktop EXE, and this Pulse PBI custom visual).
>
> **What this is not.** This is *not* part of the PulsePlay React app. The PulsePlay web playground at [`playground/`](../../playground) does not import from this folder, and this folder does not import from `playground/`. Pulse PBI keeps its own **build target, runtime, and sandbox constraints**.

---

## Why it lives here

PB0 (this slice) gives the PulsePlay ecosystem the layout ADR-0010 promised:

```text
PulsePlay/
  playground/               # PulsePlay web app
  proxy/                    # shared proxy code/contract
  bi-adapters/              # PulsePlay BI adapter implementations
  pulsepacks/               # (queued) shared pack/source intent layer
  enablers/
    pulse-pbi/              # ← this folder
    desktop/                # (queued, DX1)
  docs/
```

The win is **one download = every enabler**. Engineers who clone PulsePlay get Pulse PBI source in the same checkout, no submodule gymnastics, no separate clone step. Source ZIP downloads from GitHub include this folder verbatim because it's tracked source (not a submodule — submodules are warned against in ADR-0010 because ZIP downloads silently omit submodule content).

---

## Source provenance

| Field | Value |
|---|---|
| Source repo | `https://github.com/onerkm-in/pbi-genie-visual` |
| Source branch | `main` |
| Source commit | `9e3b7b6fffdbea8d4ca3390a7ae5eaeb8307ccce` |
| Import method | Snapshot (file copy) + provenance doc |
| Import date | 2026-05-21 |
| Imported by | PB0 cycle |

See [`PROVENANCE.md`](./PROVENANCE.md) for the explicit list of files copied, excluded, and the rationale for snapshot-vs-subtree.

---

## Pulse PBI runtime constraints

Pulse PBI runs **inside the Power BI custom visual sandbox**, which is materially more constrained than the modern top-level browser PulsePlay enjoys. **Code under this folder MUST respect these limits.** Code in `playground/src/pulse/*` mirrors a subset of these constraints because it consumes the same compatibility surface; code outside that path in PulsePlay does NOT.

| Constraint | Where it bites |
|---|---|
| No `fetch` — XHR only | All HTTP must go through the XHR client. `fetch` is silently blocked in the sandbox. |
| Bundle size cap (~350 KB `.pbiviz`) | Lazy chunks, code-splitting, and tree-shaking matter much more than they do in PulsePlay. |
| No Web Workers, no Service Workers | All work runs on the main thread inside the visual iframe. |
| No SSE / NDJSON streaming (sandbox blocks chunked transfer in places) | Use polling or single-response flows. |
| Restricted storage | `localStorage` may be partitioned or unavailable depending on host configuration. |
| No popups, no top-level window APIs | All UX stays in-iframe. |
| `gn-*` CSS class vocabulary | Pulse styles are namespaced; do not collide with host report CSS. |

Full details (and the PulsePlay side of the boundary): [`docs/PULSE_PORT_DETANGLING.md`](../../docs/PULSE_PORT_DETANGLING.md).

---

## How to build / develop

> **PB0 build verification: PASS (2026-05-21).** The PB0 cycle ran `npm install`, `npm run lint`, `npm test`, and `npx pbiviz package` from this location end-to-end. All four succeeded; a `.pbiviz` artifact was produced at `dist/`. See [`PROVENANCE.md`](./PROVENANCE.md) for the exact commands and results. One gap surfaced during PB0d (a missing `tsconfig.json` in the initial copy) and was fixed before commit.

```bash
# From the repository root
cd enablers/pulse-pbi

# Install Pulse PBI's own dependencies (separate from playground/node_modules)
npm install

# Lint / type-check
npm run lint  # or whatever package.json defines

# Build the .pbiviz artifact (requires powerbi-visuals-tools globally OR via npx)
npx pbiviz package

# Output: dist/<name>.pbiviz that can be imported into Power BI Desktop
```

The `package.json`, `package-lock.json`, `pbiviz.json`, and `capabilities.json` here are **separate from PulsePlay's playground**. Treat them as their own project boundary.

---

## Sync discipline (PULSE_SYNC.md)

This folder is **not auto-synced** with the upstream `pbi-genie-visual` repo. Changes flow through [`docs/PULSE_SYNC.md`](../../docs/PULSE_SYNC.md) the same way they always did:

- Changes to **portable pure modules** (chart-pick policy, source ref types, etc.) require a `sibling-sync` PR label and a `docs/PULSE_SYNC.md` ledger update.
- Changes to **proxy contracts** (governance attestation, client identity headers) benefit Pulse PBI automatically once the proxy emits them — Pulse PBI just calls the shared proxy.
- Changes that touch **only the Pulse PBI host UI** (`gn-*` CSS, XHR-only fetch layer, PBI sandbox-specific code) can land here without cross-impact to PulsePlay.
- **Do not** import code from `playground/src/*` into this folder unless that code is documented as Pulse PBI copy-port safe in PULSE_SYNC's Tier 1 / Tier 2 tables.

When the upstream `pbi-genie-visual` repo gains new commits worth pulling in, the maintainer decides whether to:
1. Refresh this snapshot (update `PROVENANCE.md` with the new commit hash), or
2. Apply individual patches manually with a clear PR description.

---

## Relationship to PulsePlay's `playground/src/pulse/*`

PulsePlay's `playground/src/pulse/*` directory is the **ported subset** of this Pulse PBI source. Some files exist in both places. They are **not** identical:

- `playground/src/pulse/*` is the **runtime PulsePlay can host**. It has PulsePlay-specific adapters (`_adapter/PulseHostStub.ts`), additional features that don't fit the PBI sandbox, and is exempt from the `gn-*` / XHR-only / bundle-cap constraints that apply ONLY to `playground/src/pulse/*` and to this `enablers/pulse-pbi/` folder.
- `enablers/pulse-pbi/src/*` is the **PBI custom visual runtime**. It's what gets packaged into a `.pbiviz` for Power BI Desktop.

When portable code (chart-pick policy, source ref types, etc.) moves between them, the PULSE_SYNC.md ledger records the version + last-synced commit per module. See [Tier 1 and Tier 2 portable modules](../../docs/PULSE_SYNC.md).

---

## What NOT to do here

Per [ADR-0010 tripwires](../../docs/adr/0010-artifact-strategy.md):

- ❌ Do not move PulsePlay-native UI or desktop-runtime assumptions into this folder. Pulse PBI cannot use `fetch`, Web Workers, or popups.
- ❌ Do not weaken PulsePlay capabilities because Pulse PBI cannot support a feature. Use capability-aware routes/adapters in PulsePlay instead.
- ❌ Do not create `packages/` shared modules just because both sides need similar logic. The copy-port discipline is the policy until reuse pressure is real.
- ❌ Do not duplicate the PulsePlay proxy here. This folder includes a small reference `proxy/` directory carried over from the snapshot; **the production proxy is `proxy/` at the repository root**. Treat the local `proxy/` here as historical reference only.
- ❌ Do not turn this into a "drop-in PulsePlay" — Pulse PBI is the embedded BI guest experience, not a parallel web app.

---

## Related docs

- [ADR-0010 — PulsePlay Ecosystem Artifact Strategy](../../docs/adr/0010-artifact-strategy.md) — the ecosystem decision this folder implements
- [`docs/PULSE_SYNC.md`](../../docs/PULSE_SYNC.md) — the sync discipline ledger
- [`docs/PULSE_PORT_DETANGLING.md`](../../docs/PULSE_PORT_DETANGLING.md) — what's hard-coupled vs portable
- [`docs/feature_native_adapter.md`](../../docs/feature_native_adapter.md) — the native renderer that Pulse PBI's chart-pick policy was ported FROM
- [`README.upstream.md`](./README.upstream.md) — the original Pulse PBI README, kept verbatim for reference
