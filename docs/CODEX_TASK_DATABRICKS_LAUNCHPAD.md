# Codex task — Databricks-native enablement

**For:** Codex
**From:** Claude (session 2026-05-17, branch `claude/gallant-jones-a71415` tip `4c3c18a`)
**Mission:** Promote PulsePlay's Databricks vertical from "AI backend + iframe-stub BI" to **first-class Databricks intelligence launchpad**, driven by live workspace capability discovery, while preserving the vendor-agnostic 2-axis architecture for the non-Databricks Y-axis (Power BI, Tableau, Qlik, Looker).

---

## What's already done — DON'T redo

The current branch tip ships 5 commits from this session that you should treat as foundations:

| Commit | What it shipped | What you build on |
|---|---|---|
| `42c6927` | Float-window action + BI pane control parity | Pane chrome contract for new surfaces |
| `11c7432` | Decouple AI Insights from BI (IDEA-039 PBI-only guard removed in playground) | AI/BI verticals are now independent — surfaces can render alone |
| `e27d95a` | **Mix composition mode** (`enabledComponents = "mix"`) + Genie `reasoningTraces` extraction + collapsible Research Agent section + `insightsShowResearchTraces` setting | Mix mode shell exists; you'll light up its currently-disabled toggles |
| `e8d0519` | Genie native feedback push-back (`POST /api/2.0/genie/.../feedback`) + `suggestedFollowUps` chips + `GET /assistant/conversations` proxy route | UI patterns; reuse the chip + reasoning-trace renderers |
| `c75237c` | `bi-adapters/databricks-aibi/` **v0 iframe adapter** + registry entry + 24 tests | Promote to SDK-based in P3 |
| `4c3c18a` | Mosaic AI **ResponsesAgent connector** (`/responses-agent/chat`, `responsesAgentClient.js`, 25 tests) — 9th backend path | Pulse-side `ResponsesAgentBackend.ts` is the immediate consumer |

Test baseline at branch tip: **playground 527/527, proxy 700/700, tsc clean.**

You'll find `scripts/probe_databricks_2026.mjs` already staged — read-only GET probe of 22 candidate endpoints. The probe needs `NODE_OPTIONS=--use-system-ca` per your earlier finding.

---

## What the live probe found (your earlier report — preserved verbatim for context)

| Surface | Status on Rajesh's workspace |
|---|---|
| Genie API | ✓ 7 spaces |
| AI/BI Dashboards / Lakeview | ✓ 2 dashboards |
| Serving endpoints | ✓ 13 endpoints (incl. `pulseplay-supervisor-agent` ready + foundation-model endpoints) |
| Databricks Apps | ✓ 1 app (stopped) |
| Vector Search | ✓ endpoints API available, 0 endpoints configured |
| Jobs | ✓ available |
| Preview routes returning 404 | not a concern when non-preview works |

This is the ground truth for the capability registry.

---

## Scope — IN

Eight phases, ship one commit per phase. Beast-mode shape Rajesh prefers: tight commits, tests per commit, FF main after each.

### P1 — Databricks capability registry (small, highest leverage)

Build a runtime feature-flag layer driven by probe results.

- **New:** `proxy/lib/databricksCapabilityRegistry.js` — runs the probe lazily on first request, caches result for 5 min, exposes `getCapabilities(profile)` → `{ genie: true, lakeview: true, servingEndpoints: true, apps: true, vectorSearch: false, jobs: true, ... }`
- **New proxy route:** `GET /assistant/capabilities?assistantProfile=<name>` returns the cached snapshot
- **New playground hook:** `useDatabricksCapabilities()` in `playground/src/lib/` that calls the proxy and broadcasts via storage event
- **Gate behavior:** any UI that depends on a Databricks surface checks the capability flag before rendering its entry point (e.g. "Vector Search KB" tab is hidden when `vectorSearch === false` OR `vectorSearch === true && endpointCount === 0`)
- **Tests:** capability normalization (200 / 404 / 403 → `available` / `absent` / `forbidden`), TTL expiry, profile scoping

**Acceptance:** `/assistant/capabilities` returns a JSON blob the playground consumes; at least one downstream UI element gates on it.

### P2 — PulsePlay Launchpad

A new top-level surface listing the Databricks assets the user can act on.

