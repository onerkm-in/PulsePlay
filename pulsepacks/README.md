# PulsePacks

PulsePacks are vertical preset packs for PulsePlay. A pack bundles industry knowledge, sub-vertical templates, demo configurations, and authoritative references so that a team adopting PulsePlay can go from "we have a Genie space and a Power BI report" to "we have a working domain-aware AI assistant" in hours, not months.

## What is in this directory

```
pulsepacks/
  README.md                   # this file
  PACK_SPECIFICATION.md       # the manifest schema and authoring conventions every pack follows
  cpg-fmcg/                   # the first pack: Consumer Packaged Goods / Fast-Moving Consumer Goods
    pack.json                 # machine-readable manifest
    README.md                 # pack overview and sub-vertical index
    knowledge-base/           # glossary, references, ontology
    sub-verticals/            # one folder per sub-vertical (supply-chain, procurement, ...)
    demo-configs/             # ready-to-load BIPanel + AISidebar example configurations
    MIGRATION_NOTES.md        # what was scaffolded, what still needs SME input
```

Each pack is self-contained. Adding a new pack means adding a new top-level folder here and registering it from the playground (wiring is left for a subsequent cycle).

## How a pack is used at runtime

A future cycle will wire the playground UI to load a selected pack and:

1. Inject the pack's prompt context into the AI sidebar's system message.
2. Surface the pack's sample questions as suggested prompts in the sidebar.
3. Surface the pack's KPI definitions to the AI agent as tool-callable references.
4. Load demo BIPanel + AISidebar configurations from `demo-configs/` for one-click onboarding.
5. Expose the pack's glossary and ontology to the agent as retrieval-augmented context.

None of that wiring exists yet. This directory is the content substrate that the wiring will read.

## Authoring a pack

See [PACK_SPECIFICATION.md](PACK_SPECIFICATION.md) for the manifest schema, required files, content quality rules, and citation conventions.

The short version:

- Every pack has a `pack.json` manifest, a `README.md`, a `knowledge-base/` directory, and a `sub-verticals/` directory.
- Every sub-vertical has at least four files: `README.md`, `sample-questions.md`, `kpis.md`, and `bi-ai-fit.md`. Sub-verticals that need a strong system-prompt also include `prompt-context.md`.
- Authoritative external claims must cite a verifiable URL. Unverified URLs are marked `[unverified]`. No fabricated case studies, no made-up statistics, no hallucinated quotes.
- Sub-verticals where the pack author has limited domain expertise should include `<!-- SME REVIEW NEEDED: ... -->` markers in the relevant sections.

## Current packs

| Pack | Status | Industry focus |
|------|--------|----------------|
| [cpg-fmcg](cpg-fmcg/README.md) | v0.1.0 (scaffold) | Consumer Packaged Goods / Fast-Moving Consumer Goods |

## Contributing

PulsePacks is the layer where domain expertise lives. If you are an SME for a sub-vertical, the highest-leverage contribution is:

1. Reviewing the `sample-questions.md` for that sub-vertical and replacing weak questions with ones your team actually asks.
2. Reviewing the `kpis.md` for that sub-vertical and adding the formulas, refresh cadences, and standards your team uses.
3. Marking any `<!-- SME REVIEW NEEDED -->` block as resolved (or rewriting it).

PRs to packs do not need code review approval from a platform engineer; they need approval from someone who actually does the job in that sub-vertical.
