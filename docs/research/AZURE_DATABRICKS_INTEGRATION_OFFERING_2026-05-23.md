# Azure Databricks Integration Offering - PulsePlay Research

> Date: 2026-05-23
> Scope: Deep research on the Databricks technology partner page at `https://docs.databricks.com/aws/en/integrations`, interpreted for PulsePlay with an Azure Databricks-first bias.
> Status: Research and product/architecture guidance. No runtime code shipped in this slice.

## Executive Verdict

The linked Databricks page is not a product roadmap for PulsePlay by itself. It is a catalog of validated third-party partner integrations, many surfaced through Partner Connect. For PulsePlay, the important conclusion is broader:

PulsePlay should treat **Azure Databricks-native assets** as the destination and **third-party BI/partner integrations** as bridge, ingestion, governance, or activation surfaces.

That means:

- First-class PulsePlay surfaces should bias toward Azure Databricks AI/BI dashboards, Genie Spaces, Databricks Apps, SQL Warehouses, Unity Catalog assets, Unity Catalog business semantics / metric views, Model Serving, and Vector Search.
- Power BI remains the most important bridge because the organization already has Power BI and because Azure Databricks has the strongest Microsoft-aligned path there.
- Tableau, Qlik, Sigma, Hex, ThoughtSpot, Preset, and similar partner tools should stay adapter-friendly, but they should not replace the Databricks-native center of gravity unless a specific enterprise deployment requires them.
- Partner Connect should be treated as a setup accelerator, not the security or product architecture. It can create SQL warehouses, service principals, and PAT-backed partner connections; PulsePlay still needs its own allowlist, policy, credential, evidence, and audit boundaries.
- Unity Catalog business semantics should be the preferred semantic layer before AtScale/Stardog-style third-party semantic layers, because it keeps definitions, permissions, metric views, and agent metadata inside the Databricks governance plane.

## Read The Linked Page Correctly

The original AWS Databricks page says Databricks has validated integrations with third-party solutions for common scenarios such as ingestion, preparation/transformation, BI, and ML. It also points to Partner Connect as the Databricks UI that helps some validated partner solutions connect quickly to clusters and SQL warehouses.

The Azure equivalent is on Microsoft Learn at:

- https://learn.microsoft.com/en-us/azure/databricks/integrations/

Both pages were last updated on 2026-04-20 in the official docs snapshot reviewed. The AWS page renders the partner table more cleanly. The Azure page broadly mirrors the same categories but has cloud-specific/listing differences. For implementation, do not assume AWS Partner Connect parity equals Azure Partner Connect parity. Each partner needs an Azure-specific verification step.

Important examples of observed page differences:

- Qlik Sense: AWS page lists Partner Connect with Unity Catalog support; Azure page shows Partner Connect: No and Manual connection: Yes.
- ThoughtSpot: AWS page lists ThoughtSpot under BI and visualization; the Azure page excerpt reviewed does not show it.
- Hunters and Precisely: present on the AWS page sections reviewed; not visible in the Azure page excerpt reviewed.
- Prophecy: AWS page lists Unity Catalog support as Yes; Azure page shows N/A in the excerpt reviewed.
- The Azure page may have rendering quirks around logo/table cells, so the connection guide for a specific partner is the final source of truth.

## What Is On Offer: Partner Connect Catalog

This table uses the AWS page as the clean partner list because that was the user-provided URL, then overlays Azure-specific implications where the Azure page differed.

