# ADR-0008 — Unified Assistant Surface (workbench capability model)

**Status:** Accepted 2026-05-18. Step 1 of the build sequence locked in [docs/UNIFIED_ASK_PULSE_WORKBENCH.md](../UNIFIED_ASK_PULSE_WORKBENCH.md).

**Date:** 2026-05-18

## Context

The Ask Pulse surface today renders inside `playground/src/pulse/visual.tsx` and `playground/src/components/AISidebar.tsx`. Two pressures push it in opposite directions:

1. Databricks Genie already has a strong native chat UX (Embed Genie public preview). Replacing it with a PulsePlay copy is a regression for Genie users.
2. PulsePlay must own accuracy, evidence, BI context, chart quality, and exports. Genie iframe alone cannot deliver that contract — it knows nothing about the BI surface the user is also looking at, our pack knowledge, our validation gates, or our export formats.

The 4-agent research verdict ([UNIFIED_ASK_PULSE_WORKBENCH.md](../UNIFIED_ASK_PULSE_WORKBENCH.md)) resolved this by **not framing it as app vs API**: Databricks App is hosting, Genie iframe is native UX, Genie Conversation API is verified structured artifacts, PulsePlay orchestrates all three behind one unified screen.

The proxy already supports nine backend paths (Genie, supervisor-local, supervisor, foundation-model, openai-chat, openai-analytics, bedrock-rag, bedrock-direct, responses-agent) plus the `generic` fallback. ADR-0007 captured the **proxy-side** `BackendAdapter` interface for these. PulsePlay's `BIAdapter` is the **vendor-side** mirror. What's been missing is the **workbench-facing** capability dimension: which of these connectors can do what when surfaced inside the Unified Workbench.

Without a capability matrix, the workbench would either degrade to lowest-common-denominator for every connector or hard-code per-connector behavior in render code. Neither survives the next time a connector is added or a vendor ships a new capability.

## Decision

Define a per-connector capability matrix and a mode resolver in pure TypeScript.

### Capability flags (orthogonal, boolean per connector)

| Flag | Meaning |
|---|---|
| `supportsNativeChatEmbed` | Connector has a vendor-supplied chat UI PulsePlay can iframe. |
| `supportsVerifiedArtifacts` | Connector returns provenance (SQL / rows / citation) sufficient for a `verified` artifact. |
| `supportsHybrid` | Connector can render Native Embed inside the artifact canvas with PulsePlay rails. Requires both `supportsNativeChatEmbed` AND `supportsVerifiedArtifacts`. |
| `supportsStreamingReasoning` | Connector emits incremental reasoning / progress events. |
| `supportsGroundedSql` | Connector returns SQL alongside results. Strict subset of `supportsVerifiedArtifacts`. |

### Modes (workbench runtime presentations)

| Mode | Requires | Default for |
|---|---|---|
| `native-embed` | `supportsNativeChatEmbed` | (none — opt-in only) |
| `verified` | `supportsVerifiedArtifacts` | All non-Genie connectors |
| `hybrid` | All three of `supportsNativeChatEmbed`, `supportsVerifiedArtifacts`, `supportsHybrid` | Genie |

### Resolver policy

`resolveAssistantMode({ capabilities, preference, requireVerified, requireNativeEmbed })`:

1. Compute the set of modes the capabilities advertise via `supportedModes()`, fidelity-ordered (hybrid > verified > native-embed).
2. If `requireVerified` is set, drop any mode that doesn't support verified artifacts. If none survive, return `{ mode: null, reason: 'forced-verified' }`.
3. If `requireNativeEmbed` is set, drop any mode that doesn't embed the native chat. If none survive, return `{ mode: null, reason: 'forced-native-embed' }`.
4. If `preference` is set AND in the surviving modes, return `{ mode: preference, reason: 'preference' }`.
5. Otherwise return the highest-fidelity surviving mode with `reason: 'capability'`.
6. If no mode survives at all, return `{ mode: null, reason: 'no-mode-available' }`.

The LLM cannot expand the supported set. Only the capability matrix can. This is the type-level analog of the artifact validation gate (which prevents the LLM from self-declaring `Verified`).

### Initial matrix

| Connector | Native | Verified | Hybrid | Streaming | Grounded SQL |
|---|:--:|:--:|:--:|:--:|:--:|
| `genie` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `supervisor-local` | — | ✅ | — | ✅ | ✅ |
| `supervisor` | — | ✅ | — | ✅ | ✅ |
| `foundation-model` | — | ✅ | — | ✅ | ✅ |
| `openai-chat` | — | ✅ | — | ✅ | — |
| `openai-analytics` | — | ✅ | — | ✅ | ✅ |
| `bedrock-rag` | — | ✅ | — | ✅ | — |
| `bedrock-direct` | — | ✅ | — | ✅ | — |
| `responses-agent` | — | ✅ | — | ✅ | ✅ |
| `generic` | — | — | — | — | — |

