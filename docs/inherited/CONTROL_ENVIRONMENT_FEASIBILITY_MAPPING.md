# Controlled Enterprise Environment Feasibility Mapping

Drafted on 2026-05-10.

## Purpose

This document maps PulsePlay's enterprise CPG/FMCG target state against the technical feasibility constraints of a controlled enterprise environment. It focuses on flaws, challenges, dependencies, and implementation patterns for SSO, identity, authorization, tenant isolation, BI embedding, data governance, AI governance, networking, audit, and production operations.

## Executive Verdict

PulsePlay can become enterprise-grade, but not by incrementally hardening the current playground shape alone. The current implementation needs a platform control layer in front of the proxy, a policy enforcement layer between the user and every data/model/tool action, and a governed data/semantic layer underneath the AI experience.

The most important feasibility point: enterprise buyers will not accept "AI over BI" unless identity, authorization, data provenance, model routing, audit, and write-back controls are explicit, testable, and administrable.

The technical feasibility review found the same central tension: the target documents describe a zero-trust, governed, tenant-aware AI decision fabric, while the code currently provides iframe BI hosting plus an inherited proxy with optional shared-key auth, permissive CORS, basic rate limits, in-process audit counters, and early AI orchestration. This is feasible to mature, but it needs a controlled vertical slice rather than broad feature expansion.

## Most Important Technical Flaws

1. **Proxy can run anonymously** when no shared key is configured. Even when a shared key is configured, it is not enterprise SSO or user-level authorization.
2. **Wildcard CORS is not enterprise-safe** for a centrally deployed proxy.
3. **Generic iframe accepts arbitrary user-pasted URLs**, creating controlled-environment risk unless production mode enforces vendor/domain allowlists.
4. **LLM-generated SQL can execute under shared backend credentials**, which blocks true per-user governance unless application-level policy and governed views are added.
5. **Audit is engineering telemetry, not compliance evidence**: request IDs and counters exist, but not immutable user/data/model/tool/action lineage to SIEM.
6. **Inline/browser-supplied credential paths are a deployment footgun** and should be disabled permanently in production.
7. **There is no tenant/business-unit context** carried through requests, logs, profiles, vector indexes, keys, or rate limits.
8. **Current BI adapters are iframe fallbacks**, so enterprise embed tokens, RLS binding, SDK events, and trusted context capture are not yet implemented.

## Control Mapping

### 1. SSO and Enterprise Identity

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| User authentication | Playground has no app-level login; proxy uses optional shared key for protected routes | Enterprise SSO through IdP with MFA and Conditional Access | No user identity propagated through frontend/proxy/AI calls | Supporting multiple IdPs; local dev vs production; service-to-service auth; token validation | OIDC authorization code with PKCE for frontend; backend validates JWT; service principals for backend jobs | Blocker | IdP app registration, API audience, token claims, session strategy |
| Identity lifecycle | No SCIM/provisioning model | Automated provisioning/deprovisioning through IdP groups | No group-based user lifecycle | Group claim size limits; nested groups; contractor/partner identities | SCIM to data/AI platform; app roles mapped from IdP groups; periodic entitlement review | High | Enterprise IdP, group taxonomy |
| Conditional access | Not present | Device, geography, risk, MFA, and session controls | Cannot enforce enterprise access conditions | Conditional Access lives outside app but app must honor claims/session events | Rely on IdP CA policies; require compliant-device claim for restricted functions | High | IdP, endpoint management |

### 2. Authorization and Policy Enforcement

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Application roles | No role model in playground; proxy profiles selected by header/body | RBAC plus ABAC/ReBAC/purpose-of-use | Any user can choose connector profile if proxy reachable | Mapping business hierarchy to policy; avoiding hardcoded roles | Central policy engine for route, data, agent, and tool decisions | Blocker | Identity claims, policy store |
| Data access authorization | Delegated mostly to backend profile credentials | Row/column/object authorization based on user and business context | Shared service credentials can collapse user-level access | Per-viewer identity may be hard across BI and AI systems | Backend data access service enforces user-scoped policies before retrieval/query | Blocker | Semantic layer, data catalog, user context |
| Tool/action authorization | No governed tool gateway | Per-agent, per-role, per-action tool permission | Future agents could gain excessive agency | Tool fan-out and action chains are hard to reason about | Tool gateway with allowlisted tools, schemas, risk tiers, and approval requirements | Blocker | Agent registry, workflow service |