| Category | Partner options on the linked page | Unity Catalog signal on linked page | PulsePlay interpretation |
|---|---|---:|---|
| Data ingestion | Fivetran, Hevo Data, Informatica Cloud Data Integration, Rivery, RudderStack, Snowplow | Fivetran/Informatica/RudderStack/Snowplow: Yes. Hevo/Rivery: No. | Upstream data movement. PulsePlay should consume governed outputs, not become an ingestion product. Useful for Launchpad readiness and evidence only if the org already uses them. |
| Data preparation and transformation | dbt Cloud, Matillion Data Productivity Cloud, Prophecy, Alteryx One | AWS page: all Yes | Transformation/prep workflows. dbt and Matillion matter if enterprise lineage and metric definitions already live there. PulsePlay should not duplicate their pipeline authoring surface. |
| Machine learning | Dataiku, John Snow Labs, Labelbox, SuperAnnotate | Dataiku: Yes. Others: N/A | ML/data science workbenches and labeling/NLP ecosystems. Useful as adjacent assets, not first-wave PulsePlay surfaces. |
| BI and visualization | Hex, Power BI, Preset, Qlik Sense, Sigma Computing, Tableau, ThoughtSpot | Hex/Power BI/Qlik/Sigma/Tableau/ThoughtSpot: Yes. Preset: No. | This is the surface-bridge category. Power BI is the bridge priority; Tableau/Qlik remain adapter tracks; Hex/Sigma/ThoughtSpot can become future surface types if adopted by the org. |
| Reverse ETL | Census, Hightouch | Census: Yes. Hightouch: Partner Connect No, Manual Yes | Operational activation/writeback. PulsePlay should not write back directly in v1; future actions must go through explicit tool/provider policy. |
| Security | Hunters, Privacera | Both Yes on AWS page | Security/governance integrations. Privacera may matter for policy posture; Hunters is more security-analytics oriented. PulsePlay should surface evidence from governance tools only when available. |
| Data governance | Anomalo, erwin Data Modeler, Lightup, Monte Carlo, Precisely Data Integrity Suite | All Yes on AWS page | Quality, lineage, model, observability, and data integrity signals. These are valuable for answer trust, freshness, and "why should I trust this?" drawers. |
| Semantic layer | AtScale, Stardog | Both Yes | External semantic layer options. PulsePlay should evaluate only after Unity Catalog business semantics / metric views are exhausted or enterprise-standardized elsewhere. |

Notable absence: Looker is not listed in the Partner Connect table reviewed. PulsePlay can still support Looker as a BI adapter/iframe/manual SQL connection, but it should not be described as a first-class Databricks Partner Connect option without new verification.

## What Partner Connect Actually Does

Partner Connect is a workspace UI for creating trial accounts or connecting Databricks to select technology partners. In Azure Databricks, Partner Connect can provision and share connection details for resources such as:

- Databricks SQL warehouses.
- Databricks service principals.
- Databricks personal access tokens.

Partner Connect is useful, but it has important constraints:

- Azure Databricks Partner Connect requires Premium plan, workspace admin involvement for new connections, workspace access entitlements, and SQL access entitlement when SQL warehouses are involved.
- It is not available in Azure China regions, Azure Government regions, or FedRAMP-compliant workspaces.
- Databricks recommends manual connection steps when the organization already has an existing partner account.
- Cloud-based partner solutions may get a service-principal PAT created and shared automatically by Partner Connect.
- Desktop tools such as Power BI Desktop and Tableau Desktop often require the user/admin to create and paste a token manually.
- Token sharing is a trust boundary: the partner can do what the token principal is allowed to do in the workspace.
- Partner Connect can create service principals and partner-owned assets. Admins need lifecycle ownership for rotating tokens, disconnecting partners, and cleaning up service principals, clusters, warehouses, or tables.

Partner Connect best practices from the official docs align with PulsePlay's existing posture:

- Prefer SSO when supported, because it preserves governance and auditability.
- Host partners near the Databricks workspace region when possible to reduce latency and cross-region cost.
- Use gateway clusters where required for workspaces protected by IP access lists or Private Link.

PulsePlay implication: Partner Connect can feed setup helpers and asset discovery, but browser UI must never be the only enforcement layer. PulsePlay's proxy allowlist, server-side token issuance, production auth, redaction, CSP, route guards, and audit support remain load-bearing.

## What The SQL Warehouse Connection Details Screen Offers

The screenshot is the Azure Databricks SQL Warehouse connection details page. This is the low-level connection hub behind many partner and developer integrations.

The page exposes:

- Server hostname.
- HTTP path.
- JDBC URL.
- OAuth URL and token/auth setup hints.
- Tool-specific shortcuts for Tableau, Power BI, dbt, Python, Java, Node.js, Go, and "More tools".

This is **not** an embed URL for a BI surface. It is a compute/data access endpoint. Tools use it to query a SQL warehouse through JDBC, ODBC, ADBC, REST, or language-specific drivers.

For PulsePlay:

- Treat hostname + HTTP path as server-side connection metadata, not a browser credential.
- Treat access tokens, OAuth client secrets, Power BI embed tokens, and partner PATs as proxy/server-only.
- Use SQL Warehouses as a capability source for Databricks-native probing, warehouse health, query history/evidence, and governed metric-view access.
- Use the connection details to help authors configure Power BI/Tableau/dbt/dev tools, but never confuse that with embedding a report/dashboard.

