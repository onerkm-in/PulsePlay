# Functional Coverage Assessment

Drafted on 2026-05-10.

## Purpose

This document assesses PulsePlay's functional coverage against the enterprise CPG/FMCG target state. It separates what is already implemented, what is partially implemented, what is missing, and what is currently infeasible or should be treated as out of scope under the current architecture.

## Status Legend

| Status | Meaning |
|---|---|
| Implemented | Working capability exists in the repository today |
| Partial | Some structure exists, but it is incomplete, stubbed, inherited, or not enterprise-ready |
| Missing | Target capability is documented or implied but not implemented |
| Infeasible / Out of Scope | Cannot be achieved safely or practically under the current architecture, or should be deferred until prerequisites exist |

## Executive Summary

PulsePlay currently has a strong scaffold: React playground, vendor picker, generic iframe BI host, adapter interface, connector picker, AI sidebar shell, and a broad inherited proxy with multiple AI backend routes. The enterprise CPG/FMCG target state is much larger: governed semantic layer, domain agents, real BI SDK adapters, SSO, tenant isolation, certified metrics, workflow approvals, simulation, source connectors, audit lineage, and production platform controls.

The product is best described as **partially implemented foundation**, not a functional enterprise solution yet.

Functional review bottom line: PulsePlay currently has a credible multi-BI/AI playground scaffold plus a substantial inherited AI proxy. The enterprise CPG/FMCG decision-intelligence platform is mostly documented target state. The main hard gaps are real BI adapters, SSO/AuthZ, semantic governance, audit-grade lineage, domain agents, workflows, simulation, and production deployment controls.

## Functional Coverage Table

