---
marp: true
theme: default
paginate: true
size: 16:9
header: 'PulsePlay — BI-agnostic Agentic Analytics Workbench'
footer: 'Internal · 2026-05-26'
---

<!-- _class: lead -->

# PulsePlay
## The thin pane of glass for AI on every BI tool you already have

**Internal showcase · 2026-05-26**

Rajesh Kumar Mohanty

---

## What PulsePlay is in one line

A React-based workbench that hosts **any BI tool** (Power BI · Tableau · Qlik · Looker · generic iframe) as an embedded guest, with an **AI assistant** that reasons across whatever the user is looking at.

**Vendor-agnostic on the BI side. Connector-agnostic on the AI side.**

---

## The problem

- Org has multiple BI tools deployed (Power BI for finance, Tableau for marketing, …)
- Org also has multiple AI/agent stacks (Databricks Genie, Mosaic AI Foundation Model, Azure OpenAI, Bedrock, …)
- Today these are **siloed**: each BI tool has its own AI assistant; each AI assistant is locked to one vendor
- Users live in tab-switching hell; insights don't compose; KPIs disagree across tools; AI cost runs unchecked

---

## The PulsePlay solution — 2-axis abstraction

|  | Y-axis: BI vendor | X-axis: AI connector |
|---|---|---|
| **What varies** | What the user is LOOKING AT | What the AI brain IS |
| **Where it lives** | `bi-adapters/<vendor>/` | `proxy/` profiles |
| **Today** | Power BI native + 4 iframe fallbacks | **10 backend paths shipped** |

**Any combination of (vendor, connector) is valid. Switching either is independent.**

---

## Category positioning (2026)

**"BI-agnostic agentic analytics workbench"** — category of one.

Every Gartner 2025 ABI MQ leader (Microsoft, Salesforce/Tableau, Google/Looker, Qlik, Oracle, ThoughtSpot) **IS itself a BI vendor**. PulsePlay is the only credible vendor-neutral orchestrator across them.

- "Agentic analytics" — the dominant 2026 category name
- OSI v1.0 (Jan 2026) — de facto open metric-object spec adopted by Snowflake / dbt / Cube / AtScale / ThoughtSpot / Sigma / Salesforce / 40+ partners

---

## The 10 AI connector paths

1. **Databricks Genie** — natural-language analytics over Unity Catalog
2. **Foundation Model** (Llama 3.1 405B) — Mosaic AI serving endpoint
3. **Azure OpenAI chat**
4. **Azure OpenAI analytics**
5. **Bedrock RAG**
6. **Bedrock direct** (Claude / Nova / Llama / Titan)
7. **Supervisor** — multi-agent orchestration
8. **Supervisor-local** — LangGraph-based local supervisor
9. **ResponsesAgent** — agent loop wrapper
10. **Power BI semantic-model** — deterministic DAX templates, **zero LLM cost**

---

## Three primary surfaces

### Ask Pulse
PulsePlay-orchestrated conversational AI. Sub-second deterministic DAX or grounded LLM. **10/10 PASS on latest regression**.

### AI Insights
Multi-section briefing (HEADLINE / TRENDS / RISKS / OPPORTUNITIES / NEXT ACTIONS) — staged 1-then-N rendering, parallel fan-out.

### Dashboard
Vendor-native embed (Power BI `powerbi-client` SDK shipped; Tableau / Qlik / Looker iframe today; SDK adapters in roadmap).

---

## Trust contract — 4-status validator

Every AI answer carries a status badge **emitted by the validator, never by the LLM**:

| Status | Meaning |
|---|---|
| **Verified** | Numbers traced to a verifiable query; KB and dataset agree |
| **Grounded draft** | Answer grounded but divergence flagged |
| **Suggestion** | Confidence below threshold or sample size too small |
| **Blocked** | Could not ground; escalated to human review |

**Unique in the industry** — closest precedent is IBM Carbon's AI label.

---

## Knowledge Base architecture

### Vertical (per-pack) — ✅ shipped
- **CPG-FMCG** — fully authored (652+ lines: glossary 181 / ontology 339 / references 129 / 10 sub-verticals)
- **Retail-Digital** — stubs (in plan)
- **SaaS-Product** — stubs (in plan)

