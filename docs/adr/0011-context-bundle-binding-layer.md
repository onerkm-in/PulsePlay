# ADR-0011 — Context-bundle binding layer ("AI & BI enabler")

- **Status:** Accepted (2026-05-30)
- **Deciders:** Rajesh + Claude (beast-mode research session, 5 parallel agents)
- **Supersedes / relates:** [ADR-0008](0008-unified-assistant-surface.md) (one assistant surface), the 2-axis abstraction in [docs/ARCHITECTURE.md](../ARCHITECTURE.md). Memory: `feature_ai_bi_enabler_binding_layer`.

## Context

A program with a heterogeneous estate owns several AI backends (agentic platform + Genie + Bedrock) AND several BI tools (Power BI + Tableau). PulsePlay is positioned as the **AI & BI enabler** — the thin pane of glass that PAIRS one BI surface with one AI brain. The recurring question: "can we activate multiple connectors at one time?"

5-agent beast-mode research (2026-05-30) found:

- **Backend is already concurrency-safe** — proxy resolves the connector *per request* (`X-Assistant-Profile`), conversation maps are profile-keyed, no global active-connector state, no singletons. Two connectors live at once = zero collision today.
- **Client is single-active by design** — `biVendor` + `activeAiProfile` are App-global single strings; one assistant surface with one flat history. So **switchable now = yes; two-live-on-screen = no** (needs per-pane state isolation: the detach "shared-state echo" + `"ai"|"bi"`→`paneId` generalization).
- **Market leaders already ship the coupled bundle** — ThoughtSpot Spotter pins the AI to a data model by GUID; Databricks Genie attaches a space to a dashboard. PulsePlay's differentiator is doing it **vendor-neutrally**.
- **Two-knob pickers are the documented anti-pattern** (Grafana/Slack both walked it back). Collapse `VendorPicker + ConnectorPicker` into ONE chained chip.

## Decision

Model the enabler as a **Context Bundle = a named, curated pairing of `(biVendor, aiProfile, pack?)`**, surfaced as a single switcher. Ship in the staged "final call":

- **Option A (THIS ADR — now):** `ContextBundle` as a **pure projection** over the existing axes + a `BundleSwitcher` that swaps both atomically. **Single live pane.** No new persisted state, no backend change, fully reversible.
- **Option B (deferred to v0.5, after CONNECT-P0):** simultaneous live bundles via per-pane state isolation, riding the existing `FloatingCompanion` path.
- **Option C (out):** true OS-window multi-screen, multi-AI fan-out/consensus, free-form runtime axis remixing, N-up walls.

### Why "pure projection" (the load-bearing constraint)

A bundle introduces **no new state**. The "active bundle" is *derived* — it is whichever bundle's `(biVendor, aiProfile)` matches the current selection (`resolveActiveBundle`). Switching a bundle just calls the existing governance-aware setters (`setBiVendor`, `setActiveAiProfile`, `setPackSelection`). This guarantees:

- **Modularity intact** — a bundle is a *preset over independent axes*, never a hard binding. If a bundle ever becomes an `if (bundle === X)` branch, the design is violated — that needs a new ADR.
- **Reversible** — delete the switcher and nothing else changes; the axes still work independently.
- **Allowlist-honest** — candidate bundles are filtered by the org allowlist (`validateBiVendor` / AI-profile membership), so only pairings the org's creds actually light up appear. This is what makes plug-and-play legible ("here are the enabler bundles your estate enables").

### Default presentation

- Curated candidate pairs (real ids: `powerbi × default`, `powerbi × powerbi-dwd`, `tableau × default`, …) filtered by the allowlist; dev can extend via `pulseplay:context-bundles` (JSON).
- Rendered as ONE chained chip `[Power BI ⇄ Genie]` in the dashboard context strip; click → pick another bundle. No-match current pair shows as "Custom" (the unlocked/free state — progressive disclosure of the raw axes).

## Consequences

- **Now:** users move between bound enablers with one click; the two-knob UX is gone for the default path; plug-and-play surface is legible.
- **Deferred (B):** simultaneous display still needs the per-pane isolation refactor — per-pane Zustand stores under ONE React root (NOT separate roots; that fragments React events — see research), reuse-iframe-don't-recreate, SDK singleton, LRU-cap live embeds ~3–4, per-vendor token lifecycle (PBI/Qlik reusable token, Tableau JWT handshake-only, Looker single-use URL never cached).
- **Cost/governance:** multi-AI fan-out stays opt-in + race-then-cancel; PBI concurrent embeds are paid-capacity-gated. Both are Option-B concerns, not Option A.
