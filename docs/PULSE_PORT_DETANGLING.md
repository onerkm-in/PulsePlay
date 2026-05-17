# Pulse-Port Detangling — Inheritance Inventory & Dropped Baggage

> Status: locked 2026-05-17. This document is the canonical mental model for
> what PulsePlay is and is NOT. All future agents (Claude, Codex, any LLM)
> should treat the categorizations below as authoritative. When the inventory
> shifts (an item retires from Category A to B, or B to C), update this file
> AND the matching tripwires in `CLAUDE.md` + `AGENTS.md`.

## Why this document exists

PulsePlay was bootstrapped by porting code from the sister project
**Pulse** — a Power BI custom visual (lives under `playground/src/pulse/*`,
ported verbatim). Pulse was authored under the Power BI Desktop sandbox,
which forbids many modern web platform features. Those constraints
travelled with the code into PulsePlay.

**PulsePlay itself is NOT constrained by the PBI sandbox.** PulsePlay is a
top-level-origin React + TypeScript application that runs in a real modern
browser. It HOSTS BI vendor surfaces inside narrowed iframes; it is not
itself captured inside any iframe.

Multiple agents (including me) have conflated "Pulse-PBI ported code" with
"PulsePlay-native code", carrying forward sandbox constraints that don't
apply. This document fixes that by categorizing every Pulse-PBI inheritance
and explicitly retiring the constraints that don't belong.

## The scope inversion (read first)

| Surface | Pulse-PBI sibling | PulsePlay |
|---|---|---|
| Where it runs | Inside Power BI custom-visual sandbox iframe | Real browser tab, top-level origin |
| What it embeds | Nothing — IS embedded | Power BI / Tableau / Qlik / Looker / generic-iframe AS guests |
| Bundle constraint | 350 KB `.pbiviz` cap | None (code-split per route is the only ceiling) |
| `fetch` | Blocked → XHR only | Native |
| Native streaming (NDJSON / SSE) | Blocked | Native (already used by `/supervisor/conversations/start-stream`, `/confidence`) |
| Web Workers | Blocked | Available |
| Service Worker / PWA | Blocked | Available |
| Web Speech API | Blocked | Available |
| DuckDB-WASM lazy chunks | Blocked | Available |
| WebGPU / on-device ML | Blocked | Available |
| Native PDF / PNG / Excel generation | Blocked → server help required | Available (Canvas, OffscreenCanvas, SheetJS, etc.) |
| IndexedDB / Cache API | Constrained quota | Full quota |
| Cross-origin auth flows | Constrained by PBI identity propagation | Modern BFF + PKCE + secure-cookie patterns |
| Top-level navigation, popups, File System Access | Blocked | Available |

The Pulse-PBI sibling consumes the SAME proxy as PulsePlay
(`proxy/server.js`). The proxy must therefore stay compatible with both
clients. Everything else can be PulsePlay-native.

## Inheritance inventory

Every Pulse-PBI item that ended up in PulsePlay is categorized as one of:

- **Category A — Hard-coupled compat surface.** Pulse-PBI sibling actively
  consumes this; changing it breaks the sibling. Stays. Tagged as compat,
  not as default pattern.
- **Category B — Soft-coupled modernization candidate.** Pulse-PBI uses
  this but PulsePlay can grow a native parallel without disturbing the
  ported file. The `playground/src/pulse/*` tree becomes "compatibility
  shim that PulsePlay will eventually outgrow."
- **Category C — Accidental baggage.** No active dependency. Carried over
  only because nobody removed it. Safe to retire whenever convenient.

### Category A — Hard-coupled (keep, tag as compat surface)

| Item | Where | Why it stays |
|---|---|---|
| `attachments[].text.content` Genie response shape | Proxy `normalizeGenieResponse` (`proxy/server.js:~2902`) | Pulse-PBI parses this exact shape from `/assistant/conversations/poll` responses |
| Legacy `error: <short string>` field on problem envelopes | Locked in Slice 1b ([`docs/ERROR_HANDLING_STRATEGY.md`](ERROR_HANDLING_STRATEGY.md) "Migration note") | Pulse-PBI sibling reads `error`, not `problem+json` |
| `pulseplay:visual-settings:genieSettings` localStorage namespace | `playground/src/settings/pulseVisualSettingsStore.ts` | Pulse-PBI reads/writes this key when running side-by-side in the same browser origin |
| `/assistant/conversations/start` + `/messages` + `/poll` route family | `proxy/server.js` | Pulse-PBI calls these endpoints by name |
| Genie `conversation_id` / `message_id` pass-through in responses | `normalizeGenieResponse` | Pulse-PBI's polling logic correlates by these keys |
| BUG-003 system-prompt-leak fix logic | `normalizeGenieResponse` | Pulse-PBI relies on `content` being the joined attachment text, not the user prompt |

