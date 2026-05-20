# Doc Consolidation Migration Notes — 2026-05-10

> Recording of the docs consolidation cycle that took PulsePlay from 26 mixed-heritage docs to ~10 cleanly-identified active docs, with the rest archived to `docs/inherited/`. Strategic context: Path C — inner-source-first, public-OSS-later.

## 1. What moved where

### Active docs at root

| Was | Is now | Action |
|---|---|---|
| `README.md` | `README.md` | Light edit — Path C language; updated docs map; sister-project section |
| `CLAUDE.md` | `CLAUDE.md` | Light edit — Path C language; key directories table updated; new tripwires (8 backends, 2000 ms stagger, state file rename pending) |

### Active docs in `docs/`

| Was | Is now | Action |
|---|---|---|
| `docs/MULTI_BI_ARCHITECTURE.md` (PulsePlay-native) + `docs/ARCHITECTURE.md` (PepPulse-titled, stale) | `docs/ARCHITECTURE.md` | New file. Merged the PulsePlay-native MULTI_BI content + corrections from `research/CODEBASE_AUDIT.md` (8 backend paths, not 6; supervisor stagger 2000 ms; vocabulary leak items). Replaces the inherited PepPulse-titled doc. |
| `docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md` (684 lines, public-commercial-sized) | `docs/SECURITY.md` (~330 lines, internal-org-sized) | Aggressively pruned. Dropped: multi-tenant isolation, public CVE response, SBOM signing, OpenSSF Scorecard, full ISO 42001/EU AI Act compliance. Kept: SSO via org IdP, prompt injection defense, BI embed allowlist, secrets in vault, audit log, CORS/CSP basics. |
| `docs/ROADMAP.md` (PulsePlay-native) | `docs/ROADMAP.md` | Light update — explicit Path C framing; cross-links to AGENDA + PUBLIC_OSS_AGENDA + PACKS; v1.x scope clarified as still-internal. |
| `docs/API_AUTH_AND_LIMITATIONS.md` (PepPulse-titled, mixed) | `docs/PROXY_REFERENCE.md` (new) | Split. Kept §1-3 (API list, scopes, OAuth M2M) updated for 8 backend paths. Dropped §4 (Pulse user-identity propagation) and §5 (Pulse-sandbox limitations). Added: profile shapes reference, response shape contract, route table. Original archived as `inherited/API_AUTH_AND_LIMITATIONS_FULL.md`. |
| `docs/QUALITY_METHODOLOGY.md` (PepPulse-titled with sister-project test counts) | `docs/QUALITY.md` (new) | Pruned to ~100 lines. Originally updated to the scaffold-era PulsePlay counts; later revised to the current 161 playground/adapter tests and 418 proxy tests. Kept honesty framework. |
| (none) | `docs/AGENDA.md` (new) | Open-work tracker. Captures beast-mode list, BI adapter priorities, AI sidebar v1 work, near/medium/long-term, blockers. |
| (none) | `docs/PUBLIC_OSS_AGENDA.md` (new) | What gets done IF/WHEN we go public-OSS. License decision, SBOM/signing, conformance harness, public docs site, MCP server reference impls, multi-tenant isolation, full compliance items. So none of it is forgotten. |
| (none) | `docs/PACKS.md` (new) | Pack architecture overview. Brief — details live in `pulsepacks/PACK_SPECIFICATION.md` (Agent 2's territory). |

### Archived to `docs/inherited/`

Originals preserved verbatim (no content edits) for reference and historical context.

| Was | Now lives at | Why archived |
|---|---|---|
| `docs/ARCHITECTURE.md` | `docs/inherited/PEPPULSE_ARCHITECTURE.md` | PepPulse-titled, framed around .pbiviz + Azure App Service B1 + UniBridge AI for Power BI; stale for PulsePlay |
| `docs/SECURITY_REVIEW.md` | `docs/inherited/PEPPULSE_SECURITY_REVIEW.md` | PepPulse-titled, .pbix-extraction threat model, Wave 22-38 controls reference custom-visual files |
| `docs/ENTERPRISE_READINESS.md` | `docs/inherited/PEPPULSE_ENTERPRISE_READINESS.md` | PepPulse-titled enterprise pitch with 20-question reviewer Q&A |
| `docs/BEAST_MODE_MEMORY.md` | `docs/inherited/PEPPULSE_BEAST_MODE_MEMORY.md` | 14-cycle Wave-numbered for the Pulse PBI visual |
| `docs/QUALITY_METHODOLOGY.md` | `docs/inherited/PEPPULSE_QUALITY_METHODOLOGY.md` | Original pre-pruning version with sister-project test counts |
| `docs/API_AUTH_AND_LIMITATIONS.md` | `docs/inherited/API_AUTH_AND_LIMITATIONS_FULL.md` | Full version archived; PROXY_REFERENCE.md is the pruned active doc |
| `docs/MULTI_BI_ARCHITECTURE.md` | `docs/inherited/MULTI_BI_ARCHITECTURE.md` | Predecessor of new ARCHITECTURE.md; archived after merge |
| `docs/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md` | `docs/inherited/ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md` | Full 684-line version; public-commercial-sized. SECURITY.md is the pruned active doc. |
| `docs/PROJECT_REVIEW.md` | `docs/inherited/PROJECT_REVIEW.md` | Superseded by `research/CODEBASE_AUDIT.md` (more rigorous, file:line citations) |
| `docs/PULSEPLAY_CPG_REVIEW.md` | `docs/inherited/PULSEPLAY_CPG_REVIEW.md` | Early CPG framing doc with fabricated case studies; superseded by `inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` |
| `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` | `docs/inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` | Comprehensive CPG vertical blueprint with real references; preserved verbatim. Agent 2 will use as seed for `pulsepacks/cpg-fmcg/`. |
| `docs/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md` | `docs/inherited/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md` | Feasibility gap matrix; reference material |
| `docs/FUNCTIONAL_COVERAGE_ASSESSMENT.md` | `docs/inherited/FUNCTIONAL_COVERAGE_ASSESSMENT.md` | Implemented/partial/missing/OOS table; superseded by CODEBASE_AUDIT |
| `docs/E2E_GAP_REVIEW_INITIAL.md` | `docs/inherited/E2E_GAP_REVIEW_INITIAL.md` | Concrete gap scoring; superseded by CODEBASE_AUDIT |
| `docs/E2E_REVIEW_SUB_AGENT.md` | `docs/inherited/E2E_REVIEW_SUB_AGENT.md` | Process spec for a recurring review agent; archived |

### Moved to `docs/research/`

Research bibliographies that were at `docs/` root but belong with the other research artifacts. Added portability notes at the top of each (file paths point to Pulse, not PulsePlay).

| Was | Now lives at | Notes |
|---|---|---|
| `docs/ANALYTICS_DOMAIN_TAXONOMY.md` | `docs/research/ANALYTICS_DOMAIN_TAXONOMY.md` | Portability note added; references `genieChatVisual/src/setupStep5.tsx` (sister project) |
| `docs/INSIGHTS_SECTION_TAXONOMY.md` | `docs/research/INSIGHTS_SECTION_TAXONOMY.md` | Portability note added; same heritage |

### ADR updates (`docs/adr/`)

In-place edits — added status callouts at the top of each. No file moves.

| ADR | Status change |
|---|---|
| `0001-xhr-only-genie-client.md` | Marked SUPERSEDED — Pulse-legacy. PulsePlay runs in real browser. |
| `0002-dual-bind-127-not-localhost.md` | Kept Accepted (still applies). |
| `0003-supervisor-stagger-800ms.md` | Updated — title says 800 ms, code is 2000 ms (verified at `proxy/server.js:3556`). Title rename pending. |
| `0004-format-pane-json-string-storage.md` | Marked SUPERSEDED — no PBI format pane in PulsePlay. |
| `0005-two-tier-insights-cache.md` | Kept with caveat — applies once AI Insights pipeline is ported (v0.3+). |
| `0006-trend-pill-allowlist.md` | Marked SUPERSEDED for v0.x — applies if/when insights renderer is ported. |
| `0007-backend-adapter-abstraction.md` | Kept with cross-reference to PulsePlay's `BIAdapter` (Y-axis mirror of this connector-side X-axis abstraction). |
| `README.md` | Index updated to reflect status changes; note added about PulsePlay's BIAdapter as future ADR-0008. |

## 2. What was pruned and why

### `SECURITY.md` (from `ENTERPRISE_SECURITY_PLATFORM_GUARDRAILS.md`)

**Pruned: 684 -> ~330 lines.** Items dropped (moved verbatim to PUBLIC_OSS_AGENDA.md):

- Multi-tenant isolation (per-tenant profiles, rate limits, audit, secrets, configuration UI, isolation tiers)
- SBOM (CycloneDX) generation per release; Sigstore-signed artifacts; SLSA-inspired build hardening; provenance attestations; OpenSSF Scorecard targeting
- Public CVE response process; security disclosure process; embargo policy
- Full ISO/IEC 27001 / 42001 readiness; SOC 2 Type II ongoing commitment; EU AI Act compliance; HIPAA BAA; PCI DSS scoping; FedRAMP Moderate
- Third-party penetration testing; AI red teaming; external audit evidence packs
- Public WAF, DDoS, bot/scraping detection; geographic egress restrictions; private endpoints; hub-spoke segmented network; container runtime protection (Falco-class); IaC policy-as-code gates
- mTLS between browser and proxy; HMAC request signing
- Public refusal-rule library; per-prompt cost budget enforcement; output PII/secret scanner before render; model routing policy by data sensitivity
- Action proposal model; approval workflows; dual control for high-impact actions; rollback and compensating controls
- OpenTelemetry instrumentation; tenant-aware dashboards; AI-cost attribution; anomaly detection; public status page

**Kept** (relevant for internal-org charter): SSO via org IdP, MFA, SCIM, group-based access, service principals; per-profile authorization in proxy; scoped embed tokens; Unity Catalog as the load-bearing fence; secrets in vault; audit log with X-Request-Id; sanitization (`sanitizeInstructionText`, `sanitizeIdentifierList`, `sanitizeTemplateValue`); three-layer SQL gate; validator framework; iframe sandbox attribute narrowing; CORS/CSP basics; rate limiting (per IP today); 11 audited code controls citing `proxy/server.js` etc.; honest gaps section; production hardening checklist for internal pilot.

### `PROXY_REFERENCE.md` (from `API_AUTH_AND_LIMITATIONS.md`)

**Pruned: 407 -> ~340 lines.** Items dropped (Pulse-specific, not applicable to PulsePlay):

- §4 User identity propagation — entire Pulse Section H CTE, USERPRINCIPALNAME measure binding, multi-space RBAC discussion. Power BI custom-visual specific.
- §5 Known limitations — PBI Desktop sandbox blocking lazy chunks, Genie 5 req/min rate limit (this is Genie's, not Pulse's, so it's actually still relevant — preserved in PROXY_REFERENCE under section 1.1 implicitly), .pbiviz binary size cap, PBI WebAccess allowlist (`capabilities.json`), inline credentials path detail.

**Updated** for PulsePlay reality: 6 backends -> 8 backends (verified per `research/CODEBASE_AUDIT.md`); Pulse references replaced with PulsePlay; added §4 profile shapes reference and §5 response shape contract that didn't exist in the original.

### `QUALITY.md` (from `QUALITY_METHODOLOGY.md`)

**Pruned: 95 -> ~100 lines (similar size, different content).** Items dropped:

- sister-project-specific test counts (874 vitest + 152 jest in the sister project; PulsePlay has since moved past the scaffold-era counts recorded during consolidation)
- sister-project-specific cycle / Wave references
- Pulse-specific build hygiene (.pbiviz cap, custom-visual constraints)

**Kept**: honesty framework, what-we-measure / what-we-don't / roadmap structure, "do say / don't say" rules. Updated test counts to PulsePlay reality.

### `ARCHITECTURE.md` (merged from `MULTI_BI_ARCHITECTURE.md`)

**Net change: ~175 lines -> ~280 lines** (expanded with corrections, not pruned).

Additions over the predecessor:
- 8 backend paths table (with file:line citations) replacing the 6-backend table
- Genie-vocabulary leak items section (5 items)
- Supervisor-local fan-out island sub-section (clarifies its role as ancestor of v0.5)
- Validator framework sub-section
- Inherited security posture summary (cross-link to SECURITY.md)
- Path C scope statement at the top
- Cross-link section at the bottom

## 3. What was preserved verbatim

`docs/inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md` — comprehensive CPG vertical blueprint with real references (Gartner / Deloitte / NIQ / Circana / WEF / GS1 / ISA-95). Will become the seed for `pulsepacks/cpg-fmcg/` (Agent 2's work). Preserving the original ensures Agent 2 has the full source material; the pack itself can evolve while the blueprint stays as a reference.

`docs/research/CODEBASE_AUDIT.md` and `docs/research/MARKET_AND_STANDARDS.md` — kept as-is. These are the brutal-honest ground-truth references; consolidation goal was not to alter them.

`docs/research/ANALYTICS_DOMAIN_TAXONOMY.md` and `docs/research/INSIGHTS_SECTION_TAXONOMY.md` — content preserved verbatim; only added portability notes at the top so a reader doesn't get confused by `genieChatVisual/...` file references that are Pulse, not PulsePlay.

All `docs/inherited/PEPPULSE_*.md` and other archived docs — preserved verbatim. Inherited material is reference material.

## 4. Naming drifts that remain

These are flagged for a future cleanup cycle. None block today's work; tracked in `docs/AGENDA.md` near-term and `docs/ARCHITECTURE.md` "Vocabulary leak items":

- **`proxy/package.json` name** is still `unibridge-ai-proxy` (older internal name). Description says "for routing Power BI questions."
- **`databricks-agents/supervisor/README.md`** still says "PulsePlay Supervisor Agent" in the title.
- **HTTP headers** in proxy: `X-Genie-Key`, `X-Genie-Target-Host`, `X-Databricks-Host`, `X-Databricks-Token`, `X-Genie-Space-Id`. Five of six allowed CORS headers are Databricks-vocabulary; only `X-Profile-Name` is generic. Renaming requires a backward-compat alias plan.
- **`errorStatusFromDatabricks`** is the only error-mapping helper; only Databricks-shaped errors route through it. Bedrock and OpenAI have separate paths.
- **CORS comment** claims "Power BI Desktop WebView requires permissive headers" — not applicable in PulsePlay.
- **`scripts/llm_wrapup.py` state file** is now `.pulseplay-session.state.json` (and `llm_onboard.py` matches). Legacy `.the sister project-session.state.json` is still read as a fallback so a half-migrated repo keeps working; both names remain gitignored.
- **ADR-0003 file name** `0003-supervisor-stagger-800ms.md` — title says 800 ms but code is 2000 ms. Either rename the file or supersede with a fresh ADR documenting 2000 ms.
- **Smoke scripts** (`scripts/smoke-full.ps1`, `scripts/smoke-rls-ols.ps1`) are Pulse-shaped (test PBI custom visual paths). Need adaptation to PulsePlay's profile types.

## 5. Doc count

**Was:** 26 docs (counted per the cycle scope: 2 root, 18 in docs/ root, 7 ADRs, 2 in docs/research/ — adjusting for what was already in research/, the consolidation-relevant scope was 26).

**Now active (used by readers landing on the repo):**

| Location | Files | Notes |
|---|---|---|
| Root | 2 | README.md, CLAUDE.md |
| `docs/` root | 9 | ARCHITECTURE, ROADMAP, AGENDA, SECURITY, PROXY_REFERENCE, QUALITY, PACKS, PUBLIC_OSS_AGENDA, MIGRATION_NOTES |
| `docs/adr/` | 8 | 7 ADRs + README; 4 marked SUPERSEDED, 1 needs title rename, 2 still load-bearing |
| `docs/research/` | 4 | CODEBASE_AUDIT, MARKET_AND_STANDARDS, ANALYTICS_DOMAIN_TAXONOMY (portable), INSIGHTS_SECTION_TAXONOMY (portable) |
| **Active total** | **23** | Of which the headline reader-relevant set is the **9 in `docs/` root + 2 root files = 11 active "front-facing"** |

| Location | Files | Status |
|---|---|---|
| `docs/inherited/` | 15 | Reference material; archived verbatim |

So the "fronts" presented to a new reader landing on the repo:

- 2 root files (README, CLAUDE)
- 9 active docs in `docs/` root (the headline 8 plus this MIGRATION_NOTES)
- 4 research docs (research/)
- 8 ADRs (adr/) — most marked SUPERSEDED for v0.x

That's the **target ~10 active "front-facing" docs** — within the band the consolidation aimed for. The inherited bucket is intentionally larger (15) because Pulse-heritage material is genuinely valuable as reference and was preserved by design rather than deleted.

---

*This file itself counts as one of the active docs. When the next consolidation cycle runs, this can be archived to `inherited/` as a record of what happened, or kept as a living document covering future migrations.*