Only Genie supports hybrid today. The matrix has explicit invariant tests so a future "set supportsHybrid=true without prerequisites" mistake fails CI.

### Artifact model

The workbench renders `WorkbenchArtifact` objects with one of four statuses (`verified` / `grounded-draft` / `suggestion` / `blocked`) and a tab set drawn from `WorkbenchTab` (`answer` / `chart` / `table` / `sql` / `evidence` / `reasoning`). The status is **emitted by the validator**, never declared by the LLM. The validator is Step 4; the type contract for it lives in [playground/src/types/assistant.ts](../../playground/src/types/assistant.ts) so downstream slices can be implemented without re-litigating the shape.

Citations are a discriminated union: `sql` / `dax` / `result-rows` / `vendor` / `pack` / `vector`. Charts are Vega-Lite specs at this layer (ECharts compilation is Step 5). Tabular results carry typed columns. No `any` types.

## Consequences

**Positive:**

- New connectors land as a new row in the matrix + an entry in the proxy `classifyConnectorType` + matching tests. No render-code change needed.
- The "only Genie supports hybrid today" lock is enforced by a test, not by convention; we'll know the day a second hybrid-capable vendor arrives.
- The workbench shell (Step 3) is pure presentation: `resolveAssistantMode` tells it what to render; capabilities tell it which tabs to enable.
- The validator (Step 4) and chart registry (Step 5) consume well-defined types that are stable across the workbench surface.

**Negative:**

- Five boolean flags is more state per connector than the prior "type tag only" approach. Justified because the workbench needs orthogonal mode/verification/streaming decisions, and conflating them into one tag was what made the current `AISidebar` hard to evolve.
- The matrix is hand-authored. Adding a connector requires updating both the proxy `classifyConnectorType` and the workbench matrix. The matrix exhaustiveness test catches the second omission; there's no test today catching the first.
- The matrix says `responses-agent` is verified + streaming + grounded-sql, but `classifyConnectorType` in the proxy doesn't currently classify it (it returns one of the older nine tags). Tracked as a follow-up; doesn't block Step 1 because the type registry is forward-compatible.

## Alternatives considered

- **One mode per connector type, no flags.** Rejected: collapses orthogonal decisions into a tag, and forces a code change whenever a vendor adds a new capability.
- **Capability flags inferred from `ConnectorProbeResult` at runtime.** Rejected for Step 1: the probe shape is loose (`metadataAvailability: "rich" | "minimal" | "none"`), and Step 1 needs a stable contract before the runtime inference adapter can land. Probe-to-descriptor adaptation is a downstream concern.
- **Make the LLM emit `mode` per response.** Rejected: an LLM cannot be trusted to know what the workbench can render. Same reasoning that excludes the LLM from emitting artifact `status`.

## Files

- [playground/src/types/assistant.ts](../../playground/src/types/assistant.ts) — type contract: `AssistantMode`, `ConnectorType`, `ConnectorCapabilities`, `WorkbenchArtifact`, `ArtifactStatus`, `WorkbenchTab`, `ArtifactCitation`, etc.
- [playground/src/lib/connectorCapabilities.ts](../../playground/src/lib/connectorCapabilities.ts) — `CONNECTOR_CAPABILITIES` matrix, `supportedModes()`, `resolveAssistantMode()`, `connectorsMatching()`.
- [playground/src/lib/__tests__/connectorCapabilities.test.ts](../../playground/src/lib/__tests__/connectorCapabilities.test.ts) — 35 tests covering exhaustiveness, cross-capability invariants, mode resolution policy, single-vendor locks, and resolver edge cases.

## Related

- [UNIFIED_ASK_PULSE_WORKBENCH.md](../UNIFIED_ASK_PULSE_WORKBENCH.md) — strategy lock + 7-step build sequence (this ADR is Step 1).
- [ADR-0007](0007-backend-adapter-abstraction.md) — proxy-side `BackendAdapter` interface (the X-axis abstraction this ADR's matrix lives on top of).
- [ERROR_HANDLING_STRATEGY.md](../ERROR_HANDLING_STRATEGY.md) — Step 4 validation gates will emit `Blocked` artifacts via Problem Details.
- [PROMPT_IR_ARCHITECTURE.md](../PROMPT_IR_ARCHITECTURE.md) — per-backend translators stay; the artifact validator consumes their output.
