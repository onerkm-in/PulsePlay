# Enterprise Security and Platform Architecture Guardrails

Drafted on 2026-05-10 for PulsePlay as an enterprise CPG/FMCG decision intelligence platform.

## Executive Verdict

PulsePlay must be designed as a zero-trust, governed, auditable decision platform, not as a BI chatbot. The enterprise risk is not only data leakage. The larger risk is a trusted-looking AI system making or recommending commercial, supply chain, manufacturing, procurement, or finance decisions from incomplete context, weak authorization, stale data, poisoned prompts, or uncontrolled agent actions.

The target security posture should be:

- Zero trust by default.
- Least privilege everywhere.
- Human approval for high-impact actions.
- Source-grounded AI only.
- Full lineage for data, metrics, prompts, tools, models, recommendations, and write-back actions.
- Strong separation across tenants, business units, regions, environments, and data sensitivity classes.
- Enterprise-grade controls mapped to NIST CSF 2.0, NIST Zero Trust, NIST AI RMF, OWASP API Security, OWASP LLM Top 10, CSA AI Controls Matrix, ISO/IEC 27001, and cloud well-architected frameworks.

## Solution Scope

This document covers platform and security architecture for an enterprise-grade PulsePlay deployment supporting:

- Multiple BI tools.
- Multiple AI backends and agents.
- ERP, planning, retail, commercial, procurement, HR, finance, plant, and logistics data.
- CPG/FMCG decision rooms and domain agents.
- Internal enterprise users, external partner users, and optional supplier/retailer collaboration spaces.
- Highly sensitive commercial, operational, employee, supplier, customer, and manufacturing data.

## Architectural North Star

PulsePlay should be deployed as a governed AI decision fabric with four hard control planes:

1. **Identity Control Plane**: who is asking, from which device, under which role, for which business context.
2. **Data Control Plane**: what data can be seen, joined, summarized, exported, or used in prompts.
3. **AI Control Plane**: which agents, models, tools, prompts, and actions are allowed.
4. **Platform Control Plane**: how software, infrastructure, logs, secrets, network, deployments, and incidents are managed.

If a capability cannot be governed by these control planes, it should not ship to enterprise production.

## Reference Architecture

```text
User / Device / Session
        |
        v
Enterprise IdP + Conditional Access + Device Posture
        |
        v
PulsePlay Frontend / BI Companion / Command Center
        |
        v
API Gateway + WAF + Bot / DDoS Protection + Rate Limits
        |
        v
Policy Enforcement Layer
        |
        +--> AuthZ: RBAC + ABAC + ReBAC + Purpose-of-use
        +--> Data policy: row/column/metric/document policy
        +--> AI policy: model, tool, prompt, action permissions
        +--> Risk policy: user risk, data sensitivity, action impact
        |
        v
AI Orchestration Layer
        |
        +--> Supervisor Agent
        +--> Domain Agents
        +--> Retrieval Gateway
        +--> Tool Gateway
        +--> Evaluation and Guardrail Services
        |
        v
Data and Knowledge Layer
        |
        +--> Lakehouse / Warehouse
        +--> Semantic Layer
        +--> Vector Indexes
        +--> Document Store
        +--> Audit/Event Store
        |
        v
Enterprise Systems
        |
        +--> ERP / Planning / MES / WMS / TMS / TPM / CRM / HRIS
        +--> Retailer Data / Syndicated Data / Supplier Portals
        +--> Ticketing / Workflow / Collaboration / Approval Systems
```

## Security Principles

### 1. Verify Explicitly

Every request must be authenticated and authorized using:

- User identity.
- Group and role.
- Device compliance.
- Location and network risk.
- Session risk.
- Data sensitivity.
- Business purpose.
- Requested action.
- Agent/tool/model risk.

### 2. Least Privilege

Use just-enough and just-in-time access:

- No default admin access.
- No direct user grants on production data.
- Service principals for automation.
- Group-based ownership.
- Scoped tool permissions.
- Separate read, recommend, propose, approve, and execute permissions.

### 3. Assume Breach

Design as if one token, prompt, BI embed, dependency, model output, or service account will eventually be compromised:

- Segment workloads.
- Minimize blast radius.
- Rotate secrets.
- Log every privileged operation.
- Disable lateral movement.
- Make exfiltration difficult.
- Test recovery regularly.

### 4. Human-Amplified AI

AI may summarize, reason, recommend, simulate, draft, and route. AI must not independently perform high-impact business actions such as:

- Price changes.
- Promotion funding shifts.
- Supplier awards.
- Production schedule changes.
- Inventory reallocations above threshold.
- Employee-impacting HR decisions.
- Customer contract changes.
- Financial postings.

These require human approval with documented rationale.

## Threat Model

### High-Value Assets

- Customer P&L and retailer negotiation terms.
- Trade promotion plans and accruals.
- Pricing, pack, elasticity, and margin strategy.
- Forecasts and production plans.
- Supplier contracts and commodity exposure.
- Plant recipes, batch genealogy, quality deviations, and line performance.
- HR records, pay, attendance, and performance data.
- Consumer, shopper, and loyalty data.
- Executive strategy documents.
- AI prompts, responses, embeddings, model settings, and tool traces.
- API tokens, service principals, embed tokens, and cloud credentials.

### Primary Threat Actors

- External attackers targeting exposed APIs or BI embeds.
- Malicious insiders.
- Over-permissioned business users.
- Compromised supplier or partner accounts.
- Prompt injection attackers through documents, dashboards, comments, product content, or support tickets.
- Software supply-chain attackers.
- Shadow AI users moving sensitive data into unauthorized tools.
- Misconfigured agents with excessive autonomy.

### Critical Attack Paths

- Prompt injection through documents or BI metadata.
- Cross-tenant or cross-business-unit data leakage.
- Broken object-level authorization in APIs.
- SSRF through user-supplied embed URLs or connector URLs.
- Sensitive data leakage in AI output.
- Excessive agency through tool-calling agents.
- Dependency compromise.
- Stale or poisoned semantic definitions.
- Direct cloud storage access bypassing governance.
- Leaked embed tokens or service principal secrets.
- Unsafe write-back actions into ERP, planning, MES, or finance systems.

## Guardrail Model

### Layer 1: Identity and Access Guardrails

Required controls:

- SSO through enterprise IdP.
- MFA for all users.
- Conditional access based on user, role, device, network, geography, and risk.
- SCIM-based provisioning and deprovisioning.
- Group-based access management.
- Privileged Identity Management for admin roles.
- Service principals for workloads and jobs.
- No shared human accounts.
- Session timeout and reauthentication for sensitive actions.
- Break-glass accounts with monitored use.

Authorization model:

- **RBAC** for baseline role: executive, planner, plant manager, finance analyst, category manager, procurement lead, HR partner, admin.
- **ABAC** for business attributes: region, business unit, market, plant, customer, category, function, sensitivity.
- **ReBAC** for relationship-aware access: account team can see assigned customer plans; plant team can see assigned sites.
- **Purpose-of-use** for sensitive workflows: HR, legal, M&A, supplier risk, pricing, and finance data require declared purpose.

### Layer 2: Data Governance Guardrails

Required controls:

- Central data catalog.
- Certified semantic layer.
- Row-level and column-level security.
- Dynamic masking for PII, HR, sensitive supplier, and commercial terms.
- Data classification: public, internal, confidential, restricted, regulated.
- Data lineage from source to AI answer.
- Freshness SLAs and stale data warnings.
- Data quality scores surfaced in AI responses.
- Region and residency policy.
- Retention and deletion policies.
- No direct object-store access that bypasses governance.

For Databricks-style lakehouse deployments:

- Use Unity Catalog or equivalent governance.
- Provision users/groups from the identity provider.
- Use group ownership for production catalogs/schemas.
- Use service principals for production jobs.
- Use catalog-level isolation for domains/environments.
- Use compute policies.
- Avoid broad `ALL PRIVILEGES`, `MANAGE`, `READ FILES`, and `WRITE FILES`.
- Avoid unmanaged mounts that bypass audit and access policy.

### Layer 3: API and Application Guardrails

Required controls:

- API gateway for all backend routes.
- Strong authentication on every API.
- Object-level authorization on every resource ID.
- Function-level authorization for every command.
- Property-level authorization for sensitive fields.
- Schema validation for every request and response.
- SSRF protection for URLs and webhooks.
- Per-user, per-tenant, per-profile, and per-agent rate limits.
- Idempotency keys for state-changing requests.
- CSRF protection where browser cookies are used.
- CORS allowlist, not wildcard.
- Security headers: CSP, HSTS, X-Frame-Options or frame-ancestors, Referrer-Policy, Permissions-Policy.
- Content Security Policy tailored to allowed BI/vendor origins.
- Central error handling with no secrets, tokens, SQL, or stack traces in client responses.

API risk focus from OWASP API Security Top 10:

- Broken object-level authorization.
- Broken authentication.
- Broken object property authorization.
- Unrestricted resource consumption.
- Broken function-level authorization.
- Unrestricted access to sensitive business flows.
- SSRF.
- Security misconfiguration.
- Improper inventory management.
- Unsafe consumption of third-party APIs.

### Layer 4: AI and Agent Guardrails

AI-specific controls:

- Prompt templates versioned and approved.
- System prompts separated from user and retrieved content.
- Retrieved documents treated as untrusted input.
- Prompt injection detector before and after retrieval.
- Output validation before rendering or tool use.
- Tool allowlist per agent and per user role.
- Tool parameter schema validation.
- No direct arbitrary SQL generation against production without policy review.
- SQL read-only enforcement unless explicit approval workflow exists.
- No tool chaining into high-impact actions without human approval.
- Citation required for factual claims.
- Confidence and uncertainty visible.
- Refusal rules for disallowed requests.
- Model routing policy by data sensitivity.
- No restricted data sent to external AI providers unless approved by data classification policy.
- Red-team test sets for prompt injection, data leakage, jailbreaks, and unsafe actions.

OWASP LLM risk coverage:

- Prompt injection: isolate instructions, sanitize retrieval, detect malicious content.
- Insecure output handling: validate and encode output before downstream use.
- Training data poisoning: govern fine-tuning and retrieval corpora.
- Model denial of service: quotas, token limits, timeout, cost budgets.
- Supply-chain vulnerabilities: approved models, dependencies, datasets.
- Sensitive information disclosure: masking, policy filters, output scanning.
- Insecure plugin/tool design: least-privilege tool gateway.
- Excessive agency: human approval and action thresholds.
- Overreliance: confidence, citations, challenges, and human review.
- Model theft: access controls, monitoring, and provider contracts.

### Layer 5: BI Embed and Multi-Tool Guardrails

Because PulsePlay hosts BI tools and external embedded views:

- Maintain a vendor/domain allowlist for iframe/embed origins.
- Block arbitrary user-supplied URLs in production unless approved.
- Apply strict CSP `frame-src`.
- Use sandbox attributes per vendor.
- Never put vendor credentials in the browser.
- Issue short-lived embed tokens from backend only.
- Bind embed tokens to user, tenant, report/dashboard, dataset, and role.
- Capture BI events through vendor SDKs, not unsafe cross-frame scraping.
- Treat BI event payloads as untrusted input before sending to AI.
- Do not allow AI to click, navigate, filter, export, or write back unless the action is explicitly permitted by role and capability policy.

### Layer 6: Secrets and Key Management

Required controls:

- Cloud KMS or Key Vault for all secrets.
- No secrets in repo, browser, build artifacts, logs, or local config committed to source.
- Managed identities where possible.
- Secret rotation policy.
- Short-lived OAuth tokens over static PATs.
- Separate secrets by environment and tenant.
- Hardware-backed or cloud-managed keys for production.
- Envelope encryption for sensitive stored values.
- Audit all secret reads.

### Layer 7: Network and Infrastructure Guardrails

Recommended platform pattern:

- Separate subscriptions/accounts/projects for dev, test, staging, prod, security, logging, and shared network.
- Hub-spoke or equivalent segmented network.
- Private endpoints for databases, storage, AI services, and internal APIs where possible.
- No public database/storage access.
- WAF and DDoS protection for public endpoints.
- Egress allowlisting for AI providers, BI vendors, ERP APIs, and data sources.
- Network policy between services.
- Container/workload isolation.
- Hardened base images.
- Runtime protection.
- Infrastructure as Code with policy-as-code gates.

