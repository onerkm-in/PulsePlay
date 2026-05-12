# Genie + Power BI first-copy research

Date: 2026-05-11

## Target

The first credible PulsePlay build should be narrow, excellent, novice-author friendly, and production-grade:

- AI brain: Databricks Genie through the existing PulsePlay proxy.
- BI surface: Power BI Embedded through `powerbi-client`.
- Host: PulsePlay browser app, with the ported Pulse experience as the primary AI pane.
- Author experience: guided setup that can complete in about 10 minutes when platform prerequisites are ready.

This keeps the project aligned with its original purpose: lift the proven Power BI custom visual work out of the Power BI sandbox, then make it portable.

## Playground principle

The agenda is not to turn PulsePlay into a fixed Genie + Power BI app. The agenda is to make the plugin-play concept feel like a real playground:

- Bring a BI surface.
- Bring an AI connector.
- Bring or infer a vertical pack.
- Play with the combination immediately.
- Swap any piece without rewriting the other pieces.

Genie + Power BI is the first production cell because both sides have the most proven code and test history. It must still use the same contracts as every future cell: `BIAdapter`, proxy profile, `pulsepacks`, canonical events, canonical commands, and thin host bridges.

The broader leverage plan is tracked in [SUPERIOR_BUILD_LEVERAGE_PLAN.md](SUPERIOR_BUILD_LEVERAGE_PLAN.md). First build should reuse the sister visual's best setup, context, prompt, SQL trace, smoke, and test learnings where they remain superior, but never by hard-coding the playground back into a Power BI-only product. The novice setup target is tracked in [TEN_MINUTE_AUTHOR_SETUP.md](TEN_MINUTE_AUTHOR_SETUP.md). Other combinations can be roped in after this first build clears the production gate.

## External API facts

Databricks Genie:

- The supported integration path is the Genie conversation API. It starts conversations at `POST /api/2.0/genie/spaces/{space_id}/start-conversation`, polls messages, retrieves attachments, and continues follow-ups in the same conversation.
- Genie API responses expose generated text, generated SQL, and tabular query results. They do not return rendered charts, so PulsePlay must render any result tables/charts itself.
- Production browser-user scenarios should prefer OAuth U2M; service principal/M2M is the path when browser-user auth is not possible.

Power BI Embedded:

- The browser host embeds reports with a configuration object containing `accessToken`, `embedUrl`, report `id`, `tokenType`, permissions, settings, and optional filters.
- `powerbi-client` is the right client-side control surface for page navigation, filters, refresh, fullscreen, events, and bookmark capture.
- Power BI events include `loaded`, `pageChanged`, `rendered`, `dataSelected`, `visualClicked`, and `visualRendered`.
- Export-to-file is a server-side REST flow, asynchronous, requires capacity support, and can export current state through bookmarks/filters. It should stay a later feature, not first-copy critical path.
- GenerateToken v2 is the correct REST route for embedding reports/semantic models. For service-principal plus RLS, an effective identity must be supplied.

Official references:

- Databricks Genie API: https://docs.databricks.com/aws/en/genie/conversation-api
- Power BI embed report: https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/embed-report
- Power BI client API: https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/embedded-analytics-client-api
- Power BI events: https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/handle-events
- Power BI filters: https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/control-report-filters
- Power BI embed token: https://learn.microsoft.com/en-us/power-bi/developer/embedded/generate-embed-token
- Power BI export-to-file: https://learn.microsoft.com/en-us/power-bi/developer/embedded/export-to

## Local component map

Browser host:

- `playground/src/App.tsx`: owns the outer PulsePlay shell, AI/BI layout, active BI vendor, embed config, recent BI events, and Pulse/v0 mode.
- `playground/src/biPanel/BIPanel.tsx`: generic host for any BI adapter.
- `playground/src/biPanel/BIAdapter.ts`: vendor-neutral lifecycle, event, capability, and command contract.
- `bi-adapters/powerbi/index.ts`: real `powerbi-client` adapter plus secure-embed preview iframe fallback.
- `playground/src/components/EmbedConfigForm.tsx`: Power BI secure embed quick-preview, SSO, service-principal embed-token, and manual token form.
- `playground/src/lib/pbiAuth.ts`: MSAL flow for user-owns-data Power BI embedding.

Pulse port:

- `playground/src/components/PulseShell.tsx`: mounts the old Pulse `Visual` in the web app, creates synthetic DataViews, and maps BI events into Pulse context.
- `playground/src/pulse/_adapter/PulseHostStub.ts`: replaces Power BI's `IVisualHost`, routing settings to localStorage and filters to a host callback.
- `playground/src/pulse/visual.tsx`: the mature Pulse UI and Genie workflow.
- `playground/src/pulse/genie.ts`: ported Genie client and proxy caller.
- `playground/src/pulse/setupStep5.tsx`: mature setup surface for Databricks/AI configuration.

