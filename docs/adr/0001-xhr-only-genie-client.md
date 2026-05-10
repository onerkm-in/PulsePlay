# ADR-0001 — Genie REST client uses XHR, never `fetch`

**Status:** Accepted (2025-11; reaffirmed every session)
**Owners:** maintainer

## Context

`genieChatVisual/src/genie.ts` is the only network surface that reaches Databricks Genie. The custom visual runs inside Power BI Desktop's iframe sandbox.

`fetch` calls inside the sandbox are blocked silently by Power BI Desktop — they never resolve, they never reject, and there is no console log indicating a CSP / sandbox denial. Earlier attempts to use `fetch` produced "the visual just hangs" reports that were impossible to debug from end-user logs.

Power BI Online (Service) tolerates `fetch`, but Desktop is the dominant authoring surface. We cannot rely on browser features that work in Service-only.

## Decision

`genie.ts` uses `XMLHttpRequest` for every request, including:

- Genie space POST (start conversation / continue conversation)
- attachment polling
- query result fetches
- supervisor synthesis calls (when routed through the proxy)

`fetch` is forbidden in this file and any file it transitively depends on. The codebase does use `fetch` in the proxy and in tests; that is fine because those run outside the visual sandbox.

## Consequences

- All Genie code paths use callback-style XHR with manual JSON parsing — no `await fetch().then(r => r.json())` ergonomics.
- AbortController support is implemented manually via `xhr.abort()`.
- Streaming-style responses are not possible; every Genie call is one shot.
- Reviewers should reject any PR that introduces `fetch(` inside `genieChatVisual/src/`.

## Tripwire

[`CLAUDE.md`](../../CLAUDE.md) lists this under **Tripwires**. Keep that copy in sync if this ADR changes.
