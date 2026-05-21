# Changelog

All notable package-level changes for `PBI Genie Visual` should be recorded here.

This file is intended to improve release clarity, handover quality, and package auditability.

## Unreleased — 2026-05-21

### Changed

- Proxy mode now uses the shared PulsePlay proxy contract (`/assistant/*`) instead of Databricks-shaped `/api/2.0/genie/spaces/*` URLs.
- Proxy-mode requests identify the host as `pulse-pbi` with `X-Pulse-Client`, client version, and request-id headers.
- Added format-pane settings for the PulsePlay proxy profile name and proxy shared secret.
- Proxy poll responses now consume top-level `sqlQuery`, `queryResult`, `queryTitle`, and follow-up fields emitted by the shared proxy.
- Documented production `WebAccess` origin requirements for hosted PulsePlay proxy deployments.

## 1.0.0 — 2026-03-28

### Added

- Power BI custom visual package for Databricks Genie integration
- support for dimension-only, measure-only, and mixed field-role setups
- best-practice setup guidance for report authors
- outbound interactive context chips for cross-filtering the report from the visual
- connection status indicator with cached live health checks
- deployment, handover, package-principle, performance/security, and technical-reference documentation
- agent-facing technical update guidance for reusing the package pattern in other projects and applications
- proxy deployment guide covering Azure APIM, Azure Functions, AWS API Gateway, and Nginx patterns
- auth guide covering the Power BI RLS vs Databricks authorization gap and three deployment models

### Changed

- refactored the source into a more modular structure with dedicated `src/hooks/` and `src/components/` directories
- split `VisualApp.tsx` into `useConnectionState` hook, `SetupGuidance`, `DevPanel`, `ContextStrip`, `ChatHistory`, and `ComposeArea` components
- improved code readability and comment quality across core source files
- reduced client-side latency by removing artificial UI delay and tightening polling behavior
- clarified agent-facing guidance so downstream projects assess existing maturity first, preserve stronger existing patterns, and discuss meaningful improvements before implementation
- organized all documentation into a `docs/` folder with a clean `README.md` entry point at the project root

### Known Notes

- packaging succeeds, but local certificate tooling still reports a non-blocking `pwsh` warning during `pbiviz package`

## 1.1.0 — 2026-03-28

### Added

- unit test suite using Vitest (86 tests across `contextBuilder.ts`, `visualHelpers.ts`, `genie.ts`)
- `npm test` and `npm run test:watch` scripts
- proxy deployment guide (`docs/PROXY_GUIDE.md`) covering Azure APIM, Azure Functions, AWS API Gateway, and Nginx patterns
- auth guide (`docs/AUTH_GUIDE.md`) covering the Power BI RLS vs Databricks authorization gap and three deployment models

### Changed

- split `VisualApp.tsx` (708 lines) into a `useConnectionState` hook and five focused UI components: `SetupGuidance`, `DevPanel`, `ContextStrip`, `ChatHistory`, `ComposeArea`
- hardened `proxy/server.js` with a 64 KB body size limit, 90 s upstream timeout, per-IP rate limiting (20 req/10 s), request logging, target host URL validation, and upstream timeout error handling
- moved all documentation into `docs/` — root now has only `README.md` as the single entry point
- rewrote `README.md` as a navigation hub with a project structure overview and documentation table
- updated `.gitignore` for Node.js and Power BI Visual tooling

### Known Notes

- packaging succeeds, but local certificate tooling still reports a non-blocking `pwsh` warning during `pbiviz package`
- `proxy/server.js` is still intended for local development only; use a managed proxy platform for production

## 2.0.0 — 2026-03-29

### Added

- D3-based interactive charting: bar, line, area, and pie charts rendered from Genie query results
- GenieDataView component — unified table/chart switcher with Databricks-style toolbar
- GenieChart component — responsive D3 chart renderer with auto-detection of numeric/categorical columns
- chart type switching via toolbar icons with per-chart axis configuration (X/Y dropdowns)
- column type indicators in table headers (string, numeric, date badges)
- "Show code" / "Hide code" toggle integrated into data toolbar for SQL disclosure
- follow-up question detection — Genie's trailing questions rendered as clickable suggestion buttons
- rich markdown rendering: bullet lists, italic, inline code in assistant responses
- analysis disclosure section (expandable) on assistant messages showing SQL query
- loading animation with real-time progress status (Asking AI, Executing Query, etc.)
- contextual empty states with icons (setup required, add data fields, ready to ask)
- "New chat" button in header
- Enter-to-send keyboard shortcut (Shift+Enter for newline)

### Changed

- complete UI redesign to match Databricks Genie chat experience
- assistant messages now use full-width Genie-style layout (analysis header, text, data view, follow-up, feedback)
- user messages styled as right-aligned blue bubbles
- CSS overhauled with Databricks-inspired dark theme tokens and consistent design system
- GenieTable simplified — toolbar/CSV moved to GenieDataView, table now focused on rendering with type-aware formatting
- fmt() helper rewritten to support paragraphs, bullet lists, bold, italic, and inline code
- ChatHistory redesigned with structured message sections and SVG-based feedback buttons
- feedback row redesigned with thumbs up/down icons replacing emoji
- compact mode refined for small viewport sizes

### Removed

- SetupGuidance component removed from rendering (guidance now in contextual empty states)
- DevPanel component removed from rendering (diagnostics available via dev mode setting)
- summary card, scope badge, and diagnostic metrics from the main canvas
- "Ask selection" button (replaced by cleaner interaction model)

## 2.1.0 — 2026-03-29

### Added

- scatter chart type in GenieChart and GenieDataView (5th chart option alongside bar, line, area, pie)
- chart title rendering — Genie's query title displayed above the chart
- axis labels on cartesian and scatter charts — column names shown on X and Y axes
- row numbers in GenieTable (`#` column with 1-based numbering, matching Databricks Genie)
- source view name in Analysis section — extracted from SQL `FROM` clause and shown as a styled badge (e.g. `vw_metric_superstore_analysis_flat`)
- multiple follow-up suggestion buttons rendered as a flex row when the API provides several
- proxy response logging — message attachment structure and query-result column/row counts logged for each Genie API response to aid debugging

### Fixed

- query result tables and charts not rendering: root cause was that Databricks uses `attachment_id` as the attachment key, not `id` — the query-result fetch URL was never built
- follow-up suggestions not rendering: Databricks returns them in a separate attachment under `suggested_questions`, not `follow_up_questions`

### Changed

- `GenieMessage` extended with `queryTitle` and `followUpQuestions` fields
- `ChatMessage` type extended with `queryTitle` and `followUpQuestions` fields
- `VisualApp` passes `queryTitle` and `followUpQuestions` from the API response to the message store
- `ChatHistory` renders API-provided follow-ups (multiple buttons in a row) and falls back to text-detected questions only when the API provides none
- proxy attachment logging updated to use `attachment_id` and distinguish `SUGGESTIONS` attachment type

## Release Template

Copy this section for each future release.

```md
## x.y.z — YYYY-MM-DD

### Added

-

### Changed

-

### Fixed

-

### Known Notes

-
```
