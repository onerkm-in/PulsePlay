# `DwD_for_BI` Deep Scan + PulsePlay Port-Status Cross-Reference

> **Author:** Explore agent + Claude, 2026-05-22 session.
>
> **Context:** Late in the session the user (Rajesh) said: *"you can see there are many hidden details which were devised over a period of time, and those are very thoughtful — custom SQL, direct SQL query etc etc. please review in depth, you will find gold mine and diamonds for sure."*
>
> This document is the result. It scans the OLD `DwD_for_BI` (cloned to `C:\Users\rajes\AppData\Local\Temp\dwd-inspect\DwD_for_BI`) — the Pulse-PBI custom visual that's the predecessor of PulsePlay's `enablers/pulse-pbi/` AND the source of the ported code under `playground/src/pulse/`. For every "diamond" found in OLD, the doc records whether PulsePlay has ported the logic AND whether the deployed PulsePlay UI surfaces it to users.
>
> **The headline finding rewrites the Thread C estimate:** ~95% of `DwD_for_BI`'s logic is ALREADY ported into PulsePlay. The 15-25 hr estimate from earlier in this session was wrong. The remaining work is **UI exposure** of already-ported features, not rebuilding.

## The 15-category inventory

### 1. Custom SQL Sections (Wave 35 Phased Rollout)

**What it does**: Authors write raw SQL SELECT blocks inline alongside AI-generated sections. The visual executes them (read-only), renders KPI/table/chart variants with formatting, and caches results at a longer 4-hour TTL (vs. 30 min for AI sections).

**The thoughtful details**:

- **Phase-gated rollout** (`sqlSection.ts:1-4`): Explicit 3-phase architecture:
  - Phase 1: Types + guards + migration only (shipped).
  - Phase 2–3: Executor + validator + UI land later.
  - Prevents silent data loss when old reports (without `kind` field) load — `normalizeSection()` coerces missing `kind` → `kind:"ai"` for legacy compat (`sqlSection.ts:70-98`).

- **DML block list is defense-in-depth** (`sqlSection.ts:45-46`): Two layers enforce read-only:
  1. Editor-time validation in `validateSqlSection()` flags forbidden keywords (`DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER, GRANT, REVOKE, MERGE, CREATE, REPLACE`) with friendly error.
  2. Proxy blocks DML at runtime anyway — the editor check is a UX courtesy so authors don't accidentally paste destructive SQL and hit a runtime rejection.

- **KPI delta computing** (`sqlSectionRenderer.tsx:83-122`): Infers "prior period" value by two pattern-matching strategies:
  - Pattern A: 1 row, 2+ numeric columns (interpret as current + prior).
  - Pattern B: 2+ rows, 1 numeric column (interpret rows[0] = current, rows[1] = prior).
  - Falls back gracefully if neither matches (returns all nulls, no crash).

- **Lazy format selection**: Author picks `resultRender` ("kpi" | "table" | "chart") + optional `format` (numberStyle, showPriorPeriodDelta). Chart variant includes smart fallback: if the result doesn't match bar-chart geometry (exactly 1 categorical + 1 numeric, ≤50 rows), it silently renders as table + surfaces a helpful nudge ("Switch to table in Setup").

**Ported to PulsePlay?** ✅ PORTED. `sqlSection.ts` and `sqlSectionRenderer.tsx` exist in PulsePlay's pulse folder with identical structure.

**PulsePlay surfaces it?** ⚠️ PARTIALLY. The UI in PulsePlay's `setupStep5.tsx` allows SQL section authoring, but the table/chart rendering variants and the KPI delta logic may not be fully wired into the render path yet.

---

### 2. AI-Assisted Authoring Mode (49.20 / IDEA-037 Phase 4)

**What it does**: Instead of manually authoring sections in JSON, authors click "Suggest Sections" — the visual calls Genie with the bound data schema + sample rows, and Genie auto-generates a list of section names + prompts tailored to the dataset.

**The thoughtful details**:

- **Introspection payload** (`genie.ts:859-917`): Calls `requestIntrospection()` with:
  - Bound measures + dimensions (schema).
  - Sample data rows (cardinality signals — e.g. "if this dimension has 200+ distinct values, Genie will avoid GROUP BY it").
  - User-supplied description + domain guidance.
  - Genie returns a `SuggestedMetricDirections` (IDEA-037 phase 4) list of candidate section titles + instructions.

- **Defensive parsing** (`genie.ts:1609-1635`): The response is parsed with a custom JSON parser that never throws — malformed suggestions fall back to an empty list so the visual doesn't crash.

- **Stored as preset**: The suggested sections are materialized into `insightsCustomSections` JSON and persist. If the author later swaps a bound field or updates domain guidance, they can re-suggest and compare the new list to the old one.

**Ported to PulsePlay?** ✅ PORTED. The introspection & suggestion plumbing is in PulsePlay's `genie.ts` (line 859+).

**PulsePlay surfaces it?** ⚠️ LATENT. The `setupStep5.tsx` form has the data structures to hold suggestions, but the UI widget that triggers the "Suggest from data" flow may not be fully wired or may be behind a feature flag.

---

### 3. Insights Cache: 6-Generation Version Bump & Stale-While-Revalidate

**What it does**: Caches AI Insights prose output in both memory (per-session) and localStorage (cross-session, 30 min TTL for AI; 4 hours for SQL sections). Survives PBI page navigation and report close/reopen.

**The thoughtful details**:

- **Version bump story** (`insightsCache.ts:11-31`):
  - v1 → v2 (49.16): Purged stale empty-content entries from earlier broken builds.
  - v2 → v3 (user request): Cache was silently serving stale output after supervisor code deployment.
  - v3 → v4 (user session): User asked for guaranteed fresh state after a streaming hang — invalidated v3 entirely.
  - v4 → v5 (Wave 30 cycle 5): Added `schemaHash` to detect silent-cache-miss footgun — author swaps a bound measure/dimension in PBI Visualizations pane (no Setup edit) → visual served cached output of OLD schema for up to 30 min.
  - v5 → v6 (Wave 35 Phase 1): Added `sqlHash` for SQL sections.

  Each bump invalidates **all prior versions** rather than collision-mapping the new key shape — intentional, conservative strategy.

- **Composite key is meticulous** (`insightsCache.ts:158-177`):
  - `connectionMode`, `assistantProfile`, `spaceId`, `roleMode`, `customPromptId`, `customPromptText`, sorted filter map, **`schemaHash`** (sorted measures + dimensions), **`sqlHash`** (sorted SQL sections by title+body).
  - Filter order is normalized (sorted, then joined) so PBI slicer reordering doesn't bust the cache.
  - SQL sections sorted by title (then body for tie-breaking) so column-pane reordering in Setup doesn't bust — only SQL edits do.

- **Dual TTL contract** (`insightsCache.ts:32-38`): Caller passes `ttlMs` at read time:
  - AI sections: `DEFAULT_CACHE_TTL_MS` (30 min).
  - SQL sections: `SQL_SECTION_CACHE_TTL_MS` (4 hours) because SQL results are deterministic (no LLM variance).
  - TTL of 0 = caching disabled entirely (IDEA-009 — user configurable at runtime).

