# IT / Admin

The IT / Admin seat covers application portfolio, service-desk operations, infrastructure operations, license utilisation, and — increasingly — AI governance and AI ops (model registry, evaluation harness, prompt versioning, agent permissions, cost controls). In CPG/FMCG, the IT seat carries cross-functional service-level responsibility because every other sub-vertical's analytics depends on enterprise applications staying healthy.

## What this sub-vertical covers

- **Service desk**: incident, request, problem, change. Response and resolution SLAs.
- **Application portfolio**: ERP, MES, WMS, TMS, BI, CRM, TPM, PLM, HRIS health, ownership, lifecycle.
- **Infrastructure operations**: cloud spend, on-prem capacity, network performance, identity and access.
- **License utilisation**: BI seat licenses, ERP user licenses, AI-platform consumption.
- **AI governance ops**: model registry, evaluation harness, prompt-version management, agent permissions, drift / cost / quality monitoring, rollback.
- **Cybersecurity ops**: not covered in depth here; refer to the org's security pack or the platform's `ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md` for AI-specific security guardrails.

## Why a CPG team uses this

- "Service-desk SLA on tier-1 application X has degraded for 3 consecutive weeks. What changed?"
- "Power BI premium capacity at site A is throttling for the second day. Capacity expansion or query-pattern fix?"
- "AI-platform consumption is up 38% month-over-month. Which agents and which question patterns?"
- "License utilisation for application Y at office Z is 18% — return licenses or reassign?"
- "Genie space S has model drift evidence. Roll back to previous prompt version or accept and recalibrate evaluation set?"

## Typical data sources

- **ITSM**: ServiceNow, Jira Service Management, BMC Helix.
- **APM / observability**: Datadog, New Relic, Splunk, Dynatrace, AppDynamics, Elastic.
- **Cloud cost / FinOps**: AWS Cost Explorer + Cost & Usage Reports, Azure Cost Management, GCP Billing, CloudHealth, Apptio Cloudability.
- **Identity / access**: Okta, Microsoft Entra ID, Ping Identity.
- **AI ops**: MLflow (open), Databricks Unity Catalog + lineage, Weights & Biases, internal evaluation harnesses.
- **Internal**: CMDB, application portfolio register, license tracker.

## Cross-cutting overlays

- **[Sustainability](../sustainability/README.md)**: data-centre and cloud emissions (Scope 2 and Scope 3 cat. 1 for purchased cloud services). Increasingly scrutinised under CSRD.
- **[Vendor Management](../vendor-management/README.md)**: software-vendor management, license rationalisation, hyperscaler relationship management.
- **[HR](../hr/README.md)**: AI-augmentation programs and skills evolution intersect with IT's responsibility for the platforms.

## Sub-vertical contents

- [sample-questions.md](sample-questions.md)
- [kpis.md](kpis.md)
- [bi-ai-fit.md](bi-ai-fit.md)

## Status

<!-- SME REVIEW NEEDED:
     - The author has limited IT-operations domain depth; this scaffold uses standard ITIL / ITSM / FinOps framings and should be reviewed by an IT operations SME for the adopting org's specific service catalogue and tooling.
     - AI governance ops is a fast-moving area; the metrics suggested here (drift, evaluation pass-rate, cost-per-conversation) should be revisited as standards mature (NIST AI RMF, ISO/IEC 42001).
     - Service-desk specifics (SLA definitions, ticket category taxonomies) are highly org-specific. -->
