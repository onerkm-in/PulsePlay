---
name: Modular architecture and delivery
description: Decision memory for PulsePlay modular blocks, connector plugins, lazy chunks, and future slim build profiles
type: feature
originSessionId: current
---

PulsePlay keeps one integrated user experience while making technical blocks modular and removable.

Current decision, locked by [docs/research/MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md](../research/MODULAR_DELIVERY_WAY_FORWARD_2026-05-25.md):

- Default internal v1 is one PulsePlay product build with lazy frontend chunks, proxy profiles, allowlists, and server-owned capability registry.
- "Plugin" means repo-local/internal block with manifest and conformance tests, not a public marketplace or runtime remote-JS extension system.
- Power BI + Genie is the first production-grade product cell: Surface = Power BI adapter, Assistant = Genie profile, Context = optional PulsePack. It must stay one combination of the same BI/AI/pack axes used by future cells.
- Frontend BI adapter code is already lazy-loaded through `playground/src/biPanel/registry.ts`; the static artifact still contains emitted chunks until future build profiles prune them.
- AI connectors are currently selected through proxy profiles and hardcoded connector manifests; physical `proxy/connectors/` route extraction remains future work.
- Future slim distributions such as `powerbi-genie`, `databricks-native`, and `full-internal` are platform-owned build profiles, not user-installed modules.

**Cell Catalog (Step 0 of the unified-surface beast-mode plan, 2026-05-25):**

- Five cell manifests live at `playground/src/cells/*.json` — that is the single source of truth. The earlier draft kept both JSON manifests AND hardcoded TS constants in `cellCatalog.ts`; that drifted by design and was rejected. JSON is now the only source.
- [playground/src/lib/cellCatalog.ts](../../playground/src/lib/cellCatalog.ts) statically imports the JSON manifests, deep-freezes them, and exports `CELL_CATALOG`, `getCellEntry`, `matchActiveCell`, and `auditCellCompliance`.
- `Capability` is a typed union so calls to `auditCellCompliance(cell, { 'chat': true, ... })` get TypeScript autocomplete + typo rejection. The JSON-side cannot be type-checked the same way; if a manifest contains a typo'd capability, the auditor will treat it as "missing required" at runtime (fail-closed — acceptable).
- `tableau-foundation` and `looker-supervisor` are marked `"preview"` (not `"production"`) because their underlying BI adapters are still `GenericIframeAdapter` stubs per CLAUDE.md. Only `powerbi-genie` and `generic-iframe-responses` are `"production"`.
- The catalog has no consumers yet — Settings + Launchpad integration is the deliberate next thread.

Do not build module federation, runtime plugin marketplaces, or per-connector microservices unless Rajesh explicitly changes the Path C strategy.

Next good implementation slice: server-owned block/capability registry contract covering BI adapters, AI connectors, packs, and build profile metadata, followed by proxy connector extraction behind a small host API.