### Horizontal (cross-pack) — 📋 in plan
- Visualization grammar · Statistics · Analytical frameworks · Color theory · UX patterns

**Browsable at `/knowledge`** — pack manifests + sub-vertical KPI lists + sample questions.

---

## Defining design feature — Hybrid Orchestrator-Deployer

PulsePlay is **not the AI provider** (Databricks / Microsoft / AWS / Anthropic are).
PulsePlay is **not the deployer** (the customer org is).
PulsePlay is the **enabler** that actively shapes AI behavior via:

- Prompt composition (Prompt IR + per-backend translators)
- Validator (4-status grounding)
- Routing (per-question backend selection — in plan)
- KB injection (vertical + horizontal)
- Caching (3-layer — in plan)
- KPI conflict resolution (lineage-aware — in plan)

---

## What's shipped (today)

| Capability | State |
|---|---|
| 10 backend connector paths | ✅ Wired |
| Power BI semantic-model deterministic DAX | ✅ 10/10 PASS regression |
| Power BI Q&A iframe surface | ✅ 10/10 mount stable (in defer-mode) |
| Power BI `powerbi-client` native adapter | ✅ Real SDK |
| 4-status validator | ✅ Shipped |
| `/knowledge` browser | ✅ Shipped (CPG-FMCG fully authored) |
| PulseShell 3-tab uniform chrome + detach | ✅ Shipped |
| Sustainability indicator | ✅ Shipped |
| Databricks App live deployment | ✅ Live since 2026-05-22 |
| Test suites | ✅ 1164/1164 proxy + 1103/1103 playground |

---

## End-to-end demo arc (5-7 min)

1. Land at `127.0.0.1:7001` → Settings → AI shows 10 connector profiles
2. Pick `powerbi-dwd` profile (MSAL device-code authed)
3. **Ask Pulse**: `Top 5 cities by Total Sales` → sub-second response, Verified badge
4. Follow-up: `Sales YoY % by Category`
5. **Power BI Q&A native embed** — Microsoft NLP, 0 LLM calls from PulsePlay
6. Switch to **AI Insights** — staged 1-then-N briefing
7. **Detach** the AI sidebar — comparison primitive
8. **`/knowledge`** — drill into CPG-FMCG pack
9. **Settings → AI** — per-tab visibility + sustainability indicator
10. **Deployed live** on Databricks Apps

---

## Tech stack — proxy (Express)

- **Runtime**: Node.js 18-22
- **Framework**: Express
- **Auth**: MSAL (device-code + service principal), JWT validation
- **Connectors**: Databricks SDK, Power BI REST + XMLA, Azure OpenAI, Bedrock SDK
- **Validation**: Custom 4-status validator framework
- **Tests**: Jest (1164 tests)

---

## Tech stack — playground (React)

- **Framework**: React + Vite
- **State**: React Query (TanStack)
- **Charts**: ECharts (primary) + Vega-Lite spec/validation + Plotly (lazy)
- **BI adapters**: `powerbi-client` (Power BI native); iframe fallbacks for others
- **Tests**: Vitest (1103 tests)
- **Routing**: Custom path router (no React Router); `/knowledge`, `/powerbi/qna`, etc.

---

## Tech stack — knowledge plane