Azure Databricks recommends serverless SQL warehouses when available. Warehouses can auto-restart on JDBC/ODBC connection, scheduled jobs, dashboard access, or query activity, subject to permissions. Unity Catalog governs most data access on SQL warehouses, while custom data access configurations may also exist.

## Programmatic Integration Surface

Azure Databricks offers a developer/tooling layer beside Partner Connect:

| Surface | What it gives PulsePlay |
|---|---|
| Databricks JDBC Driver | Java/database-tool access to Databricks SQL, including OAuth and Cloud Fetch. Useful for enterprise tools and SQL IDEs. |
| Databricks ODBC Driver | Standard ODBC access for BI and database tools. Databricks renamed the driver from the Simba Spark ODBC Driver in February 2026; new work should use the Databricks ODBC Driver. |
| SQL Connector for Python | Lightweight Python query path. Useful for scripts, tests, notebooks, and agent tools. |
| SQLAlchemy / pyODBC | Python ecosystem compatibility. |
| SQL Driver for Go | Go service integration. |
| SQL Driver for Node.js | JavaScript/TypeScript access to Databricks SQL. Relevant to PulsePlay's Node proxy if we add direct SQL execution through a supported driver instead of only REST APIs. |
| Statement Execution API | Driverless REST query execution for applications that do not want long-lived database connections. Strong candidate for server-side PulsePlay query/evidence features. |
| SQL CLI | Automation and smoke checks. |
| VS Code SQLTools, DataGrip, DBeaver, SQL Workbench/J | Developer/admin tooling. Useful for docs and support, not runtime. |

PulsePlay should prefer REST APIs or official SDK/driver paths over ad hoc string-built HTTP where possible.

## Azure Databricks-Native Offering Beyond The Partner Page

The integration page underplays the strategic path for PulsePlay because it focuses on third-party partners. Azure Databricks now has native application, BI, AI, semantics, and governance surfaces that map directly to PulsePlay.

### Databricks AI/BI

Azure Databricks AI/BI is the native business intelligence area. It includes:

- AI/BI dashboards.
- Genie Spaces.
- Unity Catalog business semantics.
- Admin, embedding, API, and audit capabilities.
- Consumer access patterns.

For PulsePlay, AI/BI is the destination BI surface family. It gives us first-party dashboards and first-party natural-language analysis without depending on Power BI as the permanent center.

### AI/BI Dashboards

Dashboards offer:

- AI-assisted authoring.
- Visualizations and cross-filtering.
- Dataset definitions from tables, views, or custom queries.
- Global/page/widget filters.
- Custom calculations.
- Published dashboard sharing with shared or individual data permissions.
- Scheduled refresh/subscriptions.
- Iframe embedding.
- Import/export, source control, Declarative Automation Bundles, REST APIs, and Lakeflow Jobs scheduling.
- Audit/system-table usage monitoring.

Embedding matters, but with real caveats:

- Only published dashboards can be embedded.
- Basic embedding requires Databricks authentication and explicit dashboard access.
- External-user embedding uses a service principal/OAuth approach for external portals, but Ask Genie is not supported in that embedding mode; the Genie Conversation API is the expected alternative.
- Shared data permissions mean the publisher's permissions can drive data access. Individual data permissions are safer for sensitive use cases.
- Embedded dashboards currently display in light mode.
- Blank embedded iframes may be caused by browser third-party cookie settings.

PulsePlay should build a Databricks AI/BI Dashboard adapter before over-investing in non-strategic partner SDKs.

### Genie Interface And Genie Spaces

The Genie interface is the business-user front door for Azure Databricks. It lets users view dashboards, ask natural-language questions, use Databricks Apps, browse favorites/recent/trending assets, and search/list assets without navigating technical Lakehouse concepts.

Genie Spaces provide:

- Natural-language questions over structured data.
- Configuration by domain experts using datasets, sample queries, instructions, and text guidelines.
- Unity Catalog-based data sources: tables, external tables, foreign tables, views, metric views, and materialized views.
- Space-level knowledge store metadata, column synonyms, prompt matching, and join hints.
- Example SQL queries and SQL functions as grounding assets.
- Read-only generated SQL queries running on the space's SQL warehouse.
- Inspect for additional query accuracy checks in complex scenarios.
- Trusted assets when exact parameterized examples or SQL functions support a response.
- Benchmarks for measuring Genie response quality.
- Unity Catalog row filters and column masks applied per user.

