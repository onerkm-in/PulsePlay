# PulsePlay — Market & Standards Strategic Research

> **Audience:** PulsePlay project team (engineering, product, security)
> **Horizon:** Reference doc for the next 6 months (May 2026 → Nov 2026)
> **Date compiled:** 2026-05-10
> **Status:** v1.0
>
> This document is **external-facing strategic research**. It is not a marketing brief, not a roadmap, and not a sales deck. Where competitive realities are uncomfortable, they are stated plainly.
>
> **Sourcing rule applied:** every non-trivial claim is hyperlinked to a verifiable URL. Where a claim could not be verified end-to-end (e.g., adoption percentages from a single industry blog), it is marked `[unverified]` or accompanied by the qualifier "as reported by". Forecasts from analyst firms are cited with the firm name so you can decide whether to trust them.
>
> **Last note before the body:** PulsePlay's defining bet is that the **AI brain (X-axis)** and the **BI vendor (Y-axis)** are independent dimensions, both swappable, both pluggable. The single most important takeaway from this research — call it now so the reader doesn't miss it — is that **the X-axis is converging on Model Context Protocol (MCP)** as a de-facto standard, and **every competitor in section 1 has shipped or announced an MCP server in the last 12 months**. PulsePlay should treat MCP as a first-class connector type from v1.0 forward. Section 9 unpacks this in detail.

---

## Table of contents