- **Packs**: filesystem-based at `pulsepacks/<pack>/` (glossary.md / ontology.md / references.md / sub-verticals/*)
- **Manifest**: `pack.json` declares sub-verticals + KPIs + sample questions
- **Loader**: `proxy/lib/packMatcher.js` + `playground/src/knowledge/knowledgeRoute.ts`
- **Future**: OSI v1.0 YAML alignment + horizontal KB (`_horizontal/{visualization,statistics,analytical,color,ux}/`)

---

## Tech stack — deploy

- **Local**: proxy on `127.0.0.1:7000`, dev server on `127.0.0.1:7001`
- **Live**: Databricks Apps (since 2026-05-22, commit `6de39cc`)
- **Queued**: Azure App Services
- **Vite proxies** `/api/*` → proxy port

---

## Whitespace — where PulsePlay leapfrogs

Validated by 8+5 parallel research agents — **nobody else ships these**:

1. **Vertical/domain packs at the metric layer** (CPG-FMCG fully authored; no leader has first-class verticals)
2. **Horizontal viz/stats/analytical KB with citation-per-rule** (Draco is academic-only; vendors use opaque LLM picks)
3. **Honest KB-vs-dataset divergence surfacing** (every leader silently picks one)
4. **Provider-aware KB translator** (only PulsePlay's vendor-agnostic axis needs it)
5. **Unified AuditEntry envelope** (one record = audit + feedback + eval candidate + OTel span + lineage)
6. **OLAP Intent Signature** shared across LLM + no-LLM backends
7. **Sustainability indicator** tied to real cache savings (in plan)

---

## What's in plan — gap-closure (7 ops + 3 whitespace)

| Category | Items | Effort |
|---|---|---|
| **Operational hygiene** | Caching · Routing · OTel telemetry · Prompt registry · Eval harness · Compliance audit · Feedback | ~66 days |
| **Whitespace plays** | Horizontal KB · Provider-aware translator · KPI conflict Policy A+E | ~25 days |
| **Total** | 7 ops + 3 whitespace | ~91 days serial / ~5-6 weeks foundational parallel |

Full plan in `docs/AGENDA.md`.

---

## Roadmap — sequencing

| Week | Focus |
|---|---|
| 1 | OTel telemetry + 3-layer cache (foundation) |
| 2 | Prompt registry + horizontal KB skeleton |
| 3 | Nightly eval harness + Settings → Trust panel |
| 4 | Compliance audit Phase A + active/passive feedback |
| 5 | Confidence routing across connectors |
| 6 | KB provider-aware translator + KPI conflict A+E |

---

## Compliance posture

**Role**: Hybrid Orchestrator-Deployer
- NOT the AI provider (Microsoft / Databricks / AWS / Anthropic carry that)
- NOT the deployer (customer org carries that)
- IS the enabler that actively shapes AI behavior

**Today**: structured audit log via `console.log` + 4-status badge = Art. 50 transparency disclosure
**In plan**: persistent file log + upstream-provider reference fields + COMPLIANCE.md role doc (~4-5 days)
**Deferred**: hash-chain Merkle Ed25519 + per-tenant immutable export (only when a customer deploys in regulated scope)

---

## Cost & sustainability story

- **Deterministic DAX path** = **zero LLM cost** for common analytical questions (sub-second)
- **3-layer cache (in plan)**: Bedrock-Claude ~90% read discount; Bedrock-Nova case study $335→$170/mo (49%); Azure OpenAI up to 100% Provisioned
- **Sustainability indicator** (leaf + smile gauge) shows token consumption per session
- **Future**: sustainability indicator rewires to show *saved* tokens via cache, not just consumed

---

## Differentiation summary

PulsePlay is **at or ahead of the frontier on**:
- Trust + validator architecture (4-status taxonomy)
- Deterministic grounding (no-LLM path for known intents)
- Vertical-pack substrate (CPG-FMCG fully authored)
- Knowledge-browser UI

PulsePlay is **6-8 weeks of focused work behind on**:
- Operational hygiene (caching, telemetry, eval, audit retention, feedback)

PulsePlay has **not yet shipped** the 4 whitespace plays — that's the leapfrog opportunity.

---

## Status check

- **Proxy tests**: 1164/1164 passing
- **Playground tests**: 1103/1103 passing
- **Lint**: clean
- **Build**: clean
- **Deploy**: live on Databricks Apps
- **Latest regression**: 10/10 PASS Ask Pulse + 10/10 mount Q&A (today)

---

<!-- _class: lead -->

## Q&A · Next steps

**Discussion points**:
1. Which whitespace play to prioritize first?
2. Is the 6-week foundational plan well-sized for one engineer + Codex hand-off?
3. Compliance audit Phase A — strategic timing vs the EU AI Act 2 Aug 2026 deadline
4. Vendor adapters (Tableau / Qlik / Looker) — when to graduate from iframe to real SDK

**See also**:
- `docs/REFERENCE_GUIDE.md` — comprehensive reference
- `docs/AGENDA.md` — full backlog
- `docs/ARCHITECTURE.md` — architecture lodestar