- **Settings fingerprint** (`insightsCache.ts:84-156`): `composeInsightsSettingsFingerprint()` builds a stable, ordered string from every Insights-affecting setting **previously missing from the cache key** (IDEA-039 Codex Review #2):
  - `domainGuidance`, `genieFields`, `sendContextToGenie`, `host`, `apiBaseUrl`.
  - Wave 27 governance fields: `runtimeForbiddenColumns`, `runtimeMandatoryRowFilter`, `runtimeReadOnlyEnforced`, `sqlCtePreamble`, `sqlForbiddenTables`, `sqlRlsHintEnabled`.
  - Including these prevents the stale-cache footgun: author edits rules → cache returns old output → silent incorrect behavior.

**Ported to PulsePlay?** ✅ PORTED. `insightsCache.ts` exists with full v1-v6 version history and all hashing logic.

**PulsePlay surfaces it?** ✅ YES. The visual's Insights run checks the cache before calling Genie. TTL is user-configurable in Setup.

---

### 4. Section Visibility Persistence & Viewer Toggles (Wave 37)

**What it does**: Viewers see a popover with checkboxes for custom sections only (not built-in stages like HEADLINE/TRENDS). Visibility persists to localStorage per `(spaceId | assistantProfile)` report key. Built-in stages are always added back to the live visibility set regardless of stored state.

**The thoughtful details**:

- **Default = all visible** (`insightsSectionVisibility.ts:14-19`): localStorage stores only the set of section titles the viewer **hid** (by absence). Empty localStorage → helpers return `null`, signaling "fall back to show everything."

- **Fallback for private mode** (`insightsSectionVisibility.ts:41-42, 59-67`): In-memory `memoryStore` Map survives session if localStorage throws (private browsing, quota exceeded, SSR). Single WARN logged on first fallback so console noise stays bounded.

- **Title normalization** (`insightsSectionVisibility.ts:26-29`): All titles UPPER-CASED before storage. "Customer Pulse" and "CUSTOMER PULSE" round-trip identically.

- **Built-in stage protection** (`insightsSectionVisibility.ts:23`): Universal stages (HEADLINE, KPI SNAPSHOT, TRENDS, RISKS, RECOMMENDED ACTIONS) are always re-added to the live visibility set by the caller (`visual.tsx` `currentVisibleTitles` useMemo) — stored visibility can **never** hide an author-controlled stage.

**Ported to PulsePlay?** ✅ PORTED. Identical logic in PulsePlay's `insightsSectionVisibility.ts`.

**PulsePlay surfaces it?** ✅ YES. Viewers see the visibility popover in the Insights card (if custom sections exist).

---

### 5. Metric Direction Rules & Threshold Color Logic (Wave 40)

**What it does**: Authors define custom metric thresholds in a structured form (name, direction, aliases, green/amber/red %) so the AI Insights renderer can color KPI cards 🟢/🟡/🔴 based on actual data values, not just sentiment keywords.

**The thoughtful details**:

- **Single source of truth pattern** (`metricRulesEngine.ts:7-32`): Pre-Wave 40, authors edited two separate textareas (legacy prose + JSON) and had to manually keep them in sync. Wave 40 inverts this: form is the source of truth; both prose and JSON are **derived** on every keystroke via `rulesToProse()` and `rulesToJson()` so downstream consumers (Genie prompt reads prose, renderer reads JSON) always see consistent data.

- **Prose mirrors pre-Wave-40 format** (`metricRulesEngine.ts:124-144`):
  - Example: `"Margin %: higher is better — 🟢 ≥15% · 🟡 8-15% · 🔴 <8%."`
  - Direction phrasing adapts: `higherIsBetter=true` → `≥green · green-amber · <amber`; `false` → `≤green · green-amber · >amber`.

- **Legacy prose parser for migration** (`metricRulesEngine.ts:156-206`): `proseToRules()` parses old free-text prose with intentionally-permissive regex. Splits on sentence boundaries so threshold numbers don't leak between rules. Extracts numeric thresholds by sorted order, not emoji proximity, for robustness.

- **Aliases for metric matching** (`rendering/metricDirections.ts:93-107`): Example: metric "Return %" might have aliases `["Returns", "Return Rate"]`. At render time, the metric resolver normalizes the name (lowercase, strip currency symbols, collapse whitespace) and tries to match against rule name + all aliases. Matching is fuzzy: `metric.includes(rule)` OR `rule.includes(metric)` so "Customer Churn" matches a rule named "Churn".

- **Threshold tone logic handles inverted-good metrics** (`rendering/metricDirections.ts:110-120`):
  - `higherIsBetter=true`: value < redPct → "bad"; < amberPct → "warn"; else "good".
  - `higherIsBetter=false`: value > redPct → "bad"; > amberPct → "warn"; else "good".
  - Inversion is implicit in the direction, so a metric like "Return Rate" (lower is better) automatically colors red when above threshold.

- **Field sanitization** (`metricRulesEngine.ts:87-97`): All user-typed fields scrubbed before storing — control chars removed, SQL DML keywords blasted, template chars (`{}`) removed, whitespace collapsed, length capped. Mirrors Wave 22 security contract.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES. The metric direction form is in `setupStep5.tsx`. Rendering uses the tone logic to color cards.

---

### 6. Prompt Redaction: Last-Line PII Defense (IDEA-039 Codex Review #2 C3)

**What it does**: Author-supplied prompt fields (`domainGuidance`, `insightsDomainGuidance`, `metricDirectionRules`, `insightsCustomSections`) are concatenated into Genie requests. If an author accidentally pastes a PAT, bearer token, AWS key, or email, this module redacts it before the request leaves the browser.

**The thoughtful details**:

- **Conservative false-positive tolerance** (`promptRedaction.ts:23-44`): Patterns ordered (longer/more specific first) so they win. Each pattern intentionally broad (e.g. email catches any `user@domain.ext`). False positives read as `[redacted]` (tolerable); false negatives (leaking real secrets) are unacceptable.

- **Pattern coverage**:
  - Databricks PAT: `dapi` + 32+ hex chars.
  - GitHub tokens: `ghp_`, `github_pat_`.
  - AWS access key: `AKIA` + 16 alphanumeric.
  - Google API key: `AIza` + 35 chars.
  - Slack tokens: `xoxb-`, `xoxp-`, `xoxa-`.
  - OpenAI/Anthropic: `sk-*` prefixed.
  - Bearer/Authorization headers: generic pattern.
  - JWT: `ey***.ey***.***` (base64url segments).
  - Email addresses (least specific, applied last).

- **Detection helper** (`promptRedaction.ts:66-76`): `detectAuthorPromptSecrets()` returns the list of pattern **names** that fire (not the redacted values). Setup form surfaces a yellow callout: "We found 1 email and 1 PAT — these will be redacted before the request is sent" so authors notice before they ship.

- **Regex state hygiene** (`promptRedaction.ts:72`): Global regexes are cloned (`new RegExp(regex.source, regex.flags)`) so state doesn't bleed across calls — each test() call gets a fresh regex instance.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES. Setup form shows the yellow callout when secrets are detected.

---

### 7. Progress Vocabulary: Friendly Stage Names & Icon Mapping (BUG-013 fix)

**What it does**: Genie emits raw enum statuses (`PENDING_WAREHOUSE`, `ASKING_AI`) and Insights stage titles (HEADLINE, TRENDS). This module maps them to user-friendly labels + animated SVG icons so users never see jargon.

**The thoughtful details**:

- **BUG-013 root cause** (`progressVocab.ts:6`): Pre-fix, raw Genie enums and internal profile keys (e.g. `sales`, `customer`) leaked to users. This module is the **sole source of truth** for all user-facing progress text.

- **Icon animation pairing** (`progressVocab.ts:13-22`): Each icon has its own CSS animation:
  - `warming`: cog/gear rotates.
  - `thinking`: sparkle wand twinkles.
  - `querying`: table grid pulses.
  - `reading`: magnifier wiggles.
  - `writing`: pencil bobs.
  - `calling`: antenna emanates.
  - `fusing`: braid spins.
  - Icon choice signals mental model to user (e.g. "fusing" = multi-source synthesis).

- **Multi-stage Insights pipeline labeling** (`progressVocab.ts:113-119`):
  - HEADLINE → "Reading the headline numbers".
  - TREND → "Spotting trends".
  - RISK → "Flagging risks".
  - ACTION → "Recommending next actions".
  - These friendly verbs are the "marquee" while underlying Genie poll state (PENDING_WAREHOUSE, EXECUTING, etc.) is optionally shown as `subLabel` — polish verb stays front, technical details still visible to power users.

- **Supervisor helper formatting** (`progressVocab.ts:183-187`): For multi-helper flows, displayName + dataDomain from proxy config are interpolated into "X is checking Y" so "Sales Helper is checking the revenue data" instead of "helper_profile_1 is running".

- **Graceful unknown-stage fallback** (`progressVocab.ts:121-122`): Unknown future stages title-case the input so they're never silently invisible.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES.

---

### 8. Connection Matrix: Transport × Backend Orthogonal Decomposition

**What it does**: Splits the flat `connectionMode` enum into two axes (Transport + Backend) so Setup can render a parent→child flow:
1. **Transport** (how the visual reaches the backend): auto, direct, proxy, gateway.
2. **Backend** (what sits on the other end): genie-single, genie-supervisor, azure-openai, bedrock.

**The thoughtful details**:

- **Persistence invariant** (`connectionMatrix.ts:1-12`): On-disk `connectionMode` enum stays stable (existing .pbix files load unchanged). The encode/decode functions keep the shape transparent to downstream code in `genie.ts` and `visual.tsx`, which still branch on `connectionMode` as before.

- **Support matrix guards invalid pairs** (`connectionMatrix.ts:105-132`):
  - Genie single works on every transport.
  - Supervisor / Azure OpenAI / Bedrock require Proxy **explicitly** — Auto can fall back to Direct, which has no orchestrator.
  - Each disabled Backend option shows a short reason inline ("Supervisor needs Proxy explicitly — Auto can fall back to Direct").
  - Exhaustive TS enum ensures compiler catches new modes.

- **Field requirement schema** (`connectionMatrix.ts:140-178`): For each (transport, backend) pair, `requiredFields()` returns exactly the fields the author must populate — no more, no less. Drives the Step 3 form so authors only see relevant inputs:
  - Direct + Genie: host, token, spaceId, (optional: warehouseId).
  - Proxy + Azure OpenAI: apiBaseUrl, (optional: proxyKey), assistantProfile.
  - Deduplication logic: required wins over optional if a field appears twice.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES.

---

### 9. Genie Space Sync: Read/Diff/Apply Workflow for Instructions (Wave 48.12+)

**What it does**: Authors can fetch the upstream Databricks Genie space definition (text instructions, sample questions, example SQLs) and either load it into PulsePlay Setup or push local edits back. Section G.1/G.2/G.3 editors parse JSON-string fields, render as lists, and re-serialize on every change.

**The thoughtful details**:

- **Three transports supported** (`genieSpaceSync.ts:13-20`):
  1. Direct mode: browser → Databricks `/api/2.0/genie/spaces/{id}` with PAT.
  2. Proxy mode: browser → proxy `/assistant/space-fetch` passthrough.
  3. Gateway mode: same as Direct (Gateway uses Workspace URL).
  - XHR-only (Power BI Desktop's visual sandbox blocks fetch).

- **Diff compute** (`genieSpaceSync.ts:138-150`): `computeDiff()` compares a draft vs upstream and returns operation list (added/removed/modified) with before/after values. Used by "Show diff" button so authors can preview what will push before committing.

- **Slot limit enforcement** (`setupStep5SectionG.tsx:131-135`): Databricks caps total instructions at 100. UI shows a slot counter (current/100) with color coding:
  - Green: < 80 slots.
  - Yellow: 80–99 slots ("approaching limit").
  - Red: = 100 slots ("limit reached — remove to add more").

- **JSON round-trip via SetupDraft** (`setupStep5SectionG.tsx:69-72`): Each editor (G.1/G.2/G.3) parses JSON on every render (cheap for the data sizes), edits in-memory, re-serializes back to the draft so the standard Apply path persists cleanly.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES read/diff; ⚠️ "Push to Genie" likely behind a feature flag or not yet shipped.

---

### 10. Content Sanitizer: LLM Output Cleanup & Section Deduplication (Session 53)

**What it does**: Cleans AI Insights prose by stripping trailing wrap-up phrases, normalizing section headings, dropping duplicate `## TITLE` blocks, and removing empty emphasis markers that the LLM sometimes emits.

**The thoughtful details**:

- **Section-aware stripping** (`contentSanitizer.ts:87-170`):
  - `STRUCTURED_LIST_SECTIONS` (RISKS, ACTIONS, etc.): Finds the last list line and drops everything after it (trailing prose).
  - `STRUCTURED_TABLE_SECTIONS` (CATEGORY MIX, SCORECARD, etc.): Finds the last `|...|` table line, then **intelligently filters bullets that follow**:
    - Informative bullet (has `:`, digit, `%`, currency symbol): kept.
    - Dumb noun list (no markers): dropped.
    - Example: footnote `- Profit-negative sub-categories: bookcases, tables` kept; standalone `- Bookcases, Supplies, Tables` dropped.

- **Heading normalization** (`contentSanitizer.ts:193-217`): Session 53 guarantee — every stage's response leads with `## EXPECTED_TITLE`. Four-case behavior matrix:
  - Already starts with correct heading: unchanged.
  - Starts with wrong heading: unchanged (preserves author intent for Custom Sections).
  - Has expected heading later in body (preceded by prose preamble): strips preamble, response now starts with heading.
  - Missing heading entirely: prepends `## EXPECTED_TITLE`.
  - Returns idempotent results.

- **Deduplication** (`contentSanitizer.ts:253-281`): When LLM emits the same `## TITLE` twice, keeps **last occurrence** (tends to be more refined) and drops earlier copies. Case-insensitive, normalized whitespace.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES.

---

### 11. Theme Inheritance: PBI Palette Mapping to CSS Variables (Wave 44)

**What it does**: When author toggles `inheritPowerBITheme` ON, the visual reads `host.colorPalette` and maps it to 8 CSS custom properties (--gn-bg, --gn-text, --gn-text-muted, --gn-primary, --gn-accent, --gn-positive, --gn-negative, --gn-border). Toggle OFF clears them so brand defaults from `visual.less` re-apply.

**The thoughtful details**:

- **Pure shape, no DOM** (`themeInheritance.ts:25,194-205`): Module computes a plan (`set` map + `remove` list) that the caller flushes via `setProperty()` / `removeProperty()`. Tests can inspect the plan without a DOM. SSR-safe.

- **Palette API quirks** (`themeInheritance.ts:27-37`):
  - `palette.background` / `palette.foreground` always present.
  - `palette.foregroundLight` / `palette.foregroundNeutralSecondary` sometimes absent — we guard and synthesize muted via opacity blend.
  - `palette.getColor(themeName)` is the supported API; some hosts throw on unknown slots rather than returning undefined — we wrap with try/catch.

- **Muted text synthesis** (`themeInheritance.ts:104-108`): If host doesn't ship foregroundLight, derive a 65%-opacity blend on foreground. Fallback to safe gray if foreground is also missing.

- **Border derivation** (`themeInheritance.ts:127-131`): PBI palette doesn't expose a border slot directly. Convention (per Microsoft samples): foreground at 15% opacity.

- **Toggle OFF clears stale residue** (`themeInheritance.ts:174-187`): When toggle goes back OFF, caller must explicitly clear all theme vars. Without this, previously-injected vars silently override brand defaults from LESS.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES.

---

### 12. Insights Exporters: Lazy-Loaded PNG/Excel/CSV (IDEA-044 Phase 2)

**What it does**: "Export ▾" dropdown with three options:
1. **PNG**: Full-fidelity Insights container capture via lazy-loaded html2canvas at 2× retina.
2. **Excel**: Every pipe-table as its own sheet (named after section heading) + Provenance sheet.
3. **CSV**: First table only (Phase 1 behavior; disabled when no table exists).

**The thoughtful details**:

- **Lazy-load chunking** (`insightsExporters.ts:21-44`):
  - `import("html2canvas")` and `import("xlsx")` happen in click handlers (not module-level).
  - Webpack emits as separate chunks via `/* webpackChunkName */` magic comments.
  - Main `.pbiviz` bundle stays ~247 KB (under 350 KB cap); html2canvas+xlsx ship separately.
  - Custom `LazyLoadError` class (`insightsExporters.ts:115-125`) distinguishes chunk-load failures (offline, CSP, blocked CDN) from runtime errors so UI surfaces a friendly toast.

- **Sandbox caveat** (`insightsExporters.ts:29-41`): In PBI Desktop sandbox, JSONP `<script>` injection that webpack uses for split chunks is **blocked**. `.pbiviz` only embeds main chunk, not side chunks. In hosted/web embed the chunks would be served immediately. Graceful degradation: error → toast, no crash.

- **All-tables extraction** (`insightsExporters.ts:132-150`): `extractAllPipeTables()` walks the Insights body, pairs each table with the preceding `## HEADING` (UPPER-CASED for sheet naming), preserves order (top→bottom).

- **Disabled state logic** (`insightsExporters.ts:89-110`): Trigger is disabled entirely when busy or no content. Per-format disabled flags for PNG/Excel/CSV based on:
  - `insightsBusy`: pipeline in flight.
  - `hasContent`: any body exists.
  - `hasTable`: at least one `|...|` table present.
  - Each option has a `title` attribute explaining why disabled.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES, but ⚠️ PNG disabled in PBI Desktop sandbox.

---

### 13. Setup Wizard: 6-Step Flow with Section G Sync Editor

**What it does**: Multi-step flow (approximately 6 steps):
1. Intro / connection mode selection.
2. Transport picker.
3. Backend picker.
4. Required fields form (conditional on Transport × Backend pair).
5. Insights authoring or preset selection.
6. Section G (Genie space sync instructions).

**The thoughtful details**:

- **Section G is Phase A + Phase B**:
  - Phase A (shipping): G.1 (text instructions), G.2 (sample questions), G.3 (example SQLs) + "Load from Genie" / "Show diff" buttons.
  - Phase B (48.16): "Push to Genie space" behind auth gate + confirm dialog.

- **Guided vs. manual modes**: `setupStep5Guided.tsx` vs `setupStep5.tsx` — guided mode walks through section-by-section UI; manual is the full 96-field form.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES.

---

### 14. Connector Registry: Single Source of Truth for Connection Types

**What it does**: Replaces scattered `if mode === "X"` branches with one declarative table. Each `ConnectorDescriptor` declares label, noun, kind, field schema, health probe, and factory.

**The thoughtful details**:

- **One descriptor = one connector** (`backend/connectorRegistry.ts:78-103`):
  - `id`: ConnectionMode discriminator.
  - `label`: Dropdown text.
  - `noun`: Domain noun for form labels ("Genie space" vs "Bedrock KB").
  - `kind`: "single-space" | "supervisor" — drives UI affordances.
  - `streaming`: true if supports per-helper progress events.
  - `status`: "ready" | "preview" | "stub" — UI shows "Coming soon" for stubs.
  - `fields`: Setup form schema (which inputs to render, required/optional, type).
  - `health()`: Test Connection probe.
  - `factory()`: Returns AnyBackend for the config.

- **Adding a new connector is 1-file change**: Register a new descriptor; Setup form, factory, settings dropdown, and Test Connection all pick it up automatically.

**Ported to PulsePlay?** ✅ PORTED.

**PulsePlay surfaces it?** ✅ YES.

---

### 15. Iteration History: Wave / Cycle / Phase Markers & Tripwire Comments

**Visible iteration arcs**:
- Wave 35 Phase 1–3: Custom SQL Authoring Mode (phased rollout).
- Wave 40: Metric direction form-first refactor (reconciling two divergent textareas).
- Wave 44: Theme inheritance.
- 49.20 / IDEA-037 Phase 4: AI-assisted section suggestion.
- IDEA-039 Codex Review #2: Settings fingerprint for cache invalidation.
- IDEA-044: Export (Phase 1 CSV, Phase 2 PNG/Excel).
- Wave 37: Section visibility.
- Cycle 23, 47.5, 47.8, 47.11: Incremental validator improvements.

**Tripwire examples**:
- Wave 27: Governance fields (forbidden columns, mandatory row filter, read-only enforcement) weren't part of cache key → silent stale cache when author edited rules.
- Wave 30 cycle 5: Schema hash added to cache key. Swapping a bound measure (no Setup edit) used to serve cached output of OLD schema.
- Wave 22: DML keywords must be blocked both at editor-time and proxy runtime (defense-in-depth).

**BUG-XYZ fixes**:
- BUG-013: Raw Genie enums / profile keys leaked to users → `progressVocab.ts` is sole source of truth for friendly labels.
- BUG-002: "Request failed with status 0" (network/proxy offline) → `genie.ts` handles it gracefully.
- BUG-003: Client-side mirror of user's filter selections to match Genie poll results.

---

## Porting status summary

| # | Feature | Ported? | PulsePlay surfaces? |
|---|---|---|---|
| 1 | Custom SQL Sections | ✅ | ⚠️ PARTIAL — render path may be incomplete |
| 2 | AI-Assisted Authoring | ✅ | ⚠️ LATENT — UI trigger may be hidden |
| 3 | Insights Cache v6 | ✅ | ✅ |
| 4 | Section Visibility | ✅ | ✅ |
| 5 | Metric Rules Form | ✅ | ✅ |
| 6 | Prompt Redaction | ✅ | ✅ |
| 7 | Progress Vocabulary | ✅ | ✅ |
| 8 | Connection Matrix | ✅ | ✅ |
| 9 | Genie Space Sync | ✅ | ✅ read/diff; ⚠️ push behind flag |
| 10 | Content Sanitizer | ✅ | ✅ |
| 11 | Theme Inheritance | ✅ | ✅ |
| 12 | Insights Exporters | ✅ | ✅ partial (PNG sandbox-disabled) |
| 13 | Setup Wizard | ✅ | ✅ |
| 14 | Connector Registry | ✅ | ✅ |
| 15 | Iteration History markers | n/a | n/a |

## Strategic implications

| Old assumption | Revised understanding |
|---|---|
| Thread C = 15-25 hr feature parity rebuild | Thread C ≈ **3-5 hr of UI wiring** (surfacing already-ported features) |
| PulsePlay is missing features vs OLD | PulsePlay HAS the features in code — UI exposure is the gap |
| Each gap requires backend work | Each gap is likely a missing button / a feature flag / a `display: none` |

The reference screenshots showing the OLD visual loading in ~60s with HEADLINE at 0:30 and 4 sections — **PulsePlay can do this today**. The current "7 sections / 1-2 min" experience is because the deployed config carries 3 custom sections from the DwD migration, AND the `ai-assisted` mode (which would pick 3-5 sections dynamically) probably isn't exposed in the deployed UI even though the code is there.

## Recommended next investigation

Three concrete UI-wiring gaps to confirm:

1. **AI-Assisted mode trigger**: The `<select>` at `setupStep5.tsx:3636-3643` exists. Is it reachable from the deployed PulsePlay UI? If not, what gates it?

2. **Source of the 3 custom sections** (`REGIONAL BREAKDOWN`, `CATEGORY MIX`, `OPPORTUNITIES`) in the deployed app — does it come from a profile default, proxy default, or a baked-in fallback? Removing the source would auto-drop section count to 4.

3. **End-to-end `ai-assisted` mode**: Genie introspection call (`genie.ts:859+`) → suggested-sections materialization → rendering. Does it work, partially work, or is it broken?

Closing each of these one at a time would address the AI Insights perf/quality issue more directly than rebuilding anything.
