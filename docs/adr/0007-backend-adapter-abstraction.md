# ADR-0007 — BackendAdapter abstraction (IDEA-023)

**Status:** Spike landed in Pulse (Session 53). Interface + stubs in place; full migration of GenieClient deferred. **Conceptual ancestor of PulsePlay's `BIAdapter`**: this ADR's `SingleSpaceBackend` / `SupervisorBackend` interfaces describe the **connector-side** (X-axis) abstraction, while PulsePlay's [`BIAdapter`](../../playground/src/biPanel/BIAdapter.ts) is the **BI-vendor-side** (Y-axis) mirror of the same pattern. PulsePlay applies the principle on both axes; Pulse only had it on one.

**Date:** 2026-05-02

## Context

The product vision is **plug-and-play, generic, not Genie-specific**. The
visual today only knows how to talk to Databricks Genie (via Direct, Proxy,
Supervisor, Gateway, Azure OpenAI proxy, or Bedrock proxy modes). Adding
a new connector — say a real Bedrock Knowledge Base, an Azure AI Foundry
agent, or a Microsoft Fabric Copilot — currently requires changes scattered
across `genie.ts`, `proxy/server.js`, `visualHelpers.ts`, and the settings
model.

The user's stated direction is two connector shapes:

- **Single-space connector** — one upstream backend (one Genie space, one
  OpenAI deployment, one Bedrock model). The visual orchestrates the
  multi-stage AI Insights pipeline by issuing N sequential conversations.
- **Supervisor connector** — server-side orchestrator that fans out to
  multiple single-space backends and returns one synthesized answer.

A new connector should drop in as a separate file conforming to the same
interface, without touching the visual or breaking existing connectors.

## Decision

Define `SingleSpaceBackend` and `SupervisorBackend` interfaces in
`genieChatVisual/src/backend/BackendAdapter.ts`. Both interfaces capture
the public surface of the existing `GenieClient`. New connectors implement
the interface in their own file (`BedrockBackend.ts`, `OpenAIBackend.ts`,
etc.) and a future `BackendFactory` selects the right one based on
`connectionMode`.

**Migration in three phases:**

1. **Spike (Session 53 — this commit):** Add the interface + stub files
   for Bedrock and OpenAI. No runtime change. GenieClient is not yet typed
   as `implements SingleSpaceBackend`. Pure shape-discovery work.

2. **Conformance (next session):** Make `GenieClient implements
   SingleSpaceBackend, SupervisorBackend, BackendExtras`. The compiler
   will then enforce signature drift. Any divergence will need to be
   resolved by either adapting the interface or adapting GenieClient.

3. **Factory + dispatch (sprint-level):** Replace the visual's direct
   `new GenieClient(config)` with `BackendFactory.create(config)` that
   returns the right adapter. At this point, swapping Bedrock for Genie
   becomes a one-line config change rather than a code change.

**Why we keep GenieClient as the canonical implementation for now:**

- It works. Tests cover it. A big-bang split under live-testing pressure
  risks regressions.
- The interface gives future connectors a stable target without forcing
  the existing one to change.
- Extras (`submitFeedback`, `saveHistory`, `getHistory`, `evaluateConfidence`,
  `suggestInsightsConfig`, `checkProxyHealth`) are made optional via the
  `BackendExtras` interface so non-proxy backends can no-op them.

## Consequences

**Positive:**

- New connectors land as separate files, not as new `connectionMode`
  branches inside `genie.ts`.
- The visual can mock backends in tests via the interface.
- The product vision (plug-and-play, swappable backends) has a concrete
  shape future contributors can target.

**Negative:**

- Two shapes (single-space + supervisor) instead of one — slight cognitive
  overhead. Justified because the supervisor's `startSupervisorStream`
  and `getProfiles` methods don't apply to single-space backends and
  shouldn't pollute that interface.
- GenieClient still owns the `connectionMode` switching internally; the
  factory pattern that makes this go away is deferred to phase 3.
- Stub files for Bedrock and OpenAI throw on construction. The existing
  proxy `/bedrock/*` and `/openai/*` routes still work via GenieClient's
  internal mode switching — these stubs are placeholders for the
  IDEA-019 + IDEA-023 implementations that will eventually own those paths.

## Files

- `genieChatVisual/src/backend/BackendAdapter.ts` — interfaces
- `genieChatVisual/src/backend/GenieBackend.ts` — re-export shim around GenieClient
- `genieChatVisual/src/backend/BedrockBackend.ts` — stub (NOT_IMPLEMENTED)
- `genieChatVisual/src/backend/OpenAIBackend.ts` — stub (NOT_IMPLEMENTED)

## Related

- IDEA-019 — Azure OpenAI + AWS Bedrock demo pages (gated on real creds)
- IDEA-023 — BackendAdapter abstraction (this ADR)
- IDEA-038 — Setup cockpit refactor (separate AI Insights / Chat tabs;
  this work runs in parallel and doesn't block backend abstraction)
