# PulsePlay — Reference Guide

**Comprehensive reference for leaders, architects, and engineering teams**
**Version**: 2026-05-26 · Internal · Path C (inner-source-first)
**Companion**: `SHOWCASE_DECK.md` (slide version of this material)

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [What is PulsePlay](#2-what-is-pulseplay)
3. [Strategic positioning](#3-strategic-positioning)
4. [Architecture — the 2-axis abstraction](#4-architecture--the-2-axis-abstraction)
5. [Surfaces — what users see](#5-surfaces--what-users-see)
6. [The 10 AI connector paths](#6-the-10-ai-connector-paths)
7. [The 4-status trust contract](#7-the-4-status-trust-contract)
8. [Knowledge Base architecture](#8-knowledge-base-architecture)
9. [Role classification — Hybrid Orchestrator-Deployer](#9-role-classification--hybrid-orchestrator-deployer)
10. [Tech stack — all layers](#10-tech-stack--all-layers)
11. [Deploy state](#11-deploy-state)
12. [What's completed (shipped today)](#12-whats-completed-shipped-today)
13. [What's in plan — gap-closure plan](#13-whats-in-plan--gap-closure-plan)
14. [Whitespace — where PulsePlay leapfrogs](#14-whitespace--where-pulseplay-leapfrogs)
15. [Compliance & governance posture](#15-compliance--governance-posture)
16. [Cost & sustainability](#16-cost--sustainability)
17. [Test posture & quality methodology](#17-test-posture--quality-methodology)
18. [Repository layout](#18-repository-layout)
19. [References — research lineage](#19-references--research-lineage)

---

## 1. Executive summary

PulsePlay is an internal-org **vendor-agnostic agentic analytics workbench** — a React-based "thin pane of glass" that orchestrates between any business intelligence tool (Power BI, Tableau, Qlik, Looker, generic iframe) and any AI/agent backend (Databricks Genie, Mosaic AI Foundation Model, Azure OpenAI, AWS Bedrock, deterministic templates, multi-agent supervisors).

**The strategic problem PulsePlay solves**: organisations deploy BI tools per-team and AI/agent stacks per-cloud, then watch their analysts live in tab-switching purgatory while AI costs run unchecked and KPIs diverge across tools. PulsePlay collapses that surface into one pane with one trust model, one knowledge plane, and one cost story — while preserving the vendor pluralism the org actually has.

**Strategic posture**: **inner-source-first** (Path C). PulsePlay v1 is scoped as an internal-org enabler, **not** a public commercial platform. Public-OSS readiness items (license decision, SBOM signing, conformance harness, multi-tenant isolation, full ISO compliance) are deferred to `docs/PUBLIC_OSS_AGENDA.md`.

**Current state**: production-quality on the surfaces shipped (10/10 PASS Power BI regression, 1164/1164 proxy tests, 1103/1103 playground tests, live deployment on Databricks Apps since 2026-05-22). Significant whitespace remains in operational hygiene (telemetry, eval, audit, caching) and the four named differentiation plays.

---

## 2. What is PulsePlay

**One-line definition**: a React playground that hosts ANY BI tool as an embedded guest, with an AI assistant sidebar that reasons about whatever the user is currently looking at.

### Core principles

1. **Connector-agnostic on the AI side** — the proxy abstracts 10 backend AI paths; users pick a profile, the abstraction layer translates
2. **Vendor-agnostic on the BI side** — adapter pattern lets any BI tool plug in as a "guest" inside a narrowed sandbox iframe
3. **No ungrounded artifacts** — every AI answer carries a `Verified` / `Grounded draft` / `Suggestion` / `Blocked` badge emitted by a validator framework, **never by the LLM itself**
4. **Compute deterministically, narrate with LLM** — numbers come from verifiable queries; LLM only writes the prose wrapping
5. **Brutal honesty** — accuracy claims must be measured, not asserted; "we don't know yet" is a valid answer

### What PulsePlay is NOT

- NOT an LLM (we don't build models)
- NOT an agent framework (we orchestrate org-existing agents)
- NOT a BI tool (we host them)
- NOT a public commercial platform yet (inner-source v1)
- NOT a Power BI custom visual (sister Pulse project is that; PulsePlay runs in a real browser at top-level origin)

---

## 3. Strategic positioning

### Category — "agentic analytics" (2026)

The field went through three name changes in 18 months. The 2026 dominant term is **"agentic analytics"** — Gartner's 2025 ABI MQ leader cohort all converged on it; Tableau, ThoughtSpot, Databricks, GoodData, Tellius marketing aligned.

| Term | 2026 status |
|---|---|
| Augmented Analytics | Faded as positioning word; still in Gartner's hype cycle as a capability tier |
| Conversational BI | Subsumed by "agentic" — reduced to a feature, not a category |
| Decision Intelligence | Got its own MQ in 2025; sibling discipline, not the same |
| **Agentic Analytics** | **The 2026 winner** |
| AI BI | Databricks house brand |
| Composable / Headless BI | API-first BI delivery, not the AI layer |

### PulsePlay's category-of-one positioning

**"BI-agnostic agentic analytics workbench"**. Every Gartner 2025 ABI MQ leader (Microsoft, Salesforce/Tableau, Google/Looker, Qlik, Oracle, ThoughtSpot) IS itself a BI vendor. None can credibly claim BI-agnostic — that's PulsePlay's defensible whitespace.

### Open standards alignment

- **OSI v1.0** (Open Semantic Interchange, finalized 27 Jan 2026) — vendor-neutral metric-object spec; founders include Snowflake, dbt Labs, Cube, AtScale, Databricks, ThoughtSpot, Salesforce + 40 partners. PulsePlay roadmap adopts OSI as the canonical metric IR.
- **MCP** (Model Context Protocol, Anthropic 2024 → Linux Foundation 2025) — agent ↔ semantic-layer protocol; 97M monthly SDK downloads as of 2026. PulsePlay roadmap stands up a `pulseplay-grounding` MCP server.

---

## 4. Architecture — the 2-axis abstraction

PulsePlay's defining design is two independent axes that compose:

| Axis | What varies | Where it lives | Today |
|---|---|---|---|
| **Y: BI vendor** | What the user is LOOKING AT | `bi-adapters/<vendor>/` (frontend adapters implementing `BIAdapter` interface) | Power BI native (`powerbi-client` SDK) + 4 iframe fallbacks (Tableau / Qlik / Looker / generic) |
| **X: AI connector** | What the AI brain IS | `proxy/` profile types | **10 backend paths shipped** |

### Why this matters

Any `(vendor, connector)` combination is valid. Switching either is independent. A team using Power BI for finance and Tableau for marketing can:
- Use the same Foundation Model AI brain on both
- Switch finance to powerbi-semantic-model deterministic DAX without affecting marketing
- A/B test Genie vs Azure OpenAI without touching the BI side

The 2-axis abstraction is what makes PulsePlay's "category of one" defensible.

### Failure mode to guard against — cross-contamination

Vendor-specific code must NOT leak into connector-specific code, and vice versa. The `BIAdapter` interface is the firewall. See `feature_2_axis_abstraction.md` in project memory.

---

## 5. Surfaces — what users see

Three primary surfaces, all sharing **uniform chrome** per the 2026-05-25 design lock (`feedback_three_tabs_uniform.md`):

### 5.1 Ask Pulse — PulsePlay-orchestrated conversational AI
- User composer at the top, scrollable chat thread, suggested-follow-up chips
- Backed by any of the 10 AI connector paths via profile selection
- **Today**: deterministic DAX path proven (10/10 PASS sub-second on Power BI regression)
- 4-status badge on every answer
- Slash commands (`/swot`, `/pareto`, `/rfm` framework shortcuts)
- Sustainability indicator (leaf + smile token gauge) in footer

### 5.2 AI Insights — multi-section briefing
- Staged 1-then-N rendering: HEADLINE first (sub-second), then parallel fan-out for TRENDS / RISKS / OPPORTUNITIES / NEXT ACTIONS
- Each section validated independently by `insightsValidator.js`
- Per-section retry on validator failure with worked examples
- **Today**: works on Foundation Model + Genie profiles; deterministic DAX path is a roadmap item

### 5.3 Dashboard — BI vendor's native visuals
- `BIPanel.tsx` host component delegates to the vendor's adapter (mount/on/send/destroy lifecycle)
- Power BI: real `powerbi-client` SDK with embed-token issuance via proxy
- Tableau / Qlik / Looker: iframe fallback today; real SDK adapters are roadmap

### Cross-cutting affordances

- **Per-tab visibility model** (Settings → AI) lets each tab toggle the AI sidebar, KPI strip, etc.
- **Detach as comparison primitive** — any tab can pop out into its own window for side-by-side comparison
- **Knowledge Base browser** at `/knowledge` — pack manifests, glossaries, ontologies, sub-vertical KPIs

---

## 6. The 10 AI connector paths

The connector axis hosts **10 backend paths** in `proxy/server.js` + `proxy/lib/*`. Each is a `type` in the profile registry:

| # | Connector type | Description | When to use |
|---|---|---|---|
| 1 | `genie` | Databricks Genie space — natural-language analytics over Unity Catalog | When you have a Genie space configured against a UC dataset |
| 2 | `foundation-model` | Databricks Mosaic AI Foundation Model serving endpoint (Llama 3.1 405B by default) | LLM-only path, no Genie space needed; powers AI Insights staged rendering |
| 3 | `azure-openai-chat` | Azure OpenAI chat-completions | Generic LLM chat |
| 4 | `azure-openai-analytics` | Azure OpenAI tuned for analytical narratives | Briefing prose layer |
| 5 | `bedrock-rag` | AWS Bedrock with retrieval augmentation | When grounding docs live in AWS |
| 6 | `bedrock-direct` | AWS Bedrock direct invocation (Claude / Nova / Llama / Titan) | Standalone LLM call |
| 7 | `supervisor` | Multi-space fan-out across N Genie spaces + synthesis via Foundation Model | Multi-domain questions ("compare sales and supply chain") |
| 8 | `supervisor-local` | LangGraph-based local supervisor | Org-deployed supervisor agent |
| 9 | `responses-agent` | Agent loop wrapper (tool-use, iterative) | Multi-step analytical workflows |
| 10 | `powerbi-semantic-model` | **Deterministic DAX templates, NO LLM** | Common analytical questions where templates exist; **sub-second, zero LLM cost, Verified status by construction** |

Plus the **Power BI Q&A surface at `/powerbi/qna`** — Microsoft's NLP runs in MS tenant; PulsePlay only mints the embed token (0 LLM calls from PulsePlay). **In defer-mode**: no new investment; sunset path post-Microsoft EOL Dec 2026.

### Universal best practice — "LLM emits a DSL, not raw SQL"

Validated by deep research across ThoughtSpot, Microsoft Copilot, Tableau Pulse, Looker, dbt SL, Cube, AtScale, Snowflake Cortex, Databricks Genie. PulsePlay's deterministic `powerbi-semantic-model` connector is the cleanest expression of this principle.

---

## 7. The 4-status trust contract

PulsePlay enforces a **"no ungrounded artifacts"** doctrine. Every AI answer carries one of four statuses, emitted by the validator framework (`proxy/lib/insightsValidator.js`), **never by the LLM itself**:

| Status | Meaning | When emitted |
|---|---|---|
| **Verified** | Numbers traceable to a verifiable query AND grounded against KB AND no divergence | Deterministic DAX templates; or LLM answer where round-trip SQL diff = 0 + consistency probes pass |
| **Grounded draft** | Answer is grounded but a divergence is flagged (e.g., KB formula ≠ dataset measure) | KPI conflict resolution (Policy A+E) detected divergence; both formulas shown inline |
| **Suggestion** | Confidence below threshold OR sample size too small OR LLM intuition without strong grounding | n < 30 samples; consistency probes disagree; KB lookup low-confidence |
| **Blocked** | Could not ground; escalated to human review | Round-trip SQL failed; SQLHD metamorphic flag; critical-risk metric with divergence |

This taxonomy is **unusual in the industry** — closest precedent is IBM Carbon's `AI label` component, which has variants but doesn't enforce the validator-only emission rule.

### Why this matters strategically

- Maps to GDPR Art. 15(1)(h) "meaningful information about the logic involved" — the badge IS the meaningful disclosure
- Maps to EU AI Act Art. 50 transparency obligation
- Maps to enterprise risk posture — "the AI confidently said X and was wrong" is the worst trust failure; the 4-status taxonomy prevents the LLM from claiming Verified when it isn't

---

## 8. Knowledge Base architecture

PulsePlay's knowledge plane is **two-tier**:

### 8.1 Vertical KB (per-pack) — ✅ shipped substrate

Located at `pulsepacks/<pack>/`:

| Pack | Status | Content |
|---|---|---|
| **CPG-FMCG** | ✅ Fully authored | 652+ lines: glossary 181 / ontology 339 / references 129 / 10 sub-verticals (supply-chain, procurement, manufacturing, commercial-retail, finance-fpa, hr, it-admin, vendor-mgmt, client-mgmt, sustainability) × 4 files each (KPIs, sample questions, BI-AI fit, README) |
| **Retail-Digital** | 📋 Stubs | 55 lines total — needs content authoring |
| **SaaS-Product** | 📋 Stubs | 88 lines total — needs content authoring |

Browsable in-product at `/knowledge` (extended by `playground/src/knowledge/KnowledgeShell.tsx`).

### 8.2 Horizontal KB (cross-pack) — 📋 in plan

Will live at `pulsepacks/_horizontal/`:

- **`visualization/`** — Cleveland-McGill perception ranking, Munzner task-channel, FT Visual Vocabulary 9-category taxonomy, Vega-Lite 6.x grammar, Draco 2 ASP rules, IBCS v1.2 (becoming ISO 24896), Charts-of-Thought (TVCG 2025)
- **`statistics/`** — Tiered anomaly cascade (MAD / STL+IQR / Prophet / Isolation Forest), ASA p-value guidance (intervals over p-values, always), sample-size floors (n≥30 trend, n≥100 cohort)
- **`analytical/`** — 18 classical frameworks (SWOT/BCG/Pareto/RFM/Cohort/Funnel/Variance-PVM/Anomaly/Eisenhower/RICE/OKR/North Star/AARRR/MoSCoW/NPS/Risk Heatmap/IBCS/MECE) + 5 missing canonical archetypes (BLUF / Pyramid / OKR-scorecard / North Star tracker / AARRR) + 2026 additions (JTBD / RARRA / PLG growth loops / FAIR / NIST AI RMF)
- **`color/`** — OKLab/OKLCH primary; Okabe-Ito categorical (CVD-safe); Viridis/Cividis sequential; ColorBrewer RdBu / Crameri Vik diverging; cultural-profile enum (`western-financial` / `east-asian-financial` / `colorblind-safe` / `ibcs-strict`); WCAG 2.2 3:1 chart marks / 4.5:1 legend
- **`ux/`** — composer primitives (Vercel AI Elements), Enter sends / Shift+Enter newlines, slash command cap (~12) + filter, @-mentions for data nouns, citation patterns, section-skeleton streaming, a11y from day one

### 8.3 Provider-aware KB translator — 📋 in plan

Extends the existing Prompt IR pattern: per-connector translators emit KB content in the shape each backend consumes. The horizontal KB stays vendor-neutral as YAML; each translator (`genie`, `foundation-model`, `bedrock`, `azure-openai`, `powerbi-semantic-model`, etc.) renders KB into its backend's native form. **This is what makes "bring your own LLM/agent" actually work** — orgs deploying PulsePlay against an internal fine-tune write a translator, not fork the KB.

### 8.4 KPI conflict resolution (Policy A+E) — 📋 in plan

When PulsePlay's KB says `Gross Margin = (Revenue − Cost) / Revenue` and the dataset has a `[Gross Margin]` measure with a different formula, the system:

1. Inspects the dataset measure's definition (DAX via XMLA, SQL via dbt manifest, LookML via Looker API)
2. Normalises both into a canonical form (AST hash)
3. Compares → verdict ∈ {`equivalent`, `divergent`, `indeterminate`}
4. Maps the verdict onto the existing 4-status taxonomy:
   - `equivalent` → `Verified` (answer dataset value, cite both)
   - `divergent` → `Grounded draft` (answer dataset value, show both formulas inline, "request review" link)
   - `indeterminate` → `Suggestion` (answer dataset value, soft warning)
   - critical-risk + `divergent` → `Blocked` (escalate to data steward)
5. Logs every divergence to a metric catalog as a steward task

Industry research (8 parallel agents) confirmed: **nobody ships this** — leaders silently pick one. Honest divergence surfacing is PulsePlay's whitespace.

---

## 9. Role classification — Hybrid Orchestrator-Deployer

PulsePlay is **not the AI provider** (Microsoft / Databricks / AWS / Anthropic build the models).
PulsePlay is **not the deployer** (the customer org puts the AI to use against their data).
PulsePlay is the **enabler** — the orchestrator that actively shapes AI behavior.

| What PulsePlay does | Role lens | Obligation it creates |
|---|---|---|
| Composes prompts (Prompt IR + per-backend translators) | Deployer-like | Document how prompts shape AI behavior; version + log per turn |
| Runs the validator that demotes/elevates trust status | Deployer-like | Validator outcome IS an opinionated intervention — must be auditable |
| Picks the connector (planned routing layer) | Deployer | Routing decisions logged + explainable per turn |
| Injects KB knowledge (vertical packs + horizontal) | Deployer | KB source IDs cited in audit + "why this answer?" |
| Caches answers across users (planned) | Deployer | Cached freshness disclosed; per-tenant isolation auditable |
| Adjudicates KPI conflict (Policy A+E) | Deployer | Divergence verdict + KB source + dataset source in audit |
| Forwards the call to upstream AI | Pure enabler | Pass-through; preserve lineage |
| Renders the response | Pure enabler + Art. 50 | Transparency that user is interacting with AI |

**Implication**: PulsePlay's audit obligations are enabler pass-through PLUS deployer-grade documentation of PulsePlay's own interventions — not the full provider-grade obligations.

---

## 10. Tech stack — all layers

### 10.1 Backend — proxy

| Layer | Tech | Why |
|---|---|---|
| Runtime | Node.js 18-22 | Long-term support; matches sister project |
| HTTP framework | Express | Lightweight; rich middleware ecosystem |
| Authentication | MSAL (device-code + service principal); JWT validation | Multi-tenant org-IdP compatibility |
| Connector SDKs | Databricks SDK, Power BI REST + XMLA endpoint, Azure OpenAI SDK, AWS Bedrock SDK, OpenAI SDK | Native vendor APIs |
| Test framework | Jest | 1164 tests; ~70% line coverage |
| Validation framework | Custom `insightsValidator.js` + `insightsStageValidator.js` | 4-status grounding; per-section format validators |
| OAuth M2M | `@azure/identity` for service principals | Production-grade auth |
| Cache (today) | In-memory `Map` with TTL/LRU for OAuth tokens, capability probes, pack manifests, Prompt IR | Foundation for future 3-layer cache (in plan) |

### 10.2 Frontend — playground

| Layer | Tech | Why |
|---|---|---|
| Framework | React 18 + Vite | Fast HMR; modern bundler |
| State | TanStack React Query | Battle-tested cache + revalidation |
| Charts (primary) | Apache ECharts | Best perf at scale; rich chart types |
| Charts (spec/validation) | Vega-Lite | Declarative grammar; validation primitives |
| Charts (lazy) | Plotly | Heavy chart types loaded on demand |
| Routing | Custom path router (pushState + popstate) | No React Router dependency; simple |
| BI adapters | `powerbi-client` (Power BI native) | Official Microsoft SDK |
| Type system | TypeScript strict | Catches regressions in connector adapters |
| Test framework | Vitest | 1103 tests; component + integration |

### 10.3 Knowledge plane

| Layer | Tech | Why |
|---|---|---|
| Packs | Filesystem at `pulsepacks/<pack>/` | Git-versioned; PR-reviewable |
| Pack manifest | `pack.json` declares sub-verticals + KPIs + sample questions | Single source of truth per pack |
| KB content | Markdown (`glossary.md`, `ontology.md`, `references.md`) | Authoring-friendly; renders in `/knowledge` |
| Sub-vertical detail | Markdown (`kpis.md`, `sample-questions.md`, `bi-ai-fit.md`) | Per-domain depth |
| Loader | `proxy/lib/packMatcher.js` (server) + `playground/src/knowledge/knowledgeRoute.ts` (client) | Walks filesystem; serves to UI |
| Future | OSI v1.0 YAML alignment + horizontal KB + provider-aware translator | See section 8 |

### 10.4 Connectors — per-backend tech

| Connector | Tech |
|---|---|
| Genie | Databricks Genie REST API (`/api/2.0/genie/spaces/.../conversations/.../messages`) |
| Foundation Model | Databricks Foundation Model Serving (OpenAI-compatible endpoint at `/serving-endpoints/<model>/invocations`) |
| Azure OpenAI | `@azure/openai` SDK; deployment-name routed |
| Bedrock | AWS SDK v3 Bedrock client; Claude / Nova / Llama / Titan |
| Supervisor | LangGraph orchestration over multiple Genie + synthesis via Foundation Model |
| Power BI semantic-model | Power BI REST `executeQueries`; XMLA endpoint for INFO.* introspection; TMDL fallback when tenant gates executeQueries (static probe from `.SemanticModel/definition/tables/*.tmdl`) |
| Power BI Q&A | `powerbi-client` JS SDK + embed-token issuance |

### 10.5 Deploy

| Environment | Tech | State |
|---|---|---|
| Local dev | Proxy on `127.0.0.1:7000`; Vite dev server on `127.0.0.1:7001`; Vite proxies `/api/*` → proxy port | ✅ Standard |
| Production | Databricks Apps | ✅ Live since 2026-05-22, commit `6de39cc` |
| Queued | Azure App Services | 📋 Planned |
| Deploy notes | 10 deploy pitfalls documented in `project_deploy_state.md` | ✅ |

### 10.6 Observability (today vs planned)

| Layer | Today | Planned |
|---|---|---|
| Structured logging | `console.log` JSON (`[audit]` prefix) | OpenLLMetry → LangFuse self-host (OTLP) |
| Request correlation | `X-Request-Id` header + `req.requestId` | Same + OTel trace propagation |
| Token usage tracking | Per-call usage block sanitizer | OTel `gen_ai.usage.*` semconv |
| Cost tracking | Per-call cost computed for Genie | Per-tenant + per-feature + per-user roll-up |
| Audit logs | Console JSON (lost on restart) | File-rotated `audit.log` + per-tenant export modes |
| Telemetry sink | None | LangFuse (MIT) — only OSS not Elastic-License/open-core |

### 10.7 Compliance & security

| Concern | Posture |
|---|---|
| Auth | MSAL device-code + service-principal; JWT validation; per-route policy |
| Secrets | Server-side only (`proxy/config.json`, gitignored); embed tokens minted by proxy, never browser-bundled |
| iframe sandbox | Each vendor adapter declares minimum required perms; default `allow-scripts allow-same-origin allow-forms allow-popups`, narrow per vendor |
| RLS/OLS | Inherited from upstream connector (Genie, Power BI, Snowflake) — embed-as-user, not service-principal |
| Audit log | Today: console only. Planned: file rotation + upstream-reference fields + COMPLIANCE.md role doc |
| GDPR Art. 15+22 | 4-status badge = meaningful-logic disclosure (already shipped); replay endpoint + DSAR planned |
| EU AI Act | Internal-org scope → likely NOT high-risk Annex III; transparency Art. 50 satisfied via 4-status badge |

---

## 11. Deploy state

### Current

- **Local development**: standard `cd proxy && PORT=7000 node server.js` + `cd playground && npm run dev`
- **Live deployment**: Databricks Apps, since 2026-05-22, commit `6de39cc`
- **Vite dev proxy**: `/api/*` → `127.0.0.1:7000` (configured in `playground/vite.config.ts`)

### Known deploy pitfalls (per `project_deploy_state.md`)

1. Port mismatch — proxy MUST run on PORT=7000 for Vite dev proxy to land
2. `proxy/config.json` gitignored — credentials stay on machine; never commit
3. MSAL device-code refresh tokens are secrets — log redaction required
4. Static probe path resolution (TMDL fallback) — relative to proxy root
5. NODE_ENV=test disables cfg() caching — tests must rely on env vars not in-memory mutations
6. Databricks Apps cold-start ~30s — first request after idle is slow
7. Genie message immutability — one POST = one new `message_id` (cannot append)
8. Foundation Model endpoint regional pinning — cross-region inference adds latency
9. Power BI executeQueries tenant-gated by Premium/Fabric capacity (workaround: TMDL static probe)
10. Pulse-port compat shim file paths must NOT be refactored without coordinated sister-project change

### Queued

- Azure App Services deployment
- CI/CD via GitHub Actions (eval-gated prompt promotion when prompt registry lands)

---

## 12. What's completed (shipped today)

### Core infrastructure

| Capability | State | Evidence |
|---|---|---|
| 2-axis abstraction (vendor × connector) | ✅ Locked design | `BIAdapter` interface; 10 connector profiles |
| 10 backend AI connector paths | ✅ Wired | proxy/server.js + proxy/lib/* |
| Profile registry + resolver | ✅ Solid | `resolveProfile()` lines 755-786 |
| OAuth M2M + JWT auth | ✅ Solid | `idpMiddleware`, OAuth token cache |
| `/assistant/conversations/start` route | ✅ Solid | Routes to per-connector handler |
| `/assistant/conversations/start-sectioned` route | ✅ Solid | Multi-section staged rendering (Foundation Model + Genie) |

### Surfaces

| Surface | State | Notes |
|---|---|---|
| Ask Pulse with `powerbi-dwd` deterministic DAX | ✅ 10/10 PASS regression | Sub-second responses; tables rendered |
| Ask Pulse with Genie / Foundation Model | ✅ Working | Needs configured profile |
| AI Insights briefing | ✅ Working with FM/Genie | Staged 1-then-N; per-section validation |
| Power BI Q&A iframe surface | ✅ 10/10 mount stable | Microsoft NLP in MS tenant; defer-mode |
| Power BI `powerbi-client` native | ✅ Real SDK | + secure embed quick-preview + developer tools strip |
| Pulse mode (heritage port) | ✅ Hosted | Compat shim at `playground/src/pulse/*` |
| `/knowledge` browser | ✅ Shipped | CPG-FMCG fully authored (652+ lines) |
| PulseShell 3-tab uniform chrome | ✅ Locked | Per-tab visibility + detach affordance |
| Sustainability indicator | ✅ Shipped | Leaf + smile token gauge in footer |

### Validation & trust

| Capability | State |
|---|---|
| 4-status validator framework | ✅ Shipped (`insightsValidator.js` 600 lines) |
| Per-section validation (HEADLINE / TRENDS / RISKS / OPPORTUNITIES / NEXT ACTIONS) | ✅ Shipped (`insightsStageValidator.js` 419 lines) |
| Retry-on-validator-failure with worked examples | ✅ Shipped |
| Sustainability token tracking | ✅ Shipped |

### Knowledge & packs

| Capability | State |
|---|---|
| Pack substrate (`pulsepacks/<pack>/`) | ✅ Shipped |
| CPG-FMCG pack | ✅ Fully authored (10 sub-verticals × 4 files) |
| Retail-Digital pack | 📋 Stubs |
| SaaS-Product pack | 📋 Stubs |
| Pack-aware preset library | ✅ Shipped (`_packs/cpgFmcgPresets.ts` 220+ lines) |
| KB router + browser UI | ✅ Shipped |

### Tests & quality

| Suite | State |
|---|---|
| Proxy Jest | ✅ 1164/1164 passing |
| Playground Vitest | ✅ 1103/1103 passing |
| Lint | ✅ Clean |
| TypeScript strict | ✅ Clean |
| Vite build | ✅ Clean |
| Live5 / Live10 smoke (Power BI deterministic DAX) | ✅ 10/10 PASS |
| Power BI Q&A 10x mount smoke | ✅ 10/10 mount stable |

### Operational

| Item | State |
|---|---|
| Live deployment on Databricks Apps | ✅ Since 2026-05-22 |
| MSAL device-code auth flow | ✅ Working for Power BI |
| Static probe from TMDL (tenant-gated workaround) | ✅ Working (17 measures, 8 tables, 45 columns for SalesPerformance dataset) |
| Per-tab visibility model | ✅ Locked |
| Discovery loop + staged 1-then-N rendering | ✅ Shipped |

---

## 13. What's in plan — gap-closure plan

Research-grounded plan locked 2026-05-26 after parallel agent passes. Full details in `docs/AGENDA.md`.

### Unifying thesis

**"One record, six purposes."** The same `AuditEntry` envelope IS simultaneously the audit log + feedback record + eval-set candidate + OTel span payload + OpenLineage run + "reproduce this answer" replay seed. Salesforce/Microsoft/Snowflake/Databricks each have pieces in separate stores; nobody ships unified. PulsePlay's vendor-agnostic 10-connector axis is the architectural reason to build the unified envelope first.

### Stack-of-record (locked decisions)

| Layer | Tool | License |
|---|---|---|
| Cache L1 (prompt prefix) | LiteLLM | MIT |
| Cache L2 (semantic Q→A) | GPTCache | MIT |
| Cache L3 (warehouse) | OLAP Intent Signature (custom) | — |
| Telemetry sink | LangFuse self-host | MIT |
| Instrumentation | OpenLLMetry (Traceloop) | Apache 2.0 |
| Prompt registry | Promptfoo + Git (MLflow Prompt Registry as Databricks projection) | MIT + Apache 2.0 |
| Eval CI | Promptfoo + Langfuse + DeepEval + Ragas | MIT × 4 |
| Hallucination judges | Round-trip SQL → consistency probes → HHEM-2.1-Open → SQLHD (disputed-only) | Apache 2.0 / Apache 2.0 / open |
| Audit storage | Hot Delta/Iceberg → cold S3 Object Lock or Azure Immutable Blob (compliance mode) | n/a |

### 7 ops gaps + 3 whitespace plays

| # | Gap / Whitespace | Effort | Status |
|---|---|---|---|
| Gap 1 | Prompt caching across backends | 8d | 📋 In plan |
| Gap 2 | Confidence routing | 12d | 📋 In plan |
| Gap 3 | OTel GenAI telemetry across all 10 connectors | 10d | 📋 In plan |
| Gap 4 | Prompt versioning + registry | 6d | 📋 In plan |
| Gap 5 | Nightly eval harness + Settings → Trust panel | 14d | 📋 In plan |
| Gap 6 | Compliance audit Phase A (Hybrid Orchestrator-Deployer) | 4-5d | 📋 In plan |
| Gap 7 | Active + passive feedback | 7d | 📋 In plan |
| WS 1 | Horizontal KB structure + content | 8d | 📋 In plan |
| WS 2 | Provider-aware KB translator | 5d | 📋 In plan |
| WS 3 | KPI conflict resolution Policy A+E | 2-16d | 📋 In plan |

### Sequencing (~5-6 weeks foundational per FTE)

| Week | Parallel work |
|---|---|
| 1 | OTel + Caching (foundation) |
| 2 | Prompt versioning + Horizontal KB skeleton |
| 3 | Eval harness + Trust panel |
| 4 | Compliance audit + Active+passive feedback |
| 5 | Confidence routing |
| 6 | Provider-aware translator + KPI conflict A+E |

### Codex hand-off opportunities

Per [feature_gap_closure_plan.md](C:/Users/rajes/.claude/projects/d--Working-Folder-Projects-PulsePlay/memory/feature_gap_closure_plan.md), each gap splits into a Codex-friendly chunk (mechanical, well-scoped) and a Claude-better chunk (architecture-spanning integration). Concurrent execution drops total wallclock to ~5-7 weeks per FTE with Codex helping.

---

## 14. Whitespace — where PulsePlay leapfrogs

Validated by 8+5 parallel research agents. These are features **no shipping AI-BI vendor (ThoughtSpot / Cortex / Power BI Copilot / Tableau Pulse / Looker / dbt / Cube / AtScale) currently offers**:

1. **L1+L2+L3 unified cache stack behind one telemetry envelope** (cache providers do L1+L2; warehouses do L3; nobody unifies)
2. **Connector's `updated_at` as cache-freshness key** (vendors use blind TTLs)
3. **Pre-warming on profile activation** via `max_tokens:0` ping
4. **Router confidence × validator agreement as self-training KNN signal**
5. **Tenant-policy pinning + cascade escalation combined**
6. **OLAP Intent Signature shared across LLM and non-LLM backends** (PBI deterministic and Genie LLM hit same L3 entry)
7. **Sustainability indicator tied to real cache savings** (not just consumed tokens)
8. **Uniform OTel span shape across all 10 connectors** (one dashboard works for everything)
9. **Trust-status distribution chart per backend over time** (single LangFuse query)
10. **KPI divergence dashboard** (% time Genie/FM agree per metric)
11. **Routing-accuracy retrospective** (was cheaper backend "good enough"?)
12. **Prompt provenance prod-trace → Git commit** via hash lookup
13. **Per-tenant prompt freeze** with span attribute proving compliance
14. **4% problem made visible** (arithmetic-over-aggregates accuracy on trust panel)
15. **Cross-backend leaderboard** stratified by question class × complexity tier
16. **Unified AuditEntry envelope** (one record, six purposes)
17. **KPI divergence as first-class audit field** ("show every divergence in Q3 for finance pack" is single SQL query)
18. **Per-tenant audit export to their own immutable bucket** (PulsePlay never holds long-term tenant data)
19. **Per-field retention for GDPR zero-knowledge erasure**
20. **Passive feedback signals captured automatically** (NO AI-BI vendor publishes these)
21. **Closed-loop curation pipeline** (feedback → golden set → nightly leaderboard)

### Strategic implication

PulsePlay's 4 named differentiation plays:
1. **Vertical/domain packs at the metric layer** (CPG-FMCG fully authored already)
2. **Horizontal viz/stats/analytical KB with citation-per-rule**
3. **Honest KB-vs-dataset divergence surfacing**
4. **Provider-aware KB translator** (only PulsePlay's vendor-agnostic architecture needs it)

Each is unoccupied space the leaders can't easily replicate (their architecture is single-vendor-locked).

---

## 15. Compliance & governance posture

### Role classification

PulsePlay = **Hybrid Orchestrator-Deployer**. See section 9.

### Today

| Obligation | How satisfied |
|---|---|
| EU AI Act Art. 50 transparency (user knows they're interacting with AI) | ✅ 4-status badge on every answer; visible AI surface chrome |
| GDPR Art. 15(1)(h) meaningful logic disclosure | ✅ Validator status + reasoning |
| GDPR Art. 22 right to human intervention | ✅ "Request review" link path; thumbs-down feedback |
| EU AI Act Art. 19 operational logs (6 months minimum for high-risk) | ⚠️ `console.log` only; in-memory counters lost on restart |
| Right to explanation (CJEU Dun & Bradstreet 2025) | ⚠️ Surface affordance not yet shipped |

### In plan (Phase A, ~4-5 days)

1. Persist `auditLog()` to rotating file (today: console only)
2. Add upstream-provider reference fields to every entry (`upstream_provider`, `upstream_request_id`, `upstream_audit_url`, `upstream_model_id`, `upstream_model_version`)
3. Add PulsePlay-intervention fields (`prompt_template_id`+version, `router_decision`, `kb_sources_injected`, `cache_hit`, `validator_outcome`, `kpi_divergence_verdict`)
4. Author `docs/COMPLIANCE.md` — role disclosure, responsibility matrix, audit lineage map, GDPR Art. 15+22 + EU AI Act Art. 50+86 mapping

### Deferred (Phase B — only when a customer deploys in regulated scope)

- SHA-256 hash chain + Merkle root + Ed25519 signing
- Per-tenant immutable storage modes (S3 Object Lock / Azure Immutable Blob / Databricks UC Delta)
- `/audit/replay/:entry_id` endpoint
- `/audit/dsar?user_id` endpoint
- WORM cold storage tier with 7-10 year retention

### EU AI Act exposure analysis

PulsePlay v1's internal-org decision-support analytics scope likely does **NOT** trigger high-risk Annex III classification under the May 19, 2026 draft Commission guidelines. High-risk classification only triggers when:
- Deployed against employment / credit / insurance / essential-services / education / law-enforcement
- The AI is the *decision substrate*, not exploratory tool

PulsePlay graduates to provider-grade obligations only if it ships its own model (currently doesn't) or a customer asks PulsePlay to BE their compliance store (Phase B work).

---

## 16. Cost & sustainability

### Today

- **Deterministic DAX path** = **zero LLM cost** for common analytical questions (sub-second response)
- Per-call usage tracking via sanitized `usage` blocks (OpenAI / Anthropic / Bedrock shapes normalized)
- Sustainability indicator (leaf + smile gauge) in footer shows tokens consumed per session
- Genie message cost computed per call

### Future (Gap 1 — 3-layer cache)

| Cache layer | Expected savings | Evidence |
|---|---|---|
| L1 prompt prefix (Bedrock-Claude) | ~90% read discount | Anthropic published rate |
| L1 prompt prefix (Bedrock-Nova) | 49% bill reduction | Published case study $335→$170/mo |
| L1 prompt prefix (Azure OpenAI) | 50% standard / 100% Provisioned | Azure pricing |
| L2 semantic Q→A cache | TTL-bounded; per-tenant + per-data-freshness | New ground |
| L3 warehouse result | Canonical SQL signature → shared with deterministic backend | Novel |

### Sustainability messaging

After Gap 1 lands, the sustainability indicator rewires to show **saved tokens via cache + saved via router downgrade**, not just consumed. Turns environmental messaging from greenwashing into a measured KPI — another whitespace move.

---

## 17. Test posture & quality methodology

### Today

| Type | Count | Frequency |
|---|---|---|
| Proxy unit (Jest) | 1164/1164 passing | On every PR + push to main |
| Playground unit (Vitest) | 1103/1103 passing | On every PR + push to main |
| Lint (ESLint) | Clean | On PR |
| TypeScript strict | Clean | On PR |
| Vite production build | Clean | On PR |
| Headed smoke (Playwright) | Multiple per-feature probes in `playground/scripts/probe-*.mjs` | Manual / on-demand |
| Live regression (10-Q Ask Pulse + 10x Q&A mount) | 10/10 PASS today | Manual / on-demand |

### What we measure today

- **Structural correctness**: tests assert the code emits the right *shape* of output (correct prompt structure, correct cache key, correct API call)
- **Build hygiene**: lint + TypeScript strict + bundle build
- **Live qualitative review**: maintainer manually clicks through after each shipment

### What we do NOT measure today (honest gap)

- **Answer correctness (semantic)** — no automated harness comparing AI output to ground-truth
- **Per-backend quality parity** — no A/B across the 10 connectors on the same Q-A set
- **Performance benchmarks** — latency observed in dev tools but not benchmarked across releases
- **Cache hit rate** — not tracked (cache itself is in plan)
- **Accessibility audit** — WCAG 2.2 AA not formally tested (in plan)

### What's in plan (Gap 5 — nightly eval harness, ~14 days)

- 4-tier eval ladder (Smoke 10Q ≤60s per commit / Regression 100Q ≤10min per PR / Full 1000+Q nightly / Adversarial 500+ vectors weekly)
- 3D leaderboard cube: `(connector × question-class × complexity-tier) → (accuracy, hallucination, p95, cost)`
- Settings → Trust panel surfaces stratified accuracy honestly per backend per question class
- Golden set grows from production traces via thumbs-down + human curator
- Hallucination signal feeds the 4-status validator

---

## 18. Repository layout

```
PulsePlay/
├── proxy/                          # Express proxy — 10 connector backbone
│   ├── server.js                   # Main entry; routes; auth; profile registry
│   ├── lib/
│   │   ├── insightsValidator.js    # 4-status validator framework
│   │   ├── insightsStageValidator.js   # Per-section format validators
│   │   ├── promptIR.js             # Prompt IR loader + translator dispatch
│   │   ├── promptTranslators/      # Per-backend translators (genie, foundation-model, supervisor, ...)
│   │   ├── foundationModelClient.js    # Mosaic AI Foundation Model client
│   │   ├── connectorProbe.js       # Capability probe per profile
│   │   ├── powerbiSemanticModelClient.js   # Power BI executeQueries client
│   │   ├── powerbiQuestionMatcher.js   # NL → DAX template matcher
│   │   ├── powerbiDaxTemplates.js  # Deterministic DAX template library
│   │   ├── sectionedOrchestrator.js    # Multi-section orchestrator (AI Insights)
│   │   └── packMatcher.js          # Pack manifest loader
│   ├── config.json                 # GITIGNORED — credentials per profile
│   ├── tests/                      # Jest tests (1164)
│   └── package.json
│
├── playground/                     # React frontend
│   ├── src/
│   │   ├── App.tsx                 # Sidebar + canvas shell
│   │   ├── biPanel/                # BIAdapter contract + host component + registry
│   │   ├── components/             # Composer, AnswerCard, AISidebar, ...
│   │   ├── knowledge/              # /knowledge route + KnowledgeShell
│   │   ├── visualization/          # ECharts + Vega-Lite + chart registry
│   │   ├── pulse/                  # Heritage Pulse port (compat shim)
│   │   │   └── _packs/             # Pack-aware preset library
│   │   └── lib/
│   │       └── chartRegistry.ts    # Chart type registry + auto-pick
│   ├── scripts/                    # Playwright smoke harnesses
│   │   ├── probe-ask-pulse-live10.mjs     # Today's 10-Q regression
│   │   ├── probe-powerbi-qna-10x.mjs      # Today's 10x mount regression
│   │   └── probe-*.mjs              # Other feature probes
│   ├── tests/                      # Vitest tests (1103)
│   └── vite.config.ts              # Dev proxy to 127.0.0.1:7000
│
├── bi-adapters/                    # Per-vendor BI adapters
│   ├── generic-iframe/             # Always-works escape hatch
│   ├── powerbi/                    # Real powerbi-client SDK adapter
│   ├── tableau/                    # iframe stub (real SDK in plan)
│   ├── qlik/                       # iframe stub
│   └── looker/                     # iframe stub
│
├── pulsepacks/                     # Knowledge packs
│   ├── cpg-fmcg/                   # ✅ Fully authored (652+ lines)
│   │   ├── pack.json
│   │   ├── knowledge-base/
│   │   │   ├── glossary.md         # 181 lines, 80+ entries
│   │   │   ├── ontology.md         # 339 lines, 10 entities
│   │   │   └── references.md       # 129 lines, 30+ external citations
│   │   └── sub-verticals/          # 10 sub-verticals × 4 files each
│   ├── retail-digital/             # 📋 Stubs
│   └── saas-product/               # 📋 Stubs
│
├── databricks-agents/              # Mosaic AI Supervisor Agent template
│   └── supervisor/                 # LangGraph + create_react_agent
│
├── scripts/                        # Repo-level scripts
│   ├── tmdl-to-static-probe.mjs    # TMDL → static probe JSON (for tenant-gated executeQueries)
│   ├── get-pbi-user-refresh-token.mjs   # MSAL device-code → refresh token
│   ├── llm_onboard.py              # Universal LLM ritual (entry point)
│   └── llm_wrapup.py               # Universal LLM ritual (exit point)
│
└── docs/                           # All documentation
    ├── ARCHITECTURE.md             # Architectural lodestar
    ├── AGENDA.md                   # Backlog (KB v2 + gap-closure plans)
    ├── HANDOVER.md                 # LIFO session journal
    ├── ROADMAP.md                  # v0.1 → v1.2 sequencing
    ├── SECURITY.md                 # Internal-scoped guardrails
    ├── PROXY_REFERENCE.md          # Proxy API surface + scopes
    ├── KNOWLEDGE_BASE_ARCHITECTURE.md   # KB plane spec
    ├── KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md  # Source provenance + governance
    ├── PACKS.md                    # Pack architecture overview
    ├── SETTINGS_SPEC.md            # Settings master spec
    ├── DEPLOY_MVP_0.2.md           # Deployer checklist
    ├── PUBLIC_OSS_AGENDA.md        # Public-OSS items deferred from v1.x
    ├── PULSE_PORT_DETANGLING.md    # What's heritage vs PulsePlay-native
    ├── QUALITY.md                  # Honest measurement methodology
    ├── SHOWCASE_DECK.md            # Slide deck (this file's companion)
    ├── REFERENCE_GUIDE.md          # ← You are here
    ├── adr/                        # Architecture Decision Records
    ├── inherited/                  # Pulse-heritage docs preserved verbatim
    └── research/                   # Research outputs (taxonomy docs etc.)
```

---

## 19. References — research lineage

### Project memory (decisions persisted across sessions)

| Memory file | What it captures |
|---|---|
| `feature_2_axis_abstraction.md` | The defining vendor × connector design |
| `feature_no_ungrounded_artifacts.md` | The 4-status accuracy contract |
| `feature_unified_workbench.md` | 3-mode Ask Pulse strategy (Native Embed / Verified / Hybrid) |
| `feature_visualization_stack.md` | ECharts primary + Vega-Lite + tiered chart registry |
| `feature_prompt_ir.md` | Prompt IR + per-backend translators |
| `feature_discovery_staged.md` | Discovery loop + staged 1-then-N rendering |
| `feature_kb_v2_architecture.md` | KB v2 architecture (horizontal + provider-aware + Policy A+E) |
| `feature_gap_closure_plan.md` | 7 ops gaps + 3 whitespace plays + stack decisions |
| `project_qna_defer.md` | Q&A tab defer-mode decision |

### Research synthesis (from this session)

- **8 parallel agents** on AI-BI culture, grounding architectures, viz/stats sources, offline KB inventory, colorology, UI/UX, best-practice meta, governance + KB-vs-dataset conflict
- **5 parallel agents** on caching+routing, OTel+prompt registry, eval harness, audit+feedback, offline code inventory

Findings persisted to `feature_kb_v2_architecture.md` and `feature_gap_closure_plan.md`.

### External research anchors (primary sources)

- Gartner 2025 ABI Magic Quadrant (agentic analytics terminology)
- OSI v1.0 spec (Open Semantic Interchange, Jan 2026)
- Anthropic "Building Effective Agents" + April 2026 postmortem
- OpenTelemetry GenAI Semantic Conventions v1.42.0
- EU AI Act Articles 12, 18, 19, 26, 50, 86 (May 2026 Commission guidelines)
- CJEU Dun & Bradstreet Case C-203/22 (Feb 2025)
- OWASP LLM Top 10 2025 (LLM01 Prompt Injection)
- arXiv 2505.00060 (Fact-consistency eval — the 4% problem)
- arXiv 2503.11984 (NL2SQL-BUGs taxonomy)
- Cleveland & McGill 1985 + 2025 ViT replication (perceptual ranking)

### Sister project

- **Pulse PBI custom visual** at `d:/Working_Folder/Projects/DwD_AI_Assistant_for_PBI/` — heritage source of the ported `playground/src/pulse/*` compat shim. PulsePlay is NOT a custom visual; sister project IS. See `PULSE_PORT_DETANGLING.md` for the categorization.

---

## How to convert this document

### To PDF

- **Easiest**: open in VS Code → Markdown Preview → right-click → Print → Save as PDF
- **Better formatting**: use `pandoc` (if installed): `pandoc REFERENCE_GUIDE.md -o REFERENCE_GUIDE.pdf --pdf-engine=xelatex`
- **Web-friendly**: render via any markdown-to-HTML tool, then browser-print to PDF

### Companion deck → PowerPoint

See `SHOWCASE_DECK.md` for the Marp-compatible deck source. Conversion:

- **Marp CLI** (recommended): `npx @marp-team/marp-cli SHOWCASE_DECK.md -o showcase.pptx`
- **Manual**: each `---` separator is a slide break; copy-paste into PowerPoint
- **Web preview**: `npx @marp-team/marp-cli --preview SHOWCASE_DECK.md`

---

**End of REFERENCE_GUIDE.md** · 2026-05-26