| Functional Area | Target Capability | Current Coverage | Status | Evidence | What Is Missing | Infeasible / Out-of-Scope Notes | Priority |
|---|---|---|---|---|---|---|---|
| Product concept | Multi-BI AI playground with independent BI vendor and AI connector axes | README and architecture docs define this clearly | Implemented | `README.md`, `docs/MULTI_BI_ARCHITECTURE.md` | Production-grade implementation | None | Done |
| Product framing | Clear 2-axis product framing and roadmap | Current product is v0.1 scaffold, not enterprise platform | Implemented | `README.md`, `docs/MULTI_BI_ARCHITECTURE.md`, `docs/ROADMAP.md` | Production capability tracking by feature/status | None | Low |
| React playground shell | Sidebar plus BI canvas app | Basic shell exists | Implemented | `playground/src/App.tsx` | Role-specific enterprise shells | Current shell is not a Command Center or Workflow Copilot | Medium |
| Vendor picker | Select BI vendor independently | Exists | Implemented | `playground/src/components/VendorPicker.tsx` | Admin-configured vendor registry, permissions | None | Low |
| Connector picker | Load AI connector profiles from proxy | Exists | Implemented | `playground/src/components/ConnectorPicker.tsx` | Profile authz, tenant-scoped connector list | Not enterprise-safe without identity/policy | High |
| BI adapter contract | Vendor-neutral lifecycle, events, commands, capabilities | Interface exists and is well-shaped | Implemented | `playground/src/biPanel/BIAdapter.ts` | Runtime policy and adapter test suite | None | Done |
| Lazy adapter registry | Dynamic adapter imports | Exists | Implemented | `playground/src/biPanel/registry.ts` | Admin-managed adapter enablement | None | Low |
| Generic iframe adapter | Host arbitrary URL in iframe | Exists | Implemented | `bi-adapters/generic-iframe/index.ts` | Production allowlist, CSP, sandbox locking | Arbitrary URL mode should be dev/demo only | Blocker |
| Power BI adapter | Real Power BI SDK integration | Stub inherits generic iframe | Partial | `bi-adapters/powerbi/index.ts` | `powerbi-client`, embed token broker, events, commands, RLS | Cannot claim Power BI awareness until SDK is wired | Blocker |
| Tableau adapter | Real Tableau Embedding API integration | Stub/fallback | Partial | `bi-adapters/tableau/index.ts` | Web component/SDK events, auth, commands | Defer until first vendor is deep | Medium |
| Qlik adapter | Real Qlik embed integration | Stub/fallback | Partial | `bi-adapters/qlik/index.ts` | Qlik auth, app/sheet events, selections | Defer until first vendor is deep | Medium |
| Looker adapter | Real Looker signed embed integration | Stub/fallback | Partial | `bi-adapters/looker/index.ts` | Signed URL backend, SDK events, filters | Defer until first vendor is deep | Medium |
| BI event context | Capture page/filter/selection events | Interface exists; generic iframe emits only load | Partial | `BIAdapter.ts`, `generic-iframe/index.ts` | Real event bridges per vendor | Cannot be reliable with plain cross-origin iframe | Blocker |
| BI state awareness | AI should reason over active BI state | Recent event buffer exists but depends on adapter events | Partial | `playground/src/App.tsx`, `playground/src/components/AISidebar.tsx` | Real page/filter/selection events and validated schemas | True BI-aware reasoning is infeasible from iframe fallback alone | Blocker |
| BI commands | Navigate, filter, refresh, fullscreen, export | Interface exists; generic iframe supports refresh/fullscreen only | Partial | `BIAdapter.ts`, `generic-iframe/index.ts` | Vendor command implementation and permissioning | AI-driven actions unsafe until governed | High |
| Embed config form | User supplies embed URL | Single URL input exists | Partial | `playground/src/components/EmbedConfigForm.tsx` | Per-vendor config, admin-approved reports, token flow | User-pasted URLs should be disabled in enterprise mode | Blocker |
| AI sidebar UI | Ask questions against current BI context | Textarea/history shell exists | Partial | `playground/src/components/AISidebar.tsx` | Polling, streaming, citations, provenance, stop, memory | Not an enterprise assistant yet | Blocker |
| Conversation lifecycle | Reuse conversations and complete responses | Starts request only | Partial | `AISidebar.tsx` | Poll `/messages/:id`, SSE, session memory | None | High |
| Proxy profile routing | Route assistant calls by profile | Exists | Implemented | `proxy/server.js`, `proxy/config.example.json` | User/tenant authorization over profiles | Profile selection alone is not access control | High |
| Databricks Genie backend | Genie conversation routes | Inherited proxy routes exist | Implemented | `proxy/server.js` | Enterprise identity mapping, semantic governance | Broad SP/PAT mode limits per-user governance | High |
| Proxy backend breadth | Genie, supervisor, OpenAI analytics, Bedrock, and foundation-model routes | Broad inherited proxy route surface exists | Implemented | `proxy/server.js`, `proxy/lib/llmOrchestrator.js`, `proxy/lib/foundationModelClient.js`, `proxy/lib/bedrock.js` | Enterprise gateway, mandatory auth, distributed quotas, policy enforcement | Anonymous/shared-key mode is not enterprise SSO/AuthZ | High |
| Azure OpenAI backend | OpenAI route support | Exists in proxy | Partial | `proxy/server.js`, `proxy/lib/llmOrchestrator.js` | Model governance, data classification routing | Restricted data use may be prohibited | High |
| AWS Bedrock backend | Bedrock route support | Exists in proxy | Partial | `proxy/server.js`, `proxy/lib/bedrock.js` | Model governance, regional controls | Restricted data use may be prohibited | High |
| Foundation model backend | Databricks foundation model support | Exists | Partial | `proxy/lib/foundationModelClient.js`, `proxy/server.js` | Registry, evals, routing by sensitivity | None | Medium |
| Supervisor local mode | Fan out to multiple spaces and synthesize | Exists in inherited proxy | Partial | `proxy/server.js` | Governed domain routing, cost controls, evals | Fan-out to all spaces can be costly/noisy | Medium |
| Real Databricks supervisor agent | Mosaic AI agent template | Template exists | Partial | `databricks-agents/supervisor/` | CPG/FMCG domain agents, deployment proof | Current agent is demo-domain | Medium |
| Databricks agent deployment | Deployable Mosaic AI pattern | Template and deployment script exist but require external workspace permissions/endpoints | Partial | `databricks-agents/supervisor/README.md`, `databricks-agents/supervisor/log_and_deploy.py` | Integrated enterprise agent platform, permissions, evals | Cannot be proven from repo alone without workspace deployment | Medium |
| CPG/FMCG domain agents | Supply chain, commercial, retail, manufacturing, procurement, finance, HR agents | Documented target only | Missing | `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` | Agent registry, prompts, tools, tests, policies | Should start with one domain agent | High |
| CPG ontology | Product/customer/supply/commercial/finance/manufacturing/sustainability ontology | Documented target only | Missing | `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` | Machine-readable ontology and mapping | None | High |
| Semantic layer | Certified KPI registry and metric definitions | Not implemented | Missing | Target docs only | Semantic service, glossary, owner, formula, lineage | Cannot safely scale AI analytics without it | Blocker |
| Schema introspection | Schema context for LLM SQL prompts | Some proxy helpers exist | Partial | `proxy/lib/schemaIntrospector.js`, `proxy/lib/metricRuleHeuristics.js`, `proxy/lib/llmOrchestrator.js` | Certified semantic layer and metric ownership | Schema context is not metric governance | High |
| Data source connectors | ERP, planning, MES, WMS, TMS, TPM, CRM, HRIS, retail/syndicated data | Not implemented | Missing | Target docs only | Connector framework and first source slice | Do not build all connectors before first vertical slice | High |
| Data fabric from BI | Cross-functional enterprise data access | BI iframe URL input and Databricks backends exist | Partial | `proxy/config.example.json`, `proxy/lib/sqlExecutor.js`, `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` | ERP/MES/WMS/TMS/TPM/CRM/HRIS/retailer/syndicated/commodity connectors | Broad enterprise data fabric cannot be achieved from BI embeds alone | High |
| Scenario simulation | What-if planning and digital twin style simulation | Documented target only | Missing | `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` | Simulation engine, assumptions, constraints, UI | Infeasible until semantic/data layer exists | Medium |
| Workflow approvals | Proposal, approval, dual control, rollback | Documented target only | Missing | `docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md` | Workflow service/action schema | Direct write-back is out of scope until this exists | Blocker |
| SSO | Enterprise SSO/MFA/Conditional Access | Not implemented | Missing | `docs/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md` | OIDC, JWT validation, user context | Enterprise deployment infeasible without it | Blocker |
| RBAC/ABAC/ReBAC | Role, attribute, relationship, purpose-based authorization | Not implemented | Missing | Target docs only | Policy engine, claims, data tags | Cannot protect CPG multidimensional access without it | Blocker |
| Tenant/BU isolation | Tenant, region, BU scoped config/data/logs/indexes | Not implemented | Missing | `docs/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md` | Tenant registry and isolation model | Multi-tenant external SaaS out of scope until isolation exists | Blocker |
| API gateway/WAF | Central perimeter controls | Not present in repo | Missing | Target docs only | Gateway config/IaC | Direct public Express deployment should be out of scope | Blocker |
| CORS/security headers | Production browser/API hardening | Proxy currently local-first/permissive | Partial | `proxy/server.js` | Allowlist, CSP, HSTS, structured errors | Wildcard CORS not acceptable in enterprise | Blocker |
| Secrets management | Vault/KMS/managed identity | Config/env examples exist | Partial | `proxy/config.example.json`, `proxy/server.js` | Vault integration, rotation, no inline creds | Browser-supplied backend credentials out of scope for production | Blocker |
| Audit logging | Request and proxy telemetry | Basic logs/counters exist | Partial | `proxy/server.js` | Append-only SIEM event lineage | Current telemetry not compliance-grade | High |
| Observability | Metrics, traces, health, dashboards | Basic health/admin endpoints and counters | Partial | `proxy/server.js` | Distributed tracing, SIEM, dashboards, alerts | None | Medium |
| AI guardrails | Prompt injection, output validation, model/tool policies | Some validators exist, mostly inherited/structural | Partial | `proxy/lib/insightsValidator.js`, docs | Full LLM guardrails, evals, tool gateway | Cannot allow high-impact actions without this | Blocker |
| SQL safety | SELECT-only execution and preview helpers | Exists in proxy | Partial | `proxy/lib/sqlExecutor.js`, `proxy/lib/sqlSectionPreview.js` | Semantic query API, per-user policy, budgets | Regex SQL filtering is not a governance boundary | Blocker |
| Testing - proxy | Jest tests exist | Inherited tests present | Implemented | `proxy/tests/` | Keep aligned to PulsePlay-specific risks | Existing tests do not prove enterprise target | Medium |
| Testing - playground | Frontend tests | Not written | Missing | `README.md` notes tests not written | Vitest/RTL tests for components/adapters/sidebar | None | High |
| Testing - AI eval | Golden CPG questions and safety tests | Not implemented | Missing | Target docs only | Eval harness | Cannot prove AI reliability without it | High |
| Test assurance scope | Enterprise assurance | Proxy has tests; playground has Vitest config | Partial | `proxy/tests/*`, `proxy/package.json`, `playground/package.json`, `README.md` | Authz, prompt-injection, AI eval, deployment, adapter e2e tests | Enterprise assurance infeasible from inherited proxy tests only | High |
| CI/CD | Automated build/test/release gates | Not observed | Missing | Repo files | Pipeline, scans, SBOM, signing | Enterprise release infeasible without evidence | High |
| Deployment | Local quickstart and simple app config | Basic | Partial | `README.md`, `proxy/app.yaml`, scripts | Production reference architecture/IaC | Current deployment is not enterprise production | High |
| Deployment helpers | Databricks App config and helper scripts | Local quickstart and helper scripts exist | Partial | `proxy/app.yaml`, `proxy/README.databricks-app.md`, `scripts/Deploy-DatabricksApp.ps1` | IaC, API gateway/WAF, private networking, secrets vault, SBOM/signing, DR | Production controlled deployment not represented in repo | High |
| Documentation | Rich docs and roadmaps | Exists | Partial | `docs/` | Separate inherited docs from active product truth | Drift can mislead buyers/reviewers | Medium |
| Scripts | Smoke, release, deployment, stress, onboarding/wrapup helpers | Mostly inherited/helper scripts exist | Partial | `scripts/*` | Unified CI/CD and enterprise release automation | Scripts do not replace governed SDLC controls | Medium |

