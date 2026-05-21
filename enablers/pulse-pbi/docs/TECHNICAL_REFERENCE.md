# Technical Reference

## Architecture

The package is intentionally split into a thin Power BI host layer and a modular React/UI layer.

## Source Files

### Power BI host layer

- [src/visual.tsx](../src/visual.tsx)
  Power BI host adapter. Handles lifecycle, formatting model population, and selection-manager wiring.

- [src/settings.ts](../src/settings.ts)
  Power BI format-pane settings model and plain settings conversion.

### Core logic

- [src/contextBuilder.ts](../src/contextBuilder.ts)
  Builds the compact Power BI context summary sent to Genie.

- [src/genie.ts](../src/genie.ts)
  Databricks Genie client built on top of `XMLHttpRequest`. Handles conversation sessions, polling, and attachment parsing. Key behaviours:
  - Uses `attachment_id` (not `id`) to identify attachments, matching the Databricks API contract.
  - After COMPLETED status, fetches query result rows from the separate `/query-result/{attachment_id}` endpoint.
  - Parses `suggested_questions` attachment for follow-up question arrays.
  - Handles three known query-result response formats: `statement_response` wrapper, direct `data_array`, and legacy `data_table`.
  - `GenieMessage` includes `queryTitle` and `followUpQuestions` alongside content, SQL, and query result.

- [src/visualHelpers.ts](../src/visualHelpers.ts)
  Shared helpers for prompt construction, config validation, feedback payloads, and Power BI selection context. Includes `fmt()` for rich markdown rendering (paragraphs, bullet lists, bold, italic, inline code).

- [src/visualConstants.ts](../src/visualConstants.ts)
  Reusable prompts and best-practice field constants.

- [src/visualTypes.ts](../src/visualTypes.ts)
  Shared UI and integration types. `ChatMessage` includes `queryTitle` and `followUpQuestions` fields populated from the API response.

### React UI layer

- [src/VisualApp.tsx](../src/VisualApp.tsx)
  Top-level UI coordinator. Manages chat state, feedback, context selection wiring, and follow-up question handling. Passes `queryTitle` and `followUpQuestions` from `GenieMessage` into the stored `ChatMessage`.

- [src/hooks/useConnectionState.ts](../src/hooks/useConnectionState.ts)
  Connection state hook. Manages live health checks with a short-lived in-memory cache to avoid repeated backend calls during frequent Power BI update cycles.

- [src/components/ChatHistory.tsx](../src/components/ChatHistory.tsx)
  Genie-style message renderer. User messages are right-aligned bubbles; assistant messages are full-width with structured sections: analysis disclosure, response text, data view, follow-up suggestions, and feedback row. Analysis section shows source view name extracted from SQL `FROM` clause. Follow-up suggestions use API-provided `followUpQuestions` array (multiple buttons in a flex row); falls back to text-detected trailing questions when the API provides none. Includes contextual empty states (setup required, add fields, ready to ask) with quick prompt buttons.

- [src/components/ComposeArea.tsx](../src/components/ComposeArea.tsx)
  Compose textarea with Enter-to-send, status line, and send button.

- [src/components/ContextStrip.tsx](../src/components/ContextStrip.tsx)
  Interactive context chip row. Renders clickable Power BI selection chips from bound dimension values.

- [src/components/GenieDataView.tsx](../src/components/GenieDataView.tsx)
  Unified data view wrapper with Databricks-style toolbar. Provides table/chart toggle, CSV download, "Show code" SQL disclosure, chart type switcher (bar/line/area/pie/scatter), axis configuration panel, and chart title pass-through. Responsive chart sizing via ResizeObserver.

- [src/components/GenieChart.tsx](../src/components/GenieChart.tsx)
  D3-based chart renderer supporting bar, line, area, pie, and scatter charts. Displays chart title above the SVG and axis labels on X and Y axes for cartesian and scatter types. Auto-detects numeric vs categorical columns for sensible defaults. Includes column type analysis utilities.

- [src/components/GenieTable.tsx](../src/components/GenieTable.tsx)
  Data table renderer with a `#` row-number column, column type indicators (string, numeric, date badges), type-aware cell formatting, numeric right-alignment, and row limit handling (100 rows shown).

### Local test proxy

- [proxy/server.js](../proxy/server.js)
  Local development proxy. Testing only — not for production. Logs message attachment structure (`[genie-msg]`) and query-result column/row counts (`[genie-qr]`) to standard output for debugging API response formats.

## Data Flow

1. Power BI calls `Visual.update()`.
2. The host adapter extracts the current `dataView`, formatting settings, highlights, and selection context.
3. `buildContext()` creates a compact context summary from visible dimensions and measures.
4. `VisualApp` constructs a governed Genie request from domain guidance plus Power BI context.
5. `GenieClient` sends the request to Databricks or a proxy and polls until COMPLETED.
6. On COMPLETED, `GenieClient` checks for a QUERY attachment. If present and no inline result, it fetches rows from `/query-result/{attachment_id}`. It also extracts `suggested_questions` from the suggestions attachment and `title` from the query attachment.
7. The UI renders the full response:
   - analysis disclosure (expandable SQL, source view badge)
   - rich-text explanation (markdown with bold, italic, lists, inline code)
   - data view with row-numbered table or D3 chart (bar/line/area/pie/scatter), chart title, axis labels, CSV download, chart type switcher, axis configuration
   - follow-up suggestion buttons (from API array or text-detected fallback)
   - feedback row (thumbs up/down with optional comment)

## Interaction Model

Inbound:

- report filters
- page filters
- visual filters
- slicers
- cross-highlighting

Outbound:

- interactive context chips created from categorical identities supplied by Power BI

## Connection Model

The header indicator supports four states:

- `not_configured`
- `checking`
- `online`
- `offline`

Live connection checks are cached in memory for a short time to avoid repeated backend calls during frequent Power BI update cycles.

## Local Proxy

The local proxy is for Power BI Desktop testing only. For production deployment patterns (Azure APIM, Azure Functions, AWS API Gateway, Nginx), see [PROXY_GUIDE.md](PROXY_GUIDE.md).

Behavior:

- listens on `127.0.0.1:8787` by default
- proxies `GET` and `POST` requests for `/api/2.0/genie/spaces/...`
- accepts Databricks host from `X-Genie-Target-Host` or `DATABRICKS_HOST`
- accepts authorization from `Authorization` or `DATABRICKS_TOKEN`
- exposes `/health`
- accepts `/feedback`
- logs `[genie-msg]` lines (attachment structure, follow-up count) and `[genie-qr]` lines (columns, row count) for every Genie API call to aid debugging

## Important Constraints

- The visual does not receive unrestricted access to the full Power BI semantic model.
- Only bound fields and declared mappings are available to the custom visual.
- Free-text Genie responses do not automatically create Power BI selections.
- Databricks-side authorization must be treated separately from Power BI RLS.
- Query result rows are fetched from a separate Databricks endpoint (`/query-result/{attachment_id}`), not from the message response inline.

## Agent Reuse Guidance

If another LLM or implementation agent needs to reuse the package pattern in a different application, see [TECHNICAL_UPDATE_FOR_AGENTS.md](TECHNICAL_UPDATE_FOR_AGENTS.md).

That document explains what this package makes possible, what must be validated in the target host application, and what should be adapted rather than copied directly.

## Packaging

Build command:

```powershell
npm run package
```

Output artifact:

- `dist/*.pbiviz`
