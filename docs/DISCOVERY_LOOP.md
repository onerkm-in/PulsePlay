# Discovery Loop — Design Spec

> **Status:** Phase A design lock (2026-05-13). Implementation tracked in
> [AGENDA.md](AGENDA.md) under "Discovery loop".
>
> **Sibling spec:** [STAGED_RENDERING.md](STAGED_RENDERING.md) — the "1-then-3"
> orchestration spec that consumes this discovery output.

## What it is

A **pre-flight loop** that runs once when the user enters the playground (or
when context changes) and produces a single fused snapshot answering three
questions:

1. **What data is reachable?** — schema, KPIs, measures, dimensions
2. **What analysis frames work here?** — BCG, SWOT, Pareto, Five Forces,
   vertical presets, free-text
3. **What sensible parameter defaults can we propose?** — sliders vs steppers
   vs dropdowns, with min/max/typical-value hints

The output is **cached in `sessionStorage`** keyed on
`(vendor, biUrl, pack, profile)` with a 15-minute TTL. UI surfaces read from
the cache; they never wait on a fresh probe at user-click time. This makes
the Frame dropdown feel **instant** and removes the "stare at a spinner
waiting to find out if this works" failure mode.

## Why this matters

Today the UX cost of asking the AI a question is **N + 1 round trips**:

1. User types a question
2. Proxy fans out, generates SQL, executes, narrates
3. *Maybe* it works — *maybe* the underlying data doesn't have the KPI
   the user assumed

The discovery loop moves the "is this answerable" check **before** the user
commits. By the time the dropdown opens, the system already knows whether
BCG works for this dashboard, and the parameter sliders already know what
range makes sense.

## Inputs

The loop reads from three sources and **fuses** them. Each source is
optional — the loop degrades gracefully when one is missing.

### Source 1: AI brain probe (already exists)

`POST /assistant/probe` returns a `ConnectorProbeResult` for the active
profile. Already implemented in [`proxy/lib/connectorProbe.js`](../proxy/lib/connectorProbe.js).
Yields:

