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

| # | Title | Status (PulsePlay context) |
|---|---|---|
| [0001](0001-xhr-only-genie-client.md) | Genie REST client uses XHR, never fetch | Superseded — DwD/Pulse-legacy; PulsePlay runs in a real browser |
| [0002](0002-dual-bind-127-not-localhost.md) | Proxy binds 127.0.0.1 + ::1; client uses 127.0.0.1 | Accepted (still applies to local dev) |
| [0003](0003-supervisor-stagger-800ms.md) | Supervisor stage stagger | Accepted; title says 800 ms but actual is 2000 ms — title rename pending |
| [0004](0004-format-pane-json-string-storage.md) | Format-pane stores complex shapes as JSON strings | Superseded — DwD/Pulse-only; no PBI format pane in PulsePlay |
| [0005](0005-two-tier-insights-cache.md) | AI Insights uses a two-tier (memory + localStorage) cache | Accepted; applies once AI Insights pipeline is ported (v0.3+) |
| [0006](0006-trend-pill-allowlist.md) | Trend pills use a section allowlist + numeric anchor | Superseded for v0.x; applies if/when insights renderer is ported |
| [0007](0007-backend-adapter-abstraction.md) | BackendAdapter interface + per-connector files (IDEA-023) | Spike landed; conceptual ancestor of PulsePlay's BIAdapter (Y-axis mirror) |

## Notes for new ADRs

PulsePlay's defining design (the 2-axis abstraction) is implemented across two sibling concepts:

- **Connector axis (X)** — `BackendAdapter` family, ADR-0007. Lives in proxy profile types.
- **BI vendor axis (Y)** — `BIAdapter`, in [`playground/src/biPanel/BIAdapter.ts`](../../playground/src/biPanel/BIAdapter.ts). The mirror of ADR-0007 on the BI vendor side. A future ADR-0008 should formally document it once the first real vendor adapter graduates from stub.
