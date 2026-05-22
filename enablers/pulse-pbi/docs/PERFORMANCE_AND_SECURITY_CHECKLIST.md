# Performance And Security Checklist

## Performance Checklist

Before release or rollout:

1. Confirm the visual packages successfully with `npm run package`.
2. Confirm there are no intentional UI delays in the request/response flow.
3. Confirm derived UI values are memoized where that materially reduces repeated work.
4. Confirm the Power BI host layer stays thin and does not duplicate UI logic.
5. Confirm the context payload is compact and does not expand unbounded dimension lists.
6. Confirm connection health checks are cached and do not run on every visual update.
7. Confirm the proxy or backend path is the primary latency contributor, not the visual code.

## Security Checklist

Before release or rollout:

1. Confirm the Genie space points to an approved metric view or governed view.
2. Confirm only approved fields are bound into the visual and sent to Genie.
3. Confirm no unrestricted dataset export behavior is introduced through the prompt path.
4. Confirm authentication is appropriate for the environment.
5. Confirm direct PAT usage is limited to controlled scenarios.
6. Confirm proxy/gateway patterns are used for broader or production deployment.
7. Confirm there is no assumption that Power BI RLS automatically applies in Databricks.
8. Confirm feedback capture and any downstream logging follow the approved proxy pattern.

## Authentication Checklist

1. Confirm whether the deployment uses direct mode or proxy mode.
2. Confirm the visual settings match the chosen mode.
3. Confirm token handling is not exposed more broadly than intended.
4. Confirm the connection light behavior matches actual package behavior:
   - green for reachable
   - amber for checking
   - red for unreachable or not configured

## Interaction Checklist

1. Confirm report filters affect the visual context.
2. Confirm page filters affect the visual context.
3. Confirm slicers affect the visual context.
4. Confirm cross-filtering and cross-highlighting affect the visual context.
5. Confirm clicking an interactive context chip can filter the report back.
6. Confirm chart type switching (bar, line, area, pie, scatter) renders correctly for numeric query results.
7. Confirm axis configuration dropdowns update the chart correctly.
8. Confirm "Show code" toggle reveals the SQL query in the data toolbar.
9. Confirm CSV download produces correct output.
10. Confirm follow-up question buttons (from API or text-detected) send the question when clicked.
11. Confirm Enter-to-send works in the compose area (Shift+Enter for newline).
12. Confirm query result table and chart render when Genie returns data (requires successful `/query-result/{attachment_id}` fetch).
13. Confirm chart title appears above the chart when Genie provides a query title.
14. Confirm row numbers appear in the `#` column of the data table.
15. Confirm source view name badge appears in the Analysis section when a SQL `FROM` clause is parseable.

## Handover Checklist

1. Confirm the latest `.pbiviz` artifact is present in `dist/`.
2. Confirm all package documents reflect current behavior.
3. Confirm known limitations and warnings are documented.
4. Confirm test expectations are clear for report authors and deployers.