### 3. Tenant, Region, and Business-Unit Isolation

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Tenant isolation | No explicit tenant model | Strong logical or physical isolation by tenant/BU/region | Risk of cross-tenant or cross-BU leakage | Multi-region data residency; shared model/vector indexes; config sprawl | Tenant context on every request; separate catalogs/schemas/vector indexes/keys; optional separate cloud accounts | Blocker | Tenant registry, policy engine, key management |
| Environment isolation | Dev-style app layout; simple app config | Separate dev/test/stage/prod with isolated secrets/data | Accidental production data use in dev | Maintaining realistic test data without sensitive exposure | Separate cloud subscriptions/accounts/projects; synthetic/masked test data | High | IaC, secrets vault, data masking |
| Region residency | Not encoded | Region-aware data, model, logging, and retrieval policy | Restricted data may route to wrong region/model | Global CPG operations often cross markets | Data residency tags and model/data routing policies | High | Data classification, cloud regions |

### 4. BI Embed and Frontend Security

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Embed URL control | Generic iframe accepts arbitrary URL and sandbox override | Vendor/domain allowlist and approved embed configs | SSRF-like backend risks if URLs later proxied; clickjacking/content risks | Vendors have different embed/origin requirements | Production allowlist; config approved by admin; no arbitrary URL in enterprise mode | Blocker | Admin config, CSP policy |
| Embed tokens | Not implemented for real vendor SDKs | Short-lived backend-issued tokens scoped to user/report/dataset/role | Cannot securely embed enterprise BI content | Vendor-specific auth complexity | Vendor token broker service per adapter | High | Vendor app registrations, service principals |
| CSP/frame policy | Not evident in frontend deployment | Strict CSP with frame-src per approved vendor | Browser attack surface too open | Multi-vendor CSP maintenance | Generate CSP from approved vendor registry | High | Deployment platform, vendor registry |
| BI event trust | Events sent to AI as JSON text | Events treated as untrusted, validated, normalized, and scoped | Prompt injection through BI metadata/event payloads | Event schemas vary by vendor | Canonical event schema with validation and redaction | High | Real adapters, event validator |

### 5. Data Governance and Semantic Layer

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Semantic metrics | Not implemented as service | Certified KPI registry with owner, formula, lineage, freshness | AI can answer with inconsistent definitions | Harmonizing finance/commercial/supply chain definitions | Semantic service/API; certified metric IDs in prompts and responses | Blocker | Business glossary, data owners |
| Data lineage | Limited to backend/proxy traces | Source-to-answer lineage | No trustworthy provenance | BI tools and AI retrieval expose lineage differently | Store query IDs, dataset IDs, doc IDs, metric IDs per answer | High | Audit store, semantic service |
| Data freshness | Not enforced in UI/AI | Freshness SLA and stale warnings | Decisions may use stale data | Source systems refresh asynchronously | Freshness registry and response-level warnings | Medium | Data pipeline metadata |
| Vector indexes | Not present or not formalized | Scoped indexes by tenant/function/sensitivity | Future RAG may leak across domains | Re-indexing and access policy are complex | Retrieval gateway enforces index scope and document ACLs | High | Document ACLs, vector store |
| LLM SQL execution | Generated SQL is constrained mainly by SELECT-only checks and backend credentials | Governed query API through certified views/functions and policy-injected predicates | Regex checks are not a governance boundary; shared service principal cannot preserve user-level `current_user()` access | True per-viewer passthrough can be hard across BI, AI, and data platforms | Use governed views, semantic APIs, policy predicates, query linting, budgets, and user context in every data request | Blocker | Unity Catalog or equivalent, semantic layer, policy engine |

### 6. AI Provider and Agent Governance

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Model routing | Profiles route to backends, but not by data classification | Policy-based model routing | Restricted data may go to unapproved provider | Provider contracts, regional endpoints, model capability differences | Model registry with allowed data classes, regions, cost, and eval status | Blocker | Data classification, AI governance |
| Prompt management | Prompts inline in code | Versioned prompt registry with approval | No controlled prompt lifecycle | Balancing speed and governance | Prompt registry with owner, version, eval score, release stage | High | Eval harness |
| Agent registry | No CPG domain agent registry | Governed specialist agents | Demo agents may not map to enterprise functions | Defining scopes and tools cleanly | Agent registry with permissions, tools, data scopes, and tests | High | Policy engine, tool gateway |
| AI evaluation | Structural validators only | Golden sets for groundedness, auth, safety, domain quality | Hard to prove reliability | Domain experts needed for test cases | Automated eval pipeline per domain | High | Test data, SMEs |