### Layer 8: Software Supply Chain Guardrails

Required controls:

- Protected main branch.
- Mandatory code review.
- Security review for auth, AI tool use, data access, and write-back changes.
- SAST, dependency scanning, secret scanning, IaC scanning, and container scanning.
- SBOM generated for each release.
- Signed artifacts and container images.
- Provenance attestations.
- Pinned dependencies or lockfiles.
- Renovation process for vulnerable dependencies.
- OpenSSF Scorecard-style review for critical open-source dependencies.
- SLSA-inspired build hardening.
- Separate build and deploy identities.
- No manual production deploys outside emergency break-glass.

### Layer 9: Observability, Audit, and Detection

Log the following:

- User identity and session.
- Role, group, and business context.
- API route, action, object IDs, authorization decision.
- BI vendor/report/dashboard context.
- Prompt template version.
- User prompt hash and redacted prompt copy.
- Retrieved document IDs and data rows used.
- Model/provider/agent/tool invoked.
- Tool parameters and outputs, redacted.
- Policy decisions and guardrail blocks.
- AI answer, citations, confidence, and validation status.
- Recommendations, approvals, rejections, and final actions.
- Data exports and downloads.
- Admin changes.
- Secret reads.

Detection use cases:

- Spike in AI token use or model cost.
- Unusual data access by region/category/customer.
- Repeated prompt injection attempts.
- Attempts to access unauthorized customer/plant/HR data.
- High-volume export or copy behavior.
- Tool failures or blocked tool calls.
- Cross-tenant access attempt.
- New admin role assignment.
- Disabled logging or policy changes.
- External AI routing for restricted data.

### Layer 10: Resilience and Business Continuity

Required controls:

- Multi-zone production deployment.
- Backups with restore testing.
- Disaster recovery plan.
- RTO/RPO by domain.
- Queue-based retry for noncritical jobs.
- Circuit breakers for AI providers and source systems.
- Graceful degradation to read-only mode.
- Manual fallback for business-critical workflows.
- Chaos testing for dependency failures.
- Incident runbooks for data breach, prompt injection, model failure, token leak, supply-chain compromise, and bad recommendation.

## Platform Architecture Recommendation

### Recommended Deployment Shape

For large enterprises, deploy PulsePlay as a tenant-isolated, cloud-native platform:

- **Frontend**: static web app or containerized app behind enterprise access controls.
- **API layer**: gateway plus backend-for-frontend.
- **AI orchestration**: separate service with policy enforcement and tool gateway.
- **Data access service**: only backend component allowed to query governed data.
- **Semantic service**: certified metric definitions and calculation APIs.
- **Vector retrieval service**: scoped indexes by tenant, function, region, and sensitivity.
- **Workflow service**: proposals, approvals, tasks, and write-back connectors.
- **Audit service**: append-only logs to SIEM/data lake.
- **Admin console**: policy, connectors, models, prompts, agents, tests, and releases.

### Tenant and Business Unit Isolation

Use the following isolation levels:

- **Level 0: Single tenant dev** for local development only.
- **Level 1: Logical isolation** for internal pilots.
- **Level 2: Strong logical isolation** with separate catalogs, schemas, keys, indexes, and policies for enterprise production.
- **Level 3: Physical isolation** with separate cloud accounts/subscriptions/projects for regulated or externally hosted tenants.

For global CPG/FMCG, Level 2 should be the default. Level 3 should be used for regulated markets, M&A clean rooms, sensitive HR, or external partner collaboration.

## Data Classification Policy

| Class | Examples | AI Use |
|---|---|---|
| Public | Published sustainability report, public product info | Allowed with normal controls |
| Internal | SOPs, non-sensitive dashboards | Allowed with citations |
| Confidential | Customer plans, forecasts, plant performance, supplier scorecards | Allowed only in approved models and scoped retrieval |
| Restricted | Pricing strategy, trade terms, HR data, legal, M&A, consumer PII | Strong masking, purpose-of-use, no external model unless approved |
| Regulated | Food safety incidents, health data, export-controlled data if any | Dedicated policy, approval, region controls, enhanced audit |

