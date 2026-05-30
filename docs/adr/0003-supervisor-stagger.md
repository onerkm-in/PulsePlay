# ADR-0003 — Supervisor stage stagger

**Status:** Accepted (2026-01), revised (2026-05). Original ADR title and decision value (800 ms) are historical; **shipping default is now 2000 ms**. Verified at [proxy/server.js:6385](../../proxy/server.js#L6385) on 2026-05-20: `const STAGGER_MS = supervisorProfile.staggerMs ?? 2000;`. File renamed from `0003-supervisor-stagger-800ms.md` to `0003-supervisor-stagger.md`; the title was kept generic to avoid the next tuning cycle invalidating it again.

**Owners:** maintainer

## Context

Supervisor mode fans a single user prompt out to N helper Genie spaces in parallel and synthesises the answers. Without staggering, all N spaces start their conversations within a few milliseconds of each other. Genie's per-space concurrency limits and the warehouse cold-start path then serialise them anyway, but the visual ends up showing N "Working..." rows that all fire at once and finish in a clump.

Two problems with that:

1. **Perceived latency** — the user stares at a screen with no progress for 6–10 seconds, then everything paints at once. Felt slower than it actually was.
2. **Rate-limit pressure** — if any helper space is also serving an interactive user, the synchronous burst can push them past the per-space cap and trigger 429s.

## Decision

The proxy fires helper requests with a fixed delay between each. The default applied when the deployer hasn't pinned a value via `config.supervisor.staggerMs` or `SUPERVISOR_STAGGER_MS` env var has been tuned iteratively as we observed real-world traffic:

| Era | Default | Why |
|---|---|---|
| 2026-01 (initial decision) | **350 ms** | First gut estimate — just enough to break the synchronous burst. |
| 2026-02 (post first user-test sessions) | **800 ms** | Median of "first tile paints → second tile paints" timing that felt natural. This was the original ADR-0003 decision. |
| 2026-03 (post Genie capacity work) | **1500 ms** | After Genie's per-space caps tightened, 800 ms was still tripping 429s on shared spaces during peak. |
| 2026-05 (current) | **2000 ms** | Demo cycles showed users tolerated the extra wall-clock when each tile painted on its own visible beat. Also gives Foundation Model warmups headroom on cold workspaces. |

The number is empirical; the right value is the one the next user-test session validates, not the one in a doc. The mechanism (`STAGGER_MS = supervisorProfile.staggerMs ?? <default>`) hasn't changed across all four tunings.

## Consequences

- Total supervisor latency is at least `(N - 1) × STAGGER_MS` higher than fully parallel. For N=4 at 2000 ms that's a 6 s artificial floor — accepted because of the perceived-latency-improvement and rate-limit-headroom tradeoffs above.
- The stagger lives in the proxy, not the visual. A future change (per-helper, adaptive backoff, "first paints fast then slow down") would happen in `proxy/server.js`.
- This number is the kind of decision that gets quietly overridden by a refactor or a tuning sprint. **If you change it, add a row to the history table above with the new evidence.** Don't silently mutate the constant.
- The original 800 ms decision rationale (post-user-test session timing) is preserved in the history table — it's no longer the shipping number, but the *method* (observe user timing, pick the median) is still how we'd validate the next change.
