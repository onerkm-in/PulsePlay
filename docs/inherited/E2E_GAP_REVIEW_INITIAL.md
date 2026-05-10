# End-to-End Gap Review

Reviewed on: 2026-05-10
Reviewer: End-to-End Review Sub-Agent

## Verdict

PulsePlay's enterprise CPG/FMCG vision is strong, but the current repository is still a v0.1 playground scaffold plus inherited proxy capabilities. The largest gap is between the target decision intelligence fabric and the implemented system: current code can host iframe-based BI views and submit assistant prompts, but does not yet provide enterprise-grade BI context, semantic governance, zero-trust controls, domain agents, simulation, approval workflows, or production platform hardening.

## Blockers

| Gap | Evidence | Risk | Recommendation |
|---|---|---|---|
| Enterprise product goal is mostly aspirational | Target blueprint describes semantic layer, domain agents, provenance, simulation, workflows, and governance in `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md`; current app is described as v0.1 scaffold in `README.md` and `docs/ROADMAP.md` | Stakeholders may confuse vision with implemented readiness | Define a narrow enterprise vertical slice and track every target capability as implemented, partial, or planned |
| Zero-trust guardrails are not implemented | Target guardrails require IdP, RBAC/ABAC/ReBAC, purpose-of-use, tenant separation, and control planes in `docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md`; current proxy has optional shared-key auth and wildcard CORS in `proxy/server.js` | Not suitable for enterprise production or sensitive commercial/HR/manufacturing data | Add mandatory auth, CORS allowlist, role-aware authorization, tenant context, and policy enforcement before pilots |
| BI embed security is below enterprise target | `bi-adapters/generic-iframe/index.ts` accepts arbitrary URLs and sandbox override; Power BI embed-token endpoint is roadmap-only in `docs/ROADMAP.md` | SSRF/clickjacking/data exposure risk; no enterprise embed-token control | Add vendor allowlists, CSP/frame policy, short-lived backend-issued embed tokens, and production URL restrictions |
| Semantic layer and decision provenance are missing | Target requires certified metrics, lineage, freshness SLA, and stale-data warnings; current implementation has only profile-level schema examples and SQL/proxy utilities | AI answers can be inconsistent, untraceable, or misleading | Build a semantic service with certified KPI registry, owner, freshness, lineage, and access policy |
| Closed-loop governed actions do not exist | Blueprint requires action proposals, approvals, rollback paths, and audit trail; `BICommand` is an interface and generic iframe rejects most commands | Cannot safely move from insight to enterprise action | Add proposal/approval workflow service before any write-back or AI action execution |

## High-Severity Gaps

| Gap | Evidence | Risk | Recommendation |
|---|---|---|---|
| BI adapters are stubs | `docs/ROADMAP.md` says vendor adapters are iframe fallbacks; `bi-adapters/powerbi/index.ts` confirms SDK/event/command wiring is TODO | Blocks reliable page/filter/selection context and AI reasoning | Implement one real adapter deeply, likely Power BI first |
| AI sidebar is submit-only | `playground/src/components/AISidebar.tsx` starts a conversation but does not complete polling/streaming/provenance/session memory | User experience is not a complete assistant | Add polling, streaming, session memory, citations, stop generation, and structured error states |
| Domain agents are not CPG/FMCG-native | Blueprint calls for supply chain, commercial, retail, manufacturing, procurement, finance, HR, and governance agents; current supervisor agent is demo-specific | Cannot credibly support enterprise domain workflows | Define agent registry and implement one domain agent end to end |
| AI lifecycle controls are thin | Prompts are inline constants in `proxy/lib/llmOrchestrator.js` and `databricks-agents/supervisor/agent.py`; no prompt/model registry or full eval harness | Hard to govern, audit, test, or safely evolve AI behavior | Add prompt registry, versioning, model routing policy, and evaluation harness |
| Multi-source enterprise fabric is absent | Target systems include ERP, planning, MES, WMS, TMS, TPM, CRM, HRIS, supplier/retailer/syndicated data; repo mainly has BI/proxy/Databricks paths | Product cannot yet answer cross-functional enterprise questions | Prioritize one source-system slice tied to the first vertical use case |
| Deployment posture is not enterprise production | `proxy/app.yaml` is simple app config; no API gateway, WAF, KMS/vault, private endpoints, IaC, SBOM/signing, DR, or SIEM artifacts | Not ready for controlled enterprise deployment | Create production reference architecture and deployment baseline |