## CPG/FMCG-Specific Security Rules

### Commercial

- Do not expose net pricing, trade terms, retailer-specific plans, or elasticity models outside assigned account teams.
- Prevent AI from comparing confidential retailer terms across accounts unless explicitly authorized.
- Require approval for recommendations that alter price, promo, pack, or trade funding.

### Supply Chain

- Restrict plant, DC, and lane vulnerability data to operational roles.
- Do not expose supplier concentration risk broadly.
- Require approval for inventory transfer, allocation, or customer service prioritization actions.

### Manufacturing

- Protect recipes, formulations, process parameters, batch deviations, and quality data as restricted.
- Separate OT and IT network access.
- Use ISA-95 boundaries for enterprise-to-control-system integration.
- AI must not directly control equipment.

### Procurement

- Restrict supplier bids, contracts, rebates, and negotiation strategy.
- Monitor supplier portal and third-party API ingestion.
- Require contract owner approval for sourcing recommendations.

### Finance

- Finance agent should validate margin, accrual, working capital, and accounting impacts.
- AI must not create or approve journal entries without governed workflow.
- Forecast explanations must show assumptions and data freshness.

### HR

- HR data must be purpose-scoped and masked by default.
- AI must not make employment, promotion, compensation, or disciplinary decisions.
- Workforce analytics must be aggregate unless role-approved.

## Guardrail Decision Matrix

| Action Type | Example | Default Control |
|---|---|---|
| Read | Show OTIF by region | Role/data policy |
| Explain | Why did margin drop? | Citations and metric provenance |
| Simulate | What if promo depth changes? | Scenario sandbox, no write-back |
| Recommend | Shift inventory to customer A | Confidence, impact, approval queue |
| Draft | Supplier escalation email | Human edit and send |
| Execute low-risk | Create internal task | Tool permission and audit |
| Execute high-risk | Change price, production plan, supplier award | Human approval, dual control, rollback |
| Export | Download customer P&L | DLP, watermark, approval if restricted |

## Secure Development Lifecycle

Minimum gates:

1. Threat model for every new domain agent, connector, data source, and write-back tool.
2. Security requirements mapped to OWASP ASVS and API Top 10.
3. AI safety requirements mapped to OWASP LLM Top 10 and NIST AI RMF.
4. Privacy review for PII, HR, consumer, and partner data.
5. Architecture review for tenancy, secrets, network, logging, and resilience.
6. Automated tests for authz, masking, prompt injection, and tool constraints.
7. Dependency and container scans.
8. SBOM and signed release artifacts.
9. Pre-production red-team test.
10. Post-release monitoring and rollback plan.

## AI Evaluation Harness

Create domain-specific golden test suites:

- Supply chain: stockout, OTIF, forecast bias, allocation, supplier disruption.
- Commercial: promo ROI, margin bridge, customer negotiation, price-pack.
- Retail: shelf availability, digital shelf, retailer scorecard.
- Manufacturing: OEE, quality, batch genealogy, downtime.
- Procurement: supplier risk, RFx, contract clauses.
- Finance: close anomaly, working capital, forecast.
- HR: aggregate workforce planning, skill gaps.

Each test should measure:

- Groundedness.
- Metric correctness.
- Authorization correctness.
- Citation accuracy.
- Sensitive data handling.
- Refusal behavior.
- Tool-use safety.
- Business usefulness.
- Latency and cost.

## Security KPIs

Track:

- Percent of answers with citations.
- Percent of answers using certified metrics.
- Guardrail block rate.
- Prompt injection detection rate.
- Unauthorized access attempts.
- Mean time to revoke access.
- Secrets rotation compliance.
- Vulnerability remediation SLA.
- SBOM coverage.
- Signed artifact coverage.
- Critical dependency exposure.
- Data freshness SLA compliance.
- AI evaluation pass rate.
- Human approval override rate.
- Recommendation acceptance rate.
- Incidents by domain and severity.

## Implementation Roadmap

### Phase 0: Security Baseline