- `connectorType` — `genie / openai / bedrock / foundation-model / supervisor`
- `metadataAvailability` — `rich / minimal / none`
- `schema.tables[]` with columns (Genie's certified space metadata)
- `declaredKpis[]` — KPIs Genie has been told about
- `sampleQuestions[]` — author-curated probe questions
- `inference` — pack-matcher suggestion (might propose a different pack)

### Source 2: BI surface metadata (new — needs adapter contract extension)

A new optional `BIAdapter.getMetadata(): Promise<BIMetadata | null>`
returning what the **currently mounted view** exposes. Adapters that can't
introspect their content return `null` and the loop falls back to AI-side
data only.

```ts
export interface BIMetadata {
    /** Active page / sheet / dashboard identifier */
    activeViewId: string | null;
    /** Visible measure-like fields with their semantic role hint */
    visibleMeasures: Array<{
        name: string;
        kind?: "currency" | "percent" | "count" | "ratio" | "time" | "rate";
        format?: string;     // e.g. "$#,##0.00", "0.00%"
        aggregation?: "sum" | "average" | "min" | "max" | "count" | "distinct-count";
    }>;
    /** Visible category-like fields (filterable dimensions) */
    visibleDimensions: Array<{
        name: string;
        kind?: "time" | "geography" | "product" | "customer" | "channel" | "other";
        cardinalityHint?: "low" | "medium" | "high" | "unknown";
    }>;
    /** Currently applied filters / slicers (already accumulated via BIEvents
     *  in App.tsx; mirroring here for discovery convenience) */
    activeFilters: Array<{ field: string; value: unknown }>;
}
```

**Per-vendor implementation matrix:**

| Vendor | `getMetadata()` |
|---|---|
| Power BI | Real — `report.getActivePage().getVisuals().getCapabilities()` via `powerbi-client` |
| generic-iframe | Returns `null` — iframe boundary prevents introspection |
| Tableau / Qlik / Looker | Stub `null` until SDK graduation; design intentionally degrades to AI-side only |

### Source 3: Pack KPI list (already authored)

For the active pack and sub-vertical, parse `pulsepacks/<pack>/<sv>/kpis.md`
into a structured list. Today this content is rendered as raw markdown in
the Knowledge Base page; the discovery loop is the first runtime use of it.

```ts
export interface PackKpi {
    name: string;             // "OTIF"
    definition: string;       // "On-Time-In-Full — …"
    units?: "percent" | "currency" | "count" | "ratio" | "days" | "score";
    direction?: "higher-is-better" | "lower-is-better" | "context-dependent";
    formula?: string;         // optional SQL or DAX hint
}
```

The parser is a thin markdown-list reader; it doesn't try to be smart. If a
pack's `kpis.md` doesn't follow the expected shape, the parser returns an
empty list and emits a warning. The pack-author owns the authoring contract.

## Output — the Discovery Snapshot

```ts
export interface DiscoverySnapshot {
    snapshotVersion: 1;
    fetchedAt: string;                    // ISO timestamp
    expiresAt: string;                    // fetchedAt + 15min
    cacheKey: string;                     // sha256(vendor|biUrl|pack|profile)
    sources: {
        probe: ConnectorProbeResult | null;
        biMetadata: BIMetadata | null;
        packKpis: PackKpi[];
    };
    fused: {
        availableKpis: FusedKpi[];        // pack KPIs aligned with Genie schema
        reachableFrames: ReachableFrame[];
        unreachableFrames: UnreachableFrame[];
    };
    warnings: string[];
}

export interface FusedKpi {
    name: string;
    source: "pack" | "probe" | "bi-surface";
    definition?: string;
    units?: PackKpi["units"];
    direction?: PackKpi["direction"];
    /** Tables/columns from probe schema that map to this KPI, if known */
    grounded: Array<{ table: string; column: string }>;
    /** True when both pack and probe agree on the KPI */
    aligned: boolean;
}

export interface ReachableFrame {
    frameId: string;                       // "BCG", "SWOT", "Pareto", "cpg-fmcg-supply-chain", …
    label: string;
    description: string;
    /** Why we think this frame works here */
    rationale: string;
    /** Auto-derived parameter defaults */
    params: Record<string, ParamProposal>;
}

export interface UnreachableFrame {
    frameId: string;
    label: string;
    /** Why we think this frame WON'T work — surfaced as tooltip */
    blockedBy: string;                     // "BCG needs a market-share KPI; not found"
}

export interface ParamProposal {
    /** Type the preset author declared */
    declaredType: "currency" | "percent" | "number" | "string" | "period";
    /** Type the discovery loop UPGRADED to, based on data signals.
     *  e.g. declared "number" but distribution looks continuous → "slider" */
    suggestedControl: "currency-input" | "percent-input" | "number-input"
                    | "slider" | "stepper" | "multi-select" | "period-picker";
    /** The default value to seed the form with */
    suggested: unknown;
    /** Range hints for sliders/steppers */
    min?: number;
    max?: number;
    step?: number;
    /** Enumerated options for multi-select */
    options?: Array<{ value: string; label: string }>;
    /** Where the default came from — shown as tooltip ("🪄 auto-suggested") */
    origin: "static-default" | "from-pack" | "from-probe" | "from-bi-metadata";
    originDetail?: string;                 // e.g. "median YoY growth across visible measures"
}
```

## Fusing logic — the brutal-honest version

Fusion is **set intersection with bias toward authored content**:

1. **KPI fusion**:
   - Start with `packKpis` (highest-trust — author-curated)
   - For each pack KPI, look for a matching column in `probe.schema.tables[].columns[]`
     using a fuzzy name match (case-insensitive, ignore underscores). Mark as `aligned: true` when found.
   - Add probe-discovered KPIs not in the pack as `source: "probe"`, `aligned: false`
   - Add BI-visible measures not in pack/probe as `source: "bi-surface"`

2. **Frame reachability** — each preset declares prerequisites (in code today,
   moved to the preset's TypeScript declaration in Phase C):
   ```ts
   export const BCG: CustomSectionPreset = {
       id: "bcg-matrix",
       ...
       prerequisites: {
           needsMeasure: { kinds: ["currency"], minCount: 1 },     // revenue
           needsTimeDimension: true,                                // growth axis
           needsShareableDimension: { kinds: ["product", "customer"], minCount: 1 },
       },
   };
   ```
   The fuser walks each preset's prerequisites against `availableKpis +
   biMetadata.visibleDimensions`. If all satisfied → `ReachableFrame` with
   rationale; otherwise → `UnreachableFrame` with `blockedBy` reason.

3. **Param proposals** — for each reachable frame, walk its declared `params`:
   - If the param's `type` matches a visible numeric distribution → propose
     `slider` control with `min/max` from the data
   - If the param's `type` is `string` and the schema has a finite enum →
     propose `multi-select` with options from the schema
   - Otherwise → keep the declared control with the static default
   - Always include `origin` so the UI can show "🪄 auto-suggested" tags

## Caching

**Three-layer cache**:

| Layer | Where | TTL | Invalidation |
|---|---|---|---|
| `sessionStorage` (client) | `playground/src/lib/discoveryClient.ts` | 15 min | New `cacheKey` (vendor/biUrl/pack/profile change) |
| In-memory map (proxy) | `proxy/lib/discoveryEngine.js` | 60 sec | LRU eviction at 200 entries |
| `probeConnector` cache | `proxy/lib/connectorProbe.js` | already cached today | n/a |

Why two TTLs? The client-side 15-min cache survives tab switches and
back-button navigations. The proxy-side 60-sec cache absorbs the "5 users
on the same dashboard" thundering herd without overloading Genie's metadata
API. The probeConnector cache underneath that is already battle-tested from
the Smart Connect rollout.

**Cache busting**:
- New BI mount → new `cacheKey` (biUrl changes) → fresh probe
- Pack switch → new `cacheKey` → fresh probe
- Profile switch → new `cacheKey` → fresh probe
- Filter change → cacheKey unchanged → reuse (filter context is overlaid
  on the cached snapshot, not part of the cache key)
- User clicks "Refresh discovery" → bypass all caches

## Endpoint contract

```
POST /assistant/discover

Request:
{
    assistantProfile: string,    // routes to a profile
    pack?: string,
    subVertical?: string,
    biMetadata?: BIMetadata,     // forwarded from BIAdapter.getMetadata()
    bypassCache?: boolean
}

Response: DiscoverySnapshot

Errors:
- 400 "Invalid pack identifier" if pack/sv fails isSafePackSegment
- 404 "No matching profile" if assistantProfile not allowlisted
- 503 "Probe time-budget exceeded" if probeConnector hits the 8-sec ceiling
       (degraded snapshot still returned with metadataAvailability: "minimal")
```

**Allowlist gating**: the endpoint runs through the same allowlist check as
`/assistant/probe` — packs and profiles must be in the user's visible
allowlist when one is configured.

**Rate-limit**: shares the `/assistant/probe` bucket. Both are
"warm-up before asking" operations; the existing rate limit is sufficient.

## Performance budget

| Step | Budget |
|---|---|
| `probeConnector` (Genie metadata fetch) | 8 sec hard cap (already enforced) |
| BIAdapter.getMetadata() | 500 ms soft target |
| Pack KPI parse | < 50 ms (markdown) |
| Fusion logic | < 20 ms (pure computation) |
| **Total end-to-end** | **~1 sec typical, 8 sec worst-case** |

The 15-min sessionStorage cache means typical interactive sessions hit the
cache and pay ~5ms. Only the first interaction per (vendor, biUrl, pack,
profile) tuple pays the full cost.

## What NOT to put in the discovery loop

- **Anything that requires executing SQL.** Probe returns `query_text`
  examples without executing them. SQL execution is the user's "Run" click,
  not pre-flight. Pre-flight stays cheap.
- **LLM calls.** No LLM is involved in discovery. It's pure schema +
  metadata + author-content fusion.
- **Per-question parameter tuning.** Param defaults are seeded once at
  frame-pick time and overridable in the inline form. The discovery loop
  doesn't re-fire on every parameter slider drag.

## Tests

The proxy-side discovery layer is covered by:

- `proxy/tests/discoveryEngine.test.js` — unit tests for fusion logic against
  fixture probe results + pack KPIs
- `proxy/tests/discoveryRoute.test.js` — endpoint tests with allowlist,
  rate-limit, cache hit/miss
- Integration: `proxy/tests/discoveryEngine.cpgFmcg.test.js` — runs against
  the real `cpg-fmcg/supply-chain` pack to lock the fused output

Frontend coverage:

- `playground/src/lib/__tests__/discoveryClient.test.ts` — sessionStorage
  cache behaviour, cacheKey derivation, TTL expiry
- Frame dropdown component test (lives near AISidebar)

## Phase boundaries

| Phase | Spec section | Lands |
|---|---|---|
| A | Endpoint + cache + reachability + static param defaults | This cycle |
| B | SQL transparency (CTE-comment markers) — see [STAGED_RENDERING.md §SQL Provenance](STAGED_RENDERING.md#sql-provenance) | Same cycle or next |
| C | Auto-derived param defaults with slider/stepper upgrade | Cycle after A |
| D | Per-section "1-then-3" rendering — see [STAGED_RENDERING.md](STAGED_RENDERING.md) | Cycle after C |

## Open questions for the next session

1. **BIAdapter.getMetadata() contract** — does adding this method break the
   conformance test? It's optional so existing adapters can stub. Verify in
   the conformance harness.
2. **Pack-author authoring contract for `prerequisites`** — today the
   prerequisites live in TypeScript next to the preset definition. Should
   we expose this as YAML in the IR? Probably yes in Phase C; not blocking.
3. **What's the right LLM-free reachability heuristic for SWOT?** SWOT is
   qualitative — no specific KPI prerequisite. The heuristic might be
   "always reachable if the pack has narrative content (`ontology.md` or
   `references.md`)". Worth a deeper look in Phase C.
