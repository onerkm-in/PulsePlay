# PulsePlay Public-OSS Agenda

> **Purpose:** capture everything that gets done IF/WHEN PulsePlay goes public-OSS or commercial. None of this is in the v1.x scope. None of this is committed. This file exists so the work isn't FORGOTTEN if the strategic direction shifts.
>
> **Strategic direction today:** Path C — inner-source-first, public-OSS-later. PulsePlay v1 is an internal-org enabler. Going public-OSS is a separate decision, not committed in any current roadmap.

## Why this list exists

The original `ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md` (now archived at [inherited/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md](inherited/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md)) was 684 lines sized for a public commercial platform. Pruning it to PulsePlay's internal scope produced [SECURITY.md](SECURITY.md) at ~200 lines. The 484 lines of cut content didn't disappear — they're enumerated here.

Same applies to anything else that's only relevant for public consumption (license decisions, SBOM signing, conformance harnesses for third-party adapter authors, public docs site, etc.). All captured here.

## License decision (pending; required before any public release)

**Recommended:** Apache 2.0.

**Rationale:**

- Patent grant is a feature for adopters (defensive)
- Permissive enough that downstream commercial use is unblocked
- The sister project (Pulse) used MIT; for PulsePlay, the ecosystem of BI vendors and AI providers we plug into matters more, and Apache 2.0's patent clause is the safer floor
- Compatible with most enterprise legal review processes

**Alternatives considered (NOT recommended):**

- MIT — simpler, but no patent grant
- BUSL (Business Source License) — converts to Apache 2.0 after a delay; complicates adoption
- AGPL — too restrictive for the kind of internal-fork use we'd want to encourage
- Commercial-only — defeats the purpose of going public

**Action items if we go public:**

- [ ] Add `LICENSE` file at repo root with Apache 2.0 text
- [ ] Add SPDX header to every source file
- [ ] Update `package.json` `license` field to `Apache-2.0`
- [ ] Add `THIRD_PARTY_LICENSES.md` cataloging dependency licenses
- [ ] CLA decision (DCO / Apache CLA / no CLA) — likely DCO for low friction

## Multi-tenant isolation

PulsePlay v1 is single-tenant per deployment. Multi-tenant requirements for a hosted commercial platform:

