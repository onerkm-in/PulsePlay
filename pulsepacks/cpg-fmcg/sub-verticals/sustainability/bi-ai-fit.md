# Sustainability — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | ESG dashboards in Microsoft-anchored estates; Microsoft Sustainability Manager landing reports. |
| **Tableau** | Cross-functional sustainability dashboards composing data from multiple sources. |
| **Qlik** | Less common for sustainability today. |
| **Looker** | Lakehouse-first sustainability stacks; growing in greenfield deployments. |
| **Generic iframe** | Sustainability platforms (Sphera, Watershed, Persefoni, Greenstone, Workiva ESG, Microsoft Sustainability Manager) when their native UIs are the source of truth. |

## AI shape fit

The cross-cutting nature of sustainability questions makes the AI shape choice particularly important.

| Question type | Best shape | Why |
|---------------|------------|-----|
| Single-framework lookup ("what is GHG Protocol Scope 3 cat. 1?") | `chat-completion` over a vector store | Document retrieval over the framework corpus. |
| Single-source emissions trend | `conversation` | Multi-turn drill into the sustainability platform's certified data. |
| Cross-vertical synthesis (the canonical case) | `agent` | Multi-source decomposition: manufacturing for Scope 1, procurement for Scope 3 cat. 1, supply chain for cat. 4, etc. |
| Forward-projection / scenario | `agent` | Multi-input synthesis with explicit uncertainty. |

## Anti-patterns

- **Do not let the agent invent emission factors.** Emission factors come from canonical sources (IEA, eGRID, Defra, IPCC AR6) or supplier-specific disclosure. Agents that synthesise factors from prose will produce confident wrong answers.
- **Do not blend Scope 2 location-based and market-based numbers.** GHG Protocol Scope 2 Guidance requires both methods for disclosure, but they are not interchangeable. Always cite which is being shown.
- **Do not report Scope 3 totals without the data-quality breakdown.** A Scope 3 number computed mostly from spend-based proxies is materially less reliable than one computed from supplier-specific data; the data-quality scoring per GHG Protocol's hierarchy must accompany the total.
- **Do not let the agent finalise disclosure submissions.** CDP, GRI, CSRD, and SEC submissions are governance-heavy with attestation requirements; the agent supports preparation, humans submit.
- **Do not drop framework citations from answers.** Sustainability claims without a framework anchor are not auditable.

## Data architecture note

A trustable sustainability data fabric requires:

1. **Activity-based data** (energy meters, fuel volumes, water meters, waste tonnes, supplier-specific deliveries) wherever possible. Not financial-proxy-only.
2. **A maintained emission-factor library** with version control: which factor was used for which calculation in which year. Without this, year-on-year comparisons are unreliable.
3. **A multi-tier supplier-data fabric** for Scope 3 cat. 1 (purchased goods and services). Spend-based estimates are the GHG-Protocol-permitted fallback, but supplier-specific is the goal state.
4. **A reporting-boundary register**: which legal entities, which operational sites, which financial-control rules apply for the reporting boundary. Boundary changes are a frequent restatement cause.

## Validation references

- **GHG Protocol** — https://ghgprotocol.org/
- **GRI Standards** — https://www.globalreporting.org/standards/
- **SASB Standards (IFRS Foundation)** — https://sasb.ifrs.org/standards/
- **TCFD / IFRS S2** — https://www.fsb-tcfd.org/recommendations/ ; https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/ifrs-s2-climate-related-disclosures/
- **CSRD / EFRAG ESRS** — https://www.efrag.org/
- **CDP** — https://www.cdp.net/
- **SBTi** — https://sciencebasedtargets.org/
- **WRI Aqueduct** — https://www.wri.org/aqueduct
- **RE100** — https://www.there100.org/