- **New route:** `/launchpad` in the playground (alongside `/`, `/settings`, `/knowledge`)
- **New component:** `playground/src/launchpad/LaunchpadShell.tsx` with sections:
  - **Genie Spaces** (from `GET /api/2.0/genie/spaces` via proxy proxy `/assistant/genie/spaces`)
  - **AI/BI Dashboards** (from `GET /api/2.0/lakeview/dashboards` via new proxy route)
  - **Serving endpoints** (filtered to ones the active profile can `CAN QUERY`)
  - **SQL warehouses** (from existing `/warehouse/status` extended)
  - **Apps** (from `GET /api/2.0/apps`)
  - **Recent sessions** (consume the `GET /assistant/conversations` route from `e8d0519`)
- **Each item** has primary actions: "Open in workspace" (new tab), "Use as AI source", "Use as BI source", "Float as PulsePlay pane"
- Capability-gated: sections hidden when P1 says the surface is unavailable
- **New proxy routes:** `/assistant/genie/spaces` (list), `/assistant/lakeview/dashboards` (list), `/assistant/apps` (list), `/assistant/serving-endpoints` (list, optionally filtered to user's CAN QUERY set)

**Acceptance:** `/launchpad` renders all available Databricks assets for the active profile; clicking "Use as BI source" on a dashboard sets it as the active BI surface; capability gating works (Vector Search section absent on Rajesh's workspace).

### P3 — Promote `databricks-aibi` adapter from v0 iframe to SDK

Replaces the iframe stub with the real `@databricks/aibi-client` SDK.

- **Add npm dep:** `@databricks/aibi-client` to `playground/package.json`
- **Rewrite:** `bi-adapters/databricks-aibi/index.ts` to use `DashboardEmbedClient({ instanceUrl, dashboardId, token, container, getNewToken, hideDatabricksLogo: false })`
- **Token issuance — new proxy route:** `POST /assistant/embed-token/aibi`
  - Body: `{ assistantProfile, dashboardId }`
  - Calls `POST /api/2.0/lakeview/dashboards/{id}/published/tokeninfo` on the user's behalf
  - Returns `{ token, expiresAt }` — never expose the workspace PAT
  - Mirrors the existing `/assistant/embed-token/powerbi` server-side pattern
  - Cache token with refresh-5-min-before-expiry (existing `adminEmbedTokenCache.js` pattern is the template)
- **Wire the SDK's event bridge:** map dashboard `selectionChanged` / `filterChanged` / `dataRefreshed` events → canonical `BIEvent` types so the AI sidebar can reason about Databricks dashboards the same way it reasons about Power BI reports
- **Keep iframe path as fallback** when SDK fails to load (defensive)
- **Tests:** mock SDK + verify event mapping, token-refresh trigger fires at expiry-5min, allowlist enforcement

**Acceptance:** A real Databricks AI/BI dashboard renders in the BI pane with live event flow to the AI sidebar; AI Insights can reason about dashboard selection without manual context typing.

### P4 — Genie Space as a visual surface (not just a backend)

Today, Genie Space is the AI backend. The 2026 Genie embed beta makes it also a **viewable surface** with built-in chat UI + Ask-Genie button.

- **New BI-adapter family slot:** `bi-adapters/databricks-genie/` — implements `BIAdapter` but the surface is the Genie iframe instead of a BI report
- **Vendor identity:** `databricks-genie`, displayName "Databricks Genie Space"
- **Mount:** iframe at `{workspace}/sql/genie/embed/{spaceId}` (verify the exact path during P1 — beta URL pattern may evolve)
- **Sandbox:** narrowest that still allows the Genie iframe to load (likely `allow-scripts allow-same-origin allow-forms allow-popups`)
- **Rate-limit guard:** 20 questions/min/workspace (Databricks limit). Surface a soft warning when approaching it (count Ask-Genie clicks client-side, dispatch a warning event when > 15/min).
- **Two-way bridge:** when the user picks a chart inside the Genie iframe, surface it to PulsePlay's AI sidebar context (postMessage protocol — verify the contract during implementation; Databricks may publish a postMessage spec, or we may need to use the `aibi-client` SDK)
- **Register:** in `playground/src/biPanel/registry.ts` (the 7th vendor)
- **Tests:** stub-level mount + sandbox-posture + rate-limit emission

**Acceptance:** Author can pick "Databricks Genie Space" as a BI vendor; user can chat with Genie directly in-pane; AI sidebar context updates when Genie answers a question.

### P5 — UC Metric Views as the semantic backbone

Replace ad-hoc preset / domain / metric-direction strings in Pulse settings with **UC Metric Views** as a source.

- **New proxy route:** `GET /assistant/uc/metric-views?catalog=&schema=` — lists Unity Catalog metric views accessible to the active profile (uses `/api/2.1/unity-catalog/functions` filtered to METRIC_VIEW type, or whatever Databricks ships under metric views — verify endpoint shape)
- **New proxy route:** `GET /assistant/uc/metric-views/{fullName}` — full definition: measures, dimensions, synonyms, display names, formatting rules
- **New Settings → AI panel:** "UC Metric View source" — author picks a metric view; PulsePlay auto-populates the existing `insightsDomain`, `insightsCustomSections`, `metricDirectionRules`, `insightsMetricDirections` from the metric view's definition
- **Cross-link with existing Pulse settings:** UC-sourced values appear with a "UC" badge; author can override but the badge stays until they save an override
- **Tests:** parsing of UC metric view definitions, mapping to Pulse settings, override behavior

**Acceptance:** Author picks a metric view in Settings → AI → "UC Metric View source"; the existing AI Insights presets light up automatically; running AI Insights produces output that respects the metric view's measure/dimension definitions.

### P6 — Vector Search KB provider (capability-gated)

Currently the workspace has zero Vector Search endpoints, so this lands in a hibernation state — surface exists in code, UI shows "Configure a Vector Search endpoint in Databricks to enable" until an endpoint appears.

- **New proxy route:** `POST /assistant/vector-search/query` — wraps `POST /api/2.0/vector-search/indexes/{index_name}/query` with the configured catalog/schema/index from the active profile
- **New Pulse setting:** `kbVectorSearchIndex` (string, default empty) in `PulseAiVisualSettings`
- **Pulse `knowledgeBase.ts` integration:** when `kbVectorSearchIndex` is set AND P1 capability says `vectorSearch.endpointCount > 0`, retrieve grounding chunks from Vector Search before each AI Insights stage; concatenate into the stage prompt under a "Grounding evidence" header
- **Capability-gated UI:** the "Vector Search KB" section in Settings → AI is hidden when `vectorSearch.endpointCount === 0`, replaced with a help card pointing at Databricks docs for creating an endpoint
- **Tests:** query body construction, capability gating, KB chunk concatenation

**Acceptance:** When an endpoint exists, AI Insights stages include retrieved grounding; when none exists, the UI cleanly guides the author to create one.

### P7 — Databricks Apps resource-mode deployment

Wire PulsePlay to deploy as a Databricks App with app resources (warehouses, Genie spaces, serving endpoints, secrets) declared in config.

- **New file:** `app.yaml` at repo root — Databricks App manifest declaring resources PulsePlay needs (SQL warehouse, Genie space, serving endpoints, secrets for any external API keys)
- **New file:** `docs/DEPLOY_DATABRICKS_APP.md` — step-by-step: `databricks apps create`, `databricks apps deploy`, config validation, smoke
- **Proxy adapter:** when running inside a Databricks App, the proxy reads credentials from `APP_RESOURCE_*` env vars instead of `proxy/config.json` (or merges with config.json so dev still works)
- **Settings → System panel addition:** "Deployment mode" — auto-detects (local proxy / Databricks App) and shows the detected mode + active resources
- **Tests:** resource resolution from env vars, fallback to config.json, deployment-mode detection

**Acceptance:** PulsePlay can be deployed as a Databricks App pointing at the user's workspace resources; the app starts; auth flows through Databricks Apps OAuth; the existing `node server.js` local-dev mode is unchanged.

### P8 — Evidence drawer

Tie every AI answer to its underlying data sources.

- **New component:** `playground/src/components/EvidenceDrawer.tsx` — slides in from the right when a user clicks an "evidence" affordance on any AI response
- **Sources to wire:**
  - Dashboard widget SQL (when the active BI surface is a Databricks dashboard) — fetched via Lakeview API
  - Genie SQL (already in `attachments[].query.query` — `genie.ts` extracts this today)
  - UC metric view definitions (from P5)
  - UC lineage (from `/api/2.0/lineage-tracking/` — verify path)
- **Render:** SQL with syntax highlighting, metric view fields, lineage graph (table-level adjacency, not column-level — keep it simple)
- **Integration points:** AI Insights HEADLINE / TRENDS / RISKS / ACTIONS sections + Chat messages each get an "🔍 Evidence" link
- **Tests:** drawer open/close, source aggregation, fallback when a source is missing

**Acceptance:** Clicking "Evidence" on any AI answer surfaces the SQL + metric defs + lineage that grounded it.

---

## Scope — OUT

- **Public-OSS hardening** — license decision, SBOM signing, conformance harness, multi-tenant isolation. Stays deferred per `docs/PUBLIC_OSS_AGENDA.md`.
- **Re-litigating the AI/BI decoupling** — commit `11c7432` removed the PBI-only `measCount+dimCount===0` guard. Keep it removed in the playground; the guard still lives in the sister project's PBI build (per the comment in `visual.tsx`).
- **Vendor-agnostic refactors of the BI adapter contract** — Power BI / Tableau / Qlik / Looker stay as-is. Adding Databricks-native surfaces uses the existing `BIAdapter` contract; don't rewrite the contract just because Databricks brings new event shapes.
- **The Mix mode "Per-tile cherry-pick" toggle** — gated on Databricks shipping tile-level embed, which they haven't. Leave the toggle disabled with the existing "coming next cycle" copy.
- **Touching Pulse's auto-fire / runInsights pipeline** — that's been recently stabilized (commits `3ea401a` → `9f444a6` → `c488201` → `36dbe85` → `f552508` → `11c7432`). Build alongside, not on top.

---

## Constraints — Tripwires from CLAUDE.md and ARCHITECTURE.md

1. **Genie Agent Mode is UI-only** (`docs/ARCHITECTURE.md:180`). REST API silently swallows `force_deep_research_planning`. But `reasoning_traces` field on the message IS readable as of 2026-04-16 — already wired in `e27d95a`. Don't claim Agent Mode works via REST; do surface the trace when it's present.
2. **Embed tokens are server-side only.** Power BI embed tokens, Tableau trusted tickets, AI/BI dashboard published-tokens, Vector Search auth — all server-side via the proxy. Never put credentials in the browser bundle.
3. **Proxy `cfg()` doesn't cache when `NODE_ENV=test`.** Tests configure profiles via `PROXY_PROFILE_*` env vars, not in-memory mutations.
4. **TLS chain:** local probes need `NODE_OPTIONS=--use-system-ca`. Document this in `docs/DEPLOY_DATABRICKS_APP.md` for the App deployment path.
5. **Cross-origin iframes need narrow sandbox.** Each new vendor adapter narrows from `GenericIframeAdapter`'s default. Match the pattern in `bi-adapters/databricks-aibi/index.ts`.

---

## Working conventions

- **Per-phase commit + FF main.** Don't pile P1+P2+P3 into a single commit.
- **Tests green every step** — playground vitest, proxy jest, tsc clean. Current baseline is 527 playground + 700 proxy.
- **Update HANDOVER + project_state** before saying done (per `feedback_doc_hygiene.md`).
- **Keep AGENT_SYNC.md current** with `[CODEX-DONE]` / `[CODEX-RESEARCH]` blocks so Claude can `[REVIEW-RESPONSE]` your work.
- **Brutal honesty about skipped scope.** If P5 turns out to need a UC metric views Databricks beta that's not GA, say so explicitly and document the gap rather than implementing a stub that lies.
- **`[LESSON]` block when an edge case surfaces.** The pattern from session 2026-04-x: enumerate state-machine boundaries before declaring done.

---

## Done criteria

Ship P1 through P8 as eight commits on a branch (e.g. `codex/databricks-launchpad`), FF main after each. Final state:

- `/launchpad` route renders 7 Genie spaces + 2 dashboards + 13 serving endpoints + 1 app for Rajesh's workspace
- Capability registry hides Vector Search until an endpoint is configured
- AI/BI dashboard renders via SDK with live event flow
- Genie Space embeds as a BI vendor with Ask-Genie working in-pane
- UC metric views drive Settings → AI presets
- Vector Search KB provider exists (hibernated until endpoint)
- PulsePlay deploys as a Databricks App
- Evidence drawer ties answers to sources

Total test growth target: +200 tests minimum (proxy + playground combined).

---

## Quick-start commands

```powershell
# Confirm baseline
git checkout main && git log -5 --oneline    # expect 4c3c18a at tip after Rajesh FFs C3+C4
cd playground && npx tsc --noEmit             # expect clean
cd playground && npx vitest run --silent      # expect 527/527
cd proxy && npm test                          # expect 700/700

# Re-run the probe (you've already done this once — confirm capability registry still matches)
$env:NODE_OPTIONS = "--use-system-ca"
node scripts/probe_databricks_2026.mjs

# Read this doc + the existing handover
type docs/CODEX_TASK_DATABRICKS_LAUNCHPAD.md
type docs/HANDOVER.md
type docs/AGENT_SYNC.md
```

Then start P1.