Important caveats:

- Genie Spaces are structured-data oriented. They do not answer over PDFs/Word/files unless Chat in Genie is used with external document sources such as Google Drive or SharePoint.
- Users do not need direct warehouse permissions to consume a shared Genie Space, but they still need data permissions on the underlying Unity Catalog objects.
- PulsePlay's existing tripwire remains: public REST APIs do not expose the UI-only Genie Agent Mode trigger. Do not promise PulsePlay can start Agent Mode unless Databricks exposes that capability through the API.

For PulsePlay, Genie stays the first serious AI connector. The deeper opportunity is to pair Genie Space metadata, metric views, and answer evidence into a consistent viewer trust grammar.

### Databricks Apps

Databricks Apps is a direct fit for PulsePlay hosting on Azure Databricks. It supports secure data and AI apps on Databricks serverless infrastructure, using Python or Node.js frameworks including React and Express. It integrates with Unity Catalog, Databricks SQL, and OAuth.

Supported app resources include:

- Databricks app to app communication.
- Genie Space.
- Lakebase database.
- Lakeflow job.
- MLflow experiments.
- Model Serving endpoint.
- Secret.
- SQL Warehouse.
- Unity Catalog connection.
- Unity Catalog table.
- Unity Catalog function.
- Unity Catalog volume.
- Vector Search index.

Apps resources are important because they avoid hardcoded resource IDs, manage permissions/credentials, inject connection details, and help make apps portable between environments. Each app has a dedicated service principal; Databricks recommends least privilege and avoiding hardcoded PATs.

For PulsePlay, Azure Databricks Apps should remain the preferred Databricks-native deployment topology when the app is primarily used by Databricks users. Azure App Service / Container Apps remain better if the enterprise requires a corporate WAF/custom domain, split hosting, or a non-Databricks portal first.

### Unity Catalog Business Semantics

Unity Catalog business semantics is the first-party semantic layer PulsePlay should prefer. It includes:

- Metric views: reusable SQL objects defining and governing KPIs.
- Agent metadata: synonyms, display names, formatting rules, and business context that help AI tools interpret data.
- Query support from SQL editors, notebooks, dashboards, Genie Spaces, and external tools.
- YAML/schema validation for metric views.
- Materialization options for performance.
- Catalog Explorer and SQL lifecycle management.

This is a direct match to PulsePlay's BusinessContextProfile and trust/evidence direction. A governed metric view can become:

- The authoritative semantic source for an answer.
- The source of metric labels, units, display names, and synonyms.
- The link between BI dashboards, Genie Spaces, and Ask Pulse.
- The source reference in the evidence drawer.

Important Power BI caveat as of the 2026-05-21 Azure Databricks docs: the dedicated BI metric view page warns that Microsoft removed the BI compatibility mode option from the Power BI connector to Azure Databricks, so reports that rely on that connector option no longer function. The same page recommends Azure Databricks AI/BI dashboards as the native alternative for metric views. This conflicts with older/overview Power BI guidance that still mentions metric-view querying. Treat the dedicated metric-view page as the current risk signal and do not claim Power BI metric-view support until verified live.

### Data Sources, Lakeflow, And Unity Catalog Connections

Azure Databricks provides multiple integration paths for external data:

- Cloud object storage, preferably governed through Unity Catalog.
- Unity Catalog connections for external systems.
- Managed ingestion through Lakeflow Connect.
- Query federation for read-only access to external databases without copying data.
- Catalog federation for external catalogs such as Hive Metastore, Snowflake Horizon Catalog, Salesforce Data 360, and OneLake.
- JDBC connections for read/write access through Spark Data Source or Remote Query SQL APIs.
- HTTP connections for external REST APIs, MCP integrations, and AI agent tools.
- Streaming connectors and standard connectors.
- Third-party integrations through Partner Connect.

Lakeflow managed connectors currently include Salesforce, Workday, SQL Server, ServiceNow, Google Analytics, and SharePoint in the official FAQ reviewed. All support API and Databricks Asset Bundles; UI support varies by connector.

PulsePlay should not own ingestion, but it should understand whether a dashboard/metric is backed by:

- Managed ingestion.
- Query federation.
- A metric view.
- A materialized view.
- An external table/volume.
- A partner-created schema or table.

That distinction belongs in evidence and readiness, not in user-facing setup overload.

### Model Serving And Vector Search

Azure Databricks Model Serving provides governed real-time/batch inference endpoints with REST APIs, permissions, monitoring, AI Gateway support, and support for custom models, agents, Databricks-hosted foundation models, and external models.

Mosaic AI Vector Search provides endpoints and indexes for semantic search, RAG, and recommendation patterns. It requires Unity Catalog and serverless compute, supports UI/Python/REST management, Delta Sync indexes, direct vector access indexes, full-text search in beta, and service-principal authentication for production applications.

PulsePlay should use these as backend capability blocks:

- Foundation Model / Model Serving endpoints are AI connector candidates.
- Vector Search indexes are knowledge provider candidates.
- Databricks App resources can bind both without hardcoding IDs.

## Power BI With Azure Databricks: Current Bridge

Power BI remains the most important bridge for PulsePlay because the org already has Power BI and Azure Databricks has first-class Microsoft docs for it.

Azure Databricks supports:

- Connecting Power BI Desktop to clusters and SQL warehouses through Partner Connect or manual hostname/HTTP path setup.
- Publishing Power BI reports to the Power BI service.
- DirectQuery and Import mode choices.
- Microsoft Entra ID credentials, PATs, and Databricks service principal / M2M OAuth.
- Publishing tables or schemas from Catalog Explorer into Power BI semantic models.
- SSO in Power BI service so report viewers access Azure Databricks data with their own Microsoft Entra identity in DirectQuery mode.
- ADBC support in the Azure Databricks Power BI connector.
- Delta Sharing connector path for shared data, import-only.

Important caveats:

- Power BI Desktop is Windows-only.
- Older Power BI Desktop versions require the ODBC driver.
- Databricks recommends SQL warehouses for DirectQuery.
- M2M OAuth in Power BI Desktop requires a sufficiently recent Power BI Desktop version.
- If using a Microsoft Entra ID managed service principal, workflows longer than one hour can fail according to the docs reviewed.
- Power BI service publishing requires Premium/Fabric capacity and XMLA read/write support.
- Private Link/IP-restricted workspaces can require gateways and manual datasource credential updates.
- The current metric-view/Power BI support picture is unstable, as noted above.

PulsePlay stance:

- Keep Power BI as the bridge adapter.
- Do not make Power BI the semantic source of truth when Unity Catalog metric views are available.
- Do not promise metric-view support through Power BI until the live tenant and connector version prove it.
- Prefer per-user SSO/OBO for user-governed DirectQuery experiences; avoid service-principal-only paths for sensitive/RLS scenarios unless the data owner explicitly accepts the shared-identity model.

## Tableau And Qlik

Tableau has a strong Azure Databricks path:

- Partner Connect can generate a connection file for Tableau Desktop.
- Tableau Cloud can create data sources from Databricks tables/schemas directly from the Databricks UI.
- Unity Catalog is required for the "Explore in Tableau Cloud" path reviewed.
- Auth options include Microsoft Entra ID tokens/credentials, PATs, and Azure Databricks service-principal OAuth for newer Tableau/ODBC versions.
- The docs emphasize reducing rows queried and query volume for performance.

Qlik is more ambiguous on Azure:

- The AWS page lists Qlik Sense under BI/visualization with Unity Catalog support.
- The Azure page excerpt reviewed says Partner Connect: No and Manual connection: Yes.

PulsePlay stance:

- Keep Tableau and Qlik as adapter-safe future surfaces.
- For Azure, verify Qlik manually before promising one-click Partner Connect behavior.
- Treat Tableau as a stronger second bridge than Qlik unless enterprise usage says otherwise.

## Where PulsePlay Should Invest

### Priority 1 - Azure Databricks-native Launchpad

Build the Launchpad/Home around:

- Genie Spaces.
- AI/BI dashboards.
- Databricks Apps.
- SQL Warehouse health.
- Unity Catalog metric views.
- Model Serving endpoints.
- Vector Search indexes.
- Lakeflow Jobs where they explain freshness.
- Approved Power BI reports as bridge assets.

This matches the official Genie interface direction and PulsePlay's Databricks-forward strategy.

### Priority 2 - Capability Registry

Turn every integration into a capability block with fields like:

- `kind`: surface, ai-connector, knowledge-provider, data-source, governance-signal, reverse-etl, semantic-layer.
- `cloud`: azure, aws, gcp, multi-cloud.
- `source`: databricks-native, partner-connect, manual, custom.
- `unityCatalogSupport`: yes, no, manual, n/a, unknown.
- `authModes`: Entra, Databricks OAuth, service principal, PAT, partner-managed, gateway.
- `permissionsNeeded`.
- `evidenceAvailable`: query id, lineage, metric view, audit log, freshness, quality signal.
- `pulseplayStance`: destination, bridge, upstream-only, evidence-only, future.

This would keep Settings and Launchpad from becoming hardcoded vendor if/else logic.

### Priority 3 - Databricks AI/BI Dashboard Adapter

The first native surface adapter should prove:

- Published dashboard embedding.
- Allowed embed surfaces.
- Basic Databricks-auth embedding.
- Evidence capture: dashboard id, filters, refresh state, query history/audit id where available.
- Clear caveat for light-mode-only embedded dashboards.
- Clear fallback when third-party cookies block the iframe.

External-user embedding should be a later enterprise portal slice because Ask Genie is not supported there and service-principal scoping needs careful design.

### Priority 4 - Genie Space And Metric View Evidence

The next Databricks-native depth should connect:

- Genie Space id.
- SQL warehouse id.
- Generated SQL/query id.
- Unity Catalog source refs.
- Metric view refs.
- Trusted asset/benchmark indicators if exposed by API.
- Row filter / column mask governance statement.

This is more valuable than adding another BI vendor skin.

### Priority 5 - Power BI Bridge Hardening

Power BI work should focus on:

- SSO/OBO correctness.
- Embed token issuance server-side only.
- Clear split between Power BI report embed and Databricks SQL connection.
- Honest messaging around metric-view limitations.
- Bridge/migration mapping from Power BI reports to Unity Catalog/AI-BI candidates.

## Partner Evaluation Matrix For Future Work

| Partner group | When to care | PulsePlay action |
|---|---|---|
| Power BI | Current-state reports, executive adoption, Microsoft stack | Keep bridge strong, but route strategy toward Databricks-native semantics. |
| Tableau | Enterprise already uses Tableau, or needs Tableau Cloud authoring from Databricks | Add adapter/event work only after Databricks native and Power BI bridge are reliable. |
| Qlik | Enterprise has Qlik estate | Manual Azure verification first; do not assume Partner Connect. |
| Hex/Sigma/ThoughtSpot | Org uses notebook/BI hybrid or search-first BI | Treat as future surface adapters or external tabs. |
| Fivetran/Informatica/RudderStack/Snowplow | Data freshness/lineage from ingestion matters to answer trust | Show as upstream provenance/freshness signals only. |
| dbt/Matillion/Prophecy/Alteryx | Transformation lineage defines business meaning | Ingest metadata if available; do not duplicate their authoring UI. |
| Anomalo/Monte Carlo/Lightup/Precisely/erwin | Data quality/model governance drives trust | Surface quality/freshness/model evidence in answer drawers. |
| Privacera/Hunters | Security/policy evidence matters | Integrate only via explicit governance/evidence contracts. |
| AtScale/Stardog | Enterprise has a third-party semantic standard | Evaluate only after Unity Catalog business semantics fit/gaps are known. |
| Census/Hightouch | Operational actions/writeback are demanded | Treat as future action providers behind approval and audit. |

## Brutal-Honest Caveats

- The linked Partner Connect list is not a guarantee that a partner is available, licensed, enabled, or compliant in the target Azure workspace.
- Unity Catalog support in a table is not the same as "safe to expose in PulsePlay." PulsePlay still needs per-user auth, source allowlists, row/column enforcement, query evidence, token redaction, and admin approval.
- Power BI is a bridge, not the Databricks-forward destination. The metric-view warning makes this sharper, not softer.
- Partner Connect can create long-lived service-principal PATs. That is convenient but not automatically least-privilege.
- Basic Databricks dashboard embedding depends on Databricks authentication and browser cookie behavior.
- External dashboard embedding changes the identity model and removes Ask Genie support in the embedded dashboard UI.
- Genie remains structured-data-first unless Chat in Genie/document integrations are explicitly enabled.
- PulsePlay should not become an ingestion orchestrator, reverse ETL tool, semantic-layer vendor, or model-serving platform. It should orchestrate approved tools and make the experience coherent.

