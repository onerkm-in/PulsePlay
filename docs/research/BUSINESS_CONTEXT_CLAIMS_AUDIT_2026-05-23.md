# Business Context Claims Audit

Date: 2026-05-23

Status: Multi-agent claim audit and implementation gate. No runtime code changed.

Purpose: validate the claims introduced by the draft Business Context / pack-default work before approving a beast-mode implementation pass. This document is intentionally stricter than a design brief because the affected areas touch trust, references, industry benchmarks, and sustainability wording.

Related docs:

- [SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md](SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md)
- [ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md](ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md)
- [MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md](MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md)
- [../KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md](../KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md)
- [../../pulsepacks/PACK_SPECIFICATION.md](../../pulsepacks/PACK_SPECIFICATION.md)

## Scope

This audit reviewed the draft claims and architecture around:

- [playground/src/authoring/businessContextProfile.ts](../../playground/src/authoring/businessContextProfile.ts)
- [playground/src/authoring/generatedDefaults.ts](../../playground/src/authoring/generatedDefaults.ts)
- [playground/src/authoring/__tests__/businessContextProfile.test.ts](../../playground/src/authoring/__tests__/businessContextProfile.test.ts)
- [pulsepacks/cpg-fmcg](../../pulsepacks/cpg-fmcg)
- [pulsepacks/retail-digital](../../pulsepacks/retail-digital)
- [pulsepacks/saas-product](../../pulsepacks/saas-product)
- the proposed Strategic Lens / generated-defaults direction

The user concern was correct: org type, pack, sector, preset, metric preset, guided filters, knowledge base, trusted content, references, and Adjust must collapse into one coherent Business Context flow. The core product direction remains right. The claim layer is not yet production-grade.

## Method

Six read-only research agents were reused because the session had reached the new-agent thread limit:

| Agent lane | Focus |
|---|---|
| CPG / FMCG | Supply chain, procurement, and CPG sustainability claims. |
| Retail / digital commerce | Merchandising, growth marketing, ecommerce taxonomy, and packaging sustainability claims. |
| SaaS / digital product | ARR, NRR, CAC/LTV, SaaS benchmarking, cloud sustainability, and SCI/PUE claims. |
| ESG / sustainability | GHG Protocol, SBTi, Scope 2, Scope 3, packaging circularity, PUE, SCI, and green-claim wording. |
| Provenance / trust architecture | Source IDs, confidence labels, source cards, citation mode, fallback behavior, and validators. |
| Strategic Lens / implementation shape | Whether strategy presets reduce confusion or recreate selector sprawl. |