1. [Competitive landscape — AI over BI](#1-competitive-landscape--ai-over-bi)
2. [Connector platform patterns — what we should learn from](#2-connector-platform-patterns--what-we-should-learn-from)
3. [AI agent connector standards — the X-axis future](#3-ai-agent-connector-standards--the-x-axis-future)
4. [Enterprise standards mapping](#4-enterprise-standards-mapping)
5. [Embed SDK patterns — what best-in-class looks like](#5-embed-sdk-patterns--what-best-in-class-looks-like)
6. [License recommendations](#6-license-recommendations)
7. [Demo strategy patterns](#7-demo-strategy-patterns)
8. [Cautionary tales — what's killed similar platforms](#8-cautionary-tales--whats-killed-similar-platforms)
9. [The "MCP everything" hypothesis](#9-the-mcp-everything-hypothesis)
10. [Strategic synthesis](#10-strategic-synthesis)
11. [Appendix A — Source index](#appendix-a--source-index)

---

## 1. Competitive landscape — AI over BI

This section catalogues every shipping AI-over-BI offering as of May 2026 we could verify. Format per player: positioning → AI capabilities → BI scope → open-source posture → governance/security → "any AI" stance → links → honest assessment vs PulsePlay.

The macro picture: **every major BI vendor has (a) shipped a chat assistant, (b) shipped or announced an agentic experience, and (c) added an MCP server** in the last 18 months. Differentiation today is not whether the vendor "has AI" — it is whether you are locked into their AI brain or can swap it. **None** of the major incumbents lets you fully replace the AI brain with a third party while keeping their BI surface. PulsePlay's wedge is exactly there.

### 1.1 Microsoft Power BI Copilot + Microsoft Fabric AI

**Positioning.** Copilot in Power BI is the in-product chat assistant; Fabric Data Agents is the cross-source agentic experience that sits on Lakehouses, Warehouses, semantic models, KQL, ontologies, and Microsoft Graph. Microsoft has consolidated AI consumption into "Fabric Copilot Capacity," meaning all Copilot usage in PBI Desktop, Pro, and PPU now bills against a single capacity SKU.

**AI capabilities.** Chat (in-report and standalone), DAX generation, summarization, narrative generation, mobile in-report follow-up Q&A. Standalone Copilot was promoted in 2025 and now can reason across any report/semantic model/data agent the user has access to. The character limit of the Copilot prompt was raised from 500 to 10K in early 2026 across all surfaces (Standalone, Report pane, Apps, Mobile, Embed).

**BI scope.** Single-vendor (Microsoft) — Power BI + Fabric only.

**Open-source posture.** Closed.

**"Any AI" stance.** Microsoft. Period. Copilot is wired to Azure OpenAI; you do not get to swap in Claude or Bedrock. That said, Microsoft has been the **most aggressive** mainstream incumbent in adopting MCP — they shipped the official C# SDK for MCP in partnership with Anthropic, and Copilot Studio integrates MCP servers as of mid-2025.

**Governance / security.** Tenant-level admin controls, integration with Purview for data labelling, audit logs in M365 Compliance Center.

**Sources.**
- [Overview of Copilot in Fabric — Microsoft Learn](https://learn.microsoft.com/en-us/fabric/fundamentals/copilot-fabric-overview)
- [Copilot for Power BI overview](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction)
- [Power BI February 2026 Feature Summary](https://powerbi.microsoft.com/en-us/blog/power-bi-february-2026-feature-summary/)
- [Microsoft partners with Anthropic on official C# SDK for MCP](https://developer.microsoft.com/blog/microsoft-partners-with-anthropic-to-create-official-c-sdk-for-model-context-protocol)

**Honest assessment vs PulsePlay.** Microsoft owns the lion's share of installed BI seats, and their AI product is genuinely improving fast. PulsePlay does **not** out-feature Copilot at chat-with-this-report. PulsePlay's wedge against Microsoft is: (i) you can keep Power BI as the visualisation layer but use Claude / Bedrock / Databricks Genie / a private model as the brain — Microsoft will not let you do this; (ii) you can show Power BI **and** Tableau side-by-side under the same assistant — Microsoft will not do this; (iii) you can host PulsePlay on infrastructure that does not transit data through Microsoft Cognitive Services — relevant for regulated customers.

### 1.2 Tableau Pulse / Tableau Agent (Salesforce)

**Positioning.** Tableau Pulse is the metric-monitoring + summary product. Tableau Agent is the broader chat / dashboard-narrative / vetted-allowlist agent. "Pulse for Salesforce" was wound down for net-new sales as of August 1, 2025; the strategic forward direction is **Tableau Next**, the agentic analytics platform integrated with the Salesforce Platform.

**AI capabilities.** Enhanced Q&A with geo-aware LLM routing through the Einstein GPT Gateway (Azure OpenAI under the hood); cross-source correlation insights; dashboard narratives that summarise visualisations; admin-set semantic-model allowlists per agent; PowerPoint/Word screenshot-with-refresh integration.

**BI scope.** Single-vendor (Tableau).

**Open-source posture.** Closed.

**"Any AI" stance.** Einstein GPT Gateway → Azure OpenAI. Customers do not pick the model. Tableau has not (publicly, as of May 2026) shipped MCP server support comparable to Qlik / Sigma / ThoughtSpot.

**Governance / security.** Inherits Salesforce trust layer; data residency via geo-routed LLM calls.

**Sources.**
- [About Tableau Pulse — Tableau Help](https://help.tableau.com/current/online/en-us/pulse_intro.htm)
- [Tableau Pulse Now Available — Salesforce News](https://www.salesforce.com/news/stories/tableau-pulse-general-availability-news/)
- [Tableau April 2026 New Features](https://www.tableau.com/products/new-features)
- [Salesforce sunsets Pulse for Salesforce as standalone — Salesforce Ben](https://www.salesforceben.com/practical-guide-to-deploying-your-first-tableau-pulse/)

**Honest assessment vs PulsePlay.** Tableau has the best embedded-analytics SDK in the industry (Embedding API v3 with `<tableau-viz>` web component — see Section 5). Their AI is solid but locked into Einstein. PulsePlay's wedge: keep Tableau as the canvas, swap the AI freely, and add MCP-based agent-to-agent flows that Tableau Agent does not currently expose to third-party agents.

### 1.3 ThoughtSpot — Sage / Spotter / Spotter Semantics

**Positioning.** ThoughtSpot was the original "search for analytics" company. Sage was the LLM-powered search interface. In 2024-2025, Sage was rebranded into the **Spotter** family: SpotterViz (build dashboards), SpotterModel (build semantic models), SpotterCode (embedded analytics codegen), and Spotter Core (the analytical reasoning agent). Spotter 3 (announced 2025) added forecasting + Python execution.

**AI capabilities.** Agentic reasoning with self-checking; structured + unstructured data blending; forecasting; Python execution; March 2026 announced **Spotter Semantics** — an "agentic semantic layer" intended as the trusted layer for AI agents.

**BI scope.** Single-vendor (ThoughtSpot Cloud / Analyst Studio, the latter inherited from Mode Analytics acquisition in 2023).

**Open-source posture.** Closed.

**"Any AI" stance.** **Most pluralist of the BI incumbents.** ThoughtSpot launched the **ThoughtSpot Agentic MCP Server** in July 2025, explicitly positioning ThoughtSpot data as available to Claude / ChatGPT / Gemini / internal LLMs. This is the closest any BI vendor has come to PulsePlay's "any AI" stance — but only on the Y-axis side (TS data, any AI). They do not surface other vendors' BI canvases.

**Sources.**
- [Spotter | The most trusted enterprise agent for analytics](https://www.thoughtspot.com/product/agents/spotter)
- [ThoughtSpot Introduces Spotter Semantics — March 2026](https://www.thoughtspot.com/press-releases/thoughtspot-introduces-spotter-semantics-to-bring-trust-and-context-to-enterprise-ai)
- [ThoughtSpot Launches Agentic MCP Server — July 2025](https://www.globenewswire.com/news-release/2025/07/29/3123286/0/en/thoughtspot-redefines-ai-interoperability-with-launch-of-thoughtspot-agentic-mcp-server.html)
- [ThoughtSpot acquires Mode Analytics — Press release](https://www.thoughtspot.com/press-releases/thoughtspot-completes-200m-acquisition-of-mode-analytics)

**Honest assessment vs PulsePlay.** ThoughtSpot is the philosophical closest cousin to PulsePlay. They fundamentally agree the AI side should be plural. Where PulsePlay differs: TS is a single-vendor BI surface; PulsePlay is multi-BI. ThoughtSpot is also commercial; PulsePlay is open-source. **The strategic risk:** ThoughtSpot could ship a "BI federation" feature for their MCP server that adapter-ifies other BI tools through ThoughtSpot's lens. Watch this carefully.

### 1.4 Looker / Looker Studio — Gemini in Looker

**Positioning.** Google's BI play. Looker Studio is the freemium tool, Looker Studio Pro is the paid tier, Looker Cloud Core is the enterprise governance + semantic-model platform. Gemini-in-Looker is the assistant.

**AI capabilities.** Conversational Analytics (NL → chart/table); calculated-field generation; component import into Slides; experimental Code Interpreter that translates NL → Python for forecasting / anomaly detection / advanced viz.

**BI scope.** Single-vendor (Google).

**Open-source posture.** Closed.

**"Any AI" stance.** Gemini. Pinned tightly to Google's model family.

**Governance / security.** Looker has long had a strong governance story (LookML semantic model, signed embedding) — the Gemini integration inherits the LookML model's permissioning.

**Sources.**
- [Gemini in Looker overview — Google Cloud](https://docs.cloud.google.com/looker/docs/gemini-overview-looker)
- [Gemini in Looker for Looker Studio overview](https://docs.cloud.google.com/looker/docs/studio/gemini-overview-looker-studio)
- [Looker AI features 2025-2026 — Querio](https://querio.ai/articles/looker-ai-features-natural-language-query-gemini-2025-2026)

**Honest assessment vs PulsePlay.** Looker is mid-pack on AI ambition — Gemini integration is solid but conservative. The strong LookML semantic layer is a differentiator that PulsePlay should respect (don't try to replace it; consume it). PulsePlay's wedge: pull Looker dashboards into a host alongside Power BI / Tableau / Qlik with one assistant on top.

### 1.5 Sigma — Sigma AI

**Positioning.** Spreadsheet-style cloud analytics. Late-2025 product launch leaned hard into AI Apps + agentic.

**AI capabilities.** AI Query (warehouse-LLM-call inside formula bar — Snowflake/Databricks/BigQuery/Redshift); AI Builder (private beta, conversational app construction); Explain Viz; Formula Assistant; **MCP Client + MCP Server** support; Snowflake Cortex Agents integration.

**BI scope.** Single-vendor (Sigma).

**Open-source posture.** Closed.

**"Any AI" stance.** Genuinely plural. As MCP Client, Ask Sigma + AI Builder can pull from Google Drive / Confluence / GitHub / custom MCP servers. As MCP Server, Sigma assets are exposed to Claude / ChatGPT / internal agents. This is one of the **most pluralist commercial postures** in the market.

**Sources.**
- [AI-Powered Apps and Insights: Sigma Dec. 2025 Product Launch](https://www.sigmacomputing.com/blog/december-2025-product-launch)
- [Sigma AI Toolkit — product page](https://www.sigmacomputing.com/product/ai)
- [Sigma Computing intros array of new AI tools — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366630504/Sigma-Computing-intros-array-of-new-AI-analytics-tools)

**Honest assessment vs PulsePlay.** Sigma is, today, ahead of where PulsePlay is on MCP-server-of-BI-content. Their wedge is the Snowflake-native compute model. PulsePlay does not directly compete — Sigma's customer is "we run on Snowflake and want sheets-style apps." PulsePlay's customer is "we run multiple BI tools and want one AI experience over all of them."

### 1.6 Hex — Hex Magic / Notebook Agent

**Positioning.** Notebook-first analytics workspace. Closer to a Jupyter + dashboard hybrid than a classical BI tool, but lives in the same buyer's wallet.

**AI capabilities.** Hex Magic (debug, code interpretation), Notebook Agent (NL-driven analysis with full project + warehouse-schema context), Threads (conversational), Semantic Model Agent. Fall 2025 launch added agents-for-analytics specifically.

**BI scope.** Single-vendor (Hex).

**Open-source posture.** Closed. Raised $70M in May 2025 — well-funded private.

**"Any AI" stance.** Mostly opinionated. Uses leading LLMs under the hood; not as MCP-forward as Sigma/Qlik.

**Sources.**
- [AI in Hex — Learn](https://learn.hex.tech/docs/getting-started/ai-overview)
- [Fall 2025 Launch: Agents, for analytics, for teams](https://hex.tech/blog/fall-2025-launch/)
- [The Notebook Agent just got even better](https://hex.tech/blog/notebook-agent-updates/)

**Honest assessment vs PulsePlay.** Hex is a different shape (notebook, not embed). They share the spirit of "let analysts pick their LLM" loosely but are not playing in PulsePlay's lane (multi-vendor BI canvas hosting).

### 1.7 Qlik — AnswerBot / Qlik Answers / Qlik MCP Server

**Positioning.** Qlik has been in this space longest of any vendor. AnswerBot was the early NL chat. Qlik Answers (relaunched 2024-2025) is the agentic, RAG-grounded assistant on Amazon Bedrock. Early 2026 announcement: **Qlik MCP Server GA**, explicitly framed as "USB-C for AI" allowing Claude / Copilot / internal LLMs to reach into Qlik's engine.

**AI capabilities.** Agentic Q&A with citations, anomaly detection + multi-source root-cause, automated next-step proposals, structured + unstructured RAG.

**BI scope.** Single-vendor (Qlik Cloud + on-prem Qlik Sense; QlikView still supported but in maintenance).

**Open-source posture.** Closed.

**"Any AI" stance.** Plural via MCP. Among the most aggressive pivots to "your-AI-our-data."

**Sources.**
- [Qlik Answers — product page](https://www.qlik.com/us/products/qlik-answers)
- [Qlik Debuts Agentic Experience; MCP Opens Qlik to Third-Party Assistants](https://www.qlik.com/us/news/company/press-room/press-releases/qlik-debuts-agentic-experience)
- [Qlik 2025-2026: From Data to Action — Goodin](https://goodin.fi/qlik-2025-2026-from-data-to-action-the-era-of-ai-agents-and-trust/)

**Honest assessment vs PulsePlay.** Qlik is moving in the right direction but is single-vendor. Of all incumbents, their MCP-server framing is the most aligned with PulsePlay's philosophy. **Strategic note:** if Qlik ships a "host any vendor's BI" surface inside Qlik Cloud Hub, they become a direct competitor. No public signal of that yet.

### 1.8 Sisense — Sisense Intelligence

**Positioning.** Embedded-analytics specialist. May 2025: introduced Sisense Intelligence as the GenAI suite. Late 2025 / early 2026: added an AI assistant + MCP server + Managed LLM offering.

**AI capabilities.** AI assistant for data exploration; MCP server for third-party agent access; Managed LLM (Sisense-hosted model so customers don't have to bring their own).

**BI scope.** Single-vendor (Sisense, but heavily embedded — i.e., this code lives inside customer apps).

**Open-source posture.** Closed.

**"Any AI" stance.** Plural via MCP, plus a "we host the LLM if you don't want to" option.

**Sources.**
- [Sisense unveils new suite of AI-powered capabilities — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366624918/Sisense-unveils-new-suite-of-AI-powered-capabilities)
- [Sisense targets embedding AI with latest features](https://www.techtarget.com/searchbusinessanalytics/news/366637217/Sisense-targets-embedding-AI-with-latest-new-features)

**Honest assessment vs PulsePlay.** Sisense is the **most direct philosophical competitor** to PulsePlay's "embed-this-anywhere" posture. They are commercial and single-vendor, but the embedding-first DNA matters. PulsePlay differs on: open-source, multi-vendor, and on the X-axis pluralism (Sisense Managed LLM + MCP is a plural-ish stance, but it's still Sisense's framework).

### 1.9 SAP Joule + SAC

**Positioning.** SAP's enterprise AI assistant, integrated across 35+ SAP solutions. SAP Analytics Cloud (SAC) consumes Joule under the hood via the "Just Ask" feature. SAP Joule Studio (GA Q1 2026) lets enterprises build custom Joule agents and skills.

**AI capabilities.** Chat, summarization, formula authoring assistance, "Deep Research" (multi-domain, internal+external synthesis), Joule Analytics Center (admin observability of agent usage). 30+ specialized agents, 2,500+ Joule Skills.

**BI scope.** SAP only.

**Open-source posture.** Closed.

**"Any AI" stance.** Inside the SAP world. SAP supports MCP and A2A in Joule Studio for interoperability with other agents.

**Sources.**
- [SAP Business AI Release Highlights Q1 2026 — SAP News](https://news.sap.com/2026/04/sap-business-ai-release-highlights-q1-2026/)
- [SAP Joule Agentic AI 2026 — SAVIC](https://www.savictech.com/insights/sap-joule-agentic-ai-2026/)
- [SAC AI features explained: Joule, Just Ask — s-peers](https://s-peers.com/en/wiki/sac-ai-ml-features-im-ueberblick-joule-just-ask-co-einfach-erklaert/)

**Honest assessment vs PulsePlay.** SAP customers will use Joule. PulsePlay is unlikely to displace it. The interesting overlap is the Joule Studio model (build your own agents/skills) — a similar shape to PulsePlay's per-vendor adapter idea. SAP customers are highly unlikely to embed PulsePlay; PulsePlay-as-non-SAP-front-door is not a likely play here.

### 1.10 Domo — Domo AI

**Positioning.** End-to-end cloud BI + ETL platform. Mid-2023 GenAI focus, evolved through 2025 to agentic AI. Recent additions: Worksheets (spreadsheet-style data interaction) + improved semantic layer for AI consistency.

**AI capabilities.** Chat assistant, agents-from-data alerts/workflows/automation, semantic-layer improvements.

**BI scope.** Single-vendor (Domo).

**Open-source posture.** Closed.

**"Any AI" stance.** Mostly Domo's framework, with growing openness.

**Sources.**
- [Domo doubles down on AI — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366640792/Domo-doubles-down-on-AI-with-latest-platform-additions)

**Honest assessment vs PulsePlay.** Domo is full-stack (data + viz + AI) and tends to lock customers in. PulsePlay does not really overlap — PulsePlay is a host that accepts whatever BI surface you have. If a customer has chosen Domo, they're unlikely to run PulsePlay over it.

### 1.11 Mode Analytics (now part of ThoughtSpot)

Mode was acquired by ThoughtSpot in 2023 for $200M. By 2024-2025 it had been integrated into ThoughtSpot Analyst Studio, blending Mode's SQL IDE + Python/R notebooks with ThoughtSpot's semantic-search Sage/Spotter agents. Mode no longer exists as a standalone competitive entity. See section 1.3 for the merged offering.

**Sources.**
- [ThoughtSpot acquires Mode — ThoughtSpot Blog](https://www.thoughtspot.com/blog/thoughtspot-acquires-mode)
- [Unleashing Business Intelligence in the Era of Generative AI — Mode](https://mode.com/blog/thoughtspot-acquires-mode/)

### 1.12 Cross-vendor synthesis — where does PulsePlay's wedge actually differentiate?

| Wedge attribute | Microsoft Copilot | Tableau Agent | ThoughtSpot Spotter | Looker Gemini | Sigma | Hex | Qlik Answers | Sisense | SAP Joule | Domo |
|---|---|---|---|---|---|---|---|---|---|---|
| Vendor-neutral on BI (Y) | No | No | No | No | No | No | No | No | No | No |
| Vendor-neutral on AI (X) | No | No | **Partial (MCP)** | No | **Yes (MCP both)** | No | **Yes (MCP)** | **Yes (MCP)** | Partial | Partial |
| Open source | No | No | No | No | No | No | No | No | No | No |
| Plug-and-play adapter SDK | No | No | No | No | No | No | No | No | Partial (Joule Studio) | No |
| Side-by-side multi-vendor BI canvas | No | No | No | No | No | No | No | No | No | No |

**The honest answer to "where does PulsePlay actually differentiate":**

1. **The Y-axis (multi-BI host) is genuinely empty** at the open-source layer in May 2026. No major vendor offers a credible "host any BI tool" capability — they all assume their tool is the front door. This is PulsePlay's strongest differentiator.
2. **The X-axis (multi-AI brain) is becoming crowded** — Sigma, Qlik, Sisense, ThoughtSpot all have plural "any-AI" stories via MCP. PulsePlay is **not unique** here on the BI side. PulsePlay's value on X is that it brings the same plurality across the **multiple Y-axis vendors at once**.
3. **The (X, Y) combination is empty.** No competitor lets you mount Power BI on Monday and Tableau on Tuesday with the same Claude-Genie-Bedrock-Foundation-Model-supervisor brain. That's the unique wedge.
4. **Open-source matters in regulated buyers' shortlists.** Every commercial player above will lose in customers that require source-available code review (US federal, defence, certain financial-services controls).

**The cautionary footnote:** vendor-neutrality at the BI layer is technically hard. Each vendor's embed SDK has unique events, sandbox requirements, and auth flows (see Section 5). PulsePlay's adapter contract has to absorb that variance. If the contract leaks vendor-specific shapes into the AI layer, the abstraction collapses — see Section 2 on what successful connector platforms have done with adapter contracts.

---


## 2. Connector platform patterns — what we should learn from

Mature open-source connector ecosystems offer a decade-plus of evidence about what works. PulsePlay should not invent its adapter contract from scratch when the patterns below have been validated against thousands of real connectors. For each, we extract: **adapter contract shape, versioning, conformance, registry/marketplace, distribution, security review, governance**.

### 2.1 Airbyte — 600+ open-source connectors

**What it is.** Open-source data-integration platform with the Airbyte Protocol — a JSON-based contract for sources and destinations.

**Adapter contract shape.** A connector implements `spec`, `check`, `discover`, `read` (sources) or `write` (destinations) commands. Communication is JSON-line over stdout. The protocol forces a separation between **schema discovery**, **stream reading**, and **state checkpointing** — three concerns PulsePlay should mirror in its `BIAdapter` (capability discovery, event streaming, state survives reload).

**Versioning.** Each connector image has a version tag. Airbyte supports a "Definition Version" so multiple versions can co-exist.

**Conformance harness.** Airbyte ships a Connector Acceptance Test (CAT) suite — black-box tests run against any connector that claims to implement the spec.

**Registry / distribution.** Connector images on Docker Hub, source on GitHub. Airbyte has both a no-code Connector Builder UI and low-code/code CDKs (Python primarily).

**Governance.** Airbyte has shifted licensing posture (originally MIT, then ELv2 controversy in 2022, eventually back to permissive for many connectors). The volatility is itself a lesson — see section 6.

**Lessons for PulsePlay.**
- A spec-defined IPC boundary (stdout JSON in Airbyte's case; React-renderer-with-postMessage in PulsePlay's) lets the host stay vendor-agnostic.
- A formal **conformance test** is the only way you can credibly call third-party adapters "drop-in."
- The Connector Builder pattern (no-code generator that produces a compliant connector) accelerates ecosystem growth.

**Source.** [GitHub airbytehq/airbyte](https://github.com/airbytehq/airbyte) | [Airbyte connector docs](https://docs.airbyte.com/integrations)

### 2.2 dbt-core + the dbt adapter ecosystem

**What it is.** Data transformation framework with a per-warehouse adapter (dbt-bigquery, dbt-snowflake, dbt-databricks, dbt-spark, dbt-postgres, dbt-fabric, dbt-sqlserver…).

**Adapter contract shape.** Adapters subclass `BaseAdapter`, override warehouse-specific SQL methods (catalog discovery, materialisation strategy, etc.). The contract is a **Python interface**, not a wire protocol.

**Versioning.** dbt-adapters is a separate package. Adapters declare compatibility with major versions of dbt-adapters — minor versions may include Python interface changes; patch versions may not. Each adapter ships its own `__version__.py`. `dbt --version` introspects all installed adapters.

**Plugin discovery.** **Pure Python namespace scanning** — dbt-core walks the `dbt.adapters.*` namespace at startup looking for `__version__.py` files in subdirectories, and for each one imports the adapter module. **No registration step.** Drop a `pip install dbt-snowflake` in and the adapter is discovered automatically.

**Conformance.** dbt Labs maintains a "Trusted Adapter" program with manual review + functional testing. Community adapters live alongside trusted ones with explicit labelling.

**Distribution.** PyPI. Each adapter is its own package.

**Security review.** dbt Labs reviews "Verified" adapters on roughly an ad-hoc schedule.

**Governance.** dbt Labs maintains dbt-core and the Apache 2.0 license has been continuous since 2016. The newer `dbt Fusion` engine is on a separate (non-Apache) license — see Section 6 for the licensing nuance.

**Lessons for PulsePlay.**
- **Namespace-based plugin discovery is elegant** — no registration code, no manifest, just naming convention. PulsePlay's Vite-based code-splitting registry is a roughly analogous pattern (`bi-adapters/<vendor>/`).
- A separate **adapter-interface package** (PulsePlay analogue: `@pulseplay/bi-adapter` shipped from `playground/src/biPanel/BIAdapter.ts`) lets adapters declare semver compatibility against the contract independently of the host.
- A "Trusted Adapter" tier is how you scale community contributions without putting your name on everything.

**Sources.** [About dbt Core versions — dbt docs](https://docs.getdbt.com/docs/dbt-versions) | [dbt-adapters — PyPI](https://pypi.org/project/dbt-adapters/) | [Build, test, document, and promote adapters](https://docs.getdbt.com/guides/adapter-creation) | [dbt Licensing FAQ](https://www.getdbt.com/licenses-faq)

### 2.3 Trino / Starburst — federated query plugins

**What it is.** Distributed SQL query engine that federates across heterogeneous data sources via plugins.

**Adapter contract shape.** Trino's SPI (Service Provider Interface). Each plugin implements the `Plugin` interface, which exposes `getConnectorFactories()`, `getTypes()`, `getFunctions()`, `getSystemAccessControls()`, `getEventListenerFactories()`. ServiceLoader-based discovery via `META-INF/services/io.trino.spi.Plugin`.

**Distribution.** `trino-plugin` Maven packaging type → ZIP file with the plugin JAR + dependencies. Drop into Trino's plugin directory.

**Hot deploy.** Plugins load at coordinator startup; no true hot reload. Plugins are sandboxed from each other and from Trino core via classloader isolation.

**Lessons for PulsePlay.**
- The `Plugin` interface returning multiple **capability providers** (connectors, types, functions, access controls, listeners) is a more flexible shape than one-method-does-one-thing. PulsePlay's adapter could similarly expose multiple capabilities (mount, event-stream, command-channel, security-policy, telemetry-emitter).
- ServiceLoader-style **automatic discovery from a manifest** is what makes Trino plugins drop-in.
- The classloader isolation pattern translates roughly to PulsePlay's adapter sandbox boundary — each adapter's iframe is its own JS realm.

**Sources.** [Trino SPI overview](https://trino.io/docs/current/develop/spi-overview.html) | [Starburst SPI overview](https://docs.starburst.io/latest/develop/spi-overview.html)

### 2.4 Singer — taps and targets

**What it is.** Open ETL spec from Stitch (Talend). "Taps" extract, "targets" load. Communication is JSON over stdout.

**Adapter contract shape.** Three message types:
- **schema** — JSON Schema describing record shape
- **record** — actual data row
- **state** — checkpoint metadata for resumability

A tap reads config and (optional) state, emits a stream of (schema, record, state) messages. A target consumes a stream of those messages and loads to its sink.

**Lessons for PulsePlay.**
- The **schema | record | state** triad maps surprisingly well onto a BI adapter:
  - `schema` ≈ the adapter's capability descriptor (what events it can emit, what commands it accepts)
  - `record` ≈ the actual BI events (filter changed, mark selected, page navigated)
  - `state` ≈ the snapshot of context for the AI assistant ("what is the user currently looking at")
- The Singer model has succeeded **because it is unambiguously specified** — there is no controversy about what a tap should do. PulsePlay's `BIAdapter` contract should aim for that level of precision.

**Source.** [Singer spec on GitHub](https://github.com/singer-io/getting-started/blob/master/docs/SPEC.md) | [Singer.io — main page](https://www.singer.io/) | [PipelineWise — Singer.io](https://transferwise.github.io/pipelinewise/concept/singer.html)

### 2.5 Fivetran — proprietary, but instructive

**What it is.** Closed-source competitor to Airbyte. Connectors are certified by Fivetran, not community-built.

**Lessons for PulsePlay.** Fivetran's customers pay specifically because **someone else owns** keeping connectors current. The implicit lesson: in an open community, **breaking-change cadence on the contract** is the death-knell of an ecosystem. Adapter authors will disengage if the contract churns. Plan PulsePlay's `BIAdapter` interface for stability — semver discipline matters more than feature velocity here.

### 2.6 LangChain integrations

**What it is.** Python and JS framework with provider-specific integration packages: `langchain-openai`, `langchain-anthropic`, `langchain-google-genai`, etc. (Plus equivalent JS namespaces: `@langchain/openai`, `@langchain/anthropic`.)

**Adapter contract shape.** Each provider package depends on `langchain-core` (which defines the abstract interfaces — `BaseChatModel`, `BaseEmbeddings`, etc.) and on the provider's official SDK. The provider package implements the abstract interfaces against the SDK.

**Naming convention.** `langchain-{provider}` (Python) or `@langchain/{provider}` (JS). This is a **load-bearing convention** — it's how LangChain documentation, search, and ecosystem tooling find packages.

**Versioning.** Each provider package versions independently of `langchain-core`. They depend on a major-version range of `langchain-core`.

**Governance.** Apache 2.0. Co-maintained between LangChain team and provider's developer-relations team — LangChain reviews PRs but provider DR can ship.

**Lessons for PulsePlay.**
- The split-package model (`pulseplay-core` defines contracts; `pulseplay-vendor-x` ships the impl) is the right shape. Adapters should NOT be in the host repo permanently — they should graduate to their own packages once stable.
- Co-maintenance with vendor DR teams is the **scaling pattern**. PulsePlay can't keep four BI adapters current alone forever.
- The Apache 2.0 + co-maintenance combination has produced the largest AI-integration ecosystem in the world. Imitate it.

**Sources.** [Provider Integrations — LangChain Wiki](https://deepwiki.com/langchain-ai/langchain/3-provider-integrations) | [LangChain Anthropic partner — GitHub](https://github.com/langchain-ai/langchain/tree/master/libs/partners/anthropic)

### 2.7 Cross-cutting connector-platform principles for PulsePlay

Synthesizing the six platforms above, the principles a successful connector ecosystem **must** have:

1. **A specification document** (Singer-style) that is more authoritative than the code. Adapters validate against the spec; the spec changes through an RFC-style process; semver is enforced.

2. **A conformance test harness** that any adapter (community or first-party) can run. Without this, the "drop-in" promise is hollow.

3. **An adapter SDK / scaffold** (Airbyte Connector Builder, dbt's adapter creation guide). New-adapter time-to-first-event should be < 30 minutes.

4. **Namespace-based or manifest-based discovery** (dbt's namespace scan; Trino's ServiceLoader). The host should not need to know in advance who the adapters are.

5. **A registry with tiers** — first-party (vendor's official), partner (vendor + maintainer co-signed), community (anyone). Tier visibility lets buyers self-assess risk.

6. **Per-adapter versioning** independent of the host. Each adapter ships its own version, declares contract version it implements, and updates on its own cadence.

7. **A clear, narrow license** that vendors can re-distribute without legal review (Apache 2.0 is the dominant choice for connector ecosystems).

8. **Documented breaking-change cadence** on the contract. The contract is a treaty with the ecosystem — break it and lose adapters.

9. **Co-maintenance with vendor DR teams** for the high-priority adapters. You cannot keep four-six BI adapters current as a small team alone.

10. **A story for forking** — the adapter is open source so a customer can patch it themselves if the upstream maintainer is slow. This is a **selling point** to enterprise.

PulsePlay's current `BIAdapter` interface is roughly aligned with #1, #4, and partially #6. It is missing the conformance harness (#2), the SDK scaffold (#3), the explicit tiering (#5), and the formal contract-versioning story (#6, #8). These should be near-term roadmap items for v0.2-v0.3.

---

## 3. AI agent connector standards — the X-axis future

This section is critical to PulsePlay's architecture. The X-axis is what AI brain is talking to the BI canvas. We document every major contender as of May 2026 and call the convergence direction.

**TL;DR up front:** MCP has won the tools-and-data-connection layer. A2A is winning the agent-to-agent coordination layer. The Responses API is winning the OpenAI-shaped chat-with-tools layer (replacing the deprecated Assistants API). LangChain remains the most adopted framework abstraction in Python; LangGraph is the de-facto multi-step agent runtime. PulsePlay's X-axis abstraction should treat **MCP as a first-class connector type** and treat the others as **chat-completion-shaped connectors** with provider-specific adapters.

### 3.1 Model Context Protocol (MCP) — Anthropic's standard, now Linux Foundation

**What it is.** Open protocol for connecting LLM applications to external data sources and tools. Originally introduced by Anthropic in November 2024. Donated to the Linux Foundation under the **Agentic AI Foundation (AAIF)** in December 2025, co-founded by Anthropic, Block, and OpenAI.

**Adoption signals.**
- **OpenAI** officially adopted MCP March 2025; ChatGPT desktop ships with MCP support.
- **Google DeepMind** confirmed MCP support in upcoming Gemini models (April 2025).
- **Microsoft** integrated MCP into Copilot Studio (July 2025); shipped official C# SDK in partnership with Anthropic.
- **97 million monthly SDK downloads** reported by Anthropic by December 2025 (across all language SDKs).
- **9,400+ public MCP servers** in the public registry as of April 2026 (the official MCP Registry shows ~2,000; PulseMCP indexes 5,500+; Nerq independent census found 17,468 across all registries) — counts vary by methodology.
- **Reported 78% enterprise team adoption** of at least one MCP-backed agent in production (from "MCP Adoption Statistics 2026" — treat as directional, not authoritative).

**Spec URL.** [Specification — Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25)

**License.** Spec is MIT. Reference servers repo is Apache 2.0 for new contributions, MIT for existing code. See [GitHub modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) and [GitHub modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol).

**Contract shape.** JSON-RPC 2.0 over stdio (local) or HTTP+SSE (remote). The protocol exposes:
- **Resources** — read-only data the LLM can fetch (files, URIs, metadata)
- **Tools** — callable functions with JSON Schema parameter specs
- **Prompts** — pre-fab prompt templates the server provides
- **Sampling** — server-initiated LLM calls back through the client

**Lifecycle.** Initialize → list capabilities → call tools / fetch resources → close. Stateful within a session.

**Verdict for PulsePlay.** MCP is **the** convergence point for tool-and-data connections. PulsePlay should ship:
- **MCP server** exposing PulsePlay's BI context (current dashboard, current filters, recent events) so external agents can read it.
- **MCP client** capability so the AI sidebar can call out to MCP servers configured by the user (Slack, GitHub, internal MCP servers).

This is the single most leveraged X-axis investment PulsePlay can make. See Section 9 for the full hypothesis test.

**Key sources.**
- [Anthropic — MCP announcement](https://www.anthropic.com/news/model-context-protocol)
- [A Year of MCP: 2025 in review — Pento](https://www.pento.ai/blog/a-year-of-mcp-2025-review)
- [State of MCP — Zuplo](https://zuplo.com/mcp-report)
- [MCP Adoption Statistics 2026 — Digital Applied](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol)
- [Model Context Protocol — Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)

### 3.2 OpenAI Assistants API → Responses API migration

**What happened.** The Assistants API beta launched in November 2023 alongside Custom GPTs. By August 26, 2025 OpenAI announced **deprecation** of the Assistants API with a sunset date of **August 26, 2026**. The Responses API is the successor.

**Why it matters.** Any X-axis connector built against the Assistants API has < 4 months of remaining runway as of this document's publication. New X-axis work should target the Responses API or Chat Completions API directly.

**Responses API contract shape.** A superset of Chat Completions. Supports persistent threads, tool calling, file handling. Reasoning models get richer tool-use semantics here than in Chat Completions.

**Sources.**
- [Deprecations — OpenAI API](https://developers.openai.com/api/docs/deprecations)
- [Migrate to the Responses API — OpenAI docs](https://platform.openai.com/docs/guides/migrate-to-responses)
- [Assistants API beta deprecation — OpenAI Developer Community](https://community.openai.com/t/assistants-api-beta-deprecation-august-26-2026-sunset/1354666)

**Verdict for PulsePlay.** The OpenAI X-axis adapter should target **Responses API** (or Chat Completions for simpler interactions). Avoid building anything new against Assistants API.

### 3.3 OpenAI Plugins — fully deprecated

**Status.** Discontinued. New plugin conversations stopped March 19, 2024; existing plugin conversations terminated April 9, 2024. Replaced by Custom GPTs with Actions, then by MCP apps (October 2025).

**Verdict for PulsePlay.** Don't target. Skip.

**Source.** [ChatGPT plugins — OpenAI](https://openai.com/index/chatgpt-plugins/) | [Sunsetting Zapier ChatGPT plugin](https://help.zapier.com/hc/en-us/articles/24785309335565-Sunsetting-the-Zapier-ChatGPT-plugin-what-you-need-to-know)

### 3.4 Bedrock Agent Action Groups

**What it is.** AWS Bedrock's framework for giving an agent callable tools. Tools are described via OpenAPI 3.0 schemas (path, method, description, parameters). The schema can live inline in the API call payload or be uploaded to S3.

**Notable features.**
- `x-requireConfirmation` — optional flag that forces user confirmation before invocation. Designed as a guardrail against prompt injection.
- Action group code can run as a Lambda function or be returned to the calling app for execution.

**Verdict for PulsePlay.** Bedrock-shaped agents are an important X-axis target. The OpenAPI 3.0 schema convention is well-known and Bedrock has solid AWS-native enterprise traction. PulsePlay's Bedrock connector should accept an OpenAPI definition and translate it to action-group calls.

**Source.** [Define OpenAPI schemas for Bedrock action groups](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-api-schema.html) | [Add an action group to your agent — Bedrock docs](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-action-add.html)

### 3.5 LangChain Tool spec + LangGraph

**What it is.** LangChain's tool abstraction is `BaseTool` in Python. Tools have a name, description, input schema (Pydantic). LangGraph layers a state-machine / DAG runtime on top — agents become nodes in a graph with typed state.

**Adoption.** LangChain remains the most-cited Python LLM framework as of mid-2026 despite competition from CrewAI, AutoGen, and the new Microsoft Agent Framework. LangGraph specifically is the runtime most-recommended for production multi-step agents.

**Verdict for PulsePlay.** PulsePlay should provide a **LangChain-compatible tool surface** — i.e., the PulsePlay MCP server should be wrappable as a LangChain tool with one line of code. This is how you onboard the broadest set of Python developers.

**Source.** [LangChain Anthropic — GitHub](https://github.com/langchain-ai/langchain/tree/master/libs/partners/anthropic) | [Provider Integrations — Wiki](https://deepwiki.com/langchain-ai/langchain/3-provider-integrations)

### 3.6 Claude Agent SDK (Anthropic)

**What it is.** Renamed from Claude Code SDK in late 2025. Open-source toolkit for building production AI agents. Same infrastructure that powers Claude Code. Includes subagents, lifecycle hooks, and the Skills system.

**MCP support.** As of early 2026, the Claude Agent SDK has the **deepest native MCP support** of any major framework — this is the SDK's architectural differentiator.

**Constraint.** The SDK is **Claude-only**. If model-provider portability is a requirement, you cannot use Claude Agent SDK as your sole agent runtime.

**Verdict for PulsePlay.** Claude Agent SDK is a great target if a customer wants Claude as the brain. But because PulsePlay is connector-agnostic, the Claude Agent SDK should be **one X-axis profile**, not the platform's foundational abstraction. Use it for the Claude-specific connector path.

**Source.** [Agent SDK overview — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview) | [npm @anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

### 3.7 Microsoft Semantic Kernel + Microsoft Agent Framework (MAF)

**What it is.** Semantic Kernel was Microsoft's earlier orchestrator. **Microsoft Agent Framework (MAF) 1.0** shipped April 2026 as the production-ready successor. MAF supports plugins via:
- native code (functions decorated with attributes),
- OpenAPI specs,
- **MCP servers** (first-class),
- A2A messaging (first-class).

**Verdict for PulsePlay.** MAF is the right target for .NET shops. The MAF approach of "plugins from MCP, OpenAPI, A2A, native — pick any" is exactly the philosophical shape PulsePlay's X-axis should aim for.

**Source.** [Microsoft Ships Production-Ready Agent Framework 1.0 — Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/04/06/microsoft-ships-production-ready-agent-framework-1-0-for-net-and-python.aspx) | [Plugins in Semantic Kernel — Microsoft Learn](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/) | [Semantic Kernel + AutoGen = Microsoft Agent Framework](https://visualstudiomagazine.com/articles/2025/10/01/semantic-kernel-autogen--open-source-microsoft-agent-framework.aspx)

### 3.8 AutoGen / CrewAI — multi-agent patterns

**AutoGen (Microsoft Research; now folded into Microsoft Agent Framework).** Conversation-driven multi-agent. Agents talk to each other in natural language and iterate to solve open-ended problems. AutoGen 0.4 (late 2025) was a major rewrite with event-driven architecture. As of April 2026, AutoGen and Semantic Kernel have been merged into Microsoft Agent Framework 1.0.

**CrewAI.** Role-based agent framework. You define a "crew" of agents (researcher, writer, fact-checker), each with a specialty, and CrewAI orchestrates them. Easiest learning curve in the multi-agent space.

**Verdict for PulsePlay.** Both are valid X-axis profiles. PulsePlay does not need its own multi-agent runtime — the right move is to provide an MCP server that any of these frameworks can target. The patterns are dominated by the framework, not the BI surface, so PulsePlay should expose context and let the framework do orchestration.

**Source.** [DataCamp — CrewAI vs LangGraph vs AutoGen](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen) | [CrewAI vs AutoGen — Oxylabs](https://oxylabs.io/blog/crewai-vs-autogen) | [LangGraph vs AutoGen vs CrewAI — Latenode](https://latenode.com/blog/platform-comparisons-alternatives/automation-platform-comparisons/langgraph-vs-autogen-vs-crewai-complete-ai-agent-framework-comparison-architecture-analysis-2025)

### 3.9 A2A — Agent-to-Agent protocol (Google → Linux Foundation)

**What it is.** Open standard announced by Google in April 2025; donated to the Linux Foundation. Defines how AI agents from different vendors can:
- **Agent Cards** — advertise capabilities (a JSON manifest)
- **Tasks** — exchange units of work
- **Transport** — over HTTP, SSE, JSON-RPC 2.0

**Adoption.** As of April 2026, **150+ organizations support A2A**, including Google, Microsoft, AWS, Salesforce, SAP, ServiceNow, Workday, IBM. Version 0.3 is the current stable release.

**Relationship to MCP.** A2A and MCP are **complementary**, not competing. MCP gives an agent tools and context. A2A lets two agents coordinate work. Microsoft Agent Framework 1.0 supports both natively.

**Verdict for PulsePlay.** A2A is **second-priority** for PulsePlay. The primary use case (assistant-talks-to-BI-data) is solved by MCP. A2A becomes relevant if PulsePlay-the-platform wants to expose itself as an agent to other agents — useful if a customer's Claude / Copilot / Gemini wants to delegate "open this Tableau dashboard and tell me what changed" to PulsePlay's agent. Worth planning for v1.5+ but not urgent for v1.0.

**Source.** [Announcing A2A — Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) | [A2A protocol spec](https://a2a-protocol.org/latest/specification/) | [A2A — IBM Think](https://www.ibm.com/think/topics/agent2agent-protocol) | [A2A getting an upgrade — Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)

### 3.10 Honest verdict: which standard converges?

**Two layers, two winners.**

| Layer | Winner | Confidence | Rationale |
|---|---|---|---|
| Tool/data connection between LLM and the world | **MCP** | High | OpenAI, Google, Microsoft, Anthropic all adopted; 9,400+ public servers; Linux Foundation governance |
| Agent-to-agent coordination | **A2A** | Medium-high | 150+ orgs supporting; Linux Foundation; complementary to MCP, not in tension |
| Chat-with-tools API shape | **OpenAI Responses API** (de-facto) + Chat Completions ABI | High | Most consumed in the wild; Anthropic, Bedrock, Azure all expose Chat-Completions-shaped APIs |
| Multi-agent orchestration | No clear winner; LangGraph leading in usage | Medium | Framework-level — PulsePlay doesn't need to pick one; MCP makes them all interoperable |

**What PulsePlay should target as the canonical X-axis abstraction.**

Recommend a **two-tier abstraction**:

1. **Tier 1 (transport-level): MCP.** PulsePlay ships an MCP server (PulsePlay context goes out) and an MCP client (PulsePlay agent calls out to user-configured MCP servers). This makes PulsePlay interoperable with every major framework above.

2. **Tier 2 (chat-completion-shaped wrappers):** Per-provider adapters that speak the provider's native Chat Completions / Responses API. This is required because customers buy "Claude" or "Bedrock" or "Genie" specifically and the MCP-only path doesn't expose provider-native features (caching, streaming, structured output, vision).

This is essentially what Microsoft Agent Framework 1.0 does. Imitate the architecture; don't try to invent.

---

## 4. Enterprise standards mapping

PulsePlay's "no flaws" + "security first" + "enterprise-ready" non-negotiables mean we will be measured against the standards below. For each: **what it covers → version + URL → what PulsePlay must do → applies to OSS code, hosted, or both?**

The general posture: PulsePlay (the open-source codebase) cannot be "certified" against most of these — certifications attach to organizations operating systems, not to source code. But **the OSS codebase can and must produce the artifacts and controls that make a downstream operator's certification path easy**. Most of the work below is "ship the right defaults, the right docs, and the right hooks."

### 4.1 NIST AI Risk Management Framework + GenAI Profile

**What it covers.** AI RMF (NIST AI 100-1, January 2023) — voluntary framework for managing AI risk. Four functions: **Govern, Map, Measure, Manage**. The GenAI Profile (NIST AI 600-1, July 2024) is the GenAI-specific implementation — identifies 12 GAI-unique risks, maps each to GOVERN/MAP/MEASURE/MANAGE actions, provides 200+ suggested actions.

**Latest version.** NIST AI 600-1, July 2024. URL: [NIST.AI.600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | [Publication page](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)

**What PulsePlay must do.**
- Document the 12 GAI risks in a `THREAT_MODEL.md` and call out which apply to PulsePlay (most do — confabulation, data privacy, dangerous information, environmental impact, harmful bias, etc.)
- For each, document the platform's posture: which mitigations are built-in (e.g., logging, audit trail), which are operator-responsible (e.g., choice of model, content filtering policy).
- Map PulsePlay's existing controls (proxy logging, profile-scoped access, validator framework) to the GOVERN/MAP/MEASURE/MANAGE functions.

**Applies to.** OSS codebase (controls and docs) and hosted deployments (operational practices). Both.

### 4.2 NIST Cybersecurity Framework 2.0

**What it covers.** Released February 26, 2024. Adds the new **Govern** function to CSF 1.1's five (Identify, Protect, Detect, Respond, Recover). Expanded scope from critical infrastructure to "all organizations." New emphasis on supply chain.

**Latest version.** CSF 2.0, February 2024. URL: [NIST CSF 2.0 PDF](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf) | [Cybersecurity Framework — NIST](https://www.nist.gov/cyberframework)

**What PulsePlay must do.**
- Map PulsePlay's existing security controls (auth model, secret-handling, CORS posture, CSP) to CSF 2.0 categories.
- The **Govern** function maps onto PulsePlay's project governance — license, contribution model, security disclosure policy.
- The supply-chain emphasis maps onto OpenSSF Scorecard / SLSA (see 4.13).

**Applies to.** Both (hosted operators need this for their certifications; OSS project should produce the evidence).

### 4.3 NIST SP 800-207 Zero Trust Architecture

**What it covers.** ZTA tenets: no implicit trust based on network location, per-session resource access, continuous verification, least privilege, micro-segmentation. Companion 800-207A covers cloud-native multi-cloud ZTA.

**Latest version.** SP 800-207 (August 2020) + SP 800-207A (September 2023). URL: [NIST SP 800-207 — final](https://csrc.nist.gov/pubs/sp/800/207/final) | [SP 800-207A — final](https://csrc.nist.gov/pubs/sp/800/207/a/final)

**What PulsePlay must do.**
- Embed-token issuance must be **per-session, short-lived, server-issued**. Already a tripwire in CLAUDE.md — keep it.
- Proxy-side profile resolution must do **continuous policy evaluation** (not just at session start) — check on every assistant call, not cache the entitlement.
- Iframe sandboxes are micro-segmentation — narrow the sandbox per vendor adapter (already a tripwire).
- Document the trust boundary diagram explicitly: browser → proxy → AI connector → BI vendor SDK; each hop has explicit auth.

**Applies to.** Both, but more relevant to hosted deployments where the operator owns the network.

### 4.4 OWASP API Security Top 10 (2023)

**What it covers.** API-specific security risks. The 2023 list is the latest. Notable items relevant to PulsePlay:
- API1:2023 Broken Object Level Authorization (BOLA)
- API2:2023 Broken Authentication
- API3:2023 Broken Object Property Level Authorization (merged Excessive Data Exposure + Mass Assignment)
- API4:2023 Unrestricted Resource Consumption
- API5:2023 Broken Function Level Authorization
- API6:2023 Unrestricted Access to Sensitive Business Flows (new)
- API7:2023 Server-Side Request Forgery (new)
- API8:2023 Security Misconfiguration
- API9:2023 Improper Inventory Management
- API10:2023 Unsafe Consumption of APIs

**Latest version.** 2023. URL: [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) | [Project page](https://owasp.org/www-project-api-security/)

**What PulsePlay must do.**
- Proxy-side profile registry must enforce object-level auth on every request (BOLA / BFLA).
- All embed tokens server-issued (BOPLA on credentials).
- Rate-limit AI calls per profile (Unrestricted Resource Consumption — LLM bills can run away).
- SSRF: when an MCP client calls out to a user-configured MCP server, validate the URL is in an allowlist or in a hardened way (private IP blocking, etc.).
- Inventory: ship a `/health` and `/inventory` endpoint that lists registered profiles, adapter versions, dependencies (Improper Inventory Management).

**Applies to.** Both — most directly to the proxy code in `proxy/`.

### 4.5 OWASP Top 10 for LLM Applications (2025)

**What it covers.** The 2025 edition (released late 2024) replaced the 2023 version. The list:

1. **LLM01: Prompt Injection** — manipulation of input prompts
2. **LLM02: Sensitive Information Disclosure**
3. **LLM03: Supply Chain** — vulnerable models / training data / packages
4. **LLM04: Data and Model Poisoning**
5. **LLM05: Improper Output Handling**
6. **LLM06: Excessive Agency**
7. **LLM07: System Prompt Leakage** (new in 2025)
8. **LLM08: Vector and Embedding Weaknesses** (new in 2025)
9. **LLM09: Misinformation from LLMs**
10. **LLM10: Unbounded Consumption**

**Latest version.** 2025. URL: [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/) | [PDF](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf)

**What PulsePlay must do — by item.**

- **LLM01 Prompt Injection.** The biggest risk. PulsePlay sends BI context (filters, selections, dashboard names) to the LLM. A malicious dashboard creator could embed prompt-injection payloads in a chart title. Mitigations: (i) sanitize BI context before sending to LLM; (ii) use system prompt + structured tool results rather than raw text concatenation; (iii) display attribution ("the AI is reading the dashboard you're looking at — content from this dashboard could influence the response").

- **LLM02 Sensitive Disclosure.** AI sidebar must not echo raw embed tokens, embed URLs containing secrets, or warehouse credentials. Proxy must redact.

- **LLM03 Supply Chain.** Pin dependencies. Use OpenSSF Scorecard. Don't auto-pull-latest models from registries.

- **LLM05 Improper Output Handling.** Treat LLM output as untrusted. If the assistant returns markdown with links, sanitize. If it returns code suggestions, never execute without explicit user confirmation (the `x-requireConfirmation` Bedrock pattern).

- **LLM06 Excessive Agency.** PulsePlay's assistant should not have write access to the BI tool unless explicitly enabled per profile. Even read-only is plenty for v1.0.

- **LLM07 System Prompt Leakage.** Treat the system prompt as non-sensitive (assume it leaks).

- **LLM08 Vector / Embedding Weaknesses.** If PulsePlay adds RAG over BI docs, embedding-attack vectors apply.

- **LLM10 Unbounded Consumption.** Rate-limit. Per-profile billing caps. Cancel-on-tab-close (already a UX concern in the proxy).

**Applies to.** Both. OSS codebase ships the controls; operators tune the policy.

### 4.6 Cloud Security Alliance AI Controls Matrix (AICM)

**What it covers.** Released July 2025. **18 security domains, 243 control objectives.** Vendor-agnostic. Maps to ISO/IEC 42001 and EU AI Act (mappings released August 2025). Threat categories: Model Manipulation, Data Poisoning, Sensitive Data Disclosure, Model Theft, Service Failures, Insecure Supply Chains, Insecure Apps/Plugins, Denial of Service, Loss of Governance/Compliance.

**Latest version.** v1, July 2025. STAR Level 1 Self-Assessment for AI launched end-2025. URL: [Introducing the CSA AI Controls Matrix](https://cloudsecurityalliance.org/blog/2025/07/10/introducing-the-csa-ai-controls-matrix-a-comprehensive-framework-for-trustworthy-ai) | [AI Controls Matrix artifact](https://cloudsecurityalliance.org/artifacts/ai-controls-matrix) | [AICM + ISO 42001 mapping](https://cloudsecurityalliance.org/blog/2025/08/20/announcing-the-ai-controls-matrix-and-iso-iec-42001-mapping-and-the-roadmap-to-star-for-ai-42001)

**What PulsePlay must do.** Treat AICM as the canonical control checklist for hosted deployments. Produce a CAIQ-for-AI completed self-assessment as a published artifact for operators to fork. The 243 controls are too many for a single doc; the work is to map PulsePlay's current controls and explicitly say which are operator-responsibility.

**Applies to.** Hosted deployments primarily (CAIQ submission). OSS codebase produces the evidence and the defaults.

### 4.7 ISO/IEC 27001:2022

**What it covers.** Information security management system (ISMS) standard. The bedrock enterprise security cert. Annex A controls revised 2022 (93 controls in 4 themes vs older 114 in 14).

**Latest version.** ISO/IEC 27001:2022. URL: [ISO/IEC 27001 — official](https://www.iso.org/standard/27001) (paywalled).

**What PulsePlay must do.** PulsePlay-the-OSS-project does not get certified — operators do. PulsePlay should ship docs that map controls to PulsePlay's defaults (logging, access control, change management hooks) so operators can use PulsePlay as part of their ISMS without additional work.

**Applies to.** Hosted operators primarily.

### 4.8 ISO/IEC 42001 — AI Management Systems

**What it covers.** First international AI-management-system standard. Specifies requirements for establishing, implementing, maintaining, and continually improving an AIMS. Voluntary. Certifying bodies include BSI, DNV, TÜV SÜD, SGS.

**Latest version.** ISO/IEC 42001:2023. URL: [ISO/IEC 42001](https://www.iso.org/standard/42001) | [Microsoft Compliance offering](https://learn.microsoft.com/en-us/compliance/regulatory/offering-iso-42001) | [ISO 42001 explained](https://www.iso.org/home/insights-news/resources/iso-42001-explained-what-it-is.html)

**What PulsePlay must do.** Increasingly required for AI products in regulated sectors. PulsePlay should:
- Document an AI policy template (what models are allowed, what data may be sent to them, retention).
- Provide hooks for operators to log model interactions for governance review.
- Ship a CSA AICM mapping (which already cross-walks to ISO 42001).

**Applies to.** Hosted operators primarily — but the OSS project should make their certification cheap.

### 4.9 EU AI Act

**What it covers.** Tiered risk classification:
- **Unacceptable risk** — banned since February 2, 2025 (social scoring, manipulative AI, untargeted facial scraping, etc.).
- **High-risk** — full obligations. Annex III standalone uses (hiring, credit scoring, biometrics) apply from August 2, 2026. Critical-infrastructure and safety-component use cases earlier.
- **Limited risk** — transparency obligations (disclose chatbots, label deepfakes).
- **Minimal risk** — no obligations.
- **General Purpose AI (GPAI)** — separate obligations, applicable since August 2, 2025; full enforcement from August 2, 2026. Open-source GPAI providers have lighter obligations (copyright + training data summary) unless their model presents systemic risk.

**Latest version.** Regulation (EU) 2024/1689. URL: [EU AI Act — full text portal](https://artificialintelligenceact.eu/) | [Article 6: Classification rules](https://artificialintelligenceact.eu/article/6/) | [Article 51: GPAI systemic risk classification](https://artificialintelligenceact.eu/article/51/) | [Implementation timeline — Trilateral Research](https://trilateralresearch.com/responsible-ai/eu-ai-act-implementation-timeline-mapping-your-models-to-the-new-risk-tiers)

**What PulsePlay must do.**
- PulsePlay-the-platform is **not itself a high-risk AI system**. It is more analogous to "infrastructure that high-risk systems can be built on top of." Most PulsePlay deployments will be **limited risk** at most (transparency about chatbot use is the primary obligation).
- BUT: customers using PulsePlay for high-risk use cases (e.g., HR analytics involving applicant data) inherit high-risk obligations. PulsePlay must give them the hooks: logging, model card capture, human-in-the-loop affordance, transparency UX.
- Open-source operator obligations are lighter for the GPAI track — PulsePlay can document an open-source AI policy aligned with this provision.

**Applies to.** Hosted operators in EU primarily; OSS project ships the affordances.

### 4.10 SOC 2 Type II

**What it covers.** AICPA control framework with five Trust Services Criteria: Security, Availability, Processing Integrity, Confidentiality, Privacy. Type II = audited continuous compliance over a period (typically 6-12 months).

**Latest update.** AICPA's 2025 guidance now emphasizes AI Governance Controls and Continuous Monitoring + Zero Trust expectations. ~66% of B2B buyers are reported to demand a SOC 2 report before considering a vendor (from industry surveys; treat as directional).

**Latest version (criteria).** TSP 100-2017 with SOC 2 + AI Governance addenda (2025). URL: [SOC 2 for AI Companies — Comp AI](https://www.trycomp.ai/soc-2-for-ai-companies) | [SOC 2 AI Compliance News 2025 — Quantarra](https://quantarra.io/blog/soc-2-ai-compliance-news-2025-edition-the-trends-that-reshaped-security-audits)

**What PulsePlay must do.** SOC 2 attaches to operators, not codebases. The OSS project should:
- Ship structured logging hooks suitable for SIEM ingestion.
- Document the threat model + control mapping per TSP criterion.
- Provide a sample data-classification policy.

**Applies to.** Hosted operators only.

### 4.11 GDPR / Data Residency

**What it covers.** EU data subject rights (access, rectification, erasure, portability, objection); data minimization; lawful basis; data residency for cross-border transfers; data-protection impact assessments (DPIAs) for high-risk processing.

**Latest authority.** Regulation (EU) 2016/679, plus 2025 EDPB guidelines on AI training data.

**What PulsePlay must do.**
- Don't log full prompt content by default (it may contain PII). Log structured metadata + hashed identifiers.
- Provide an "erase user history" hook.
- Make the AI connector's region configurable (Tableau Pulse already does this through Einstein GPT Gateway geo-routing — this is a known pattern).
- Document data flow per connector profile so operators can complete a DPIA.

**Applies to.** Both — OSS provides hooks; operators implement policy.

### 4.12 MITRE ATLAS

**What it covers.** Adversarial Threat Landscape for AI Systems. As of v5.1.0 (November 2025): **16 tactics, 84 techniques, 56 sub-techniques, 32 mitigations, 42 real-world case studies**. October 2025 added 14 techniques specifically focused on AI Agents and Generative AI (Zenity Labs collaboration).

**Latest version.** v5.1.0, November 2025. URL: [MITRE ATLAS](https://atlas.mitre.org/) | [ATLAS Overview — NIST CSRC presentation Sept 2025](https://csrc.nist.gov/csrc/media/Presentations/2025/mitre-atlas/TuePM2.1-MITRE%20ATLAS%20Overview%20Sept%202025.pdf)

**What PulsePlay must do.** Use ATLAS as the canonical adversarial threat model. Concretely:
- Map PulsePlay's threat surface (proxy, AI connector, embed iframe, MCP client) to ATLAS tactics/techniques.
- Run red-team exercises against the most likely techniques: prompt injection (very high), model evasion (medium), data poisoning of the BI dashboard the user is looking at (medium-high — this is novel!).
- Document mitigations.

**Applies to.** Both (the threat model is universal; mitigations split between OSS defaults and operator policy).

### 4.13 NIST SSDF (SP 800-218) + 800-218A for GenAI

**What it covers.** SP 800-218 v1.1 — secure software development framework. Four pillars: Prepare the Organization (PO), Protect the Software (PS), Produce Well-Secured Software (PW), Respond to Vulnerabilities (RV). SP 800-218A is the GenAI community profile that adds AI-model-development practices.

**Latest version.** SP 800-218 v1.1 (final); v1.2 in draft (initial public draft). 800-218A finalized for GenAI. URL: [NIST SSDF SP 800-218 — final](https://csrc.nist.gov/pubs/sp/800/218/final) | [SP 800-218A draft GenAI profile](https://csrc.nist.gov/pubs/sp/800/218/a/ipd) | [SSDF overview](https://csrc.nist.gov/projects/ssdf)

**What PulsePlay must do.**
- All four pillars apply. PulsePlay should adopt: signed releases, dependency review (Dependabot or similar), pinned dependencies, vulnerability disclosure policy (security.md), code review on every PR, threat modeling per release.
- 800-218A specifically: if PulsePlay ever does fine-tuning or hosted-model serving, the AI-model lifecycle controls apply.

**Applies to.** OSS project (SSDF on the codebase); operators (SSDF on their fork or distribution).

### 4.14 OpenSSF Scorecard / SLSA

**What it covers.** **Scorecard** runs automated checks (18+ checks) against an OSS project on GitHub: branch protection, code review, dependency management, CI/CD security, fuzzing, vuln disclosure, signed releases. **SLSA** (Supply-chain Levels for Software Artifacts, "salsa") is a tiered framework (SLSA 0–3) for build-process integrity, with provenance metadata as the central artifact.

**Latest version.** SLSA v1.1 stable; v1.2 in development. URL: [SLSA — slsa.dev](https://slsa.dev/) | [SLSA — OpenSSF projects](https://openssf.org/projects/slsa/) | [OpenSSF Scorecard](https://scorecard.dev/)

**What PulsePlay must do.**
- Run Scorecard on the repo. Aim for >= 7/10 within 6 months.
- Aim for **SLSA Build Level 2** at minimum: provenance generated, kept private, build platform secured. Level 3 (hardened build) for v1.0.
- Sign releases with Sigstore.
- Publish SBOM (SPDX or CycloneDX) per release.

**Applies to.** OSS project directly. This is one of the most testable claims PulsePlay can make about being "enterprise-ready."

### 4.15 Compliance summary matrix

| Standard | OSS code | Hosted ops | Priority for v1.0 | Effort |
|---|---|---|---|---|
| NIST AI RMF + GenAI Profile | Both | Both | High | Medium (docs + threat model) |
| NIST CSF 2.0 | Evidence | Both | Medium | Medium |
| NIST SP 800-207 (ZTA) | Defaults | Ops | High | Low (already aligned) |
| OWASP API Top 10 (2023) | Code | Ops | High | Medium |
| OWASP LLM Top 10 (2025) | Code | Ops | **Critical** | High (prompt injection is the killer) |
| CSA AICM | Both | Both | Medium | High (243 controls — staged) |
| ISO/IEC 27001 | Evidence | Ops | Medium | Low for OSS, high for ops |
| ISO/IEC 42001 | Evidence | Ops | High | Medium |
| EU AI Act | Hooks | Ops | High in EU | Medium |
| SOC 2 Type II | Evidence | Ops | High in B2B | High for ops |
| GDPR | Hooks | Ops | High in EU | Medium |
| MITRE ATLAS | Both | Both | High | Medium |
| NIST SSDF (SP 800-218) | Code | Ops | High | Low (mostly process) |
| OpenSSF Scorecard / SLSA | Code | Ops | **Critical** for OSS legitimacy | Medium |

The **two non-negotiables for v1.0** in this view: **OWASP LLM Top 10** alignment (because prompt injection is the killer threat for any AI-over-data product), and **OpenSSF Scorecard ≥ 7 + SLSA Build L2** (because that is the verifiable supply-chain claim enterprises will check).

---

## 5. Embed SDK patterns — what best-in-class looks like

This section catalogues the four major BI vendors' embedding SDKs. The goal is not just "what exists" but to identify a **cross-vendor pattern that PulsePlay's `BIAdapter` interface should converge on**. If the contract reflects what the vendors are actually shaped like, adapter authors will find it natural.

### 5.1 Power BI — `powerbi-client` and `powerbi-client-react`

**Package.** `powerbi-client` on npm. Companion React wrapper `powerbi-client-react`. Models lib `powerbi-models`. Authoring extension `powerbi-report-authoring`. The npm package was last updated March 2026 — actively maintained. URL: [powerbi-client — npm](https://www.npmjs.com/package/powerbi-client) | [PowerBI-JavaScript on GitHub](https://github.com/microsoft/PowerBI-JavaScript) | [Power BI embedded analytics Client APIs — Microsoft Learn](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/)

**API surface (mapped to PulsePlay's `mount/on/send/destroy`).**
- `mount` ≈ `powerbi.embed(element, config)` returns an `Embed` object (Report / Dashboard / Tile / Visual / QnA).
- `on` ≈ `embed.on('eventName', callback)` for events: `loaded`, `rendered`, `pageChanged`, `dataSelected`, `error`, `bookmarkApplied`, `commandTriggered`, `selectionChanged`, `filtersApplied`, `visualClicked`, `visualRendered`, etc.
- `send` ≈ `embed.setFilters(filters)`, `embed.setPage(name)`, `embed.bookmarksManager.apply(name)`, `embed.exportData()`, `embed.refresh()`.
- `destroy` ≈ `powerbi.reset(element)` or `embed.off('event')` + DOM removal.

**Auth model.** Embed token issued server-side by Power BI REST API; **NEVER** issue client-side. Token is short-lived (default 1 hour, configurable up to 24 hours).

**Sandbox / iframe constraints.** Power BI Embedded uses an iframe under the hood. Microsoft's own custom-visuals are sandboxed with `allow-scripts` only. Combining `allow-scripts` and `allow-same-origin` is explicitly called out as a security anti-pattern (the embedded doc can remove its own sandbox). For PulsePlay's host iframe wrapping a Power BI embed, the sandbox should be as narrow as possible while allowing the SDK to function (typical: `allow-scripts allow-same-origin allow-popups allow-forms`).

**Streaming / realtime.** Streaming datasets via push; report viewers update via SignalR-backed change detection.

**Open issues / limitations.**
- **Cross-origin iframe nesting:** embedding a PBI report that itself contains an embedded paginated report is **not supported** due to cross-origin restrictions.
- HTML Content custom visuals can't host iframes that need a less restrictive sandbox than the parent.

**Source for limitations.** [Power BI Embedded — iframe sandbox attribute (Fabric Community)](https://community.fabric.microsoft.com/t5/Service/Power-BI-Embedded-iframe-sandbox-attribute/m-p/2358591) | [Embed report containing embedded paginated rep](https://community.fabric.microsoft.com/t5/Developer/Embed-report-containing-embedded-paginated-report-Cross-origin/m-p/4722341)

### 5.2 Tableau — Embedding API v3 + `<tableau-viz>` web component

**Package.** Embedding API v3. Used as a standard ES module + the `<tableau-viz>` Web Component. URL: [Embedding API v3 — Tableau Help](https://help.tableau.com/current/api/embedding_api/en-us/index.html) | [Tutorial](https://help.tableau.com/current/api/embedding_api/en-us/tutorial/tutorial.htm) | [About the Embedding API v3](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_about.html) | [Embedding API v3 samples — GitHub](https://github.com/tableau/embedding-api-v3-samples)

**API surface.**
- `mount` ≈ Add `<tableau-viz src="..." token="...">` to the DOM, OR `new TableauViz()` programmatically and append.
- `on` ≈ `tableauViz.addEventListener(TableauEventType.X, callback)`. From v3.3, you can declaratively bind handlers via attributes on the web component.
- `send` ≈ Methods on the `Worksheet` or `Dashboard` API: `applyFilter`, `selectMarks`, `clearSelectedMarks`, `getSummaryDataAsync`, etc. Plus the `Workbook` API: `revertAllAsync`, `activateSheetAsync`.
- `destroy` ≈ Remove the element from the DOM; the Web Component cleans up.

**Event vocabulary (TableauEventType).**
- `FirstInteractive` (the load-complete signal — fires when the view is interactive)
- `MarksSelectionChanged`
- `FilterChanged`
- `ParameterChanged`
- `TabSwitched`
- `URLAction`
- `CustomMarkContextMenuEvent`
- `EditButtonClicked`, `EditInDesktopButtonClicked`
- `WorkbookPublished`, `WorkbookReadyToClose`

**Auth model.** JWT-based connected-app authentication is the modern pattern. JWT is signed server-side with the connected app's secret; passed to the embed via the `token` attribute. Old "trusted ticket" model still supported.

**Sandbox / iframe constraints.** `<tableau-viz>` itself creates an iframe. Same broad sandbox considerations as Power BI.

**Source.** [Add Event Listeners to the Embedded Tableau View](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_event.html) | [Interact with the View](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_interact.html) | [React components](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_react.html)

### 5.3 Qlik — `qlik-embed` web component (Qlik Cloud) + Mashup APIs (Qlik Sense / QlikView legacy)

**Package.** `qlik-embed` is the modern library for Qlik Cloud, distributed as a script tag + Web Component, with React bindings via `@qlik/embed-react`. The older capability APIs (Qlik Sense) and Single Integration API (iframe-based) are still supported but de-emphasized. **QlikView mashup API** is in maintenance mode — still works for QlikView 12.x but no new development.

**URL.** [Discovering qlik-embed](https://community.qlik.com/t5/Design/Discovering-qlik-embed-Qlik-s-new-library-for-Embedding-Qlik/ba-p/2141202) | [Embedding Qlik Sense in web applications](https://help.qlik.com/en-US/sense-developer/November2025/Content/Sense_Helpsites/embed-qlik-sense.htm) | [Embed objects, apps, and visualizations](https://help.qlik.com/en-US/sense-developer/November2025/Subsystems/Mashups/Content/Sense_Mashups/Embed/embed.htm) | [qlik-embed quickstart — Qlik Developer Portal](https://qlik.dev/embed/capability-api/quickstart/build-a-simple-mashup-capability-api/) | [Web integration examples — GitHub](https://github.com/qlik-oss/web-integration-examples)

**API surface.**
- `mount` ≈ `<qlik-embed ui="analytics/sheet" app-id="..." object-id="...">` Web Component, or programmatic `new QlikEmbed()`.
- `on` ≈ Web Component events for selections, errors, ready.
- `send` ≈ Selection state via the Engine API; commands via the Capability API for legacy.
- `destroy` ≈ Remove from DOM.

**Auth model.** OAuth2 Client ID / Client Secret. Web integration ID required in tenant CORS config.

**Sandbox.** Iframe-backed.

**QlikView legacy.** The QlikView mashup API uses a JavaScript proxy (qva.js) loaded from the QlikView server. CORS restrictions apply. As long as the QlikView server is reachable and licensed, the API works — just don't expect new features.

### 5.4 Looker — `@looker/embed-sdk`

**Package.** `@looker/embed-sdk` on npm. Open-source on GitHub. URL: [@looker/embed-sdk — main page](https://looker-open-source.github.io/embed-sdk/) | [npm](https://www.npmjs.com/package/@looker/embed-sdk) | [Embed SDK on GitHub](https://github.com/looker-open-source/embed-sdk) | [Introduction to the Embed SDK — Google Cloud](https://cloud.google.com/looker/docs/embed-sdk-intro) | [Signed embedding](https://cloud.google.com/looker/docs/signed-embedding)

**API surface.**
- `mount` ≈ `LookerEmbedSDK.createDashboardWithId(id).appendTo(element).build().connect()`. Builder pattern.
- `on` ≈ `.on('dashboard:run:start', cb)`, `.on('dashboard:run:complete', cb)`, `.on('dashboard:filters:changed', cb)`, `.on('drillmenu:click', cb)`, `.on('page:changed', cb)`.
- `send` ≈ `connection.send('dashboard:run', {})`, `connection.send('dashboard:filters:update', {filters: {...}})`, plus message-passing for custom commands.
- `destroy` ≈ `connection.disconnect()` + DOM removal.

**Auth model.** Signed embed URL — server-side, with secret + permissions encoded into a signed URL the iframe loads. The signed URL's signature includes the user ID, permissions, and other claims the embed will use.

**Sandbox / iframe constraints.** Standard iframe; the embed URL uses Looker cookies so cross-origin cookie policies matter.

**Streaming.** No native streaming. Polling-based "run scheduled" is the closest.

### 5.5 Cross-vendor pattern observations — what should `BIAdapter` look like?

Common shape across all four major BI vendors:

| PulsePlay concept | Power BI | Tableau | Qlik | Looker |
|---|---|---|---|---|
| **mount** | `powerbi.embed()` | `<tableau-viz>` element / `new TableauViz()` | `<qlik-embed>` / `new QlikEmbed()` | `LookerEmbedSDK.createX().build().connect()` |
| **on** | `embed.on('event', cb)` | `addEventListener(TableauEventType.X)` | Web Component event | `.on('event', cb)` |
| **send** | `embed.setFilters()`, etc. | Worksheet/Dashboard API | Engine API selections | `connection.send('msg', payload)` |
| **destroy** | `powerbi.reset()` | Remove element | Remove element | `connection.disconnect()` |
| **token model** | Server-issued embed token | JWT (connected app) | OAuth2 (web integration ID) | Signed URL |
| **realtime** | SignalR-backed | Polling | Engine pub/sub | Polling |

**Common event vocabulary** PulsePlay should normalize:

| Generic event | Power BI | Tableau | Qlik | Looker |
|---|---|---|---|---|
| `ready` | `loaded` + `rendered` | `FirstInteractive` | `ready` | `dashboard:run:complete` |
| `page-changed` | `pageChanged` | `TabSwitched` | (sheet change in API) | `page:changed` |
| `filter-applied` | `filtersApplied` | `FilterChanged` | (selection state) | `dashboard:filters:changed` |
| `selection-made` | `dataSelected` | `MarksSelectionChanged` | `selection-changed` | `drillmenu:click` |
| `error` | `error` | `Error` | (engine error) | `error` |
| `command-triggered` | `commandTriggered` | `URLAction` | (custom) | `drillmenu:click` |

**A "well-shaped" `BIAdapter` contract** should therefore expose:

```typescript
interface BIAdapter {
  // Vendor identity + capabilities (Singer-style schema phase)
  readonly vendor: string;
  readonly version: string;
  readonly contractVersion: string; // semver of the BIAdapter spec it implements
  capabilities(): AdapterCapabilities; // events emitted, commands accepted, sandbox needs

  // Lifecycle (mount/destroy)
  mount(container: HTMLElement, config: EmbedConfig): Promise<void>;
  destroy(): Promise<void>;

  // Event subscription (Singer-style record phase)
  on<E extends BIEventType>(event: E, handler: BIEventHandler<E>): UnsubscribeFn;

  // Command channel (the "send" axis)
  send<C extends BICommandType>(command: C, payload: BICommandPayload<C>): Promise<BICommandResult<C>>;

  // State snapshot (Singer-style state phase) — for crash recovery + assistant context
  snapshot(): AdapterSnapshot;
  restore(snapshot: AdapterSnapshot): Promise<void>;
}
```

The five additions over the current PulsePlay `BIAdapter`:
1. **`contractVersion`** — explicit semver compatibility declaration.
2. **`capabilities()`** — what does this adapter actually support? Lets PulsePlay degrade gracefully when an adapter doesn't implement, say, snapshot.
3. **`snapshot/restore`** — survives reload, supports the "what was the user looking at" question for the AI.
4. **Generic event/command typing** — TypeScript discriminated unions across the vendor-agnostic vocabulary.
5. **Promise-based send** — vendor commands are async, modeling them as such avoids the callback-vs-promise inconsistency across the four SDKs.

**Cross-vendor pollination:** Tableau's TableauEventType discriminated-union approach is the cleanest of the four. Looker's builder pattern is the most ergonomic for users. Power BI's Models package (Pydantic-like schemas) is the most rigorous at compile time. PulsePlay should borrow from all three.

---

## 6. License recommendations

PulsePlay is open-source and wants to:
1. **Attract third-party adapter contributors** (BI vendors and AI vendors writing adapters).
2. **Be adopted by enterprises** including in regulated sectors that vet OSS legally.
3. **Avoid the "AWS hosts our project for free and undercuts us" trap** if PulsePlay later monetizes a hosted version.

These goals partially conflict — the licenses below trade between them.

### 6.1 The candidates

**MIT.** Permissive. Nine words of obligation: "include the copyright notice and the license." No patent grant. No copyleft. Used by: LangChain (no — Apache 2.0; common misperception), MCP spec, jQuery, React, lodash, most of the Node ecosystem.

**Apache 2.0.** Permissive. Same freedoms as MIT, plus:
- **Explicit patent grant** from contributors.
- **NOTICE file preservation** requirement.
- **Trademark protection** (no implied trademark license).
- **Termination clause for patent litigation** — contributors who sue you for patent infringement lose their grant.

Used by: dbt-core, LangChain, Trino, Apache Foundation projects, Kubernetes, Terraform (until 2023), most of the modern data-stack OSS.

**MPL 2.0 (Mozilla Public License).** **Weak copyleft per file.** You can mix MPL 2.0 code with proprietary code in the same product, but modifications to MPL 2.0 files must be released under MPL 2.0. Used by: Firefox, Mozilla projects, some niche libraries.

**BSL (Business Source License) 1.1.** **Source-available, not open-source per OSI.** The licensor specifies a "Change License" (typically Apache 2.0) and a "Change Date" (typically 4 years). Until the Change Date, production use is restricted to certain classes of users (typically: anyone except a competing hosted-service provider). After the Change Date, the code automatically becomes the Change License. Used by: MariaDB MaxScale, CockroachDB (now Apache 2.0 as of certain versions), Sentry.io, Materialize, ZeroTier, HashiCorp products since 2023, dbt Fusion engine.

### 6.2 What similar projects use

| Project | License | Notes |
|---|---|---|
| **LangChain** | Apache 2.0 | Patent grant + ecosystem maturity |
| **dbt-core** | Apache 2.0 | Continuous since 2016. dbt Fusion engine on a separate (non-Apache) license — see below |
| **Airbyte** | Originally MIT → ELv2 (2022) → mostly back to permissive (MIT) for connectors as of 2024 | Volatility hurt them; partial reversal |
| **Trino** | Apache 2.0 | Ongoing |
| **Singer** | Per-tap; many AGPL-3.0 (e.g., singer-io original); some MIT | Mixed; the spec itself is open |
| **MCP (the project)** | MIT (spec/main repo) + Apache 2.0 (servers repo for new contributions) | Now under Linux Foundation governance |
| **MCP servers (reference)** | Apache 2.0 (new) / MIT (legacy) | Migrated for patent protection |
| **Hex** | Closed | Not OSS |
| **OpenSearch (Elastic fork)** | Apache 2.0 | After Elastic moved Elasticsearch to dual ELv2/SSPL |

**Pattern observation.** Successful **infrastructure-tier** OSS that wants ecosystem contributions overwhelmingly chooses **Apache 2.0**. The MIT-licensed projects in the chart are either (a) ones that pre-date the patent-litigation era of OSS or (b) projects where vendor patent risk is low.

**The BSL pattern** (HashiCorp, Sentry, MariaDB MaxScale) is for projects where the **maintaining company has commercial-grade intent** and wants to prevent AWS-style undercutting. The dbt Fusion case is illustrative — dbt Labs kept dbt-core on Apache 2.0 (community-maintained core) but their newer Fusion engine is on a more restrictive license. This dual-license posture preserves the ecosystem while protecting commercial interests.

**Sources.** [dbt Licensing FAQ](https://www.getdbt.com/licenses-faq) | [Licensing dbt — dbt Labs blog](https://www.getdbt.com/blog/licensing-dbt) | [Business Source License — MariaDB](https://mariadb.com/bsl-faq-mariadb/) | [BSL 1.1 license text](https://mariadb.com/bsl11/) | [BSL adopters — dotCMS](https://www.dotcms.com/blog/bsl-in-action-whos-doing-it-and-does-it-work) | [HashiCorp BSL](https://www.hashicorp.com/en/bsl) | [Couchbase BSL adoption](https://www.couchbase.com/blog/couchbase-adopts-bsl-license/) | [Business Source License — Wikipedia](https://en.wikipedia.org/wiki/Business_Source_License) | [MIT vs Apache 2.0 — Oreate AI](https://www.oreateai.com/blog/mit-vs-apache-20-decoding-the-open-source-licenses-that-shape-ais-future/086ddac3ca198ebbdaf48f876c7bbd08)

### 6.3 Recommendation for PulsePlay

**Adopt Apache 2.0.** Reasoning:

1. **Patent grant.** PulsePlay's space (AI agents, BI federation) is patent-rich. Microsoft, Salesforce, IBM, Google all hold portfolios that touch this. A patent grant in the contributor agreement protects downstream users.

2. **Vendor adapter contributors will require it.** BI vendor DR teams (Microsoft, Tableau, Qlik, Looker) cannot easily contribute to MIT-licensed projects without explicit patent waivers from their employer's legal team. Apache 2.0 has the patent grant baked in — a vendor PR signs the patent grant by virtue of contributing.

3. **Enterprise legal review is fastest.** Apache 2.0 is on the OSI-approved list, the Eclipse Foundation list, and is acceptable to virtually every enterprise legal team without further review. MIT is also acceptable, but Apache 2.0's patent provision is a positive signal not a negative one.

4. **MCP and most of the modern AI infrastructure stack are Apache 2.0.** PulsePlay imports MCP servers, LangChain integrations, dbt-shape thinking — staying compatible upstream is easiest at Apache 2.0.

5. **Future BSL pivot is still possible.** If PulsePlay later needs to protect a hosted commercial offering, you can BSL future versions while keeping older versions permissive (HashiCorp pattern). Starting on Apache 2.0 leaves this option open. Starting on BSL forecloses on community contribution velocity.

**Things to avoid:**
- **GPL family** (any version). Hostile to enterprise consumption. Particularly painful for SaaS vendors who would have to AGPL-disclose if they integrate.
- **MPL 2.0** unless you have a specific per-file copyleft case. Doesn't fit the connector-platform shape.
- **BSL at v1.0.** Premature; alienates contributors before there is anything to protect.

**Companion docs to ship:**
- `LICENSE` (Apache 2.0 standard text)
- `NOTICE` (per Apache 2.0 §4d)
- `CONTRIBUTING.md` (with explicit DCO / CLA decision)
- `SECURITY.md` (vulnerability disclosure)
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1 is standard)

**On CLA vs DCO.** The Apache Foundation uses a CLA (Individual + Corporate). The Linux kernel uses DCO (Developer Certificate of Origin) — sign-off in commits. DCO is lower friction; CLA is more legally robust. Recommendation: **DCO at v1.0** to maximize contribution velocity; revisit CLA if PulsePlay graduates to a foundation (LF AAIF would be a natural home given PulsePlay's MCP focus).

---

## 7. Demo strategy patterns

The hardest part of selling a "any A + any B" platform is **avoiding abstraction-poisoning** in the demo. If the demo is "look how generic it is," prospects nod politely and forget. The platforms that have succeeded in this shape have all followed one of three demo formulas:

### 7.1 The marketplace pattern (Zapier / Slack apps / dbt Hub / Airbyte connectors)

**Mechanic.** Show a directory page with vendor logos. Customer's brain auto-completes "if X is in there, my X is in there too." The directory is the demo.

**Why it works.** Vendor logos are extremely high-bandwidth signals. A 4×6 grid of recognizable BI logos + a 4×6 grid of AI logos is, for the right audience, a stronger demo than any video.

**Risks.**
- Empty squares are devastating. If the grid has Power BI but not Tableau, that's a "no" from a Tableau shop. Plan grid completion as a P0 product launch criterion.
- "Coming soon" labels work for a few squares; more than ~30% "coming soon" reads as vapor.

**Sources.** [Heroku Elements Marketplace](https://elements.heroku.com/) | [Zapier developer platform](https://zapier.com/developer-platform) | [Salesforce AppExchange — partner program](https://www.salesforce.com/partners/become-a-partner/) — note: 91% of Salesforce customers have installed at least one AppExchange app, demonstrating that this surface is meaningfully consulted by buyers.

**For PulsePlay.** Build the registry surface early (`docs/REGISTRY.md` or a static site) listing every adapter and every connector with status (alpha / beta / GA / community / partner / first-party). Even a 4-vendor 5-connector grid is enough at v0.2.

### 7.2 The reference deployment / lighthouse pattern (Cisco Crosswork / Salesforce AppExchange)

**Mechanic.** Pick **one vertical**, build a polished end-to-end deployment for it. The whole platform's credibility rides on that one deployment looking real. Once it does, the abstraction reads as proven.

**Why it works.** Concreteness beats genericity. "We built a CPG-trade-spend command center on PulsePlay" is more compelling than "PulsePlay supports CPG."

**Risks.**
- The lighthouse can be misread as scope. Prospects will ask "do you do retail too?" — and if the answer is "yes but we haven't shipped that lighthouse yet," they discount.
- Vertical-specific features creep in and pollute the platform.

**For PulsePlay.** The CPG/FMCG playground (already in `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md`) is well-suited to be the v1.0 lighthouse. Pair it with an explicit "the platform underneath this is fully generic — see the BIAdapter spec" disclosure in the demo.

### 7.3 The vendor-swap formula (live demo of the abstraction)

**Mechanic.** During the demo, **swap a vendor mid-conversation.** "I just clicked Y and switched from Power BI to Tableau. The AI sidebar is still answering. The conversation history is preserved." This is the single most credible way to demo "any A + any B" — show the swap.

**Why it works.** It directly attacks the prospect's skepticism. Most platforms can't do this; the ones that can have a permanent advantage in the demo room.

**Risks.**
- The swap has to be visually instant (< 2 seconds). If it stalls, the demo dies.
- The data model has to actually be similar enough across vendors that the AI's answer makes sense post-swap. PulsePlay should pre-build identical sample dashboards in each vendor for this purpose.

**Variants.**
- **AI swap.** "Now I'm switching from Claude to Genie." Same dashboard, new brain, different reasoning style visible.
- **Split-screen.** Show two BI vendors side-by-side, one assistant answering questions across both. This is harder to pull off but eye-popping when it works.

**For PulsePlay.** The vendor-swap demo is **PulsePlay's killer demo formula**. Plan the demo such that the swap is the climax, not a footnote. Build the sample dashboards (or bring vendor-supplied ones) explicitly for this.

### 7.4 What the incumbents do — and why PulsePlay can't copy them

| Incumbent | Demo formula | PulsePlay applicability |
|---|---|---|
| Microsoft Copilot | "Look how it generates DAX from one prompt" | Single-vendor wow moment. PulsePlay doesn't have that single-tool depth. |
| Tableau Pulse | "Subscribe to a metric, get a digest" | Workflow demo. Long-running. PulsePlay can do this too but it's not differentiating. |
| ThoughtSpot Spotter | "Search for it like Google" | The search-bar metaphor. Strong wedge but they own it. |
| Sigma AI Builder | "Describe an app, get an app" | App-builder demo. Different category from PulsePlay. |
| Hex Magic | "Notebook agent writes the analysis" | Notebook category. Different shape. |

PulsePlay can't out-demo these in their own categories. **PulsePlay's demo has to be about the abstraction itself** — and the only credible way to demo an abstraction is to swap.

### 7.5 The "live customer" pattern

Most of the incumbents above lean heavily on customer logos and named case studies. PulsePlay v1.0 won't have these. The substitute, while early:

- **Open-source GitHub stars** as a credibility proxy.
- **A public, hosted demo** (`demo.pulseplay.dev` or similar) where prospects can play with their own embed URL.
- **Recorded demos** of the swap formula (60-90 seconds, no narration, just action).
- **Reference implementation in CPG/FMCG** with screenshots in the README.

**Don't fabricate case studies.** The brutal-honesty rule applies — invented case studies get caught and end careers. If PulsePlay doesn't yet have a deployed customer, say so explicitly. Pre-launch, the credibility comes from the codebase quality, the standards alignment (Section 4), and the demo that works in the room.

---

## 8. Cautionary tales — what's killed similar platforms

Five real cases where "platform of platforms" or "any A + any B" plays died. PulsePlay should learn from each.

### 8.1 Yahoo! Pipes (2007 → 2015) — beloved but dependent

**What happened.** Yahoo! Pipes was a graphical "build mashups from web feeds" platform launched February 2007. It enabled non-coders to combine RSS feeds, web pages, and APIs into custom data flows. It was a critical-darling product. **Shut down September 30, 2015**, with Yahoo's stated reason being "focus our efforts on core Yahoo product experiences."

**Why it died.** Two structural reasons (per [Reflections on the Closure of Yahoo Pipes](https://blog.ouseful.info/2015/06/05/reflections-on-the-closure-of-yahoo-pipes/) and [ReadWrite coverage](https://readwrite.com/yahoo-shuts-down-pipes/)):
1. **API economy migration.** When Pipes launched, the web was awash in open APIs. As Amazon, Twitter, and others added authentication and rate-limiting, Pipes' integrations broke en masse. Pipes never had a vendor-by-vendor maintenance model.
2. **Yahoo deprioritized the product.** It was always a side project, not a strategic asset.

**Lesson for PulsePlay.**
- **Vendor SDKs change.** Power BI, Tableau, Qlik, Looker all change their SDKs every quarter. PulsePlay needs a per-adapter maintenance contract — either a paid maintainer per vendor or a vendor-DR co-maintenance model (Section 2.6 lesson).
- **Don't be a side project at the parent org.** PulsePlay-the-OSS is independent of any one vendor's strategy by design. Good. Stay that way.

### 8.2 Heroku add-ons (peaked ~2014, hollowed out 2024-2026)

**What happened.** Heroku's Elements Marketplace was the prototype "add-on ecosystem" — third-party services (databases, monitoring, search, etc.) that bolt onto a Heroku app via a single click. At peak, it hosted 200+ add-ons and was a model for platform partner programs. By 2022, removal of the free tier hurt the ecosystem; in February 2026, **Salesforce announced Heroku is transitioning to "sustaining engineering mode"** — no new features, strategic pivot toward AI products.

**Why it stalled.** The **platform owner's strategic choices** (Salesforce's prioritization of Agentforce over Heroku) starved the platform of investment.

**Sources.** [Heroku Enters Sustaining Engineering Mode](https://www.deployhq.com/blog/heroku-sustaining-engineering-alternatives) | [Heroku Elements Marketplace](https://elements.heroku.com/) | [Bringing an Add-on to Market — Heroku Dev Center](https://devcenter.heroku.com/articles/bringing-an-add-on-to-market) | [Heroku Ecosystem Partner Program](https://www.heroku.com/elements/partner/)

**Lesson for PulsePlay.**
- **Platform owners can starve their own ecosystem.** PulsePlay being open-source mitigates this — there is no parent org to deprioritize the platform.
- **The lock-in is the ecosystem, not the platform.** Heroku users invested in add-on dependencies. PulsePlay should structure adapter contracts so that adapters are usable without PulsePlay too — a portable spec, not platform-bound code.

### 8.3 Slack apps cut (2024-2026 deprecation cycle)

**What happened.** Slack's classic apps and legacy custom integration bot users were quietly deprecated. As of June 4, 2024, you can no longer create new classic apps or custom integration bots. Beginning **March 31, 2025**, legacy custom bots stopped functioning. Beginning **November 16, 2026**, classic apps will stop functioning. Many integrations developers had to rebuild on the modern Slack Apps platform.

**Sources.** [Discontinuing creation of classic apps — Slack](https://docs.slack.dev/changelog/2024-04-discontinuing-new-creation-of-classic-slack-apps-and-custom-bots/) | [Discontinuing support for legacy custom bots](https://docs.slack.dev/changelog/2024-09-legacy-custom-bots-classic-apps-deprecation/) | [Slack changelog — deprecations tag](https://docs.slack.dev/changelog/tags/deprecation/)

**Why this happened.** Slack has multiple ways to build apps; the old paths were a maintenance burden and security liability. The platform owner forced migration.

**Lesson for PulsePlay.**
- **Multiple "right ways" rot the ecosystem.** Pick ONE adapter contract. Resist the urge to add a "v2" before the ecosystem has saturated v1.
- **Communicate breaking changes 18 months ahead.** Slack gave roughly that runway. Fewer than 12 months provokes mutiny.

### 8.4 Microsoft Power Automate vs Zapier — when does platform owner kill connector ecosystem?

**What's true.** Power Automate has roughly **1,000 prebuilt connectors**; Zapier has **8,000+**. Power Automate's strategic incentive is to keep customers in the Microsoft ecosystem; Zapier's is the opposite. As of 2025, Microsoft has aggressively added AI / agentic capabilities to Power Automate (Copilot-driven flow creation, autonomous agents), but the connector breadth gap with Zapier has not closed.

**Sources.** [Zapier vs Power Automate — Zapier blog](https://zapier.com/blog/zapier-vs-power-automate/) | [Power Automate vs Zapier — ERP Software Blog](https://erpsoftwareblog.com/2025/09/power-automate-vs-zapier-which-automation-tool-wins-in-2025/)

**Lesson for PulsePlay.** Microsoft does not technically "kill" Zapier — but it competes by deeply integrating Power Automate into M365 such that the marginal cost is zero for a tenant already paying for E5 licenses. **The economic moat of a platform-owner-bundled connector hub is real.** PulsePlay should not try to compete with Microsoft on integration breadth in the Microsoft ecosystem; PulsePlay's wedge is the cross-vendor AND cross-AI story, which Microsoft cannot offer (their incentive is Copilot+Azure-only).

### 8.5 OpenAI Plugins — fast launch, faster shutdown

**What happened.** Launched March 2023 with 1,000+ plugins by partners. By March 19, 2024, no new conversations via plugins. By April 9, 2024, all plugin-based chats terminated. **13-month total lifespan.** Users mostly never noticed because most never used plugins.

**Why it died.** Per [OpenAI Plugin retrospectives](https://aionx.co/chatgpt-reviews/chatgpt-plus-plugins-review/) and [Drio's analysis](https://www.getdrio.com/blog/chatgpt-plugins-vs-custom-gpts):
- Concentration of usage among power users; mass-market never adopted.
- Confusing UX (manual plugin selection per conversation).
- Operational cost to OpenAI (review pipeline, security pipeline, infra).
- Better internal alternative (Custom GPTs, then GPTs Actions, then MCP apps).

**Sources.** [ChatGPT plugins — OpenAI](https://openai.com/index/chatgpt-plugins/) | [ChatGPT Plus Plugins Review 2025](https://aionx.co/chatgpt-reviews/chatgpt-plus-plugins-review/) | [Have plugins been replaced — OpenAI Community](https://community.openai.com/t/have-plugins-been-replaced-completely/475694)

**Lesson for PulsePlay.**
- **Don't ship a plugin / extension surface unless you can guarantee it for years.** Adapter authors will not invest if the surface might disappear.
- **Confusing UX kills ecosystem adoption.** PulsePlay's vendor picker + connector picker UX needs to be obvious and stable.
- **Eventually, MCP became the survivor.** OpenAI didn't kill the underlying need for "external data and tools in chat" — they killed the wrong implementation. Right idea, wrong shape. PulsePlay should align with MCP precisely because the alternative shapes have all already been tried and discarded.

### 8.6 Cross-cutting cautionary lessons for PulsePlay

1. **Vendor SDKs break adapters.** Plan the maintenance model up front — either community contribution + co-maintenance, paid first-party, or both. Without a maintenance model, adapters bit-rot in 18 months.
2. **Platform-owner deprioritization kills ecosystems.** PulsePlay being OSS is the partial defense. The other defense is keeping adapters as portable code that is useful even outside PulsePlay.
3. **Don't ship a plugin surface you can't commit to long-term.** OpenAI Plugins and Slack classic apps both warn here.
4. **Bundling kills standalone platforms.** Microsoft bundled into M365 is the economic threat. PulsePlay's wedge has to remain the cross-vendor story Microsoft will not offer.
5. **Multiple "right ways" rot ecosystems.** One contract, semver discipline, long runway on breaking changes.

---

## 9. The "MCP everything" hypothesis

Hypothesis under test: **In 2026, MCP is becoming the de-facto standard for AI-to-tools and AI-to-data connections; PulsePlay should make MCP a first-class connector type alongside chat-completion and conversation-pattern.**

This section evaluates the hypothesis with current evidence, addresses counter-arguments, and concludes.

### 9.1 Evidence supporting "MCP has won"

**1. Major LLM providers have all adopted it.**
- **OpenAI** officially adopted MCP March 2025. ChatGPT desktop ships with MCP support.
- **Google DeepMind** confirmed MCP support in Gemini in April 2025.
- **Microsoft** integrated MCP into Copilot Studio in July 2025, shipped official C# SDK in partnership with Anthropic.
- **Anthropic** authored it.

That is the four biggest model providers in the world adopting one protocol within six months of each other. Modern computing has very few precedents for this level of cross-vendor convergence at this speed.

**Sources.** [A Year of MCP — Pento](https://www.pento.ai/blog/a-year-of-mcp-2025-review) | [MCP Adoption in 2026 — Knak](https://knak.com/blog/mcp-adoption-in-2026-what-marketers-need-to-know/)

**2. Enterprise-tier governance has formed.**
In December 2025, Anthropic donated MCP to the Linux Foundation under the **Agentic AI Foundation (AAIF)**, co-founded by Anthropic, Block, and OpenAI. This removes the "Anthropic-controlled" objection that any standard-track work has to overcome.

**Source.** [Model Context Protocol — Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)

**3. The BI vendors have shipped MCP servers.**
- **ThoughtSpot** Agentic MCP Server (July 2025).
- **Sigma** as both MCP Client and MCP Server (December 2025).
- **Qlik** MCP Server (GA early 2026).
- **Sisense** MCP server (late 2025 / early 2026).

This is the leading indicator that matters most for PulsePlay: **the surfaces PulsePlay wants to host already have MCP servers.** PulsePlay's MCP-first approach inherits an existing ecosystem rather than fighting for one.

**4. Server count growth is exponential and continues.**
- Q1 2025: ~1,200 public MCP servers.
- April 2026: 9,400+ public servers (different sources count differently — see Section 3.1).
- 78% of enterprise AI teams report at least one MCP-backed agent in production (per industry survey — directional, not authoritative).

**5. Reference SDKs in every major language.**
Python, TypeScript, C# (Microsoft), Java, Rust, Go reference SDKs all maintained. Anthropic reported 97M monthly SDK downloads by December 2025.

### 9.2 Honest counter-arguments

**Counter-argument #1: protocols don't always win on momentum alone.**
History has plenty of "won" protocols that lost (XML-RPC, SOAP, OData, JSON-RPC's various shapes). Momentum can stall when corner cases collide with reality. **Counter-counter:** MCP is on a faster adoption curve than any of those, and unlike them it has the largest model providers in the world as adopters from day one.

**Counter-argument #2: enterprise adoption is reported, not measured.**
The "78% of enterprise AI teams" stat comes from industry surveys. Real enterprise penetration is harder to measure. **Counter-counter:** even if the real number is 30%, that's still extraordinary for an 18-month-old protocol, and the trend lines are vertical.

**Counter-argument #3: the chat-completion API is also a de-facto standard.**
OpenAI's Chat Completions API shape is implemented by Anthropic (via the Messages API and chat-completion bridges), Bedrock, Vertex AI, Groq, Together, Replicate, and roughly every model gateway. It is also a de-facto standard. **Counter-counter:** Chat-completions and MCP solve **different layers**. Chat-completions is the "what does the API call to the model look like" layer. MCP is the "how does the model reach into external systems" layer. Both can win their respective layers.

**Counter-argument #4: A2A is competing for mindshare.**
Google's A2A protocol is also gaining traction (150+ orgs as of April 2026). **Counter-counter:** A2A and MCP are explicitly complementary — A2A for agent-to-agent coordination, MCP for tools/data. Microsoft Agent Framework supports both. They are not in tension.

**Counter-argument #5: the security story is immature.**
MCP servers can be vulnerable to prompt injection through their tool descriptions; permissioning models are early; auth flows for remote MCP servers are still being standardized. **Counter-counter:** This is the maturity tax of any new protocol. The fact that the spec is open and the AAIF is shaping the security posture is a positive signal — security is being addressed in the open.

### 9.3 Verdict

**MCP has won the tools-and-data connector layer.** The evidence on adoption velocity, vendor convergence, and ecosystem governance is strong enough that PulsePlay can plan around MCP being the dominant standard for at least the next 24-36 months without serious risk of betting on a loser.

**The right architectural posture for PulsePlay:**

1. **MCP server (PulsePlay → world).** PulsePlay exposes the BI context (current dashboard, active filters, last-N events) as MCP resources, plus tools for "switch dashboard," "apply filter," "ask AI." This means external agents (Claude Desktop, ChatGPT, Cursor, internal corporate agents) can ground themselves in PulsePlay's BI context. This is **the single highest-leverage X-axis investment.**

2. **MCP client (world → PulsePlay).** PulsePlay's AI sidebar can call out to user-configured MCP servers — Slack, GitHub, Jira, Confluence, the customer's data warehouse MCP server. This expands the assistant's capabilities without PulsePlay implementing every connector itself.

3. **MCP-as-X-axis-connector-type.** The X-axis profile vocabulary (Genie / Azure OpenAI / Bedrock / Foundation Model / Supervisor) gains a new sibling: **MCP**. An MCP profile points to one or more MCP servers; the assistant routes tool calls through them. The host's chat shape can be any of the existing connector shapes — what changes is where tools come from.

4. **Chat-completion-shaped wrappers remain.** Because Claude / Bedrock / Genie / Foundation Model APIs each have provider-specific features (caching, vision, structured output, streaming) that are not fully expressible through MCP. Don't try to make MCP carry the model-call layer; let it carry the tools-and-data layer where it belongs.

**The risk if PulsePlay does not do this.** Every major BI vendor's customers will have agentic Claude / Copilot / Gemini that grounds itself directly in the vendor's MCP server. PulsePlay-without-MCP-support will be a worse experience than the BI vendor's own native MCP server because the customer's agent can read PulsePlay's BI vendor's data without going through PulsePlay. PulsePlay loses its claim to be "where the AI happens."

**The risk if PulsePlay does this and MCP later loses.** Low. Even if MCP is overtaken by a successor protocol, the architectural shape (separate tools-and-data layer from model-call layer) will remain correct. Moving from MCP to its successor would be an incremental adapter swap, not a redesign.

---

## 10. Strategic synthesis

Final, actionable strategic takeaways. This section is for the project lead to read on a Monday morning and act on Wednesday.

### 10.1 Positioning

**PulsePlay is the open-source X×Y substrate for AI-over-BI.** Filling the blanks: "the **LangChain × dbt-adapters** of AI-over-BI." That is:
- **Like LangChain** in that it brings any LLM provider into a unified contract (X-axis), and
- **Like dbt-adapters** in that it brings any vendor surface into a unified contract (Y-axis), and
- **Open-source, Apache 2.0, plug-and-play** — which the commercial BI incumbents and AI incumbents are not.

The honest competitive landscape (Section 1) shows that **the (vendor-neutral on Y) × (vendor-neutral on X) × (open source) cell is empty.** Everyone is filling one or two of those three. PulsePlay can credibly claim all three.

**What PulsePlay is NOT.** PulsePlay is not a BI tool, not an LLM, not an agent runtime. It is the substrate that lets any of those plug into any of the others. Resist scope creep into building any of those primitives.

### 10.2 Architectural priorities

In order of v1.0 importance:

1. **Stabilize the `BIAdapter` contract** with explicit `contractVersion`, `capabilities()`, `snapshot/restore` (Section 5.5 sketch). This is the treaty with the adapter-author community. Get it right before signing partners.

2. **Ship MCP server + MCP client capabilities** (Section 9.3). This is the X-axis convergence point.

3. **Add a connector profile type for MCP** alongside Genie/Azure OpenAI/Bedrock/Foundation Model/Supervisor.

4. **Build the conformance test harness** (Section 2.7 #2). Without this, "drop-in adapter" is a marketing claim, not a product claim.

5. **Ship adapters in priority order:**
   - Power BI (largest installed base; most existing BI buyer pain point)
   - Tableau (best embed SDK; fewest gotchas)
   - Qlik (most aggressive on MCP; aligned partner)
   - Looker (Google ecosystem)
   - Generic iframe (already have; keep as escape hatch)
   
6. **Ship connector profiles in priority order:**
   - Databricks Genie (PulsePlay sister project; fastest path to deployable)
   - Anthropic Claude (via Messages API)
   - Azure OpenAI (largest enterprise base)
   - AWS Bedrock (action groups + Claude on Bedrock)
   - **MCP profile** (the convergence story)
   - LangChain/LangGraph integration (broadest Python community)
   - Mosaic AI Foundation Model (Databricks-hosted)
   - Supervisor agents (multi-agent orchestration)

7. **Multi-agent orchestration is NOT a P0.** PulsePlay should let LangGraph / CrewAI / AutoGen / MAF do that. PulsePlay exposes context via MCP and lets the framework drive.

### 10.3 Standards alignment for v1.0 vs later

**For v1.0 (next 6 months).**
- **OWASP LLM Top 10 (2025)** — full mapping + mitigations doc + threat-model walk-through.
- **OpenSSF Scorecard ≥ 7** — branch protection, code review, signed releases, pinned deps, vuln disclosure policy.
- **SLSA Build Level 2** — provenance generated for every release artifact.
- **NIST AI RMF GenAI Profile** — 12 risks documented with PulsePlay's posture per risk.
- **MITRE ATLAS threat-mapping** — every major attack technique against PulsePlay catalogued.
- **NIST SSDF** — adoption of the four pillars in the contributor process.

**For v1.5 / v2.0 (6-18 months).**
- **CSA AICM** — full 243-control CAIQ self-assessment.
- **ISO 42001 enablement** — operator's playbook.
- **EU AI Act enablement** — operator's playbook for high-risk use cases.
- **SOC 2 Type II evidence kit** — the artifacts a hosted operator needs to pursue Type II within 6 months of going live.

### 10.4 Open-source strategy

- **License: Apache 2.0** (Section 6.3). Patent grant is non-negotiable for the AI/BI space.
- **Governance: BDFL initially, target Linux Foundation AAIF graduation by v2.0.** AAIF is already the home of MCP and overlaps perfectly with PulsePlay's mission.
- **CLA: DCO at v1.0**, revisit to formal CLA at foundation graduation.
- **Adapters as separate packages.** `@pulseplay/bi-adapter-powerbi`, `@pulseplay/connector-claude`, etc. Co-maintained with vendor DR teams where possible.
- **Trusted-tier adapter program.** First-party (PulsePlay maintains), Partner (vendor-co-maintained, security-reviewed), Community (anyone, clearly labelled).
- **Spec lives in the repo, not the docs.** A formal `BIAdapter.spec.md` with versioning is the treaty with adapter authors.
- **Public registry surface (`registry.pulseplay.dev` or static site)** with the marketplace-grid pattern (Section 7.1).

### 10.5 Demo strategy

**The killer demo formula** (Section 7.3): **the live vendor swap.** Pre-build identical sample dashboards in Power BI, Tableau, Qlik, Looker, plus a generic-iframe fallback. Show the swap in < 2 seconds, show the assistant continuing to answer correctly, show the conversation history persisting.

**The lighthouse vertical** (Section 7.2): **CPG/FMCG**. Ship a complete reference deployment for trade-spend / promotional analytics, using the existing CPG taxonomy work in `docs/CPG_FMCG_ENTERPRISE_BLUEPRINT.md`.

**The marketplace surface** (Section 7.1): a public adapter + connector grid with logos, status, and tier badges. Even at v0.2 with 4 vendors and 5 connectors, this surface communicates "this is real."

**Don't fabricate.** Pre-launch credibility comes from code quality, standards alignment, and a demo that works in the room. Real customer logos come later.

### 10.6 The single most important sentence in this document

If the team takes only one thing from this research:

> **MCP has won the tools-and-data connector layer of the AI stack. PulsePlay should make MCP a first-class X-axis connector type and ship an MCP server exposing PulsePlay's BI context, no later than v1.0. Every other architectural decision should be checked against compatibility with this commitment.**

The justification is in Section 9. The execution roadmap implication is in Section 10.2. The standards implication is in Section 4.5 (LLM Top 10 — MCP servers introduce their own attack surface that must be modelled). The competitive implication is in Section 1.12 (every BI incumbent has shipped or will ship an MCP server, and PulsePlay's "any AI brain" wedge depends on speaking the protocol they all now speak).

---

## Appendix A — Source index

For convenience, all primary sources cited above are collected here. Marked categories indicate primary use of the source.

### Competitive landscape (Section 1)

- [Overview of Copilot in Fabric — Microsoft Learn](https://learn.microsoft.com/en-us/fabric/fundamentals/copilot-fabric-overview)
- [Copilot for Power BI overview — Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction)
- [Power BI February 2026 Feature Summary](https://powerbi.microsoft.com/en-us/blog/power-bi-february-2026-feature-summary/)
- [Power BI April 2026 Feature Summary](https://community.fabric.microsoft.com/t5/Power-BI-Updates-Blog/Power-BI-April-2026-Feature-Summary/ba-p/5173904)
- [Power BI Meets AI — Plainsight 2026](https://www.plainsight.pro/blogs/power-bi-meets-ai-mcp-copilot-fabric-agents-explained)
- [About Tableau Pulse](https://help.tableau.com/current/online/en-us/pulse_intro.htm)
- [Tableau Pulse Now Available — Salesforce News](https://www.salesforce.com/news/stories/tableau-pulse-general-availability-news/)
- [Tableau April 2026 New Features](https://www.tableau.com/products/new-features)
- [Tableau September 2025 New Features](https://www.tableau.com/2025-2-september-features)
- [Salesforce introduces Tableau GPT — Salesforce Ben](https://www.salesforceben.com/salesforce-introduces-tableau-pulse-tableau-gpt-generative-ai-for-analytics/)
- [Practical Guide to Deploying Tableau Pulse — Salesforce Ben](https://www.salesforceben.com/practical-guide-to-deploying-your-first-tableau-pulse/)
- [Pulse for Salesforce news — Salesforce](https://www.salesforce.com/news/stories/pulse-for-salesforce-available/)
- [ThoughtSpot automates full platform with Spotter agents — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366636078/ThoughtSpot-automates-full-platform-with-new-Spotter-agents)
- [Spotter — ThoughtSpot product page](https://www.thoughtspot.com/product/agents/spotter)
- [ThoughtSpot Spotter agents — product](https://www.thoughtspot.com/product/agents)
- [ThoughtSpot Introduces Spotter Semantics — March 2026](https://www.thoughtspot.com/press-releases/thoughtspot-introduces-spotter-semantics-to-bring-trust-and-context-to-enterprise-ai)
- [ThoughtSpot Agentic MCP Server — July 2025](https://www.globenewswire.com/news-release/2025/07/29/3123286/0/en/thoughtspot-redefines-ai-interoperability-with-launch-of-thoughtspot-agentic-mcp-server.html)
- [ThoughtSpot acquires Mode — ThoughtSpot Blog](https://www.thoughtspot.com/blog/thoughtspot-acquires-mode)
- [Gemini in Looker overview — Google Cloud](https://docs.cloud.google.com/looker/docs/gemini-overview-looker)
- [Gemini in Looker for Looker Studio overview](https://docs.cloud.google.com/looker/docs/studio/gemini-overview-looker-studio)
- [Looker AI features 2025-2026 — Querio](https://querio.ai/articles/looker-ai-features-natural-language-query-gemini-2025-2026)
- [Sigma December 2025 Product Launch](https://www.sigmacomputing.com/blog/december-2025-product-launch)
- [Sigma AI Toolkit](https://www.sigmacomputing.com/product/ai)
- [Sigma Computing intros AI tools — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366630504/Sigma-Computing-intros-array-of-new-AI-analytics-tools)
- [Hex AI overview](https://learn.hex.tech/docs/getting-started/ai-overview)
- [Hex Fall 2025 Launch](https://hex.tech/blog/fall-2025-launch/)
- [Hex Notebook Agent updates](https://hex.tech/blog/notebook-agent-updates/)
- [Qlik Answers product page](https://www.qlik.com/us/products/qlik-answers)
- [Qlik Debuts Agentic Experience + MCP](https://www.qlik.com/us/news/company/press-room/press-releases/qlik-debuts-agentic-experience)
- [Qlik 2025-2026 — Goodin](https://goodin.fi/qlik-2025-2026-from-data-to-action-the-era-of-ai-agents-and-trust/)
- [Sisense unveils new AI capabilities — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366624918/Sisense-unveils-new-suite-of-AI-powered-capabilities)
- [Sisense targets embedded AI](https://www.techtarget.com/searchbusinessanalytics/news/366637217/Sisense-targets-embedding-AI-with-latest-new-features)
- [SAP Business AI Q1 2026 highlights](https://news.sap.com/2026/04/sap-business-ai-release-highlights-q1-2026/)
- [SAP Joule Agentic AI — SAVIC](https://www.savictech.com/insights/sap-joule-agentic-ai-2026/)
- [SAC AI features explained — s-peers](https://s-peers.com/en/wiki/sac-ai-ml-features-im-ueberblick-joule-just-ask-co-einfach-erklaert/)
- [Domo doubles down on AI — TechTarget](https://www.techtarget.com/searchbusinessanalytics/news/366640792/Domo-doubles-down-on-AI-with-latest-platform-additions)

### Connector platform patterns (Section 2)

- [Airbyte on GitHub](https://github.com/airbytehq/airbyte)
- [Airbyte connector docs](https://docs.airbyte.com/integrations)
- [Airbyte sources, destinations, connectors](https://docs.airbyte.com/platform/2.0/move-data/sources-destinations-connectors)
- [About dbt Core versions](https://docs.getdbt.com/docs/dbt-versions)
- [dbt-adapters on PyPI](https://pypi.org/project/dbt-adapters/)
- [Build, test, document, and promote adapters](https://docs.getdbt.com/guides/adapter-creation)
- [dbt Licensing FAQ](https://www.getdbt.com/licenses-faq)
- [Trino SPI overview](https://trino.io/docs/current/develop/spi-overview.html)
- [Starburst SPI overview](https://docs.starburst.io/latest/develop/spi-overview.html)
- [Singer spec on GitHub](https://github.com/singer-io/getting-started/blob/master/docs/SPEC.md)
- [Singer.io main page](https://www.singer.io/)
- [PipelineWise — Singer.io](https://transferwise.github.io/pipelinewise/concept/singer.html)
- [LangChain Anthropic partner package](https://github.com/langchain-ai/langchain/tree/master/libs/partners/anthropic)
- [LangChain provider integrations](https://deepwiki.com/langchain-ai/langchain/3-provider-integrations)

### AI agent connector standards (Section 3)

- [MCP specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP main repo on GitHub](https://github.com/modelcontextprotocol/modelcontextprotocol)
- [MCP servers reference repo](https://github.com/modelcontextprotocol/servers)
- [Anthropic — MCP announcement](https://www.anthropic.com/news/model-context-protocol)
- [Microsoft + Anthropic C# SDK for MCP](https://developer.microsoft.com/blog/microsoft-partners-with-anthropic-to-create-official-c-sdk-for-model-context-protocol)
- [A Year of MCP — Pento](https://www.pento.ai/blog/a-year-of-mcp-2025-review)
- [State of MCP — Zuplo](https://zuplo.com/mcp-report)
- [MCP Adoption Statistics 2026 — Digital Applied](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol)
- [MCP — Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- [OpenAI Deprecations](https://developers.openai.com/api/docs/deprecations)
- [Migrate to the Responses API](https://platform.openai.com/docs/guides/migrate-to-responses)
- [Assistants API beta deprecation — OpenAI Developer Community](https://community.openai.com/t/assistants-api-beta-deprecation-august-26-2026-sunset/1354666)
- [ChatGPT plugins announcement](https://openai.com/index/chatgpt-plugins/)
- [Sunsetting Zapier ChatGPT plugin](https://help.zapier.com/hc/en-us/articles/24785309335565-Sunsetting-the-Zapier-ChatGPT-plugin-what-you-need-to-know)
- [Bedrock Agent OpenAPI schemas](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-api-schema.html)
- [Add an action group to your agent — Bedrock docs](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-action-add.html)
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Microsoft Agent Framework 1.0 — VS Magazine](https://visualstudiomagazine.com/articles/2026/04/06/microsoft-ships-production-ready-agent-framework-1-0-for-net-and-python.aspx)
- [Plugins in Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/)
- [Semantic Kernel + AutoGen — VS Magazine](https://visualstudiomagazine.com/articles/2025/10/01/semantic-kernel-autogen--open-source-microsoft-agent-framework.aspx)
- [CrewAI vs LangGraph vs AutoGen — DataCamp](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
- [CrewAI vs AutoGen — Oxylabs](https://oxylabs.io/blog/crewai-vs-autogen)
- [LangGraph vs AutoGen vs CrewAI — Latenode](https://latenode.com/blog/platform-comparisons-alternatives/automation-platform-comparisons/langgraph-vs-autogen-vs-crewai-complete-ai-agent-framework-comparison-architecture-analysis-2025)
- [A2A — Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [A2A protocol spec](https://a2a-protocol.org/latest/specification/)
- [A2A — IBM Think](https://www.ibm.com/think/topics/agent2agent-protocol)
- [A2A getting an upgrade — Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- [Databricks Genie Conversation APIs](https://www.databricks.com/blog/genie-conversation-apis-public-preview)
- [Mosaic AI announcements 2025](https://www.databricks.com/blog/mosaic-ai-announcements-data-ai-summit-2025)
- [Databricks AI/BI Genie GA](https://www.databricks.com/blog/aibi-genie-now-generally-available)

### Enterprise standards (Section 4)

- [NIST AI 600-1 GenAI Profile PDF](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
- [NIST AI RMF GenAI publication page](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)
- [NIST AI Risk Management Framework — main page](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST CSF 2.0 PDF](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf)
- [NIST CSF 2.0 main page](https://www.nist.gov/cyberframework)
- [NIST SP 800-207 ZTA — final](https://csrc.nist.gov/pubs/sp/800/207/final)
- [NIST SP 800-207A ZTA cloud-native](https://csrc.nist.gov/pubs/sp/800/207/a/final)
- [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP API Security Project page](https://owasp.org/www-project-api-security/)
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)
- [OWASP LLM Top 10 2025 PDF](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf)
- [CSA AI Controls Matrix introduction](https://cloudsecurityalliance.org/blog/2025/07/10/introducing-the-csa-ai-controls-matrix-a-comprehensive-framework-for-trustworthy-ai)
- [CSA AICM artifact](https://cloudsecurityalliance.org/artifacts/ai-controls-matrix)
- [CSA AICM + ISO 42001 mapping](https://cloudsecurityalliance.org/blog/2025/08/20/announcing-the-ai-controls-matrix-and-iso-iec-42001-mapping-and-the-roadmap-to-star-for-ai-42001)
- [ISO/IEC 42001 official](https://www.iso.org/standard/42001)
- [ISO 42001 — Microsoft Compliance](https://learn.microsoft.com/en-us/compliance/regulatory/offering-iso-42001)
- [ISO 42001 explained](https://www.iso.org/home/insights-news/resources/iso-42001-explained-what-it-is.html)
- [EU AI Act portal](https://artificialintelligenceact.eu/)
- [EU AI Act — Article 6 high-risk classification](https://artificialintelligenceact.eu/article/6/)
- [EU AI Act — Article 51 GPAI systemic risk](https://artificialintelligenceact.eu/article/51/)
- [EU AI Act timeline — Trilateral Research](https://trilateralresearch.com/responsible-ai/eu-ai-act-implementation-timeline-mapping-your-models-to-the-new-risk-tiers)
- [SOC 2 for AI Companies — Comp AI](https://www.trycomp.ai/soc-2-for-ai-companies)
- [SOC 2 AI Compliance News 2025 — Quantarra](https://quantarra.io/blog/soc-2-ai-compliance-news-2025-edition-the-trends-that-reshaped-security-audits)
- [MITRE ATLAS](https://atlas.mitre.org/)
- [ATLAS Overview — NIST CSRC Sept 2025](https://csrc.nist.gov/csrc/media/Presentations/2025/mitre-atlas/TuePM2.1-MITRE%20ATLAS%20Overview%20Sept%202025.pdf)
- [NIST SSDF SP 800-218 final](https://csrc.nist.gov/pubs/sp/800/218/final)
- [NIST SSDF SP 800-218A draft GenAI profile](https://csrc.nist.gov/pubs/sp/800/218/a/ipd)
- [SSDF main page](https://csrc.nist.gov/projects/ssdf)
- [SLSA main site](https://slsa.dev/)
- [SLSA — OpenSSF projects](https://openssf.org/projects/slsa/)
- [OpenSSF Scorecard](https://scorecard.dev/)

### Embed SDK patterns (Section 5)

- [powerbi-client on npm](https://www.npmjs.com/package/powerbi-client)
- [PowerBI-JavaScript on GitHub](https://github.com/microsoft/PowerBI-JavaScript)
- [Power BI embedded analytics Client APIs](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/)
- [Power BI Embedded — iframe sandbox attribute](https://community.fabric.microsoft.com/t5/Service/Power-BI-Embedded-iframe-sandbox-attribute/m-p/2358591)
- [Embed report containing paginated report — cross-origin](https://community.fabric.microsoft.com/t5/Developer/Embed-report-containing-embedded-paginated-report-Cross-origin/m-p/4722341)
- [Tableau Embedding API v3 main](https://help.tableau.com/current/api/embedding_api/en-us/index.html)
- [Tableau Embedding API tutorial](https://help.tableau.com/current/api/embedding_api/en-us/tutorial/tutorial.htm)
- [Tableau API — Add event listeners](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_event.html)
- [Tableau API — Interact with the view](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_interact.html)
- [Tableau React components](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_react.html)
- [Tableau Embedding API v3 samples](https://github.com/tableau/embedding-api-v3-samples)
- [Discovering qlik-embed](https://community.qlik.com/t5/Design/Discovering-qlik-embed-Qlik-s-new-library-for-Embedding-Qlik/ba-p/2141202)
- [Embedding Qlik Sense in web applications](https://help.qlik.com/en-US/sense-developer/November2025/Content/Sense_Helpsites/embed-qlik-sense.htm)
- [Embed objects, apps, visualizations](https://help.qlik.com/en-US/sense-developer/November2025/Subsystems/Mashups/Content/Sense_Mashups/Embed/embed.htm)
- [qlik-embed quickstart](https://qlik.dev/embed/capability-api/quickstart/build-a-simple-mashup-capability-api/)
- [qlik web integration examples](https://github.com/qlik-oss/web-integration-examples)
- [@looker/embed-sdk main page](https://looker-open-source.github.io/embed-sdk/)
- [Looker Embed SDK on GitHub](https://github.com/looker-open-source/embed-sdk)
- [Looker — Introduction to the Embed SDK](https://cloud.google.com/looker/docs/embed-sdk-intro)
- [Looker — Signed embedding](https://cloud.google.com/looker/docs/signed-embedding)

### Licensing (Section 6)

- [dbt Licensing FAQ](https://www.getdbt.com/licenses-faq)
- [Licensing dbt — dbt Labs blog](https://www.getdbt.com/blog/licensing-dbt)
- [dbt Fusion engine licensing — dbt Labs](https://www.getdbt.com/blog/new-code-new-license-understanding-the-new-license-for-the-dbt-fusion-engine)
- [Business Source License — MariaDB FAQ](https://mariadb.com/bsl-faq-mariadb/)
- [BSL 1.1 license text](https://mariadb.com/bsl11/)
- [BSL adopters — dotCMS](https://www.dotcms.com/blog/bsl-in-action-whos-doing-it-and-does-it-work)
- [HashiCorp BSL](https://www.hashicorp.com/en/bsl)
- [Couchbase BSL adoption](https://www.couchbase.com/blog/couchbase-adopts-bsl-license/)
- [Business Source License — Wikipedia](https://en.wikipedia.org/wiki/Business_Source_License)
- [MIT vs Apache 2.0 — Oreate AI](https://www.oreateai.com/blog/mit-vs-apache-20-decoding-the-open-source-licenses-that-shape-ais-future/086ddac3ca198ebbdaf48f876c7bbd08)

### Demo strategy + cautionary tales (Sections 7-8)

- [Heroku Elements Marketplace](https://elements.heroku.com/)
- [Heroku — Bringing an Add-on to Market](https://devcenter.heroku.com/articles/bringing-an-add-on-to-market)
- [Heroku Sustaining Engineering Mode — DeployHQ](https://www.deployhq.com/blog/heroku-sustaining-engineering-alternatives)
- [Salesforce AppExchange — partner program](https://www.salesforce.com/partners/become-a-partner/)
- [Slack — discontinuing classic apps](https://docs.slack.dev/changelog/2024-04-discontinuing-new-creation-of-classic-slack-apps-and-custom-bots/)
- [Slack — legacy custom bots deprecation](https://docs.slack.dev/changelog/2024-09-legacy-custom-bots-classic-apps-deprecation/)
- [Slack changelog — deprecations](https://docs.slack.dev/changelog/tags/deprecation/)
- [Yahoo Pipes shutdown — Wikipedia](https://en.wikipedia.org/wiki/Yahoo_Pipes)
- [Reflections on Yahoo Pipes closure — OUseful.info](https://blog.ouseful.info/2015/06/05/reflections-on-the-closure-of-yahoo-pipes/)
- [Yahoo shuts down Pipes — ReadWrite](https://readwrite.com/yahoo-shuts-down-pipes/)
- [ChatGPT Plus Plugins Review 2025](https://aionx.co/chatgpt-reviews/chatgpt-plus-plugins-review/)
- [ChatGPT Plugins vs Custom GPTs vs MCP — Drio](https://www.getdrio.com/blog/chatgpt-plugins-vs-custom-gpts)
- [Zapier developer platform](https://zapier.com/developer-platform)
- [Zapier vs Power Automate — Zapier blog](https://zapier.com/blog/zapier-vs-power-automate/)
- [Power Automate vs Zapier 2025 — ERP Software Blog](https://erpsoftwareblog.com/2025/09/power-automate-vs-zapier-which-automation-tool-wins-in-2025/)

### Market context

- [Embedded analytics market — IMARC](https://www.imarcgroup.com/embedded-analytics-market)
- [Embedded analytics market — Global Growth Insights](https://www.globalgrowthinsights.com/market-reports/embedded-analytics-market-109233)
- [Embedded analytics trends 2026 — Databrain](https://www.usedatabrain.com/blog/embedded-analytics-trends)
- [Best Embedded Analytics — Gartner Peer Insights](https://www.gartner.com/reviews/market/embedded-analytics)

---

## Document metadata

- **Authors.** Generated by automated research process; reviewed by PulsePlay project team.
- **License of this document.** Same license as the PulsePlay project (recommendation pending — see Section 6).
- **Update cadence.** Suggest revisiting at v0.5, v1.0, and any time a section's facts move materially. Sections most likely to age fastest: 1 (competitive landscape), 3 (AI agent connector standards), 9 (MCP hypothesis).
- **Known gaps acknowledged.**
  - Industry adoption statistics for MCP are reported (Sigma Computing, Pento, Digital Applied) rather than independently audited. Treat as directional.
  - The CSA AICM has 243 controls; only the framework-level summary is here. Full mapping is a separate document.
  - The strategic synthesis (Section 10) assumes certain product priorities not yet final in PulsePlay's roadmap. Treat as input to the roadmap discussion, not a decision.
  - Real customer data is not used anywhere in this document. Customer logos and named case studies are deliberately absent (they would require either NDA review or fabrication).

End of document.