**Retire-when criteria for Category A items:** when the Pulse-PBI sibling
project is sunset or migrated to a different runtime, these become
Category B (modernization candidates). Until then, treat as load-bearing.

### Category B — Soft-coupled (modernize on PulsePlay's clock)

| Item | Where | PulsePlay-native replacement direction |
|---|---|---|
| XHR-only HTTP layer (`ProxyChatBackend`, `GenieClient`) | `playground/src/pulse/backend/*`, `playground/src/pulse/genie.ts` | New playground code uses `fetch` + React Query freely. Pulse-port keeps XHR until sibling sunsets |
| `gn-*` CSS class vocabulary (~10k LOC in `visual.less`) | `playground/src/pulse/style/visual.less` | New design system (Tailwind+Radix or alternative). `gn-*` stays in ported surface only |
| `gn-shell--dark` theme model | `visual.less` | Real W3C Design Tokens + `prefers-color-scheme` + theme switcher (already aligned with adaptive-theme research packet) |
| Insights section taxonomy (HEADLINE / TRENDS / RISKS / OPPORTUNITIES / RECOMMENDED ACTIONS) | `foundationModelClient.js` `SECTION_RENDERERS` / `RESPONSE_SCHEMAS`, `insightsValidator.js` | Pulse-PBI's vocabulary. PulsePlay can extend the schema or grow a richer briefing model |
| `Customize ⚙` / `Adjust ▾` / per-section kebab interaction model | `pulse/visual.tsx` | Re-derive from a design system that's been a11y-audited |
| `v0` "lightweight sidebar" UI mode | `settingsStore.ts` `UiMode = "pulse" \| "v0"` | Drop in PulsePlay-native. `v0` was a Pulse-PBI bundle-pressure hedge; PulsePlay has no bundle cap |
| The whole `playground/src/pulse/` directory (~half the playground LOC) | `playground/src/pulse/*` | Long-term: extract pure domain logic (validators, renderers, metric-direction rules) as shared functions; rebuild UI shell PulsePlay-native |
| `gn-pane-action-btn`, `gn-pill`, `gn-header-tab` and related Pulse cluster components | `visual.tsx` + `visual.less` | Replaced by design-system primitives once selected |
| `setupStep5*.tsx` wizard heritage | `playground/src/pulse/setupStep5.tsx`, `setupStep5Guided.tsx` | New onboarding flow under `features/onboarding/` once feature-sliced |
| `FoundationModelBackend` and `OpenAIBackend` / `BedrockBackend` extending `ProxyChatBackend` | `playground/src/pulse/backend/*` | Modernize to React Query data layer + typed API contracts |
| The Genie-shaped attachment normalization on the *frontend* | `genie.ts` `hydrateGenieFields` | Long-term: API client emits typed responses; no frontend normalization needed |
| Pulse-shaped Insights run-state cluster (`gn-insights-meta`, timestamp + Copy MD/HTML + Print + Refresh + Stop) | `visual.tsx` ~4053+ | Re-derive in feature-sliced AI surface component |

**Retire-when criteria for Category B items:** when a PulsePlay-native
replacement ships AND the relevant code path is no longer in active
deployment. Until then, leave the Pulse-port alone — it works and the
sibling depends on it.

### Category C — Accidental baggage (retire outright)

| Item | Why it's pure baggage |
|---|---|
| `LEGACY_DEMO_SCHEMAS`, `LEGACY_DEMO_SYNTHETIC_FIELDS` constants in `proxy/server.js` | Pulse-PBI demo-data baked in. PulsePlay should be pack-driven only. Schedule for removal once pack-driven fallback covers demo flows |
| `scrubInternalJargon` regex sweep on synthesis output | Pulse-PBI defensive layer against its own training-time leaks. Not needed in PulsePlay |
| `lazy-chunk pre-warm probe` references in comments | Pulse-PBI sandbox workaround for DuckDB-WASM chunk loading. Meaningless in real browser |
| 350 KB `.pbiviz` cap awareness in commit comments and prose | Doesn't apply; PulsePlay has no `.pbiviz` build target |
| "PNG / Excel / CSV exports were available; prefer Power BI Service-side native export" guidance in `pulse/visual.tsx:~4164` | Pulse-PBI sandbox-workaround language. PulsePlay can do all three browser-native |
| `gn-pill--icon-only` `min-width: 28px` and similar PBI-custom-visual-sized assumptions | Cargo-culted sizing from sandbox-constrained UI |
| Anti-pattern guidance warning about Power BI custom-visual sandbox limitations scattered through comments | Don't apply to PulsePlay-native code |
| Several `DwD_AI_Assistant_for_PBI` / `PepPulse` / `UniBridge` name references | Pre-PulsePlay naming drift. Already tracked in `docs/research/CODEBASE_AUDIT.md`. Schedule cleanup |

