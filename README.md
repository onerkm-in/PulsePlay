# PulsePlay

[![tests](https://github.com/onerkm-in/PulsePlay/actions/workflows/test.yml/badge.svg)](https://github.com/onerkm-in/PulsePlay/actions/workflows/test.yml)
[![codeql](https://github.com/onerkm-in/PulsePlay/actions/workflows/codeql.yml/badge.svg)](https://github.com/onerkm-in/PulsePlay/actions/workflows/codeql.yml)

**Multi-BI AI playground.** A React app where BI and AI components come to play together. Plug in a BI surface, plug in an AI connector, pick or infer a vertical pack, and explore the combination in one web-native host.

## What it is

PulsePlay is a 2-axis abstraction:

- **Y: BI vendor axis** — what the user is LOOKING AT (Power BI / Tableau / Qlik / Looker / generic iframe). Pick one, embed it in the canvas. Vendor-agnostic via the [`BIAdapter`](playground/src/biPanel/BIAdapter.ts) contract.
- **X: AI connector axis** — what the AI brain IS (Databricks Genie / Azure OpenAI / AWS Bedrock / Mosaic AI Foundation Model / Supervisor Agent). Pick one in the sidebar. Connector-agnostic via the proxy's profile system.

Any combination of (vendor, connector) is valid. Switch either independently.

The first production-grade build target is **Databricks Genie + Power BI** because that path inherits the most battle-tested work from the Power BI custom visual project. It must also be novice-author friendly: with org prerequisites in place, the setup goal is roughly 10 minutes through a guided flow where AI/probe output drafts the setup and the author confirms. It is the first product slice, not a cage: the same contracts remain open for Tableau, Qlik, Looker, OpenAI, Bedrock, Foundation Model profiles, and future connectors, but those come after the Genie + Power BI cell is robust. The working rule is documented in [docs/SUPERIOR_BUILD_LEVERAGE_PLAN.md](docs/SUPERIOR_BUILD_LEVERAGE_PLAN.md): best proven behavior wins, but it must enter through PulsePlay's modular contracts.

## Why it exists

The sister project [sister Pulse project](../sister Pulse project) (Pulse) proved out the AI-over-BI pattern as a Power BI custom visual. That product is locked into the Power BI sandbox (no `fetch`, no streaming, no Web Workers, single-vendor). PulsePlay flips the model: **the React playground is the host, BI tools are guests** — which removes the sandbox constraints AND opens the door to multi-vendor BI orchestration.

PulsePlay's role inside the org: a thin pane of glass that connects to the platform team's existing AI services (Databricks Genie, Mosaic Supervisor, Foundation Model serving) and the org's existing BI deployments (Power BI / Tableau / Qlik / Looker). We don't build LLMs; we don't build agents; we orchestrate and provide the experience layer.

What becomes possible: streaming AI responses, voice in/out, AI-driven auto-tour mode, cross-vendor single-pane-of-glass answers, AI-painted overlay annotations on top of iframes, multi-user collaboration via WebRTC, save/share/branch sessions, in-browser data joins via DuckDB-WASM. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "The unconstrained roadmap" and [docs/ROADMAP.md](docs/ROADMAP.md) for the sequenced plan.

## Quick start

```powershell
# 1. Install proxy dependencies + start it (terminal 1)
cd proxy
npm install
node server.js
# Listens on http://127.0.0.1:8787

# 2. Install playground dependencies + start it (terminal 2)
cd playground
npm install
npm run dev
# Open http://127.0.0.1:5173
```

Configure the proxy by copying `proxy/config.example.json` → `proxy/config.json` and filling in your Databricks workspace + token (or Azure OpenAI key, or Bedrock creds — see [docs/PROXY_REFERENCE.md](docs/PROXY_REFERENCE.md) for every supported backend and the OAuth M2M setup).

Once both are running, the playground will:
- Start in Pulse mode with a BI source setup panel and the ported Pulse AI experience
- Let you configure Power BI through secure embed quick-preview, SSO, backend-issued embed token, or manual paste
- Render the BI tool in the canvas
- Route AI questions through the configured proxy profile

## Status

**First production target in flight — Genie + Power BI.** Proxy + databricks-agents + cross-cutting docs inherited from sister Pulse project cycles 1-47. The ported Pulse AI experience runs inside the playground, Power BI has a real `powerbi-client` adapter, and Tableau/Qlik/Looker remain modular iframe stubs until the first cell passes the production gate.

Current local validation: proxy **1137/1137**; playground **1382/1382**, lint clean, and `vite build` clean; Pulse PBI enabler **93/93**, lint clean, and local `pbiviz package` clean after PB1a. The proxy-backed shell smoke also passes via `node playground/scripts/shell-smoke-proxy.mjs` with native canvas paint.

**The connector axis grew in May 2026.** PulsePlay now hosts **10 backend paths** on the AI side: Genie / Azure OpenAI (chat + analytics) / Bedrock (RAG + direct) / Foundation Model / Supervisor (managed + local) / ResponsesAgent / **Power BI semantic-model** (the latest — deterministic DAX templates, no LLM in the loop). The Power BI brain also exposes a **Q&A embed surface** at `/powerbi/qna` so deployers who want Microsoft's NLP can get it without PulsePlay invoking any LLM (Microsoft handles it in their tenant). See [docs/PROXY_REFERENCE.md](docs/PROXY_REFERENCE.md) for the full backend table.

Next major architectural cycle: **connector plugin system** — drop-in/drop-out per-connector modules under `proxy/connectors/`. Direction locked 2026-05-20; phased rollout queued. See [docs/AGENT_SYNC.md](docs/AGENT_SYNC.md) `[DECISION]` block for the contract.

## Repository layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full layout walkthrough.

```
PulsePlay/
├── playground/           # Vite + React + TS frontend (the host)
├── bi-adapters/          # Y-axis: BI vendor adapters
├── proxy/                # X-axis: connector-agnostic AI backbone (Pulse heritage)
├── databricks-agents/    # Mosaic AI Supervisor Agent template
├── pulsepacks/           # Vertical packs (CPG/FMCG, manufacturing, ...)
├── scripts/              # llm_onboard, llm_wrapup, smoke helpers
├── docs/                 # ARCHITECTURE, SECURITY, ROADMAP, AGENDA, PROXY_REFERENCE, ...
├── CLAUDE.md             # Per-session collaboration guide for LLMs
└── README.md             # This file
```

## Docs map

| Doc | What it covers |
|---|---|
| [docs/README.md](docs/README.md) | Documentation hub: what to read, what to skip, and consolidation map |
| [docs/research/SIMPLIFICATION_BEAST_MODE_DECISIONS_2026-05-23.md](docs/research/SIMPLIFICATION_BEAST_MODE_DECISIONS_2026-05-23.md) | Locked decisions for T1-T7 architecture tensions after 5 parallel research lanes: smart 2-parent, static defaults first, pack.json source of truth, mobile drawer + Context Bar, 5 backend / 3 UI confidence tiers, mobile Context Bar collapse, anonymous-first persistence |
| [docs/research/SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md](docs/research/SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md) | Two-user Viewer/Author model and single Business Context source of truth for packs, sectors, templates, metric behavior, guided filters, and references |
| [docs/research/FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md](docs/research/FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md) | Limits, end-user journey, Author flow, feature-add recommendations, and multiplicity collapse map |
| [docs/research/BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md](docs/research/BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md) | Six-agent audit of Business Context claims, source IDs, confidence labels, sustainability wording, and Strategic Lens implementation gates |
| [docs/research/MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md](docs/research/MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md) | Six-agent deep study across architecture, Settings, typeahead, visual system, trust, and engineering readiness |
| [docs/research/ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md](docs/research/ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md) | Enterprise product architecture, UX/UI system, typeahead command palette, wireframes, and Codex implementation blueprint |
| [docs/research/PULSEPLAY_END_TO_END_FEATURE_AND_JOURNEY_RESEARCH_2026-05-22.md](docs/research/PULSEPLAY_END_TO_END_FEATURE_AND_JOURNEY_RESEARCH_2026-05-22.md) | End-to-end feature inventory, information flow, Author/Viewer journeys, UX risks, and Figma evolution plan |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 2-axis design, BIAdapter contract, proxy backbone, 10 backend paths |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Sequenced plan v0.1 -> v1.2 |
| [docs/AGENDA.md](docs/AGENDA.md) | Open-work tracker, near-term + medium-term + blockers |
| [docs/SUPERIOR_BUILD_LEVERAGE_PLAN.md](docs/SUPERIOR_BUILD_LEVERAGE_PLAN.md) | How we harvest the mature Power BI visual without reintroducing Power BI-only coupling |
| [docs/POWERBI_DAX_QNA_ENABLEMENT.md](docs/POWERBI_DAX_QNA_ENABLEMENT.md) | Power BI semantic-model DAX setup, Q&A bridge, tenant settings, RLS/OBO, and deployment blockers |
| [docs/TEN_MINUTE_AUTHOR_SETUP.md](docs/TEN_MINUTE_AUTHOR_SETUP.md) | Novice-author setup target for the production Genie + Power BI cell |
| [docs/HOSTING_OPTIONS.md](docs/HOSTING_OPTIONS.md) | Hosting decision guide: Databricks App, Azure Static Web Apps, Container Apps, App Service, AKS, VM, and no-proxy rejection path |
| [docs/DEPLOY_AZURE_APP_SERVICE.md](docs/DEPLOY_AZURE_APP_SERVICE.md) | Azure App Service configuration challenges, auth/build/Key Vault/logging guidance |
| [docs/research/AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md](docs/research/AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md) | Deep App Service deployment findings: repo readiness, Azure account state, cost gates, auth blockers, and clean deployment phases |
| [docs/SECURITY.md](docs/SECURITY.md) | Internal-scoped security guardrails |
| [docs/PROXY_REFERENCE.md](docs/PROXY_REFERENCE.md) | Proxy API surface, scopes, OAuth M2M setup |
| [docs/QUALITY.md](docs/QUALITY.md) | What we measure, what we don't, what's roadmap |
| [docs/PACKS.md](docs/PACKS.md) | Pack architecture overview |
| [docs/SETTINGS_SPEC.md](docs/SETTINGS_SPEC.md) | Settings page master spec — IA + microcopy + state + guardrails + loophole audit |
| [docs/research/SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md](docs/research/SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md) | Settings observation alignment before brainstorming, including screenshot synthesis and Figma/VS Code handoff path |
| [docs/research/SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md](docs/research/SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md) | Settings progressive setup design brief, sustainability gauge study, and Claude implementation prompt |
| [docs/KNOWLEDGE_BASE_ARCHITECTURE.md](docs/KNOWLEDGE_BASE_ARCHITECTURE.md) | Knowledge plane, retrieval contracts, Settings IA, and Knowledge Base IA |
| [docs/DEPLOY_MVP_0.2.md](docs/DEPLOY_MVP_0.2.md) | MVP 0.2 deployer checklist — `config.json` template, env vars, smoke verification |
| [docs/PUBLIC_OSS_AGENDA.md](docs/PUBLIC_OSS_AGENDA.md) | What gets done IF/WHEN we go public-OSS later |
| [docs/MIGRATION_NOTES.md](docs/MIGRATION_NOTES.md) | Doc consolidation 2026-05-10 (this cycle's notes) |
| [docs/research/CODEBASE_AUDIT.md](docs/research/CODEBASE_AUDIT.md) | Brutal-honest gap analysis at HEAD |
| [docs/research/MARKET_AND_STANDARDS.md](docs/research/MARKET_AND_STANDARDS.md) | Market + standards research |
| [docs/adr/](docs/adr/) | Architecture Decision Records |
| [docs/inherited/](docs/inherited/) | Pulse-heritage docs preserved verbatim for reference |

## License

**Strategic direction:** Path C — inner-source-first, public-OSS-later. PulsePlay v1 is scoped as an **internal-org enabler**, not a public commercial platform. Public-OSS readiness items (license decision, SBOM signing, conformance harness, public docs site, etc.) are tracked in [docs/PUBLIC_OSS_AGENDA.md](docs/PUBLIC_OSS_AGENDA.md) so the work isn't forgotten if the strategic direction shifts.

No `LICENSE` file is committed yet. License decision pending; recommendation when needed is Apache 2.0.

## Sister project

This is a sibling of [sister Pulse project](../sister Pulse project) (the Pulse Power BI custom visual). Cross-pollination is intentional: bug fixes in `proxy/` should be ported between both projects manually until a shared library extraction is done. PulsePlay's `proxy/`, `databricks-agents/`, and `scripts/` were copied verbatim from Pulse cycles 1-47 and still carry some Pulse vocabulary in headers and comments — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Vocabulary leak items" for the cleanup list.
