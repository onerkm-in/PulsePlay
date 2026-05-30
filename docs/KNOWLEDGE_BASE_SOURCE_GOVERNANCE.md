# Knowledge Base Source Governance

> **Status:** Planning and authoring baseline, 2026-05-16.
>
> **Purpose:** Make every Knowledge Base module auditable. A reviewer should be able to see who authored a claim, what source supports it, how credible that source is, when it was reviewed, and whether the content is safe to use in Chat, AI Insights, retrieval, or prompt generation.

## Scope

This applies to all current Knowledge Base modules:

- PulsePack manifest: `pack.json`
- Pack overview: `README.md`
- Pack-level knowledge: `knowledge-base/glossary.md`, `ontology.md`, `references.md`
- Sub-vertical modules: `README.md`, `kpis.md`, `bi-ai-fit.md`, `sample-questions.md`, `prompt-context.md`, `prompt-ir.yaml`
- Demo modules: `demo-configs/README.md`, `demo-configs/*.json`
- Migration and review state: `MIGRATION_NOTES.md`
- Cross-cutting guidance docs: [AI_CONTEXT_CONFIGURATION_MODEL.md](AI_CONTEXT_CONFIGURATION_MODEL.md), [CHAT_VISUALIZATION_KNOWLEDGE_BASE.md](CHAT_VISUALIZATION_KNOWLEDGE_BASE.md)

## Source Register Model

Each pack should have one source register, currently `knowledge-base/references.md`. Future implementation can add `knowledge-base/source-register.yaml` for machine-readable validation while preserving the Markdown bibliography for humans.

Every source card should carry:

```yaml
sourceId: "GS1-GTIN"
title: "GS1 barcodes and identification standards"
publisher: "GS1"
authors: ["GS1 standards body"]
sourceType: "standard"
url: "https://www.gs1.org/standards/barcodes"
publishedAt: null
lastVerifiedAt: "2026-05-16"
verifiedBy: "PulsePlay author"
credibilityTier: "tier-1-standard"
licenseOrUsageNote: "Cite only; do not copy controlled standard text."
appliesTo:
  - "glossary"
  - "ontology"
  - "kpis"
claimsSupported:
  - "Product identifiers such as GTIN, GLN, and SSCC"
stalenessPolicy: "review-annually"
notes: "Official standards source. Some detailed specifications may require GS1 membership or controlled access."
```

## Credibility Tiers

| Tier | Use | Examples | Runtime posture |
|---|---|---|---|
| `tier-1-standard` | Standards, regulations, official specs | GS1, ISO, IEC/ISA, W3C/WCAG, GHG Protocol, IFRS/ISSB, NIST, OWASP | Strong support for definitions, compliance rules, accessibility, security, and governance. |
| `tier-2-official-product` | Vendor product behavior and capabilities | Microsoft Learn, Databricks docs, AWS docs, OpenAI docs, Tableau Help | Strong support for what a platform supports today; refresh frequently. |
| `tier-3-research` | Peer-reviewed or named-author research | Cleveland/McGill, Vega-Lite paper, academic or industry research with named authors | Strong support for design principles and tradeoffs, not product capability claims. |
| `tier-4-industry-analysis` | Analyst, consulting, market, and industry bodies | Gartner, Deloitte, KPMG, WEF, NielsenIQ, Circana, ASCM, RILA | Useful for trends, examples, and framing. Do not use alone for precise runtime behavior. |
| `tier-5-internal-sme` | Internal domain knowledge | Business SMEs, data stewards, platform teams | Valid inside the enterprise when owner and review date are explicit. |
| `tier-6-illustrative` | Synthetic examples and demo assumptions | Demo configs, sample data, hypothetical scenarios | Never present as fact. Must be labeled illustrative. |

## Module Requirements

