# ADR-0002 — Proxy binds 127.0.0.1 + ::1; visual uses 127.0.0.1, never `localhost`

**Status:** Accepted (2025-12)
**Owners:** maintainer

## Context

The proxy serves the visual at `http://<host>:8787`. On Windows 11, `localhost` resolves to `::1` (IPv6) before `127.0.0.1` (IPv4) because of how the Hosts file and the IPv6 stack are configured by default.

When the proxy bound only on IPv4 (`127.0.0.1`), every visual request that used `localhost` paid a ~2 second IPv6-first-then-fall-back penalty. AI Insights felt unbearably slow even though the model itself responded quickly.

Authoring guidance to "use `127.0.0.1`" is fragile — authors copy-paste examples, and any drift to `localhost` reintroduces the penalty.

## Decision

Two halves to the decision:

1. **Proxy dual-binds.** `proxy/server.js` listens on both `127.0.0.1` (IPv4) and `::1` (IPv6) so the path is fast regardless of which the client picks.
2. **Visual hardcodes `127.0.0.1`.** Every PBIP `visual.json`, every script, every doc example uses `http://127.0.0.1:8787`. Setup tab validation flags `localhost` with an info-level message.

## Consequences

- Authors who paste `localhost:8787` are warned but not blocked — they can ship if they accept the latency.
- A future deploy to a remote host (Databricks Apps, Azure Container Instance) will need its own ADR; the dual-bind logic is local-only.
- Smoke scripts (`smoke-full.ps1`, `smoke-rls-ols.ps1`) all hit `127.0.0.1:8787`.

## Tripwire

[`CLAUDE.md`](../../CLAUDE.md) records this under **Tripwires**.