**Retire process for Category C items:** any developer touching the
relevant file is encouraged to delete the baggage as a drive-by cleanup.
No coordination needed; these have no consumers.

## Mental tripwires formally retired (do NOT carry these forward)

The following constraints were in agent reasoning and should no longer be:

1. ❌ "XHR-only because PBI sandbox" — applies only to ported Pulse code,
   not PulsePlay-native code. New code uses `fetch` + React Query.
2. ❌ "350 KB bundle cap" — does not apply to PulsePlay at all. Code-split
   + lazy-load are the right answer to bundle pressure.
3. ❌ "No streaming, no Web Workers, no fetch, no Web Speech, no
   DuckDB-WASM" — none apply; PulsePlay can use all of them.
4. ❌ "Cross-origin restrictions matter at the HOST level" — wrong
   direction. PulsePlay IS the origin; BI vendors are the guests subject
   to PulsePlay's sandbox attribute (see CLAUDE.md "Cross-origin iframes
   need narrow sandbox" — that tripwire still applies because BI guests
   are now in the sandbox PulsePlay defines).
5. ❌ "Identity propagation needs PBI's identity pattern" — modern BFF +
   PKCE + secure-cookie works fine.
6. ❌ "PNG / Excel / PDF exports require server-side help" — browser
   handles all three natively (Canvas, OffscreenCanvas, SheetJS, jsPDF, etc.).
7. ❌ "Bundle larger libraries cautiously" — code-split + lazy-load are
   the right answer.
8. ❌ "Inherited section taxonomy is canonical law" — Pulse-PBI's chosen
   vocabulary, not a law of nature. Schema is extensible.

## PulsePlay-native reasoning frame (use this as default)

When you evaluate proposals, write code, or push back on direction, the
default mental model is:

> **PulsePlay is a greenfield enterprise React + TypeScript application
> running in a real modern browser at top-level origin. It hosts BI
> vendor surfaces inside narrowed sandbox iframes and orchestrates AI
> connector backends via a shared Node proxy. The Pulse PBI custom-visual
> sibling is a CONSUMER of the same proxy with stricter constraints;
> PulsePlay does not inherit those constraints.**
>
> Modern web platform features (`fetch`, streaming, Web Workers, Service
> Workers, IndexedDB, Web Speech, WebGPU, View Transitions, native
> PDF/PNG/Excel generation, top-level navigation, popups, full PWA
> installability) are **available by default**.
>
> The only deferrals are public-OSS distribution items (license, SBOM
> signing, conformance harness, multi-tenant isolation, full compliance)
> per [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md) — those are correctly
> out of v1 scope.
>
> Bundle constraints, sandbox tripwires, and design-token decisions are
> **PulsePlay's own**, not inherited from Pulse-PBI. The
> `playground/src/pulse/*` directory is a compatibility shim, not the
> architectural template.

## What this unlocks

This categorization is the contract that the upcoming
[`ENTERPRISE_MODERNIZATION_CHARTER.md`](ENTERPRISE_MODERNIZATION_CHARTER.md)
(deferred to a separate cycle) builds on. Specifically:

- **Category C items** can be retired during routine touch-ups, no
  coordination needed.
- **Category B items** become explicit modernization phases in the
  charter. Each gets its own [PROPOSAL] → [CHALLENGE] → [DECISION] cycle
  in `AGENT_SYNC.md`.
- **Category A items** stay until the Pulse-PBI sibling project sunsets
  or migrates.

## Maintenance

When you discover a new Pulse-PBI inheritance, add it to the appropriate
category here. When an item retires, move it to a "Retired" section below
with the commit SHA that finished the migration. This document should
shrink over time as Category B + C items get retired.

### Retired (none yet)

*(Items retire here with commit SHA + date when migration completes.)*
