# Manufacturing

The manufacturing seat covers plant performance, line efficiency, quality, maintenance, energy, and labour. CPG manufacturing is highly automated and increasingly instrumented; the analytics challenge is fusing MES / SCADA / quality / maintenance / energy / labour data into a unified view of plant health.

## What this sub-vertical covers

- **OEE and loss tree**: availability, performance, quality losses; changeover and micro-stops decomposition.
- **Yield and waste**: by batch, line, material, operator group, shift, recipe.
- **Predictive maintenance**: vibration, temperature, energy-signature, and historical-failure pattern matching.
- **Quality**: deviations, CAPA, batch genealogy, release decisions, customer complaint linkage.
- **Energy and water**: line-level intensity; sustainability cross-cutting feed.
- **Plant scheduling**: tied to demand, inventory, materials, labour, allergens, and changeover constraints.

## Why a CPG team uses this

- "Line 4 OEE dropped from 78% to 71% over 3 weeks. Where did the points go?"
- "Yield variance on recipe R is up. Material lot, line, operator, or recipe-parameter cause?"
- "Vibration signature on packer P12 is drifting. Open a maintenance work order or run to next planned changeover?"
- "Batch B failed release. What is the genealogy back to material lots, and which downstream batches share that genealogy?"
- "Plant schedule for next week — given the materials shortage on ingredient I, what is the lowest-cost-to-serve sequence that still hits the OTIF commitment?"

## Typical data sources

- **MES**: Siemens Opcenter, Rockwell FactoryTalk ProductionCentre, AVEVA MES, GE Digital Plant Apps, SAP ME / MII, Honeywell.
- **SCADA / DCS / PLC**: Siemens, Rockwell, ABB, Yokogawa, Honeywell, Emerson; OPC UA as the integration layer.
- **Quality / LIMS**: LabWare, STARLIMS, SAP QM.
- **Maintenance**: SAP PM, IBM Maximo, Infor EAM, Oracle eAM, Maintenance Connection.
- **Energy management**: Siemens Navigator, Schneider EcoStruxure, AVEVA, GE Digital, vendor-native plant systems.
- **Labour and shift**: Workday, Kronos / UKG, SAP SuccessFactors.
- **External**: WEF Global Lighthouse Network case patterns; ISA-95, ISO 22400 reference standards.

## Cross-cutting overlays

- **[Sustainability](../sustainability/README.md)**: Scope 1 (combustion, refrigerants), Scope 2 (purchased electricity, steam), water withdrawal / discharge, waste streams.
- **[HR](../hr/README.md)**: shift staffing, skills, safety incidents, fatigue.
- **[Procurement](../procurement/README.md)**: ingredient and packaging quality issues that originate upstream.
- **[Supply Chain](../supply-chain/README.md)**: production-plan adherence is the upstream feed of customer service.

## Sub-vertical contents

- [sample-questions.md](sample-questions.md)
- [kpis.md](kpis.md)
- [bi-ai-fit.md](bi-ai-fit.md)

## Notable industry context

The WEF Global Lighthouse Network publishes verified case patterns from advanced manufacturing sites that have demonstrated significant gains in productivity, lead time, waste, emissions, and defects through AI, IoT, digital twins, and workforce transformation. The 2025 round recognised 12 new sites; the 2026 round recognised 23 more and launched an AI platform for industrial transformation. These case patterns are valuable as evidence of what is possible at scale — they are not customer-name-attributed claims about PulsePlay deployments. See:
- https://www.weforum.org/press/2025/09/global-lighthouse-network-2025-world-economic-forum-recognizes-12-new-sites-driving-holistic-transformation-in-manufacturing/
- https://www.weforum.org/press/2026/01/global-lighthouse-network-recognizes-23-new-sites-launches-ai-platform-for-industrial-transformation-89a7334dcb/