| Module | What it contains | Required provenance | Claims that need citation | Minimum review owner |
|---|---|---|---|---|
| `pack.json` | Manifest, compatibility, short references | Pack owner, maintainers, `lastUpdated`, curated source list with source IDs | Compatibility, industry scope, official-source claims | Pack maintainer |
| Pack `README.md` | Human overview and scope | Author/owner, review status, source IDs for scope claims | Industry scope, sub-vertical descriptions, "why teams use this" | Pack maintainer + SME |
| `knowledge-base/references.md` | Source register | Full source cards: publisher, author/body, URL, date, tier, verification date | Every external source claim | Pack maintainer |
| `knowledge-base/glossary.md` | Definitions and acronyms | Source IDs per canonical term or term group | Standards terms, formulas, regulated vocabulary, vendor-specific product terms | Domain SME |
| `knowledge-base/ontology.md` | Entities and relationships | Source IDs for standards-based entities and model assumptions | Entity definitions, relationships, hierarchy, identifier semantics | Data architect + SME |
| Sub-vertical `README.md` | Scope, decisions, data sources | Source IDs for external/process claims; SME marker for internal process claims | "Typical data sources", process names, decision responsibilities | Sub-vertical SME |
| `kpis.md` | KPI definitions, formulas, direction, cadence | Source IDs per KPI; confidence; formula authority; review date | Formulas, directionality, target bands, cadence norms | Domain SME + data steward |
| `bi-ai-fit.md` | BI and AI shape recommendations | Source IDs for vendor capability claims; rationale for local assumptions | "Power BI supports", "Databricks supports", "agent needed", anti-patterns | Solution architect |
| `sample-questions.md` | Golden questions by intent | Source IDs for domain tasks where external; SME marker for internal tasks | Regulated or process-specific question patterns | Domain SME |
| `prompt-context.md` | Prompt grounding snippets | Source IDs for all durable claims; no unsourced statistics | Business rules, definitions, model limitations, instructions | Prompt owner + SME |
| `prompt-ir.yaml` | Structured prompt contract | Source IDs or profile IDs for rules used by middleware | Required sections, output shape, evidence policy | Prompt owner |
| `demo-configs/*.json` | Loadable scenarios | `sourceIds`, `scenarioType`, `illustrative` flag, owner | Any business result, benchmark, or quantified outcome | Demo owner |
| `MIGRATION_NOTES.md` | Scaffold and review gaps | Gap owner, expected source type, review blocker | Open SME gaps and unverifiable claims | Pack maintainer |
| AI context model | Domain profile architecture | Source IDs for governance, RAG, and product capability claims | Runtime/source-of-truth claims | Architecture owner |
| Chat visualization KB | Chart selection and migration rules | Source IDs per rule family; named research/source register | Chart capability, accessibility, perceptual claims | UX/data-viz owner |

## Module Header Template

Markdown modules should start with a short audit block:

```markdown
> **Owner:** CPG/FMCG pack maintainers
> **Author:** PulsePlay scaffold, SME review pending
> **Last reviewed:** 2026-05-16
> **Source register:** `knowledge-base/references.md`
> **Source IDs:** `GS1-GTIN`, `ISO-22400`, `GHG-PROTOCOL`
> **Confidence:** draft | reviewed | SME-approved
```

YAML or JSON modules should carry equivalent machine-readable fields:

```yaml
provenance:
  owner: "CPG/FMCG pack maintainers"
  author: "PulsePlay scaffold"
  lastReviewed: "2026-05-16"
  confidence: "draft"
  sourceIds:
    - "GS1-GTIN"
    - "ISO-22400"
  reviewNotes:
    - "SME validation required before production use."
```

## Claim-Level Citation Rule

Use short source IDs inline when a module makes a durable claim:

```markdown
- **GTIN** - A GS1 product identifier used to identify trade items. Source: `GS1-GTIN`.
- **OEE** - Availability x Performance x Quality. Source: `ISO-22400`; SME review required for local formula variants.
```

If a claim is a PulsePlay design decision rather than an external fact, say so:

```markdown
- PulsePlay treats Chat visualization rules as Knowledge-plane guidance, not renderer code. Source: `PULSEPLAY-ARCHITECTURE`; internal design decision.
```

