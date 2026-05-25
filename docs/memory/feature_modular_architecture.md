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

Do not build module federation, runtime plugin marketplaces, or per-connector microservices unless Rajesh explicitly changes the Path C strategy.

Next good implementation slice: server-owned block/capability registry contract covering BI adapters, AI connectors, packs, and build profile metadata, followed by proxy connector extraction behind a small host API.
