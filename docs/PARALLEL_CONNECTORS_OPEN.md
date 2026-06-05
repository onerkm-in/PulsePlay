# Parallel Connectors + Parallel Screens — OPEN / UNBUILT (named-open with plan)

> **Status: OPEN — not started, not certified.** Per the Super Beast Mode mandate
> (2026-06-05, `PART_C = flag-only`), this capability is **not built** this pass.
> This document is the named open item: the proven gap, the phased plan, and the
> exact decision required to proceed. It is **not** a certification of closure.

## The proven gap (RUNNING-verified, 2026-06-04 probe — re-confirmed by code read 2026-06-05)

PulsePlay today is **single-active-per-axis**. Multiple panes can render (1 AI + 1 BI
split; `BITileGrid` up to 4 tiles) but they all share **one** connector/vendor/config:

| Global | Location | Today |
|--------|----------|-------|
| `activeVendor` (Y-axis: which BI vendor) | [App.tsx:568](../playground/src/App.tsx#L568) `useState` | one scalar for the whole app |
| `activeConnector` (X-axis: which AI brain) | [App.tsx:578](../playground/src/App.tsx#L578) `useState` | one scalar for the whole app |
| `embedConfig` (BI embed target) | [App.tsx:602](../playground/src/App.tsx#L602) `useEmbedConfig()` | one cross-tab store for the whole app |
| `PaneInstance` | [settingsStore.tsx:241](../playground/src/settings/settingsStore.tsx#L241) | **connector-less** (paneId/pageId/placement/position/size/createdAt) |

Selecting an enabler bundle (e.g. "Tableau × Genie") flips **both axes globally**
(live-proven 2026-06-04: Source `powerbi-dwd` → Default profile in one click).
`BITileGrid` passes the single vendor/config to all tiles. So two panes bound to two
DIFFERENT live connectors **cannot coexist** today.

## Phased plan (foundation → P2+), flag-gated, single-pane never regresses

**P0 — flag `multiConnectorPanes`, DEFAULT OFF.** Everything below gated. Flag OFF ⇒
single-pane app byte-for-byte unchanged (must prove: full gate green + screenshot of
the normal app unaffected).

**P1 — per-pane state model.** Add optional `vendor` / `aiProfile` / `embedConfig` to
`PaneInstance`; introduce `Map<paneId, PaneConnectorState>`; the three globals become a
**projection of the active pane (pane[0])** for backward-compat. Unit-test the
projection (existing `phaseCScaffolding.test.ts` uses partial matches, so optional
fields are backward-compatible — verified 2026-06-05).

**P1-PROOF (RUNNING+PIXEL, flag ON, via the real UI flow not localStorage).** Bind
pane 1 = Foundation Model and pane 2 = Power BI — two genuinely different LIVE
connectors at once. PIXEL that BOTH hold independent live state simultaneously (FM
advisory on pane 1; PBI DAX/render on pane 2) AND that erroring/switching one does NOT
poison the other (isolation). If `SERVERLESS=enabled`, add Genie as a third live
parallel pane; else note it joins on the flip — do not fake it.

**Then STOP — AWAITING APPROVAL for P2+:** per-pane adapter/AISidebar isolation by
paneId → `BITileGrid` per-tile config ("K.2") → UNIFIED/SEGREGATED layout toggle →
parallel-connect via `Promise.allSettled` with per-pane status → `BundleSwitcher`
targets a paneId; capped/lazy ~4–6 panes given the ~6-connection/origin browser cap,
the Power BI iframe sandbox, and the XHR-only Genie client.

## The exact decision required from you

To proceed, set **`PART_C = build-foundation`** (builds P0+P1+P1-PROOF only, then STOPs
for P2+ approval). The P1-PROOF additionally needs, to be RUNNING not READING:
- Foundation Model: already live ✓ (re-proven 2026-06-05, `status=COMPLETED`).
- Power BI: already live ✓ (DAX total 2,297,201 re-proven 2026-06-05).
- Genie as a third parallel pane: requires **`SERVERLESS = enabled`** (or a classic SQL
  warehouse) on workspace `dbc-f88d29ce-4aa2` — currently disabled, so Genie would join
  on the flip, not at first proof.

Until that decision: this stays **OPEN / UNBUILT**.