## Capabilities That Should Be Considered Out of Scope for Now

| Capability | Why It Should Be Deferred |
|---|---|
| Multi-vendor simultaneous command/control | Requires at least one real adapter, policy engine, and trusted event model first |
| Direct AI write-back to ERP/planning/MES/finance | Unsafe until workflow approval, dual control, rollback, and audit exist |
| External supplier/retailer tenant access | Unsafe until tenant isolation, partner identity, data clean rooms, and legal controls exist |
| Real-time autonomous supply chain execution | Requires semantic layer, simulation engine, optimization constraints, human approval, and operational integration |
| HR individual-level AI decisions | High legal/ethical risk; keep aggregate analytics and human-led decisions |
| Equipment or plant control from AI | Out of scope; read-only manufacturing intelligence should come first |
| Arbitrary user-provided BI URLs in enterprise production | Security risk; restrict to approved vendor/report registry |
| Broad multi-source connector buildout | Too wide before first vertical slice proves value |

## Recommended Functional Build Sequence

1. Enterprise auth baseline.
2. One real BI adapter.
3. Complete AI answer lifecycle.
4. First certified semantic metric set.
5. Audit event schema.
6. First CPG vertical slice.
7. One CPG domain agent.
8. Workflow proposal and approval.
9. AI evaluation harness.
10. Production deployment baseline.