Proxy:

- `proxy/server.js`: Genie start/poll/follow-up, profile resolution, Power BI embed-token issuance, Smart Connect probe, pack injection, security middleware.
- `proxy/lib/connectorProbe.js`: profiles and metadata probe.
- `proxy/lib/packMatcher.js`: pack inference from connector metadata.
- `proxy/lib/insightsValidator.js`: JS mirror of the Pulse insights validator.

## What was missing

Critical host gaps:

- Pulse mode was default, but BI embed setup only existed in v0 mode.
- Pulse could call `host.applyJsonFilter`, but the callback was not connected to the active BI adapter.
- `BIPanel` did not expose its live adapter to the parent, so outer host commands could not be routed into the embedded BI report.
- Power BI context was event-derived, not full semantic-model-derived. That is acceptable for first copy, but it must be labelled as scoped browser context, not full Power BI DataView parity.
- The old visual test suite was not ported; PulsePlay currently validates only a small subset of the ported Pulse behavior.

Intentional first-copy non-goals:

- Tableau/Qlik/Looker SDK parity.
- Server-side Power BI export-to-file.
- Multi-tenant production auth hardening beyond current proxy security middleware.
- Full report-authoring or report-generation automation inside Power BI.

## Changes landed in this pass

- Power BI is now the default BI vendor for the browser host.
- The active BI vendor persists in localStorage under `pulseplay:bi-vendor`.
- Pulse mode now surfaces a compact BI source setup panel above the Pulse UI.
- The Power BI embed form is reachable from the default Pulse mode.
- Power BI secure embed link/iframe is now available as the default novice preview path; richer SDK control still uses SSO or backend-issued embed tokens.
- A Power BI Developer Tools strip is available above embedded Power BI reports for API proving: snapshot pages/filters/capabilities, inspect recent events, refresh/fullscreen, and test apply/clear filter commands.
- `BIPanel` exposes the live adapter through `onAdapterReady`.
- `App.tsx` keeps live BI adapters in a ref and routes Pulse filter actions into the BIAdapter command contract.
- Pulse `applyJsonFilter` calls now become BI commands:
  - merge -> `apply-filter`
  - remove with a target -> `clear-filter` for that field
  - remove with no target -> `clear-filter` for all filters

## Next best work

P0: make Power BI and Genie feel seamless.

- Add a first-run "Genie + Power BI" setup path that configures both:
  - Genie profile/API base in Pulse settings.
  - Power BI report/workspace/embed mode in the BI source panel.
- Add a Power BI profile probe that verifies:
  - report ID, workspace ID, dataset ID, embed URL.
  - service principal token generation.
  - RLS effective identity readiness when configured.
- Add a health strip that shows three independent states:
  - Power BI report embedded.
  - Genie profile reachable.
  - Context bridge active.

P1: improve context fidelity.

- Capture Power BI `loaded`, `rendered`, `pageChanged`, `dataSelected`, and current report filters into a normalized context store.
- On report load and page change, call `getFilters()` and `getPages()` so the AI context does not depend only on future events.
- Add a field mapping layer for Power BI filter targets. Column-only filters work for demos, but production needs `{ table, column }` mapping to avoid duplicate-column ambiguity.
- Add optional dataset/schema metadata from Power BI REST or a user-provided mapping file.

P2: protect the migrated Pulse behavior.

- Port the old visual's most valuable pure tests into `playground/src/pulse`.
- Prioritize:
  - prompt redaction
  - context builder
  - insights renderer edge cases
  - stage validator
  - SQL section rendering
  - settings/setup draft validation
  - export helpers
- Keep browser-host tests separate from old PBI visual lifecycle tests.

P3: enterprise polish.

- Decide the production auth shape:
  - user-owns-data for internal users through MSAL/AAD, or
  - app-owns-data through service principal plus effective identity.
- Align Genie identity and Power BI RLS identity where possible.
- Add audit correlation IDs spanning:
  - Power BI embed-token request
  - Genie conversation start
  - poll/follow-up
  - exported result/query trace

## Product direction

For this first copy, do not market PulsePlay as "any BI, any AI" yet. The right first message is:

> PulsePlay connects a Power BI report to a Databricks Genie space in a web-native host, carrying report context into Genie and routing safe AI actions back into the report.

Internally, keep the broader promise visible:

> PulsePlay is where BI and AI components come to play together.

Once the first slice is boringly reliable, the same contracts can be widened to Tableau, Qlik, Looker, OpenAI, Bedrock, and Foundation Model profiles.
