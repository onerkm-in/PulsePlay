# ADR-0005 — AI Insights uses a two-tier (memory + localStorage) cache

**Status:** Accepted (2026-03)
**Owners:** maintainer

## Context

A full AI Insights run is 5–7 stages of Genie calls plus a synthesis step. End-to-end latency is 30–90 seconds depending on the warehouse's cold-start state. The user pays this cost on every Power BI page switch because the host re-mounts the visual on navigation.

Without caching, the user perceives "this thing breaks every time I navigate" — the Insights pane goes blank, fires the pipeline again, and the user waits.

Two distinct survival horizons:

1. **Within-session re-mounts** (page switch, theme apply, format-pane reopen) — needs to be instant.
2. **Cross-session** (close the report, reopen the next morning) — should still hit cache if nothing material has changed.

## Decision

`genieChatVisual/src/insightsCache.ts` implements a two-tier cache:

- **Memory tier** — module-level `Map<string, CachedInsightsEntry>` for the current iframe session. Sub-millisecond reads.
- **Persistent tier** — `localStorage` with TTL (default 30 min, configurable via `insightsCacheTtlMinutes`). Survives report close/reopen.

Read order: memory first; on miss, hydrate from localStorage; on miss there too, run the pipeline. Writes go to both tiers.

The cache key is composed by `composeInsightsSettingsFingerprint` from every input that affects the prompt:
- prompt-shape inputs (`insightsAuthoringMode`, `insightsDomain`, `insightsCustomSections`, `insightsDomainGuidance`, `metricDirectionRules`, `insightsMetricDirections`)
- guidance / context inputs (`domainGuidance`, `genieFields`, `sendContextToGenie`)
- network / scope inputs (`host`, `apiBaseUrl`, `roleMode`, `selectedFilters`, `kbFlags`)

Theme is **not** part of the key. Theme changes shouldn't bust insights — that was the original bug that motivated this design.

## Consequences

- Adding a new prompt-affecting setting requires three coordinated edits: the field in `setupDraft.ts`, the fingerprint in `insightsCache.ts`, the `useCallback` deps in `visual.tsx`. Codex Review #2 C1 was an example of what happens when one of those is missed.
- The parity test in `tests/insightsCache.test.ts` asserts each fingerprint field independently busts the cache. A future change that adds a field without updating the test is a tripwire — fixed by extending the `fields` array in that test.
- Field-order changes in the fingerprint require bumping `CACHE_PREFIX` (currently `dwd-ai-insights:v2:`), which orphans every previously cached entry. This is intentional and not a problem because Insights re-runs anyway.
- The 30-minute default TTL is a guess; surface telemetry later (M1) will let us tune it to actual hit rate.