### 7. API Gateway, Network, and Deployment

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| API perimeter | Express server exposed directly in local/dev shape | API gateway + WAF + centralized auth/rate limits | Weak perimeter for production | Gateway differs across cloud providers | Put proxy behind API gateway; disable direct public access | Blocker | Cloud platform choice |
| Private networking | Not defined | Private endpoints to data systems and internal services | Data paths may traverse public internet | SaaS APIs may require public egress | Hub-spoke/network segmentation; egress allowlist; private links where possible | High | Cloud landing zone |
| IaC | Not present | Policy-gated Infrastructure as Code | Manual drift and weak reproducibility | Multi-cloud support decisions | Terraform/Bicep/Pulumi modules for reference deployment | High | Platform standard |
| Resilience | Not defined for platform | RTO/RPO, backups, DR, graceful degradation | Enterprise operations risk | AI/provider/source failures common | Multi-zone deployment, queues, circuit breakers, read-only fallback | Medium | Architecture baseline |
| Proxy hardening | Express proxy has wildcard CORS, optional shared key, per-process memory rate limits, and no evident Helmet/CSP/HSTS baseline | Gateway-enforced auth plus backend schema validation, CORS allowlist, security headers, and distributed quotas | Local-first assumptions do not hold in a centrally deployed enterprise service | Requires cloud gateway and distributed state | API gateway handles auth/WAF/quotas; backend adds schema validation, security headers, structured errors, and distributed rate limiter | Blocker | Gateway, auth, schema library, shared cache |

### 8. Audit, SIEM, and Compliance Evidence

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Audit logs | Proxy has logs/counters | Append-only audit trail for user, data, prompt, model, tool, answer, action | Forensics and compliance evidence incomplete | Prompt logging may contain sensitive data | Redacted structured event schema to SIEM/data lake | Blocker | Redaction policy, event schema |
| SIEM integration | Not present | Enterprise SIEM export and detection rules | No centralized monitoring | Customer SIEMs vary | Support JSON event stream and cloud-native logging sinks | High | Audit service |
| Compliance mapping | Docs reference standards | Control evidence mapped to implementation | Hard to pass security review | Evidence collection overhead | Control matrix linking NIST/OWASP/ISO/SOC2 to tests/logs/config | High | Governance owner |
| Prompt/tool lineage | Not captured as compliance-grade event chain | Reconstruct any answer from user, prompt version, retrieved sources, model, tools, policy decisions, and approval chain | Cannot investigate bad recommendations or data leakage | Must redact sensitive prompt content while retaining enough evidence | Store hashed/redacted prompt, source IDs, model version, tool calls, policy decision, and answer citation map | Blocker | Audit schema, redaction, prompt registry |

### 9. Software Supply Chain and SDLC

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| CI/CD | Not evident in repo | Protected CI with test/security gates | Manual builds may bypass controls | Setting consistent gates across packages | CI pipeline for proxy/playground/adapters with required checks | High | Git hosting, pipeline runner |
| SBOM/signing | Not present | SBOM, provenance, signed artifacts | Supply-chain review gap | Tooling setup | CycloneDX SBOM, signed containers/artifacts, dependency review | High | Build pipeline |
| Security tests | Proxy tests exist but new enterprise surface lacks tests | SAST, dependency, secret, IaC, container, authz, prompt-injection tests | High risk of silent regressions | Test data and enterprise auth mocks | Automated test gates and red-team suites | High | Test harness |

### 10. Secrets, Credentials, and Controlled Config

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Secrets storage | Config/env profile model; plaintext config path supported | Vault/KMS-backed secrets with managed identity and audit | Plain config remains a footgun | Local dev convenience versus production discipline | Keep local examples, but production reads only from vault/managed identity | Blocker | Secrets vault, deployment platform |
| Inline credentials | Inline credential headers exist with production-off heuristic | No browser-supplied backend credentials in production | Enterprise reviewers will reject user-supplied backend tokens | Backward compatibility with demos | Permanently disable inline credentials in enterprise mode | Blocker | Production mode flag, tests |
| Demo config | App config includes example concrete IDs/local log style | Environment-specific, non-sensitive config | Risk of accidental demo secret/config propagation | Separating examples from deployable manifests | Move examples to `.example`; use deployment templates with secret references | Medium | IaC baseline |

### 11. CPG/FMCG Regulated Function Controls