## Medium-Severity Gaps

| Gap | Evidence | Risk | Recommendation |
|---|---|---|---|
| Observability is local, not audit-grade | Proxy has request IDs, counters, and log lines, but no append-only audit/event store, SIEM export, prompt/tool/model lineage, or tenant-aware detections | Weak forensic and compliance posture | Add structured audit service and SIEM-ready event schema |
| Testing does not cover new product surface | README says proxy tests are inherited and playground tests are not written | Regressions and security gaps will escape | Add tests for frontend, adapters, authz, masking, prompt injection, AI evals, and deployment |
| Documentation drift is significant | New enterprise docs describe target platform; older docs still reference inherited products and Power BI visual constraints | Confuses buyers, engineers, and reviewers | Split inherited docs from active PulsePlay product truth |
| Frontend lacks role-specific enterprise experiences | Blueprint calls for BI Companion, Command Center, and Workflow Copilot; current `playground/src/App.tsx` is one sidebar/canvas shell | Does not yet support enterprise workflows | Design role-based shells after first vertical slice is defined |

## End-State Coverage Matrix

| Capability | Target State | Current State | Status | Next Step |
|---|---|---|---|---|
| Multi-BI host | Real vendor adapters with secure embed and event bridges | Iframe fallback adapters | Partial | Implement one real adapter |
| AI assistant | Conversational, streaming, grounded, cited, governed | Submit-only sidebar | Partial | Add polling/streaming/provenance |
| CPG semantic layer | Certified metrics and ontology | Not implemented | Missing | Build semantic registry |
| Domain agents | CPG/FMCG specialist agents | Demo-style supervisor helpers | Missing | Add agent registry and first domain agent |
| Security | Zero trust, policy enforcement, tenant isolation | Optional shared key and inherited proxy controls | Missing | Add auth/policy baseline |
| Workflow actions | Governed proposals and approvals | Not implemented | Missing | Build action proposal service |
| Observability | Audit-grade event lineage and SIEM export | Local logs/counters | Partial | Add audit event schema |
| Deployment | Enterprise reference architecture | Dev/local and simple app config | Partial | Add production deployment blueprint |
| Testing | Full app/security/AI eval suite | Inherited proxy tests only | Partial | Add playground and AI safety tests |
| Documentation | Active product truth separated from inherited notes | Mixed current and inherited docs | Partial | Refactor docs structure |

## Top 10 Next Moves

1. Decide the first enterprise vertical slice, such as service-level and margin recovery for one region/category/customer cluster.
2. Implement mandatory proxy security baseline: auth required, CORS allowlist, security headers, rate limits, and structured authorization.
3. Implement one real BI adapter with event capture and secure token issuance.
4. Complete AI sidebar lifecycle with polling/streaming, conversation reuse, citations, and provenance.
5. Define the first CPG semantic registry with 20-30 certified metrics.
6. Add a minimal policy enforcement layer for role, data, model, and tool permissions.
7. Create an audit event schema covering user, prompt, data, model, tool, answer, and action proposal lineage.
8. Add playground tests and auth/security regression tests.
9. Split inherited documentation from active PulsePlay documentation.
10. Create a production platform reference architecture with API gateway, WAF, secrets vault, private data access, SBOM, signed artifacts, and SIEM integration.

## Open Questions

- Which enterprise vertical slice should become the first proof point?
- Which BI vendor should be implemented first as a real adapter?
- Which identity provider and authorization model should be assumed for reference architecture?
- Which data platform should be the first-class governed data layer?
- Which AI provider/model classes are approved for restricted enterprise data?
- Should PulsePlay support external supplier/retailer users in the first enterprise release or only internal users?
