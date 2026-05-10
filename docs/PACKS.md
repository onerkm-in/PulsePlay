# PulsePlay Packs

> **Brief overview of the pack architecture.** Detailed pack specification lives in `pulsepacks/PACK_SPECIFICATION.md` (Agent 2's work). This doc explains what packs are, why we have them, and how they fit into PulsePlay.

## What is a pack

A **PulsePack** is a vertical / domain-specific bundle that pre-configures PulsePlay for a particular industry or function. Examples:

- `pulsepacks/cpg-fmcg/` — Consumer Packaged Goods / Fast-Moving Consumer Goods. Pre-built domain agents for trade promotion, demand planning, retail execution, supply chain, finance close. Reference dashboards. Curated metric definitions.
- `pulsepacks/manufacturing/` — Plant operations (OEE, downtime, quality), batch genealogy, supplier risk, ISA-95-aware OT/IT integration.
- `pulsepacks/financial-services/` (potential) — Risk, compliance, customer 360, treasury.

Each pack is a self-contained directory bundling:

| Element | Purpose |
|---|---|
| Domain agents (LangGraph specs) | Pre-built reasoning for the vertical's standard questions |
| Connector profile templates | Common backend wirings (e.g., "Genie space for sales, Foundation Model for narrative") |
| Reference dashboards | Sample BI artifacts the user can load to demo |
| Prompt templates | Versioned, vertical-tuned prompts |
| Validator rule overrides | Section schemas that match the vertical's reporting conventions |
| Vocabulary / glossary | Industry-standard term definitions for the AI to reference |
| Demo / golden-question sets | Eval suite seeds |
| README | What this pack is, who it's for, how to deploy |

## Why pack architecture

**Without packs:** every customer of PulsePlay reinvents the same vertical setup. CPG team spends 3 weeks defining trade-promotion metrics. Manufacturing team spends 3 weeks setting up OEE prompts. Each ad hoc, inconsistent, hard to share.

**With packs:** one curated, vetted, vertical-specific configuration that anyone in the org's CPG business unit (or manufacturing, or whatever) can drop in. Consistent metric definitions. Curated golden questions. Pre-tested validator rules. Compounds value.

**Pack architecture also makes inner-source work** — a different team in the org maintains a pack independently, syncs it to the central PulsePlay registry, and shares improvements with everyone using that pack.

## How to use a pack

```powershell
# 1. Pick a pack from pulsepacks/
ls D:\Working_Folder\Projects\PulsePlay\pulsepacks\

# 2. Activate it via env var or proxy config
$env:PULSEPLAY_PACK = "cpg-fmcg"
node proxy/server.js

# 3. The proxy auto-loads:
#    - Pack's connector profile templates (merged with proxy/config.json)
#    - Pack's prompt templates
#    - Pack's validator rules
#    - Pack's domain agents (if Mosaic AI Supervisor is configured)

# 4. The playground auto-discovers:
#    - Pack's reference dashboards (via /assistant/pack/dashboards endpoint)
#    - Pack's golden questions (via /assistant/pack/questions endpoint, if eval suite is wired)
```

The pack contract is documented in `pulsepacks/PACK_SPECIFICATION.md`.

## Pack governance

For internal-org packs:

- One pack per business vertical (CPG, manufacturing, finance, etc.)
- Owned by the team that uses the pack the most
- Sync upstream changes from PulsePlay core into the pack on every minor version
- Lint pack against the spec on commit (validator rules valid, prompts well-formed, agents deployable)

For (future) public packs:

- Pack registry / discovery (see [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md))
- Conformance suite each pack must pass
- Versioned pack contract (semver) with backward-compat support window

## Status

The first pack — `pulsepacks/cpg-fmcg/` — is being seeded by Agent 2 from the [inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md](inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md) reference doc. Until that lands, there are no functional packs in the repo. PulsePlay v0.1 ships without packs; v0.2 / v0.3 will ship with the first one.

## Related docs

- `pulsepacks/PACK_SPECIFICATION.md` — the contract every pack implements (Agent 2)
- `pulsepacks/cpg-fmcg/README.md` — the first reference pack (Agent 2)
- [inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md](inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md) — the blueprint Agent 2 is working from
- [ARCHITECTURE.md](ARCHITECTURE.md) — how packs plug into the proxy and the playground
- [ROADMAP.md](ROADMAP.md) — first pack live is a v0.3 milestone