- [ ] Per-tenant profile namespacing (today profiles are global)
- [ ] Per-tenant rate limits (today only per-IP)
- [ ] Per-tenant audit log isolation
- [ ] Per-tenant secret stores (each tenant's vault refs)
- [ ] Per-tenant configuration UI (admin console)
- [ ] Strong isolation level (separate catalogs, schemas, keys, indexes per tenant)
- [ ] Optional physical isolation tier (separate cloud subscriptions per tenant)
- [ ] Cross-tenant access attempt detection + auto-kill

## Security hardening for public exposure

Everything that was cut from the original 684-line enterprise security doc:

### Compliance and certification

- [ ] SOC 2 Type II ongoing operational commitment (~6-month observation window)
- [ ] ISO/IEC 27001 readiness (formal ISMS, annual audit)
- [ ] ISO/IEC 42001 (AI management system) readiness
- [ ] EU AI Act compliance (risk classification, transparency obligations, conformance assessment)
- [ ] HIPAA BAA template (for healthcare-adjacent customers)
- [ ] PCI DSS scoping document
- [ ] FedRAMP Moderate path (FIPS-validated crypto, Azure Government cloud, formal SSP, ATO process)
- [ ] Third-party penetration testing
- [ ] AI red teaming (commissioned)
- [ ] External audit evidence packs

### Supply chain

- [ ] SBOM (CycloneDX) generated per release
- [ ] Sigstore-signed artifacts (cosign sigs on container images)
- [ ] SLSA-inspired build hardening
- [ ] Provenance attestations
- [ ] OpenSSF Scorecard targeting / improvement
- [ ] Pinned dependencies (lockfile-only)
- [ ] Renovate / Dependabot with security-priority lane
- [ ] Critical-dependency review process for OSS we depend on
- [ ] Separate build and deploy identities (signed promotion path)
- [ ] Reproducible builds where possible

### Network and infrastructure (public-host posture)

- [ ] WAF on public endpoints
- [ ] DDoS protection
- [ ] Bot/scraping detection
- [ ] Geographic egress restrictions per tenant policy
- [ ] Private endpoints for databases / storage / AI services / internal APIs
- [ ] Hub-spoke segmented network
- [ ] Hardened base images
- [ ] Container runtime protection (Falco / similar)
- [ ] IaC policy-as-code gates
- [ ] Mutual TLS between proxy and backends
- [ ] Request signing (HMAC over body+timestamp+nonce)

### AI guardrails (public-scale)

- [ ] Public CVE response process for AI-related disclosures
- [ ] Prompt-injection detector (red-team-validated, not just sanitization)
- [ ] Output PII / secret scanner before render
- [ ] Per-prompt cost budget enforcement
- [ ] Refusal-rule library (versioned, customer-tunable)
- [ ] Model routing policy by data sensitivity (auto-route restricted data to in-region / in-org models)
- [ ] Citations required for factual claims (and rendering them in the UI)
- [ ] Confidence + uncertainty visible in every answer
- [ ] Red-team test sets for prompt injection, data leakage, jailbreaks, unsafe actions
- [ ] Token / cost caps with tenant-configurable thresholds
- [ ] Tool-use safety harness (no external tool calls without policy review)

### Workflow and write-back primitives

- [ ] Action proposal model (AI proposes, human approves)
- [ ] Approval workflows
- [ ] Dual control for high-impact actions (price changes, supplier awards, financial postings)
- [ ] Rollback and compensating controls
- [ ] Continuous learning from accepted/rejected recommendations
- [ ] Idempotency keys for state-changing operations

### Observability at scale

- [ ] OpenTelemetry instrumentation (traces + metrics + logs)
- [ ] Tenant-aware dashboards (cost, latency, validator pass rate per tenant)
- [ ] AI-cost attribution per tenant / per profile
- [ ] Anomaly detection on usage patterns
- [ ] Public status page

## Public adapter ecosystem (third-party adapter authors)

If we want third parties to write BIAdapter implementations:

- [ ] Conformance harness — every adapter must pass to be listed
- [ ] Adapter registry (npm packages following a naming convention)
- [ ] Adapter security review checklist
- [ ] Adapter docs site with worked examples
- [ ] Versioned BIAdapter contract (semver) with deprecation policy
- [ ] Backward-compat support window
- [ ] CI matrix that runs the conformance harness against the latest published adapters

Same idea for connector authors (X-axis) — third-party connector profile types:

- [ ] Connector authoring guide
- [ ] Connector security review checklist (treats user prompts + tool responses as untrusted)
- [ ] Connector registry / discovery
- [ ] Conformance suite for connector profile types

## MCP server reference implementations

If we want to expose PulsePlay's BI-context as an MCP server (so other AI tools can read what the user is looking at):

- [ ] MCP server for "what is the user currently looking at?" context
- [ ] MCP server for "execute a BICommand against the active adapter"
- [ ] MCP server for "fetch a row from the active embed's underlying data" (if BIAdapter exposes it)
- [ ] Reference deployment guide (Claude Desktop, ChatGPT MCP client, etc.)

## Public docs / DX

- [ ] Public docs site (Mintlify / Docusaurus / VitePress)
- [ ] Public issue tracker on GitHub
- [ ] Public security disclosure process (security.txt, GitHub Security Advisories, embargo policy)
- [ ] Public Discord / Slack / forum
- [ ] Conference talks / blog posts
- [ ] Demo video (Loom or similar) showing the 2-axis switching
- [ ] Tutorial: write your first BIAdapter
- [ ] Tutorial: write your first connector profile
- [ ] Tutorial: write your first PulsePack
- [ ] Public roadmap (this file becomes that, post-decision)

## Commercial / SaaS layer (if we go that way)

- [ ] Hosted PulsePlay control plane
- [ ] Tenant onboarding flow (self-serve)
- [ ] Billing / metering (per-user / per-call / per-token tiers)
- [ ] Marketplace (vendor-published adapter packs)
- [ ] Customer success / support tier with SLA
- [ ] Enterprise paid plan with audit, SSO connector library, on-premises option

## Decision points (when to revisit)

- After v0.3 ships and the AI sidebar reaches Pulse parity — revisit "is the internal-org charter still the right scope?"
- After v0.5 ships (multi-vendor single pane of glass) — revisit "is this the differentiator that justifies public release?"
- If demand from outside the org materializes — revisit posture
- If the platform team's AI services are themselves productized for external customers — PulsePlay's role in that bundle is a separate conversation

## How this file evolves

When we decide to go public-OSS:

1. License chosen, file added at repo root
2. Items above re-prioritized into a real public-OSS roadmap
3. This file becomes obsolete (or pivots into "what's still aspirational")

When we decide to STAY internal-only forever:

1. Mark this file `STATUS: ARCHIVED — internal-only is the final answer`
2. Items become irrelevant; archive

Until either decision lands, this file is the parking lot.