## Runtime Metadata Additions

The Knowledge Base runtime contracts should eventually carry source accountability directly:

```typescript
type SourceConfidence = "draft" | "reviewed" | "sme-approved" | "deprecated";
type CredibilityTier =
    | "tier-1-standard"
    | "tier-2-official-product"
    | "tier-3-research"
    | "tier-4-industry-analysis"
    | "tier-5-internal-sme"
    | "tier-6-illustrative";

interface KnowledgeSourceCard {
    sourceId: string;
    title: string;
    publisher: string;
    authors: string[];
    sourceType: "standard" | "official-doc" | "research" | "industry-analysis" | "internal-sme" | "demo";
    uri?: string;
    publishedAt?: string;
    lastVerifiedAt: string;
    credibilityTier: CredibilityTier;
    licenseOrUsageNote?: string;
    claimsSupported: string[];
}

interface KnowledgeClaimProvenance {
    sourceIds: string[];
    owner: string;
    author?: string;
    lastReviewedAt: string;
    confidence: SourceConfidence;
    claimType: "definition" | "formula" | "capability" | "recommendation" | "example" | "design-decision";
}
```

## External Governance Sources

| Source ID | Source | Publisher / author | Why it matters |
|---|---|---|---|
| `DBX-VECTOR-SEARCH` | [Databricks Vector Search](https://docs.databricks.com/en/generative-ai/vector-search.html) | Databricks documentation team | Official Databricks source for vector search, hybrid search, filters, reranking, Unity Catalog alignment, and ACL posture. |
| `AZURE-RAG` | [RAG and Generative AI in Azure AI Search](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview) | Microsoft Learn / Azure AI Search documentation team | Official Microsoft source for RAG architecture and hybrid keyword/vector retrieval. |
| `AZURE-HYBRID-SEARCH` | [Hybrid search in Azure AI Search](https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview) | Microsoft Learn / Azure AI Search documentation team | Official Microsoft source for combined vector and keyword retrieval plus filtering/semantic ranking posture. |
| `BEDROCK-KB` | [Retrieving information from data sources using Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-how-retrieval.html) | AWS documentation team | Official AWS source for Retrieve, RetrieveAndGenerate, source chunks, citations, and reranking. |
| `OPENAI-FILE-SEARCH` | [OpenAI File Search](https://platform.openai.com/docs/guides/tools-file-search/) and [Vector stores API](https://platform.openai.com/docs/api-reference/vector-stores/search) | OpenAI documentation | Official OpenAI source for file search/vector store behavior and search API posture. |
| `NIST-AI-RMF` | [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) and [Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) | NIST | Government standards body guidance for AI risk, governance, measurement, and accountability. |
| `OWASP-LLM` | [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | OWASP Foundation | Application security guidance for prompt injection, sensitive information disclosure, supply-chain risks, and agent/tool risks. |
| `W3C-PROV-DM` | [PROV-DM: The PROV Data Model](https://www.w3.org/TR/prov-dm/) | W3C Recommendation; editors Luc Moreau and Paolo Missier | Standards-body model for entities, activities, agents, derivation, attribution, and provenance chains. |
| `DUBLIN-CORE` | [Dublin Core Metadata Element Set](https://www.dublincore.org/specifications/dublin-core/dces/) | Dublin Core Metadata Initiative | Metadata vocabulary for creator, publisher, source, rights, date, and related audit metadata. |
| `W3C-WCAG-COLOR` | [WCAG 2.2 use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) | W3C Web Accessibility Initiative | Standards-body rule for not using color as the only channel of meaning. |
| `PBI-VISUALS` | [Power BI visualizations overview](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview) | Microsoft Learn / Power BI documentation team | Official Power BI source for native visual families, AI visuals, cross-filtering, drillthrough, and visual interactions. |
| `TABLEAU-CHARTS` | [Choose the Right Chart Type for Your Data](https://help.tableau.com/current/pro/desktop/en-us/what_chart_example.htm) | Salesforce/Tableau Help | Official Tableau chart-choice guidance organized by analytical question and data properties. |
| `DBX-AIBI-VISUALS` | [AI/BI dashboard visualization types](https://docs.databricks.com/aws/en/dashboards/manage/visualizations/types) | Databricks documentation team | Official Databricks AI/BI visual catalog and surface capability source. |

## Reviewer Workflow

1. Open the module header and verify owner, author, review state, and source register path.
2. Open the source register entry for each source ID used by the module.
3. Confirm the source tier matches the claim type. Example: formulas should come from standards/SME approval, not only analyst trend reports.
4. Check that product capability claims are tied to official vendor docs and have a recent `lastVerifiedAt`.
5. Check that runtime-adjacent modules (`prompt-context.md`, `prompt-ir.yaml`, chart rules, retrieval profiles) do not smuggle unsourced policy into system prompts.
6. If a claim is useful but unsourced, mark it `SME REVIEW NEEDED` instead of deleting it silently.
7. If source text is paywalled or membership-gated, record the limitation and cite only what was actually reviewed.

## Suggested Pack Linter Rules

| Rule ID | Check |
|---|---|
| `KB-SRC-001` | Every pack has `knowledge-base/references.md`. |
| `KB-SRC-002` | Every source entry has a stable source ID, publisher, URL or access note, credibility tier, and last verification date. |
| `KB-SRC-003` | Every Markdown module has an audit header. |
| `KB-SRC-004` | Every KPI formula has at least one source ID or `SME REVIEW NEEDED`. |
| `KB-SRC-005` | Every prompt context / prompt IR file has provenance metadata before runtime use. |
| `KB-SRC-006` | Every demo config declares `illustrative` and `noRealCustomerClaim`. |
| `KB-SRC-007` | Product capability claims cite official product docs. |
| `KB-SRC-008` | Accessibility/chart-color claims cite W3C/WCAG or approved accessibility source. |
| `KB-SRC-009` | Analyst/consulting sources cannot be the only authority for formulas, compliance obligations, or product capabilities. |
| `KB-SRC-010` | Deprecated or stale sources raise a warning in Knowledge UI and Chat provenance output. |

## Current CPG/FMCG Pack Assessment

| Area | Current state | Required next hardening |
|---|---|---|
| Source list | `knowledge-base/references.md` has a broad bibliography. | Convert bibliography entries to source cards with source IDs, publisher, source date, verification date, and tier. |
| Glossary | Definitions exist, but source IDs are not uniformly present. | Add source IDs per canonical term group. |
| Ontology | Domain model exists, but relationship provenance is not explicit. | Mark standard-derived entities vs PulsePlay modeling assumptions. |
| KPIs | KPI files carry formulas/directions, but source traceability is inconsistent. | Add source IDs, confidence, and SME review status per KPI. |
| BI/AI fit | Useful guidance exists, but vendor capability claims need source IDs. | Cite official vendor docs or mark as internal architecture assumption. |
| Sample questions | Practical prompts exist. | Mark source as SME/internal pattern, external process source, or illustrative. |
| Prompt context / IR | Runtime shape exists. | Add provenance fields before these become middleware authority. |
| Demo configs | Demo scenarios exist. | Add `illustrative: true`, `sourceIds`, and "no real customer claim" policy. |

## Implementation Sequence

1. Keep `references.md` as the human source register for v0.x.
2. Add source IDs to `references.md` entries before converting every module.
3. Add module header audit blocks to pack-level and sub-vertical Markdown files.
4. Add `provenance` blocks to `prompt-ir.yaml` and demo JSON.
5. Add a pack linter that checks every KPI, prompt rule, chart rule, and external claim has at least one source ID or `SME REVIEW NEEDED`.
6. Add Knowledge UI provenance badges: source tier, last reviewed, owner, and "SME-approved" status.
7. Later, persist source cards in a machine-readable `source-register.yaml` and render Markdown from it.
