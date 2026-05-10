# Architecture Decision Records (ADRs)

These records capture the load-bearing technical decisions in this project — the ones a future contributor would otherwise have to reverse-engineer from `HANDOVER.md`, the auto-memory, or a half-remembered tripwire in `CLAUDE.md`.

Each ADR follows the lightweight Michael Nygard format:

- **Status** — Accepted / Superseded / Deprecated
- **Context** — what forced the decision
- **Decision** — what we chose
- **Consequences** — what we now have to live with

Add a new ADR when you make a decision that:

1. Is hard to undo (data shape, network protocol, build pipeline).
2. Will surprise a future contributor (workaround for a host bug, non-obvious performance trade-off).
3. Is policy, not code (how we handle tokens, how we name things, what we don't test).

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-xhr-only-genie-client.md) | Genie REST client uses XHR, never fetch | Accepted |
| [0002](0002-dual-bind-127-not-localhost.md) | Proxy binds 127.0.0.1 + ::1; visual uses 127.0.0.1 | Accepted |
| [0003](0003-supervisor-stagger-800ms.md) | Supervisor stage stagger is 800 ms | Accepted |
| [0004](0004-format-pane-json-string-storage.md) | Format-pane stores complex shapes as JSON strings | Accepted |
| [0005](0005-two-tier-insights-cache.md) | AI Insights uses a two-tier (memory + localStorage) cache | Accepted |
| [0006](0006-trend-pill-allowlist.md) | Trend pills use a section allowlist + numeric anchor | Accepted |
| [0007](0007-backend-adapter-abstraction.md) | BackendAdapter interface + per-connector files (IDEA-023) | Spike landed |
