# Handover

## Current State

The package is buildable and produces a Power BI custom visual artifact in `dist/`.

Version: **2.1.0** — released 2026-03-29.

## What Has Been Implemented

- Power BI custom visual packaging
- Databricks Genie chat experience replicated inside Power BI
- modularized source layout with dedicated hooks and UI components
- governed Power BI context summary for Genie
- support for dimension-only, measure-only, and mixed setups
- contextual empty states with guided setup
- outbound interactive context chips for cross-filtering
- connection-status indicator with cached live health checks
- local proxy server for Power BI Desktop testing with structured response logging
- Genie API client with correct `attachment_id` field parsing and separate query-result endpoint fetching
- query results (tables and charts) rendered from the `/query-result/{attachment_id}` endpoint
- follow-up suggestions parsed from `suggested_questions` attachment and rendered as multiple clickable buttons
- D3-based interactive charts: bar, line, area, pie, and scatter with chart-type switching and axis configuration
- chart title from Genie query metadata displayed above chart
- axis labels on cartesian and scatter charts
- table/chart unified data view with Databricks-style toolbar (download, show code, chart config)
- column type indicators in table headers (string, numeric, date)
- row numbers in data table
- source view/table name extracted from SQL and shown in Analysis section
- rich markdown rendering (bold, italic, bullet lists, inline code)
- analysis disclosure section with expandable SQL query
- Enter-to-send keyboard shortcut in compose area
- loading animation with real-time progress states
- full dark/light theme matching Databricks Genie design language
- proxy deployment guide covering Azure APIM, Azure Functions, AWS API Gateway, and Nginx patterns
- auth guide covering the Power BI RLS vs Databricks authorization gap and three deployment models
- full deployment, package-principles, performance/security, and technical-reference documentation

## Recommended Authoring Pattern

1. Bind an anchor measure such as:

```DAX
PBIGENIE_FILTER = COUNTROWS(<table_or_view_name>)
```

2. Bind key business dimensions.
3. Bind one to three business measures if useful.
4. Configure the Databricks connection and Genie space.
5. Populate `Genie View Fields` with approved metric-view fields.

## Known Limitations

- The package shows a non-blocking local packaging warning related to `pwsh` certificate tooling.
- Power BI RLS does not automatically become Databricks authorization.
- Only categorical fields with Power BI identities can be used for outbound interactive chips.
- End-to-end latency remains primarily dependent on proxy and Databricks response time.
- The local proxy is intended for testing and should be replaced or hardened for broader production deployment.
- Conversation history is in-memory only — messages are lost when the visual is refreshed or the report is reloaded.
- Charts render from returned query result data only — no real-time streaming or live data updates.
- Heatmap, Sankey, and point map chart types are not yet supported (Databricks Genie native supports these).
- Chart title comes from Genie's query metadata; queries without a title show no chart heading.
- Follow-up suggestions depend on the `suggested_questions` attachment being present in the API response; not all Genie spaces return them.

## Suggested Next Work

- add heatmap chart type to GenieChart
- add chart export (save chart as image)
- add conversation persistence (localStorage or backend storage)
- add repository-specific testing notes for Databricks proxy timing and failure modes
- keep the agent-facing adaptation guide current if this package pattern is reused in other applications

## Documents To Keep Updated

All documents are in `docs/` except `README.md` which lives at the project root.

- [../README.md](../README.md)
- [DEPLOYMENT_GUIDELINES.md](DEPLOYMENT_GUIDELINES.md)
- [PROXY_GUIDE.md](PROXY_GUIDE.md)
- [AUTH_GUIDE.md](AUTH_GUIDE.md)
- [PACKAGE_PRINCIPLES.md](PACKAGE_PRINCIPLES.md)
- [PERFORMANCE_AND_SECURITY_CHECKLIST.md](PERFORMANCE_AND_SECURITY_CHECKLIST.md)
- [TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md)
- [TECHNICAL_UPDATE_FOR_AGENTS.md](TECHNICAL_UPDATE_FOR_AGENTS.md)
- [HANDOVER.md](HANDOVER.md)
- [CHANGELOG.md](CHANGELOG.md)