## Recommended Next Slice

Add an Azure Databricks Integration Capability Map to PulsePlay docs/config as a static seed, then graduate it into `/assistant/capabilities`.

Minimum seed fields:

```typescript
type PulsePlayIntegrationStance =
    | "databricks-native-destination"
    | "bridge-surface"
    | "upstream-data-provider"
    | "governance-signal"
    | "future-action-provider"
    | "deferred";

interface IntegrationCapabilitySeed {
    id: string;
    displayName: string;
    category:
        | "databricks-native"
        | "bi-visualization"
        | "data-ingestion"
        | "transformation"
        | "machine-learning"
        | "reverse-etl"
        | "security"
        | "data-governance"
        | "semantic-layer"
        | "developer-tool";
    cloudSupport: Array<"azure" | "aws" | "gcp" | "multi-cloud">;
    connectionMode: "databricks-native" | "partner-connect" | "manual" | "driver-api" | "unknown";
    unityCatalogSupport: "yes" | "no" | "manual" | "n/a" | "unknown";
    authModes: string[];
    pulseplayStance: PulsePlayIntegrationStance;
    notes: string;
    officialDocsUrl: string;
}
```

This lets Settings, Launchpad, and future onboarding explain why Power BI is a bridge, why AI/BI dashboards are destination, and why ingestion/governance partners appear as evidence rather than primary user surfaces.

## Source Ledger

Primary sources reviewed:

- Databricks AWS Technology Partners: https://docs.databricks.com/aws/en/integrations
- Azure Databricks Technology Partners: https://learn.microsoft.com/en-us/azure/databricks/integrations/
- Azure Databricks Partner Connect: https://learn.microsoft.com/en-us/azure/databricks/partner-connect/
- Databricks Partner Connect best practices: https://docs.databricks.com/aws/en/partner-connect/best-practice
- Databricks Partner Connect administration: https://docs.databricks.com/aws/en/partner-connect/admin
- Azure Databricks integrations overview: https://learn.microsoft.com/en-us/azure/databricks/getting-started/connect/
- Azure Databricks SQL Warehouse: https://learn.microsoft.com/en-us/azure/databricks/compute/sql-warehouse/
- Azure Databricks SQL connectors/drivers/tools: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/sql-drivers-tools
- Azure Databricks Power BI overview: https://learn.microsoft.com/en-us/azure/databricks/partners/bi/power-bi
- Power BI Desktop with Azure Databricks: https://learn.microsoft.com/en-us/azure/databricks/partners/bi/power-bi-desktop
- Publish to Power BI service from Azure Databricks: https://learn.microsoft.com/en-us/azure/databricks/partners/bi/power-bi-service
- Query metric views from BI tools: https://learn.microsoft.com/en-us/azure/databricks/partners/bi/bi-metric-view
- Tableau with Azure Databricks: https://learn.microsoft.com/en-us/azure/databricks/partners/bi/tableau
- Azure Databricks AI/BI: https://learn.microsoft.com/en-us/azure/databricks/ai-bi/
- Azure Databricks dashboards: https://learn.microsoft.com/en-us/azure/databricks/dashboards/
- Databricks dashboard embedding: https://docs.databricks.com/aws/en/dashboards/share/embedding
- Azure Databricks Genie interface: https://learn.microsoft.com/en-us/azure/databricks/genie-ui/genie
- Azure Databricks Genie Spaces: https://learn.microsoft.com/en-us/azure/databricks/genie/
- Azure Databricks Apps: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/
- Databricks Apps resources: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/resources
- Unity Catalog business semantics: https://learn.microsoft.com/en-us/azure/databricks/business-semantics/
- Unity Catalog connections: https://learn.microsoft.com/en-us/azure/databricks/connect/uc-connections
- Connect to data sources and external services: https://learn.microsoft.com/en-us/azure/databricks/connect/
- Data engineering / Lakeflow: https://learn.microsoft.com/en-us/azure/databricks/data-engineering/
- Lakeflow managed connector FAQ: https://learn.microsoft.com/en-us/azure/databricks/ingestion/lakeflow-connect/faq
- Azure Databricks Model Serving: https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/
- Azure Databricks Vector Search: https://learn.microsoft.com/en-us/azure/databricks/vector-search/create-vector-search