| Area | Current State | Target State | Gaps / Flaws | Feasibility Challenges | Recommended Pattern | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| Commercial controls | Generic AI/BI surface | Pricing/trade/customer terms protected by account role and purpose | No account-team scoping or price/trade approval controls | Commercial data access is highly sensitive | Start with customer/category/region scoped access and finance approval gates | High | Customer hierarchy, role model |
| Manufacturing/quality controls | No GS1/ISA-95/HACCP implementation | Plant/line/batch/quality controls with OT/IT separation | Blueprint only; implementation absent | Manufacturing safety and quality cannot be chatbot-driven | Read-only plant intelligence first; no equipment control; ISA-95-aligned boundaries | High | MES/quality data, plant SMEs |
| HR controls | No HR-specific purpose scoping | Aggregate workforce analytics, strict HR data isolation | HR decisions and PII can create legal risk | Small populations can re-identify individuals | Aggregate thresholds, masking, purpose-of-use, HR-only agent | High | HRIS access model, privacy review |

## Feasibility Summary

### Feasible with Current Direction

- Multi-BI adapter architecture.
- Backend AI profile routing.
- Databricks/Genie integration.
- Supervisor-agent concept.
- CPG/FMCG domain documentation.
- Security guardrail target model.

### Feasible but Requires Platform Redesign

- Enterprise SSO and role-aware access.
- Tenant/business-unit isolation.
- Policy-based AI/tool governance.
- Certified semantic layer.
- Audit-grade lineage.
- Governed write-back workflows.
- Production deployment with API gateway, private networking, and SIEM.

### High-Risk or Hard Areas

- Per-viewer security propagation across BI embeds, AI retrieval, and source systems.
- Preventing prompt injection from BI metadata, documents, comments, and external content.
- Keeping vector retrieval isolated by user, role, tenant, and sensitivity.
- Maintaining certified metric definitions across BI, data platform, and AI.
- Supporting external partner access without cross-party data leakage.
- Making AI recommendations useful while limiting excessive agency.
- Preserving native data-platform security when the AI proxy uses service principals.
- Producing compliance-grade evidence without storing sensitive prompts in raw form.
- Designing a CSP and embed-token broker that works across BI vendors.

## Recommended Architecture Additions

1. **Identity Gateway**: validates user tokens and emits normalized user/session context.
2. **Policy Decision Point**: evaluates RBAC, ABAC, ReBAC, purpose-of-use, data sensitivity, model/tool/action risk.
3. **Policy Enforcement Point**: wraps every API, data query, retrieval, tool call, and action proposal.
4. **Semantic Service**: serves certified KPI definitions, formulas, lineage, owners, and freshness.
5. **Retrieval Gateway**: handles vector/document retrieval with ACLs, redaction, and prompt-injection checks.
6. **Tool Gateway**: validates tool calls and blocks excessive agent agency.
7. **Action Workflow Service**: proposal, approval, dual-control, execution, rollback, audit.
8. **Audit Event Service**: append-only, redacted, SIEM-compatible activity record.
9. **Model and Prompt Registry**: approved models/prompts by domain, data class, region, and evaluation score.
10. **Deployment Baseline**: API gateway, WAF, private endpoints, secrets vault, IaC, SBOM, signed artifacts, backups, DR.

## Recommended First Controlled Slice

The feasibility reviewer recommends one narrow production-grade slice before adding more vendors, agents, simulations, or write-back workflows:

> Service-level and margin recovery for one region, one category, and one customer cluster.

Suggested implementation boundaries:

- One tenant.
- One BI vendor.
- One governed data platform.
- One approved AI provider.
- One semantic domain.
- OIDC SSO with signed user and tenant claims.
- Backend-issued BI embed tokens.
- Governed data views with row/column policy.
- Certified OTIF, service level, net revenue, gross margin, trade spend, inventory, and forecast accuracy metrics.
- Redacted audit event stream to SIEM/data lake.
- AI can explain and recommend, but write-back is proposal-only.

This gives PulsePlay a credible controlled-environment foundation before broadening the platform.

## Priority Roadmap

### Blocker Before Enterprise Pilot

- SSO/JWT validation.
- CORS allowlist and security headers.
- Mandatory auth on protected proxy routes.
- Vendor allowlist for embed URLs.
- Basic RBAC and tenant context.
- Structured audit events.
- First real BI adapter or explicitly scoped generic iframe-only pilot.

### Required Before Sensitive Data

- Data classification.
- Row/column masking.
- Semantic metric registry.
- Model routing by data class.
- Prompt/output redaction.
- SIEM export.
- Secrets vault and managed identities.

### Required Before Write-Back

- Tool gateway.
- Action proposal model.
- Human approval workflow.
- Dual control for high-impact actions.
- Rollback and audit trail.
- Agent evaluation harness.

### Required Before Scale

- IaC deployment.
- Private networking.
- Tenant/business-unit isolation.
- SBOM and signed artifacts.
- DR and backup tests.
- Formal control mapping to NIST/OWASP/ISO/SOC2.