The main session then checked official/current web sources for GHG Protocol, Google Analytics, Green Software Foundation, The Green Grid, WBCSD CTI, SBTi, SaaS Metrics Standards Board, and KeyBanc/Sapphire SaaS survey references. Source signatures are appended in [EXTERNAL_REFERENCES.md](EXTERNAL_REFERENCES.md#2026-05-23--business-context-claims-audit-and-source-hardening).

## Executive Verdict

Do not approve the full Business Context implementation exactly as drafted.

Approve a narrowed hardening pass first:

1. Keep the one-canonical-`BusinessContextProfile` direction.
2. Treat the current `PACK_REGISTRY`, new Retail/SaaS packs, and strategic lens content as draft scaffolds.
3. Remove false `sme-reviewed` confidence defaults.
4. Replace invented or weak source IDs with source-register-backed IDs.
5. Add a validator before wiring this into the progressive Settings UI.
6. Only after that, add the Generated Defaults Review screen and Strategic Lens as a child of Business Context, not as another top-level selector.

The current draft is valuable, but it overstates governance. If shipped as-is, PulsePlay would look trustworthy while silently mixing verified standards, common business heuristics, placeholders, and unreviewed thresholds under the same badge. That is exactly the discomfort the user is trying to remove.

## Critical Findings

| Severity | Finding | Evidence | Required correction |
|---|---|---|---|
| Critical | `buildBusinessContextProfile()` returns `confidence: "sme-reviewed"` for every known profile. | [businessContextProfile.ts](../../playground/src/authoring/businessContextProfile.ts) and tests currently assert `sme-reviewed`. | Default to `draft` / `inferred` / `author-confirmed`. Use `sme-reviewed` only when a pack source register and SME approval record explicitly prove it. |
| Critical | CPG source IDs are invented in the runtime registry. | `SC-001`, `SC-002`, `PROC-001`, `ESG-001`, and `ESG-002` appear in [businessContextProfile.ts](../../playground/src/authoring/businessContextProfile.ts), but the CPG source register uses IDs like `GHG-CORPORATE`, `GHG-SCOPE-2`, `GHG-SCOPE-3`, and `SBTI`. | Runtime profiles must reference real source IDs from the pack's `knowledge-base/references.md`, or mark the claim as `SME REVIEW NEEDED`. |
| Critical | Static `PACK_REGISTRY` is detached from the actual pack files. | `PACK_REGISTRY` is hard-coded inside [businessContextProfile.ts](../../playground/src/authoring/businessContextProfile.ts), while packs carry their own manifests and source registers under [pulsepacks](../../pulsepacks). | Treat registry data as a projection layer generated from pack metadata, or add a validator that proves every runtime source ID exists in the corresponding pack source register. |
| High | Tests currently assert governance overclaims. | [businessContextProfile.test.ts](../../playground/src/authoring/__tests__/businessContextProfile.test.ts) expects `sme-reviewed` and invented source IDs. | Update tests to fail if draft profiles claim SME review, if source IDs are missing from source registers, or if citations are disabled without a review gate. |
| High | Fallback and override behavior can downgrade citation expectations too easily. | Fallback profile uses empty `sourceIds` and `citationMode: "off"`; overrides can set citation mode off. | Unknown/fallback profiles should show `source-review-required`, not citation off. Downgrading citations should require an explicit author/governance review state. |
| High | Source-card metadata is missing from runtime profiles. | Pack spec requires publisher/author, URL, source date, verification date, tier, and supported claims. The runtime only carries IDs and basic provenance. | Add source-card resolution or source-card references so the UI can show publisher, URL, tier, freshness, and supported claim scope. |
| High | Strategic Lens risks becoming another duplicate selector. | Proposed state fields such as `activeStrategyId` / `activeStrategyParams` would sit beside existing custom-section and metric-preset concepts. | Put Strategic Lens inside Business Context -> Generated Defaults Review. It should shape narrative/report structure only and project to existing settings through one adapter. |

## Domain Findings

### CPG / FMCG

| Claim area | Verdict | Notes |
|---|---|---|
| OTIF formula | Partially safe | OTIF as an operational delivery KPI is reasonable, but source ID `SC-001` is invalid and thresholds like `>=95` / `90-94.9` / `<90` must be org- or customer-policy defaults, not standards. |
| Forecast accuracy / WMAPE | Partially safe | `1 - WMAPE` style accuracy is a common analytics formula, but `SC-002` is not in the CPG source register and thresholds require SME review. |
| Inventory days | Partially safe | Formula is common. Thresholds such as 30-60 days are not universal and must be marked configurable. |
| Procurement / spend concentration | Draft only | `PROC-001` is invalid. Supplier concentration thresholds such as 60% are business heuristics until tied to a source or SME decision. |
| Scope 1 / Scope 2 / Scope 3 glossary | Safe if re-sourced | Definitions are broadly aligned with GHG Protocol, but IDs must be corrected to `GHG-CORPORATE`, `GHG-SCOPE-2`, and `GHG-SCOPE-3`. |
| Carbon intensity per order | Org-defined KPI | GHG Protocol supports emissions accounting, but denominator, boundaries, emission factors, and thresholds are PulsePlay/org-defined. Do not call this a universal standard. |
| `lastReviewedAt: 2026-05-23` | Overclaim for CPG | CPG register says last reviewed 2026-05-16 and confidence draft. Do not stamp today's date as review unless a real review happened. |

### Retail / Digital Commerce

| Claim area | Verdict | Notes |
|---|---|---|
| `RET-001` merchandising math | Weak source | The referenced NRF retail library does not prove a specific "Retail Merchandising Mathematics Standard Guide" claim. GMROI is common retail math, but use a lower confidence tier unless a direct standard/source is added. |
| GMROI and sell-through thresholds | Draft only | Formulas are common; thresholds and "good/bad" labels vary by category, margin structure, seasonality, and inventory model. |
| `RET-002` GA4 ecommerce source | Narrowly safe | Google GA4 supports ecommerce event names and parameters. It does not define ROAS, CAC, LTV, or retail growth benchmarks. |
| CAC / ROAS / LTV | Needs finance/marketing source | These require spend, revenue, cohort, and customer-model data outside GA4. Use GA4 for event taxonomy only. |
| Packaging circularity / EPR | Mis-sourced | GHG Scope 3 is not a packaging circularity or EPR-fee standard. Use WBCSD CTI / ESRS E5 / packaging-specific standards / jurisdictional EPR regulation, or mark internal/illustrative. |
| "Standard retail taxonomy" wording | Too broad | Safer copy: "Uses GA4 ecommerce event taxonomy plus common retail merchandising formulas." |

### SaaS / Digital Product

| Claim area | Verdict | Notes |
|---|---|---|
| `SAAS-F01` URL | Needs correction | The verified site is `saasmetricsboard.com`, not `saasmetricsboard.org`. |
| ARR | Sourceable | SaaS Metrics Standards Board publishes an ARR page and formula. Treat as an industry operating metric, not GAAP. |
| NRR | Sourceable, with split roles | SaaS Metrics Board should be formula authority. KeyBanc/Sapphire is a benchmark/survey source, not the formula authority. |
| LTV:CAC | Heuristic / in-progress | SaaS Metrics Board lists CLTV-to-CAC ratio as in progress. Avoid framing 3:1 thresholds as a standard. |
| CAC payback vs LTV:CAC | Needs wording fix | "LTV:CAC payback speed" conflates two different metrics. CAC payback period and LTV:CAC ratio need separate definitions. |
| Accounting claim | Overclaim | ARR/NRR/CAC/LTV are operating metrics. Do not say they are "fully aligned with financial accounting practices." |
| `ESG-S01` SCI / PUE | Split sources | SCI supports software carbon intensity. PUE is a data-center efficiency metric from The Green Grid / ISO lineage. Do not cite SCI as the PUE source. |
| Scope 3 Category 11 for compute/hosting | Risky | Category mapping depends on reporting boundary, customer use phase, and accounting policy. Phrase as a candidate mapping, not a standard rule. |

### ESG / Sustainability

| Claim area | Verdict | Notes |
|---|---|---|
| Scope glossary | Safe with correct IDs | Use GHG Corporate Standard, Scope 2 Guidance, and Scope 3 Standard. |
| Scope 2 market/location based | Safe in context | Present as Scope 2 accounting/disclosure guidance, not a general sustainability score. |
| Scope 3 categories | Safe with boundary caveat | Category 4 vs 9 and other category assignments depend on who pays/controls transport and reporting boundaries. |
| SBTi actions | Reword | SBTi validates targets. PulsePlay can map actions to SBTi-validated targets where present; it cannot validate actions itself. |
| Packaging circularity | Needs new source family | Compostable, biodegradable, recycled content, recyclability, circularity, and EPR exposure are not interchangeable terms. |
| PUE | Source must be The Green Grid / ISO lineage | PUE = total data-center energy divided by IT equipment energy. SCI is separate. |
| SCI | Valid but requires full data | SCI requires energy, carbon intensity, embodied emissions allocation, and a functional unit. Instance count alone is insufficient. |
| Token/session efficiency | Safe if modest | Keep it near Ask as a digital-wellbeing/efficiency cue. Do not make climate-impact claims from token counts alone. |

## Strategic Lens Implementation Gate

The narrowed Strategic Lens direction is acceptable only under these constraints:

1. Strategic Lens is not a top-level Settings dropdown.
2. It lives under Business Context -> Generated Defaults Review.
3. It reuses or adapts existing custom-section and metric-rule presets instead of creating a third taxonomy.
4. It shapes narrative structure, emphasis, starter questions, and section ordering.
5. It does not own materiality thresholds or metric polarity. Those stay under KPI behavior / Author Overrides.
6. It does not persist `activeStrategyId` or `activeStrategyParams` as peer fields in `PulseAiVisualSettings`.
7. Generated defaults must track per-field status: generated, accepted, author-overridden, source-review-required.
8. A deterministic adapter should project accepted defaults into legacy settings until the old settings model is retired.

Acceptance tests should prove:

- no new top-level strategy selector appears in Settings,
- changing Business Context recomputes generated defaults,
- author-overridden values are not overwritten by recomputation,
- strategy defaults are explainable from the selected pack/focus area,
- generated defaults retain source IDs and confidence.

## Implementation Backlog

### Phase 0 - Source Hardening Before UI

1. Add `validateBusinessContextProfile(profile, packSourceRegister)` as a pure validator.
2. Fail validation when any `sourceId` is absent from the pack source register.
3. Fail validation when `confidence === "sme-reviewed"` lacks an SME approval marker.
4. Fail validation when `citationMode === "off"` is used with external/domain claims.
5. Fail validation when a source tier is inconsistent with the claim category, for example GA4 event taxonomy used as ROAS authority.
6. Fail validation when thresholds are marked standard but lack a source or author override.
7. Update tests so they reject invented IDs and over-strong confidence.

### Phase 1 - Correct The Draft Content

1. Replace CPG `SC-001`, `SC-002`, `PROC-001`, `ESG-001`, and `ESG-002` with real source-register IDs or `SME REVIEW NEEDED`.
2. Keep CPG supply-chain/procurement thresholds as org-configurable defaults until reviewed.
3. Fix SaaS Metrics Standards Board URLs and source tiering.
4. Split SaaS SCI and PUE into separate references.
5. Reword SaaS metrics as operating metrics, not accounting standards.
6. Narrow GA4 to ecommerce event taxonomy in Retail.
7. Add appropriate packaging circularity/EPR sources or mark those claims illustrative.
8. Add explicit boundary/method notes for all carbon-intensity claims.

### Phase 2 - Runtime Provenance

1. Resolve source IDs into source-card metadata for the UI.
2. Carry per-generated-default provenance through `generatedDefaults.ts`.
3. Show source, tier, freshness, and review state in the Generated Defaults Review screen.
4. Block handoff if required source review is unresolved.
5. Keep `Refine this answer` scoped to the answer/session, not global context.

### Phase 3 - Strategic Lens As A Child Flow

1. Add lens suggestions only after Phase 0 and Phase 1 pass.
2. Make lens choice explainable from Business Context and selected outcome.
3. Project lens output through a typed adapter into current settings.
4. Do not expose a duplicate top-level lens selector.

## Recommended Product Copy

Use calmer, honest labels:

| Avoid | Use |
|---|---|
| SME reviewed | Draft / Author confirmed / SME reviewed |
| Governed by industry standards | Grounded in selected sources and org policy |
| GA4-backed ROAS/CAC/LTV | Uses GA4 ecommerce events; ROAS/CAC/LTV require marketing and finance data |
| SCI-backed PUE | PUE source: data-center efficiency; SCI source: software carbon intensity |
| SBTi-aligned actions | Mapped to SBTi-validated targets where present |
| Sustainability gauge | Token/session efficiency |
| Adjust setup | Refine this answer |

## Approval Decision

Approve:

- the two-user Viewer/Author model,
- one canonical Business Context owner,
- Generated Defaults Review as the place where authors accept or override defaults,
- token/session efficiency as a small Ask-adjacent education gesture,
- a future Strategic Lens child flow after source hardening.

Do not approve yet:

- `sme-reviewed` defaults,
- invented CPG source IDs,
- GA4 as authority for CAC/ROAS/LTV,
- SCI as authority for PUE,
- packaging circularity/EPR claims sourced only to GHG Scope 3,
- top-level Strategic Lens selectors,
- citation mode off for unknown/domain claims,
- tests that assert draft overclaims as expected behavior.

## Bottom Line

Rajesh's instinct is right: the experience should feel simple, streamlined, and trustworthy. The way to get there is not to hide the current multiplicity behind prettier cards. It is to make Business Context the parent, generated defaults the child, references the proof, and overrides the exception.

The next implementation slice should be "source hardening and validator first." After that, the progressive Settings experience can be built with confidence instead of carrying fragile trust claims into the UI.
