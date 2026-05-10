# Pack Specification (v0.1)

This document defines what a PulsePack is, what files it must contain, what conventions its content must follow, and what shape its manifest takes. Implementations of the playground that load packs read against this spec.

## Pack identity

A pack is identified by its directory name under `pulsepacks/`. Conventions:

- All-lowercase, hyphen-separated. Example: `cpg-fmcg`, `pharma-clinical`, `banking-retail`.
- The directory name must match the `name` field in `pack.json`.
- A pack name is permanent. Renaming a pack means publishing a new pack and deprecating the old one.

## Required files

```
<pack>/
  pack.json                       # required
  README.md                       # required
  knowledge-base/
    glossary.md                   # required
    references.md                 # required
    ontology.md                   # required
  sub-verticals/
    <sub-vertical>/
      README.md                   # required
      sample-questions.md         # required
      kpis.md                     # required
      bi-ai-fit.md                # required
      prompt-context.md           # optional but recommended
  demo-configs/
    README.md                     # required (index of configs)
    <demo>.json                   # at least one
  MIGRATION_NOTES.md              # required at v0.x; can be removed once pack reaches v1.0
```

## `pack.json` manifest schema

```jsonc
{
  // Stable machine-readable identifier. Must match the directory name.
  "name": "cpg-fmcg",

  // Human-readable display name.
  "displayName": "CPG / FMCG",

  // Semantic version of the pack. Bump on content changes.
  "version": "0.1.0",

  // One-paragraph description for the pack registry surface.
  "description": "Consumer Packaged Goods / Fast-Moving Consumer Goods preset pack...",

  // Industries the pack is intended for. Free-form labels; useful for filtering.
  "industries": ["food-beverage", "personal-care", "household", "consumer-health"],

  // Sub-verticals this pack ships. Each entry must correspond to a folder under sub-verticals/.
  "subVerticals": [
    {
      "name": "supply-chain",
      "path": "sub-verticals/supply-chain",
      "description": "Demand, inventory, OTIF, S&OP, control tower."
    }
    // ...
  ],

  // Cross-cutting overlays. These are sub-verticals that combine data from
  // multiple peer sub-verticals (e.g. sustainability touches manufacturing,
  // procurement, supply chain, HR, and finance).
  "crossCutting": ["sustainability"],

  // AI brain shapes the pack's content has been authored against.
  // Valid values: "chat-completion" | "conversation" | "agent" | "mcp"
  // - chat-completion: stateless single-turn (e.g. raw OpenAI completion)
  // - conversation:    multi-turn with server-managed memory (e.g. Genie spaces, Mosaic)
  // - agent:           tool-using planner (e.g. Mosaic Supervisor, LangGraph)
  // - mcp:             Model Context Protocol-aware client
  "aiCompatibility": ["conversation", "agent", "mcp"],

  // BI vendors the pack's demo configs target. Adapter folders under bi-adapters/
  // should exist for each.
  "biCompatibility": ["powerbi", "tableau", "qlik", "looker", "generic-iframe"],

  // Pointers into the knowledge base. Paths are relative to the pack root.
  "knowledgeBase": {
    "glossary": "knowledge-base/glossary.md",
    "references": "knowledge-base/references.md",
    "ontology": "knowledge-base/ontology.md"
  },

  // Authoritative external sources cited across the pack. The full bibliography
  // lives in knowledge-base/references.md; this is a curated short list for the
  // registry surface.
  "references": [
    {
      "label": "GS1 Digital Link",
      "url": "https://www.gs1.org/standards/gs1-digital-link",
      "scope": "product-identity"
    }
  ],

  // Maintainers. Empty array on first scaffold; populated when an owning team adopts.
  "maintainers": [],

  // ISO date of last meaningful content change. Bump alongside version.
  "lastUpdated": "2026-05-10"
}
```

## File-by-file conventions

### `README.md` (pack root)

- One-paragraph "what this pack is for".
- A table or bullet list of sub-verticals with a one-line description each.
- A "How to use this pack" section pointing at demo configs.
- A "Status and known gaps" section that is honest about what is scaffold vs. SME-validated.

### `knowledge-base/glossary.md`

- Alphabetical.
- Each entry: bold term, optional acronym expansion, one-sentence definition, source/standard where applicable.
- Cite a URL or a standards body for any term whose definition has a canonical source.
- Example:
  > **OEE (Overall Equipment Effectiveness)** — Availability x Performance x Quality, expressed as a percentage of theoretical maximum output. Source: TPM (Total Productive Maintenance) practice, embedded in ISO 22400 manufacturing KPI standard.