- SSO, MFA, group-based RBAC.
- API gateway and WAF.
- Secrets in vault.
- Central logging.
- Dependency, secret, and SAST scanning.
- CORS/CSP hardening.
- Basic rate limits.

### Phase 1: Governed Data and Semantic Layer

- Data classification.
- Row/column-level policy.
- Certified metrics.
- Lineage and freshness.
- Data quality scoring.
- Unity Catalog or equivalent.

### Phase 2: AI Guardrail Plane

- Prompt/version registry.
- Tool gateway.
- Prompt injection defenses.
- Output validation.
- Model routing policy.
- Evaluation harness.
- Audit for prompts, retrieval, tools, and answers.

### Phase 3: Enterprise Platform Hardening

- Tenant/business unit isolation.
- Private endpoints.
- IaC policy gates.
- Signed artifacts.
- SBOM and provenance.
- SIEM integration.
- Disaster recovery tests.

### Phase 4: Governed Action and Workflow

- Action proposal model.
- Approval workflows.
- Dual control for high-impact actions.
- Rollback and compensating controls.
- Continuous learning from accepted/rejected recommendations.

### Phase 5: Compliance and Assurance

- ISO/IEC 27001 readiness.
- SOC 2 readiness.
- AI governance control mapping.
- Penetration testing.
- AI red teaming.
- Third-party risk reviews.
- External audit evidence packs.

## Recommended Platform Decisions

### Must Do

- Use backend-only data access.
- Use short-lived tokens.
- Use certified metrics for executive-facing answers.
- Block arbitrary iframe URLs in production.
- Isolate vector indexes by tenant/function/sensitivity.
- Treat retrieved content as hostile until validated.
- Require human approval for write-back actions.
- Log every AI tool invocation.
- Generate SBOMs and sign artifacts.

### Should Do

- Create a policy-as-code layer for data, AI, and tool permissions.
- Implement dynamic risk scoring per request.
- Add privacy-preserving analytics for consumer and HR data.
- Use private network paths for data systems.
- Add a security champion per domain agent.
- Run quarterly AI red-team exercises.

### Must Not Do

- Do not send restricted data to unapproved external models.
- Do not store prompts or responses without retention and redaction policy.
- Do not allow AI agents to execute arbitrary SQL or shell commands.
- Do not use shared service accounts.
- Do not allow direct object storage access around the data governance layer.
- Do not expose raw stack traces or upstream error bodies.
- Do not rely on prompt instructions as the only security control.

## Research References

Cloud Security Alliance. (2025). *AI Controls Matrix*. https://cloudsecurityalliance.org/artifacts/ai-controls-matrix

CISA. (2023). *Secure by Design*. https://www.cisa.gov/resources-tools/resources/secure-by-design

Databricks. (2026). *Unity Catalog best practices*. https://learn.microsoft.com/en-us/azure/databricks/data-governance/unity-catalog/best-practices

ISO. (2022). *ISO/IEC 27001:2022 Information security management systems*. https://www.iso.org/standard/27001

NIST. (2020). *SP 800-207: Zero Trust Architecture*. https://www.nist.gov/publications/zero-trust-architecture

NIST. (2024). *Cybersecurity Framework 2.0*. https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20

NIST. (2024). *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*. https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

OWASP. (2023). *API Security Top 10 2023*. https://owasp.org/API-Security/

OWASP. (2025). *Application Security Verification Standard*. https://owasp.org/www-project-application-security-verification-standard/

OWASP. (2025). *Top 10 for Large Language Model Applications*. https://owasp.org/www-project-top-10-for-large-language-model-applications

OpenSSF. (2025). *OpenSSF Scorecard*. https://openssf.org/projects/scorecard/

Sigstore. (2025). *Overview*. https://docs.sigstore.dev/

CycloneDX. (2025). *CycloneDX Bill of Materials Specification*. https://github.com/CycloneDX/specification

AWS. (2025). *Well-Architected Framework: Security Pillar*. https://docs.aws.amazon.com/wellarchitected/latest/framework/security.html

Microsoft. (2026). *Incorporate Zero Trust practices in your landing zone*. https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-area/security-zero-trust
