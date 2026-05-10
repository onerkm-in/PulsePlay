# ADR-0003 — Supervisor stage stagger is 800 ms

**Status:** Accepted (2026-01)
**Owners:** maintainer

## Context

Supervisor mode fans a single user prompt out to N helper Genie spaces in parallel and synthesises the answers. Without staggering, all N spaces start their conversations within a few milliseconds of each other. Genie's per-space concurrency limits and the warehouse cold-start path then serialise them anyway, but the visual ends up showing N "Working..." rows that all fire at once and finish in a clump.

Two problems with that:

1. **Perceived latency** — the user stares at a screen with no progress for 6–10 seconds, then everything paints at once. Felt slower than it actually was.
2. **Rate-limit pressure** — if any helper space is also serving an interactive user, the synchronous burst can push them past the per-space cap and trigger 429s.

## Decision

The proxy fires helper requests with a fixed **800 ms** delay between each. Default applied when the deployer hasn't pinned a value via `config.supervisor.staggerMs` or `SUPERVISOR_STAGGER_MS` env var.

The number is empirical:
- `< 500 ms` — the perceived-clump problem returns.
- `> 1500 ms` — total wall-clock for 4 helpers gets long enough that the user wonders if the request died.
- `800 ms` — close to the median of "first tile paints" → "second tile paints" timing that felt natural in the user-test sessions.

## Consequences

- Total supervisor latency is at least `(N - 1) × 800 ms` higher than fully parallel. For N=4 that's 2.4 s of artificial floor — accepted.
- The stagger lives in the proxy, not the visual. A future change-frequency tweak (per-helper, adaptive backoff) would happen in `proxy/server.js`.
- This number is the kind of decision that gets quietly overridden by a refactor. If you change it, update this ADR with the new evidence.