### `knowledge-base/references.md`

- Organised by sub-vertical or theme.
- Every entry: organisation, title, year, URL.
- Mark `[unverified]` next to any URL the author could not load successfully at authoring time.

### `knowledge-base/ontology.md`

- Domain entity model. Group entities by area (Product, Customer, Supply, Commercial, Manufacturing, Finance, Sustainability, etc.).
- Each entity: short description, key attributes, relationships to other entities.
- Use Markdown headings and bullet lists; ASCII relationship diagrams are fine.

### `sub-verticals/<x>/README.md`

- One-paragraph "what this sub-vertical covers".
- A "Why a CPG team uses this" section: the actual decisions a team in this seat makes.
- A "Typical data sources" section: ERP modules, planning tools, MES/WMS/TMS, retailer feeds, etc.
- A pointer at the cross-cutting overlays that touch this sub-vertical (e.g. sustainability).

### `sub-verticals/<x>/sample-questions.md`

- At least 10 questions a real practitioner in this seat would ask.
- Group by intent: descriptive ("what happened"), diagnostic ("why"), predictive ("what will"), prescriptive ("what should we do"), exploratory ("show me").
- For each question, indicate which AI shape can answer it (chat-completion / conversation / agent / mcp). A question that requires multi-step tool use should NOT be tagged chat-completion.
- No fabricated context numbers ("our service level dropped 4 points last week" is fine as a TEMPLATE for a question; "Acme Corp's service level dropped 4 points" is not).

### `sub-verticals/<x>/kpis.md`

- 5-10 canonical KPIs. Each KPI has:
  - Name (with acronym).
  - One-sentence definition.
  - Formula (where calculable; otherwise mark "definition-only").
  - Direction (higher-is-better / lower-is-better / target-band).
  - Authoritative source / standard.
  - Typical refresh cadence (real-time / hourly / daily / weekly / monthly).
- Cross-reference glossary entries.

### `sub-verticals/<x>/bi-ai-fit.md`

- Which BI surfaces typically host this sub-vertical's analytics in a CPG enterprise.
- Which AI shapes work for this sub-vertical's question types and why.
- Known anti-patterns. Example: "Do not use stateless chat-completion for OTIF root-cause questions; the agent will need at least three tool calls and short-term memory to traverse customer / lane / DC dimensions."

### `sub-verticals/<x>/prompt-context.md` (optional)

- A snippet that gets concatenated into the AI sidebar's system prompt when this sub-vertical is selected.
- Should be terse: 200-500 words. Long context degrades model performance and inflates token cost.
- No proprietary client names, no internal-only metric names. Use generic placeholders the runtime substitutes.

### `demo-configs/<x>.json`

- A loadable configuration the playground can import to produce a one-click demo.
- Must reference a `vendor` (Y-axis) and a `connector` (X-axis) that the playground knows.
- Must reference a `subVertical` from this pack.
- Include `metadata.scenario` describing what the demo proves.

## Content quality rules

These are non-negotiable:

1. **No fabricated case studies.** Do not write "a Fortune 500 beverage company saved 18%". Public case patterns from Gartner, Deloitte, KPMG, WEF Lighthouse Network, etc. are fine when cited; named-customer claims are not.
2. **No made-up statistics.** Every percentage, dollar figure, or count must be either (a) cited to a verifiable source or (b) clearly marked as illustrative ("for a hypothetical 50-DC network...").
3. **Real, verifiable URLs.** Where a URL cannot be verified at authoring time, mark `[unverified]` next to it.
4. **SME placeholders are explicit.** Where the author has limited domain expertise in a sub-vertical, insert `<!-- SME REVIEW NEEDED: <what needs review> -->` blocks. These are tracked in the pack's MIGRATION_NOTES.md.
5. **No emojis.** Plain Markdown. Code-style technical voice.
6. **No marketing voice.** "PulsePlay revolutionizes ..." prose belongs nowhere in a pack. State what the content is and what it covers.

## Versioning

- Pre-1.0 packs are scaffolds. Content may shift substantially between minor versions.
- 1.0 means at least one team has adopted the pack in production and the SME placeholders are resolved.
- Breaking schema changes to `pack.json` bump the spec major version, not the pack major version.

## Spec changelog

| Spec version | Date | Notes |
|---|---|---|
| 0.1 | 2026-05-10 | Initial scaffold. CPG-FMCG is the reference implementation. |
