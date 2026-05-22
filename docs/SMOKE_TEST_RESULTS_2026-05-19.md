# Smoke Test Results — 2026-05-19

Run type: visible Codex in-app browser smoke slice + local validation gates.

## Summary

| Metric | Count |
|---|---:|
| Plan rows parsed | 647 |
| Plan AUTO rows parsed | 400 |
| Plan LIVE rows parsed | 169 |
| Plan MANUAL rows parsed | 78 |
| Executed visible browser plan scenarios | 34 |
| PASS | 34 |
| FAIL | 0 |
| SKIPPED | 444 |
| N/A live-environment required | 169 |

Note: docs/SMOKE_TEST_PLAN.md says 520 scenarios, but the current markdown table parser found 647 scenario rows (400 AUTO / 169 LIVE / 78 MANUAL). This report is intentionally conservative and does not mark unexecuted rows as pass.

## Environment

- App URL tested: http://127.0.0.1:5174
- Current browser surface: Codex in-app browser, visible to user during automation
- Proxy health: ok; profiles default, supervisor; port 8787; authMode none
- Git HEAD: 82f77fa
- Git status at smoke close: clean main
- Baseline tests from this run: playground vitest 918/918 passing
- TypeScript/lint gate from this run: npm run lint clean

## Browser Notes

- The first browser pass exposed automation-selector issues, not product failures: rail controls use richer accessible names and the app shell needs a short stabilization wait after direct navigation. Retried using DOM-grounded selectors.
- The default visible in-app viewport is narrow, so Settings desktop rail checks were repeated with a temporary 1440x900 viewport.
- No live Databricks/AAD/vendor scenarios were executed. No manual visual scoring was attempted.
- I did not click the external separate-page button in this run; I verified the in-app floating panel behavior instead.

## Custom Observations

- SURFACE-PEER-01: BI Viz opens as a same-screen peer surface from the top switcher, not as the old permanent blank split pane.
- SURFACE-PEER-02: AI Insights returns from BI Viz after the shell stabilizes.
- WORKBENCH-ROUTE-01: /workbench responds with the workbench gate/shell. This is route health only, not WB-01 from the plan.
- SEPARATE-PAGE-CTRL-01: External separate-page control is present. It was not clicked in this visible smoke run.
- RESPONSIVE-NOTE-01: At the default narrow in-app viewport, the Settings desktop rail is hidden/offscreen as expected; rail-click checks were repeated at 1440x900.

## Executed Plan Passes

- SETUP-RENDER-01: Setup page loaded in visible browser.
- SETUP-RENDER-02: Subtitle rendered exactly.
- SETUP-RENDER-03: Readiness chip visible.
- SETUP-RENDER-04: Three current setup cards visible: BI tool, AI brain, Knowledge pack.
- SETUP-RENDER-05: Footer quick-jump chips visible.
- SETUP-RENDER-08: No governance/proxy error banner visible with proxy healthy.
- SHELL-NAV-01: /settings lands on Setup.
- SHELL-NAV-02: BI group chip navigates to /settings/bi.
- SHELL-NAV-03: AI group chip navigates to /settings/ai.
- SHELL-NAV-04: Desktop rail Preferences navigates to /settings/preferences.
- SHELL-NAV-05: Desktop rail System navigates to /settings/system.
- SHELL-NAV-06: Desktop rail Advanced navigates to /settings/advanced.
- SHELL-NAV-07: Setup group chip returns to /settings/setup.
- SHELL-NAV-08: Esc from settings returns to app root.
- SHELL-NAV-11: Direct /settings/ai/knowledge-base renders.
- SHELL-NAV-15: Back to app returns to /.
- SHELL-NAV-20: Direct /settings/bi/governance renders.
- SHELL-STATUS-01: Six status chips visible: Setup, BI, AI, Pack, Proxy, Security.
- SHELL-STATUS-08: Proxy chip reads healthy/reachable with proxy up.
- SHELL-SEARCH-01: Ctrl+/ focuses Settings search.
- SHELL-SEARCH-08: Gibberish search shows zero-match state.
- SHELL-SEARCH-09: Clearing search restores all groups.
- APP-01: Root app shell renders PulsePlay.
- APP-12: Setup readiness pill visible in top-right.
- APP-13: Readiness pill opens Settings > Setup.
- APP-14: Surface switcher shows AI Insights, Ask Pulse, BI Viz after shell stabilizes.
- PREF-APP-01: /settings/preferences/appearance renders.
- PREF-APP-02: Default light theme option visible.
- PREF-APP-05: Slate Dark theme option visible.
- AI-VSEARCH-01: /settings/ai/vector-search-kb renders.
- FLOAT-01: Popout control opens in-app floating AI panel.
- FLOAT-04: Dock control returns floating panel to layout.
- FLOAT-05: Main canvas remains visible/available while AI panel floats.
- FLOAT-08: Floating mode did not create a duplicate surface tablist.

## Full Scenario Matrix

| ID | Tag | Status | Scenario | Note |
|---|---|---|---|---|
| SHELL-NAV-01 | AUTO | PASS | Open `/settings` directly | /settings lands on Setup. |
| SHELL-NAV-02 | AUTO | PASS | Click "BI" in rail | BI group chip navigates to /settings/bi. |
| SHELL-NAV-03 | AUTO | PASS | Click "AI" in rail | AI group chip navigates to /settings/ai. |
| SHELL-NAV-04 | AUTO | PASS | Click "Preferences" in rail | Desktop rail Preferences navigates to /settings/preferences. |
| SHELL-NAV-05 | AUTO | PASS | Click "System" in rail | Desktop rail System navigates to /settings/system. |
| SHELL-NAV-06 | AUTO | PASS | Click "Advanced" in rail | Desktop rail Advanced navigates to /settings/advanced. |
| SHELL-NAV-07 | AUTO | PASS | Click "Setup" after visiting another group | Setup group chip returns to /settings/setup. |
| SHELL-NAV-08 | AUTO | PASS | Press Esc on any settings page | Esc from settings returns to app root. |
| SHELL-NAV-09 | AUTO | SKIPPED | Browser back button on settings | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-NAV-10 | AUTO | SKIPPED | Browser forward button | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-NAV-11 | AUTO | PASS | Refresh page on `/settings/ai/knowledge-base` | Direct /settings/ai/knowledge-base renders. |
| SHELL-NAV-12 | MANUAL | SKIPPED | Active group in rail has blue gradient fill | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-NAV-13 | MANUAL | SKIPPED | Active sub-route in rail is highlighted | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-NAV-14 | MANUAL | SKIPPED | Hover an inactive group in rail | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-NAV-15 | AUTO | PASS | Click "Back to app" button | Back to app returns to /. |
| SHELL-NAV-16 | MANUAL | SKIPPED | Back button hovers shift left 2px | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-NAV-17 | AUTO | SKIPPED | Active group expands to show sub-leaves | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-NAV-18 | AUTO | SKIPPED | Inactive group does NOT show sub-leaves | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-NAV-19 | AUTO | SKIPPED | Switch groups → sub-leaves of new group appear | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-NAV-20 | AUTO | PASS | Direct URL `/settings/bi/governance` | Direct /settings/bi/governance renders. |
| SHELL-HEADER-01 | MANUAL | SKIPPED | Header shows "Settings" title | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-HEADER-02 | AUTO | SKIPPED | Header subtitle renders | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-HEADER-03 | MANUAL | SKIPPED | Icon badge gradient indigo→violet | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-HEADER-04 | MANUAL | SKIPPED | Back button right-aligned | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-HEADER-05 | MANUAL | SKIPPED | Header has bottom shadow | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-SEARCH-01 | AUTO | PASS | Press Cmd/Ctrl+/ | Ctrl+/ focuses Settings search. |
| SHELL-SEARCH-02 | AUTO | SKIPPED | Type "tile" in search | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-SEARCH-03 | AUTO | SKIPPED | Type "embed" in search | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-SEARCH-04 | AUTO | SKIPPED | Type "supervisor" in search | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-SEARCH-05 | AUTO | SKIPPED | Type "theme" in search | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-SEARCH-06 | AUTO | SKIPPED | Type "sql" in search | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-SEARCH-07 | AUTO | SKIPPED | Type "governance" in search | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-SEARCH-08 | AUTO | PASS | Type gibberish "xyzqq" | Gibberish search shows zero-match state. |
| SHELL-SEARCH-09 | AUTO | PASS | Clear search | Clearing search restores all groups. |
| SHELL-SEARCH-10 | AUTO | SKIPPED | Search results count visible | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-SEARCH-11 | MANUAL | SKIPPED | kbd hint visible when search empty | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-SEARCH-12 | MANUAL | SKIPPED | kbd hint fades when input focused | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-SEARCH-13 | MANUAL | SKIPPED | Search input has focus ring | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-SEARCH-14 | MANUAL | SKIPPED | Search input is pill-shaped | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-SEARCH-15 | AUTO | SKIPPED | Search ignored when typing in form fields | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-01 | AUTO | PASS | Status strip shows 6 chips | Six status chips visible: Setup, BI, AI, Pack, Proxy, Security. |
| SHELL-STATUS-02 | AUTO | SKIPPED | Click "Setup" chip | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-03 | AUTO | SKIPPED | Click "BI" chip | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-04 | AUTO | SKIPPED | Click "AI" chip | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-05 | AUTO | SKIPPED | Click "Pack" chip | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-06 | AUTO | SKIPPED | Click "Proxy" chip | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-07 | AUTO | SKIPPED | Click "Security" chip | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-08 | AUTO | PASS | Proxy chip shows "ok" when proxy reachable | Proxy chip reads healthy/reachable with proxy up. |
| SHELL-STATUS-09 | LIVE | N/A | Proxy chip shows "warn" when 5xx | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SHELL-STATUS-10 | AUTO | SKIPPED | Proxy chip shows "loading" during initial fetch | AUTO scenario not included in this visible time-boxed smoke slice. |
| SHELL-STATUS-11 | MANUAL | SKIPPED | Status chips have hover lift | Manual visual/a11y judgment required; not scored by automation. |
| SHELL-STATUS-12 | MANUAL | SKIPPED | Status chip dots scale on hover | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-RENDER-01 | AUTO | PASS | Open `/settings/setup` | Setup page loaded in visible browser. |
| SETUP-RENDER-02 | AUTO | PASS | Subtitle "Three short steps to get PulsePlay running" visible | Subtitle rendered exactly. |
| SETUP-RENDER-03 | AUTO | PASS | Top-right readiness chip renders | Readiness chip visible. |
| SETUP-RENDER-04 | AUTO | PASS | 3 FieldCards render (BI / AI / Knowledge pack) | Three current setup cards visible: BI tool, AI brain, Knowledge pack. |
| SETUP-RENDER-05 | AUTO | PASS | Footer with 3 quick-jump chips | Footer quick-jump chips visible. |
| SETUP-RENDER-06 | MANUAL | SKIPPED | Step badge has indigo→violet gradient | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-RENDER-07 | MANUAL | SKIPPED | FieldCard hover raises shadow | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-RENDER-08 | AUTO | PASS | No allowlist errors shown when proxy responds | No governance/proxy error banner visible with proxy healthy. |
| SETUP-RENDER-09 | LIVE | N/A | Orphan banner shown if orphans present | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SETUP-RENDER-10 | AUTO | SKIPPED | Each card has status badge in header | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-01 | AUTO | SKIPPED | Vendor select shows "— Pick a BI tool —" placeholder when empty | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-02 | AUTO | SKIPPED | Select "Power BI" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-03 | AUTO | SKIPPED | Select "Databricks Genie" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-04 | AUTO | SKIPPED | Select "Databricks AI/BI" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-05 | AUTO | SKIPPED | Select "Tableau" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-06 | AUTO | SKIPPED | Select "Qlik Sense" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-07 | AUTO | SKIPPED | Select "Looker" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-08 | AUTO | SKIPPED | Select "Generic iframe" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-09 | AUTO | SKIPPED | Paste Power BI URL `https://app.powerbi.com/reportEmbed?...` | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-10 | AUTO | SKIPPED | Click "Apply embed" with valid URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-11 | AUTO | SKIPPED | Click "Apply embed" with empty field | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-12 | AUTO | SKIPPED | Click "Clear" after apply | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-13 | MANUAL | SKIPPED | Vendor help tooltip opens on hover of ⓘ | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-BI-14 | MANUAL | SKIPPED | Title-level help tooltip explains 2-axis | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-BI-15 | AUTO | SKIPPED | Embed status badge updates after apply | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-16 | AUTO | SKIPPED | "Full embed form →" link navigates to BI/embed | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-17 | LIVE | N/A | Allowlist filters vendor options | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SETUP-BI-18 | AUTO | SKIPPED | Vendor select disabled while allowlist loading | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-19 | AUTO | SKIPPED | Refresh page after apply — embed persists | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-BI-20 | AUTO | SKIPPED | Apply Genie iframe HTML (full `<iframe>...</iframe>`) | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-01 | AUTO | SKIPPED | Profile select shows allowlist'd profiles | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-02 | AUTO | SKIPPED | Select a profile | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-03 | AUTO | SKIPPED | "Test proxy" button in card header | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-04 | LIVE | N/A | Click "Test proxy" → ok | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SETUP-AI-05 | LIVE | N/A | Click "Test proxy" with proxy down | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SETUP-AI-06 | AUTO | SKIPPED | Click "Test selected profile" with no profile | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-07 | LIVE | N/A | Click "Test selected profile" with valid profile | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SETUP-AI-08 | LIVE | N/A | Click "Test selected profile" with unknown profile | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SETUP-AI-09 | MANUAL | SKIPPED | Test button shows spinner while running | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-AI-10 | AUTO | SKIPPED | Test result persists until next click | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-11 | AUTO | SKIPPED | Profile select disabled when no profiles in allowlist | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-12 | MANUAL | SKIPPED | Profile tooltip mentions proxy/config.json | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-AI-13 | AUTO | SKIPPED | "Tune Insights behavior →" link navigates to AI/ai-insights | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-14 | AUTO | SKIPPED | Status badge shows "Configured" once profile picked | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-AI-15 | AUTO | SKIPPED | Status badge shows "Not picked" when profile empty | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-01 | AUTO | SKIPPED | Pack select shows allowlist'd packs | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-02 | AUTO | SKIPPED | Select a pack | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-03 | AUTO | SKIPPED | Select "— No pack —" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-04 | AUTO | SKIPPED | Browse link appears after pack selected | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-05 | AUTO | SKIPPED | Browse link href is `/knowledge/<pack>` | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-06 | AUTO | SKIPPED | Status badge "Optional" when no pack | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-07 | AUTO | SKIPPED | Status badge "Selected" when pack picked | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-PACK-08 | AUTO | SKIPPED | Pack select disabled when no allowlist'd packs | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-SAVE-01 | AUTO | SKIPPED | Change a setting | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-SAVE-02 | MANUAL | SKIPPED | Save bar shows "Unsaved changes" with pulsing dot | Manual visual/a11y judgment required; not scored by automation. |
| SETUP-SAVE-03 | AUTO | SKIPPED | Click "Save changes" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-SAVE-04 | AUTO | SKIPPED | "Settings saved" auto-dismisses after 3s | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-SAVE-05 | AUTO | SKIPPED | Make change → click "Discard" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-SAVE-06 | AUTO | SKIPPED | Make multiple changes → Save | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-SAVE-07 | AUTO | SKIPPED | No save bar visible when nothing changed | AUTO scenario not included in this visible time-boxed smoke slice. |
| SETUP-SAVE-08 | AUTO | SKIPPED | Save bar persists across group changes | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PROVIDER-01 | AUTO | SKIPPED | Open `/settings/bi/provider` | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PROVIDER-02 | AUTO | SKIPPED | Current vendor visible | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PROVIDER-03 | AUTO | SKIPPED | Allowlist enforcement shown | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PROVIDER-04 | AUTO | SKIPPED | Vendor picker in BI matches Setup | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-01 | AUTO | SKIPPED | Pick PBI, switch to Secure mode | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-02 | AUTO | SKIPPED | Paste valid secure embed URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-03 | AUTO | SKIPPED | Apply secure URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-04 | AUTO | SKIPPED | Paste portal iframe HTML | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-05 | AUTO | SKIPPED | Apply invalid URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-06 | LIVE | N/A | URL host outside allowlist | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SECURE-07 | AUTO | SKIPPED | autoAuth=true preserved in URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-08 | AUTO | SKIPPED | ctid (tenant) preserved | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-09 | AUTO | SKIPPED | actionBarEnabled flag preserved | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SECURE-10 | LIVE | N/A | Embed iframe loads in canvas after apply | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SECURE-11 | LIVE | N/A | AAD SSO flow completes via autoAuth | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SECURE-12 | LIVE | N/A | X-Frame-Options not blocking | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SSO-01 | AUTO | SKIPPED | Switch to SSO mode | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SSO-02 | AUTO | SKIPPED | Fill groupId, reportId, datasetId | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SSO-03 | AUTO | SKIPPED | Pick permissions = "View" | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SSO-04 | AUTO | SKIPPED | Pick permissions = "Edit" | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SSO-05 | AUTO | SKIPPED | AAD client ID required field | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SSO-06 | AUTO | SKIPPED | AAD tenant optional field | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SSO-07 | AUTO | SKIPPED | "Sign in & embed" button visible | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-SSO-08 | LIVE | N/A | Click "Sign in & embed" → MSAL redirect | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SSO-09 | LIVE | N/A | After sign-in, embed loads | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SSO-10 | LIVE | N/A | "Sign Out" button after signed in | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SSO-11 | LIVE | N/A | Sign Out clears MSAL session | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SSO-12 | LIVE | N/A | groupId allowlist enforcement | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-SSO-13 | LIVE | N/A | reportId allowlist enforcement | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-BACKEND-01 | AUTO | SKIPPED | Switch to Backend mode | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-BACKEND-02 | AUTO | SKIPPED | Fill groupId, reportId, datasetId | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-BACKEND-03 | LIVE | N/A | Apply → proxy calls `/api/assistant/embed-token/powerbi` | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-BACKEND-04 | LIVE | N/A | Proxy returns embed token | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-BACKEND-05 | LIVE | N/A | Active assistant profile included in call | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-BACKEND-06 | LIVE | N/A | Token expiration handled | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-BACKEND-07 | LIVE | N/A | Service principal misconfigured → 401/403 | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-MANUAL-01 | AUTO | SKIPPED | Switch to Manual mode | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-MANUAL-02 | AUTO | SKIPPED | Paste embed URL + token | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-PBI-MANUAL-03 | MANUAL | SKIPPED | Manual mode shows dev-only warning | Manual visual/a11y judgment required; not scored by automation. |
| BI-PBI-MANUAL-04 | LIVE | N/A | Apply with valid token | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-PBI-MANUAL-05 | LIVE | N/A | Token never leaves browser | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-AIBI-01 | AUTO | SKIPPED | Pick "Databricks AI/BI" vendor | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-AIBI-02 | AUTO | SKIPPED | Basic mode — URL input | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-AIBI-03 | AUTO | SKIPPED | Basic mode — paste dashboard URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-AIBI-04 | AUTO | SKIPPED | SDK mode — multi-field form | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-AIBI-05 | AUTO | SKIPPED | SDK mode — all required fields filled | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-AIBI-06 | LIVE | N/A | SDK mode — calls `/api/assistant/embed-token/databricks-aibi` | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-AIBI-07 | AUTO | SKIPPED | SDK mode — external viewer ID for RLS | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-AIBI-08 | AUTO | SKIPPED | SDK mode — external viewer value | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-AIBI-09 | LIVE | N/A | Embed iframe loads in canvas | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-AIBI-10 | AUTO | SKIPPED | Switch between Basic/SDK preserves URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GENIE-01 | AUTO | SKIPPED | Pick "Databricks Genie" | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GENIE-02 | AUTO | SKIPPED | Paste full `<iframe>...</iframe>` HTML | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GENIE-03 | AUTO | SKIPPED | Paste just iframe src URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GENIE-04 | LIVE | N/A | Embed iframe loads Genie space | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-GENIE-05 | AUTO | SKIPPED | Sandbox attributes narrow to minimum | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GENERIC-01 | AUTO | SKIPPED | Pick "Generic iframe" | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GENERIC-02 | AUTO | SKIPPED | Paste any URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GENERIC-03 | LIVE | N/A | Iframe loads URL | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| BI-GENERIC-04 | MANUAL | SKIPPED | X-Frame-Options blocks → blank iframe | Manual visual/a11y judgment required; not scored by automation. |
| BI-STUBS-01 | AUTO | SKIPPED | Pick Tableau | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-STUBS-02 | AUTO | SKIPPED | Pick Qlik | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-STUBS-03 | AUTO | SKIPPED | Pick Looker | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-STUBS-04 | AUTO | SKIPPED | Apply URL — falls through generic iframe | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-STUBS-05 | AUTO | SKIPPED | Stub vendor shows "needs config" hint | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-01 | AUTO | SKIPPED | Open `/settings/bi/governance` | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-02 | AUTO | SKIPPED | Auth mode select shows 2 options | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-03 | AUTO | SKIPPED | Select sharedPat | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-04 | AUTO | SKIPPED | Select oauthObo | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-05 | AUTO | SKIPPED | UC row filters toggle on | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-06 | AUTO | SKIPPED | UC column masks toggle off | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-07 | AUTO | SKIPPED | Read-only enforcement off | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-08 | AUTO | SKIPPED | Type forbidden columns CSV | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-09 | AUTO | SKIPPED | Type forbidden tables CSV | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-10 | AUTO | SKIPPED | Type mandatory row filter with {{role}} | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-11 | AUTO | SKIPPED | RLS hint toggle on/off | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-12 | AUTO | SKIPPED | All 8 fields persist after page refresh | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-13 | MANUAL | SKIPPED | All HelpTip ⓘ buttons open tooltip | Manual visual/a11y judgment required; not scored by automation. |
| BI-GOV-14 | AUTO | SKIPPED | Card status "Full enforcement" when all 3 UC toggles on | AUTO scenario not included in this visible time-boxed smoke slice. |
| BI-GOV-15 | MANUAL | SKIPPED | Forbidden columns hint mentions case-insensitive | Manual visual/a11y judgment required; not scored by automation. |
| AI-PROVIDER-01 | AUTO | SKIPPED | Open `/settings/ai/provider` | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-PROVIDER-02 | AUTO | SKIPPED | Profile picker shows allowlist'd profiles | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-PROVIDER-03 | AUTO | SKIPPED | Pick a profile | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-PROVIDER-04 | AUTO | SKIPPED | Profile validation against allowlist | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-MODEL-01 | AUTO | SKIPPED | Open `/settings/ai/model-agent` | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-MODEL-02 | LIVE | N/A | Direct mode shows Genie space ID + data domain | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-MODEL-03 | LIVE | N/A | Supervisor mode shows fan-out table | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-MODEL-04 | LIVE | N/A | Supervisor table shows allowlist status per space | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-PACK-01 | LIVE | N/A | Pack picker loads from `/api/assistant/knowledge/packs` | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-PACK-02 | AUTO | SKIPPED | Pack picker filtered by allowlist | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-PACK-03 | AUTO | SKIPPED | Pick pack | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-PACK-04 | AUTO | SKIPPED | "Browse library ↗" link works | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-01 | AUTO | SKIPPED | Open `/settings/ai/knowledge-base` | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-02 | AUTO | SKIPPED | Master switch "KB enabled" toggle on/off | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-03 | AUTO | SKIPPED | Master switch off → children disabled visually | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-04 | AUTO | SKIPPED | Chart rules toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-05 | AUTO | SKIPPED | Stats rules toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-06 | AUTO | SKIPPED | Reporting rules toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-07 | AUTO | SKIPPED | All toggles round-trip across refresh | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-08 | AUTO | SKIPPED | Card status badge updates with master switch | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-KB-09 | MANUAL | SKIPPED | All HelpTip tooltips open | Manual visual/a11y judgment required; not scored by automation. |
| AI-KB-10 | MANUAL | SKIPPED | Master tooltip mentions debugging KB interference | Manual visual/a11y judgment required; not scored by automation. |
| AI-KB-11 | MANUAL | SKIPPED | Chart tooltip mentions chartRegistry | Manual visual/a11y judgment required; not scored by automation. |
| AI-KB-12 | MANUAL | SKIPPED | Stats tooltip mentions confidence intervals | Manual visual/a11y judgment required; not scored by automation. |
| AI-KB-13 | MANUAL | SKIPPED | Reporting tooltip mentions leadership audience | Manual visual/a11y judgment required; not scored by automation. |
| AI-KB-14 | MANUAL | SKIPPED | Toggle gradient on when checked | Manual visual/a11y judgment required; not scored by automation. |
| AI-KB-15 | MANUAL | SKIPPED | Toggle thumb animates on change | Manual visual/a11y judgment required; not scored by automation. |
| AI-VSEARCH-01 | AUTO | PASS | Open `/settings/ai/vector-search-kb` | /settings/ai/vector-search-kb renders. |
| AI-VSEARCH-02 | AUTO | SKIPPED | Input catalog.schema.index_name format | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-VSEARCH-03 | LIVE | N/A | Test query button (if present) | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-VSEARCH-04 | MANUAL | SKIPPED | Empty input shows hint | Manual visual/a11y judgment required; not scored by automation. |
| AI-VSEARCH-05 | AUTO | SKIPPED | Persists to genieSettings.kbVectorSearchIndex | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-PROBE-01 | AUTO | SKIPPED | Genie profile — single probe button | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-PROBE-02 | LIVE | N/A | Click probe → success | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-PROBE-03 | LIVE | N/A | Click probe → failure | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-PROBE-04 | LIVE | N/A | Supervisor profile — per-space probes | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-PROBE-05 | LIVE | N/A | Supervisor probes stagger 2000ms | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-PROBE-06 | LIVE | N/A | Supervisor aggregate summary | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-INSIGHTS-01 | AUTO | SKIPPED | enabledFeatures select (both/insightsOnly/chatOnly) | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-02 | AUTO | SKIPPED | Authoring mode select (preset/ai-assisted/manual) | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-03 | AUTO | SKIPPED | Domain text input | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-04 | AUTO | SKIPPED | Custom prompt textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-05 | AUTO | SKIPPED | Domain guidance textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-06 | AUTO | SKIPPED | Custom sections textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-07 | AUTO | SKIPPED | HEADLINE visibility toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-08 | AUTO | SKIPPED | TRENDS visibility toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-09 | AUTO | SKIPPED | RISKS visibility toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-10 | AUTO | SKIPPED | ACTIONS visibility toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-11 | AUTO | SKIPPED | HEADLINE override textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-12 | AUTO | SKIPPED | TRENDS override textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-13 | AUTO | SKIPPED | RISKS override textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-14 | AUTO | SKIPPED | ACTIONS override textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-15 | AUTO | SKIPPED | Metric direction rules textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-16 | AUTO | SKIPPED | Metric direction map JSON textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-17 | AUTO | SKIPPED | Cache TTL select (5/15/30/60 min) | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-18 | AUTO | SKIPPED | Provenance footer toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-INSIGHTS-19 | AUTO | SKIPPED | Research traces toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-01 | AUTO | SKIPPED | Open `/settings/ai/supervisor-fusion` | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-02 | AUTO | SKIPPED | Auto-fusion toggle on/off | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-03 | AUTO | SKIPPED | Status badge "Synthesised" when on | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-04 | AUTO | SKIPPED | Status badge "Raw fan-out" when off | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-05 | AUTO | SKIPPED | Synthesis profile input | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-06 | AUTO | SKIPPED | Custom synthesis prompt textarea | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-07 | MANUAL | SKIPPED | Synthesis prompt placeholder shows default | Manual visual/a11y judgment required; not scored by automation. |
| AI-SUP-08 | AUTO | SKIPPED | Agent name input | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-09 | AUTO | SKIPPED | Endpoint input | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-10 | AUTO | SKIPPED | Override card status "Overridden" when filled | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-11 | AUTO | SKIPPED | Override card status "Defaults" when empty | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-SUP-12 | MANUAL | SKIPPED | All HelpTip tooltips open | Manual visual/a11y judgment required; not scored by automation. |
| AI-SUP-13 | AUTO | SKIPPED | All 5 fields persist across refresh | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-UC-01 | AUTO | SKIPPED | Discovery form (catalog/schema inputs) | AUTO scenario not included in this visible time-boxed smoke slice. |
| AI-UC-02 | LIVE | N/A | "Discover" button calls list-metric-views | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-UC-03 | LIVE | N/A | Metric view picker after discovery | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| AI-UC-04 | AUTO | SKIPPED | Pick a metric view | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-01 | AUTO | SKIPPED | UI mode picker (Pulse / v0) | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-02 | AUTO | SKIPPED | Layout preset T1 | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-03 | AUTO | SKIPPED | Layout preset T2 | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-04 | AUTO | SKIPPED | Layout preset T3 | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-05 | AUTO | SKIPPED | Layout preset T4 | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-06 | AUTO | SKIPPED | Layout preset T5 | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-07 | AUTO | SKIPPED | Custom layout label shown when hand-tuned | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-08 | AUTO | SKIPPED | Visible panels — aiOnly | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-09 | AUTO | SKIPPED | Visible panels — biOnly | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-10 | AUTO | SKIPPED | Visible panels — both | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-11 | AUTO | SKIPPED | Visible panels — mix | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-12 | AUTO | SKIPPED | AI position — Left | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-13 | AUTO | SKIPPED | AI position — Right | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-14 | AUTO | SKIPPED | AI position — Top | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-15 | AUTO | SKIPPED | AI position — Bottom | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-16 | AUTO | SKIPPED | Mix — AI surfaces both | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-17 | AUTO | SKIPPED | Mix — AI surfaces insightsOnly | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-18 | AUTO | SKIPPED | Mix — AI surfaces chatOnly | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-19 | AUTO | SKIPPED | Research traces toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-20 | AUTO | SKIPPED | BI composition — full canvas | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-CORE-21 | AUTO | SKIPPED | Canvas tiles select (1/2/4) | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-01 | AUTO | PASS | Open `/settings/preferences/appearance` | /settings/preferences/appearance renders. |
| PREF-APP-02 | AUTO | PASS | Theme card "Default light" selectable | Default light theme option visible. |
| PREF-APP-03 | AUTO | SKIPPED | Theme card "Corporate Blue" selectable | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-04 | AUTO | SKIPPED | Theme card "Forest (ESG)" selectable | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-05 | AUTO | PASS | Theme card "Slate Dark" selectable | Slate Dark theme option visible. |
| PREF-APP-06 | AUTO | SKIPPED | Theme card "High Contrast" selectable | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-07 | AUTO | SKIPPED | Theme card "Custom" selectable | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-08 | MANUAL | SKIPPED | Theme swatch shows gradient | Manual visual/a11y judgment required; not scored by automation. |
| PREF-APP-09 | MANUAL | SKIPPED | Active theme card has blue ring + accent fill | Manual visual/a11y judgment required; not scored by automation. |
| PREF-APP-10 | AUTO | SKIPPED | Dark mode toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-11 | AUTO | SKIPPED | Use report theme toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-12 | AUTO | SKIPPED | Brand accent color picker disabled when not Custom | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-13 | AUTO | SKIPPED | Brand text color picker disabled when not Custom | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-14 | AUTO | SKIPPED | Brand bg color picker disabled when not Custom | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-15 | AUTO | SKIPPED | Pick Custom theme → color pickers enable | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-16 | MANUAL | SKIPPED | Color swatch picker opens native dialog | Manual visual/a11y judgment required; not scored by automation. |
| PREF-APP-17 | AUTO | SKIPPED | Hex input synced with swatch | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-18 | MANUAL | SKIPPED | Hex input rejects invalid hex | Manual visual/a11y judgment required; not scored by automation. |
| PREF-APP-19 | AUTO | SKIPPED | All 6 themes round-trip across refresh | AUTO scenario not included in this visible time-boxed smoke slice. |
| PREF-APP-20 | AUTO | SKIPPED | Card status "Active"/"Inactive" reflects Custom selection | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-01 | AUTO | SKIPPED | Open `/settings/system/proxy-status` | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-02 | AUTO | SKIPPED | Status dot green when proxy up | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-03 | LIVE | N/A | Status dot red when proxy 5xx | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SYS-PROXY-04 | AUTO | SKIPPED | Latency badge under 100ms | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-05 | AUTO | SKIPPED | Re-run button triggers fresh probe | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-06 | AUTO | SKIPPED | Profile count shown | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-07 | AUTO | SKIPPED | Config source shown | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-08 | AUTO | SKIPPED | Auth mode shown | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-09 | AUTO | SKIPPED | Bound port shown | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-10 | LIVE | N/A | App name shown if Databricks App | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| SYS-PROXY-11 | AUTO | SKIPPED | Last-checked timestamp updates | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-PROXY-12 | AUTO | SKIPPED | Auto-poll every 10s | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-01 | AUTO | SKIPPED | Network and auth leaf | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-02 | AUTO | SKIPPED | Security posture leaf | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-03 | AUTO | SKIPPED | License posture leaf — PBI Premium NOT Fabric | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-04 | AUTO | SKIPPED | Profile inventory leaf | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-05 | AUTO | SKIPPED | Diagnostics events table | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-06 | AUTO | SKIPPED | Diagnostics last errors list | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-07 | AUTO | SKIPPED | Setup wizard button → re-runs wizard | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-08 | AUTO | SKIPPED | Export support bundle downloads JSON | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-09 | AUTO | SKIPPED | Bundle redacts tokens | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-OTHER-10 | AUTO | SKIPPED | Bundle includes localStorage keys | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-01 | AUTO | SKIPPED | Open `/settings/system/developer-tools` | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-02 | AUTO | SKIPPED | Dev mode toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-03 | AUTO | SKIPPED | Show SQL toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-04 | AUTO | SKIPPED | Show Trace toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-05 | AUTO | SKIPPED | Compatibility warnings toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-06 | AUTO | SKIPPED | Guided filters toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-07 | AUTO | SKIPPED | Allow report actions toggle | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-08 | AUTO | SKIPPED | Validation retry select 0 | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-09 | AUTO | SKIPPED | Validation retry select 1 | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-10 | AUTO | SKIPPED | Validation retry select 2 | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-11 | AUTO | SKIPPED | Validation retry select 3 | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-12 | AUTO | SKIPPED | Card status reflects dev posture | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-13 | AUTO | SKIPPED | All 7 fields round-trip across refresh | AUTO scenario not included in this visible time-boxed smoke slice. |
| SYS-DEV-14 | MANUAL | SKIPPED | All HelpTip tooltips open | Manual visual/a11y judgment required; not scored by automation. |
| SYS-DEV-15 | MANUAL | SKIPPED | Dev mode tooltip mentions verbose logging | Manual visual/a11y judgment required; not scored by automation. |
| ADV-01 | AUTO | SKIPPED | Open `/settings/advanced/local-storage-inspector` | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-02 | AUTO | SKIPPED | All pulseplay:* keys grouped (wizard/BI/AI/layout/nav/other) | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-03 | AUTO | SKIPPED | Reset section dropdown lists bi/ai/preferences | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-04 | AUTO | SKIPPED | Pick "bi" → shows keys to clear | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-05 | AUTO | SKIPPED | Type-to-confirm gate active | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-06 | AUTO | SKIPPED | Type matching string → button enables | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-07 | AUTO | SKIPPED | Click clear → keys removed | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-08 | AUTO | SKIPPED | Reset all requires typing "Reset all" | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-09 | AUTO | SKIPPED | Reset all clears all pulseplay:* keys | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-10 | LIVE | N/A | Sign out Power BI clears MSAL sessionStorage | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ADV-11 | AUTO | SKIPPED | Danger zone "Clear Pulse settings" type-to-confirm | AUTO scenario not included in this visible time-boxed smoke slice. |
| ADV-12 | AUTO | SKIPPED | Pulse settings cleared (pulseplay:visual-settings:*) | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-01 | AUTO | SKIPPED | Open Ask Pulse | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-02 | AUTO | SKIPPED | Type question + press Enter | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-03 | AUTO | SKIPPED | Click send button | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-04 | LIVE | N/A | Progress indicator appears | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-FLOW-05 | LIVE | N/A | Stage 5 of 5 visible | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-FLOW-06 | LIVE | N/A | Elapsed timer ticks | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-FLOW-07 | LIVE | N/A | Response card appears with content | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-FLOW-08 | LIVE | N/A | View tabs appear if SQL result attached | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-FLOW-09 | LIVE | N/A | Pure narrative response (no SQL) shows no tabs | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-FLOW-10 | AUTO | SKIPPED | Helpful? buttons appear after completion | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-11 | AUTO | SKIPPED | Copy answer button | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-12 | AUTO | SKIPPED | Send disabled while busy | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-13 | AUTO | SKIPPED | Send re-enables after response | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-14 | AUTO | SKIPPED | Empty compose disables send | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-15 | AUTO | SKIPPED | Multi-line input via Shift+Enter | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-16 | AUTO | SKIPPED | Compose expands vertically | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-17 | AUTO | SKIPPED | Compose caps at max-height | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-FLOW-18 | MANUAL | SKIPPED | Send button has gradient | Manual visual/a11y judgment required; not scored by automation. |
| CHAT-FLOW-19 | MANUAL | SKIPPED | Send button scale on hover | Manual visual/a11y judgment required; not scored by automation. |
| CHAT-VIEWS-01 | LIVE | N/A | Click "Chart" tab | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-VIEWS-02 | LIVE | N/A | Click "Table" tab | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-VIEWS-03 | LIVE | N/A | Click "SQL" tab (when showSql on) | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-VIEWS-04 | LIVE | N/A | Click "Trace" tab (when showTrace on) | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-VIEWS-05 | LIVE | N/A | Narrative tab always visible | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-VIEWS-06 | MANUAL | SKIPPED | View tab buttons styled as pills | Manual visual/a11y judgment required; not scored by automation. |
| CHAT-VIEWS-07 | MANUAL | SKIPPED | Active tab has accent fill | Manual visual/a11y judgment required; not scored by automation. |
| CHAT-CHARTS-01 | AUTO | SKIPPED | Chart picker shows grouped optgroups | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-CHARTS-02 | AUTO | SKIPPED | Recommended type has ★ | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-CHARTS-03 | LIVE | N/A | KPI Tile renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-04 | LIVE | N/A | Column chart renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-05 | LIVE | N/A | Bar chart renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-06 | LIVE | N/A | Clustered Bar renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-07 | LIVE | N/A | Line renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-08 | LIVE | N/A | Area renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-09 | LIVE | N/A | Pie renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-10 | LIVE | N/A | Donut renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-11 | LIVE | N/A | Scatter renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-12 | LIVE | N/A | Bubble renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-13 | LIVE | N/A | Heat Map renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-14 | LIVE | N/A | Tree Map renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-15 | LIVE | N/A | Funnel renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-16 | LIVE | N/A | Waterfall renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-17 | LIVE | N/A | Pareto renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-18 | LIVE | N/A | Lollipop renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-19 | LIVE | N/A | Sparkline renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-20 | LIVE | N/A | Sankey Flow renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-21 | LIVE | N/A | Radar / Spider renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-22 | LIVE | N/A | Gauge renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-23 | LIVE | N/A | Sunburst renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-CHARTS-24 | AUTO | SKIPPED | Chart container height capped at 420px | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-CHARTS-25 | LIVE | N/A | "Not enough data" message for incompatible chart | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-SUGGEST-01 | LIVE | N/A | "✦ Try asking" section appears after first message | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-SUGGEST-02 | LIVE | N/A | Suggestion pills clickable | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-SUGGEST-03 | MANUAL | SKIPPED | Featured pill (insights-derived) has gradient | Manual visual/a11y judgment required; not scored by automation. |
| CHAT-SUGGEST-04 | LIVE | N/A | Featured pill has ✨ marker | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-SUGGEST-05 | MANUAL | SKIPPED | Pill lift on hover | Manual visual/a11y judgment required; not scored by automation. |
| CHAT-SUGGEST-06 | AUTO | SKIPPED | Max 6 pills displayed | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-SUGGEST-07 | LIVE | N/A | Featured pills come first | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-ERR-01 | LIVE | N/A | Proxy offline → "Proxy Offline" banner | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-ERR-02 | AUTO | SKIPPED | Banner text says "PulsePlay Proxy" (not UniBridge) | AUTO scenario not included in this visible time-boxed smoke slice. |
| CHAT-ERR-03 | LIVE | N/A | Genie timeout → error message | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-ERR-04 | LIVE | N/A | Foundation Model stream error → message | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-ERR-05 | LIVE | N/A | Empty response → graceful fallback | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| CHAT-ERR-06 | LIVE | N/A | Retry button on transient failures | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-01 | LIVE | N/A | Trigger Insights from app | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-02 | LIVE | N/A | HEADLINE section renders first | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-03 | LIVE | N/A | TRENDS section renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-04 | LIVE | N/A | RISKS section renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-05 | LIVE | N/A | RECOMMENDED ACTIONS section renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-06 | LIVE | N/A | Status pills colored correctly | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-07 | LIVE | N/A | Lower-is-better metrics use amber for increases | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-08 | MANUAL | SKIPPED | Card border color derived from pill tone | Manual visual/a11y judgment required; not scored by automation. |
| INS-RENDER-09 | LIVE | N/A | "What changed" cards visible | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-RENDER-10 | LIVE | N/A | "What needs attention" cards visible | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STREAM-01 | LIVE | N/A | Foundation Model profile streams sections | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STREAM-02 | LIVE | N/A | Genie profile batches | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STREAM-03 | LIVE | N/A | Stream error mid-flight handled | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STREAM-04 | LIVE | N/A | Client disconnect tears down upstream | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-CACHE-01 | LIVE | N/A | Cache hit on second identical run | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-CACHE-02 | LIVE | N/A | Cache TTL respected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-CACHE-03 | LIVE | N/A | Cache key includes settings fingerprint | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STAGES-01 | LIVE | N/A | Hide HEADLINE → not rendered | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STAGES-02 | LIVE | N/A | Hide TRENDS → not rendered | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STAGES-03 | LIVE | N/A | Hide RISKS → not rendered | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STAGES-04 | LIVE | N/A | Hide ACTIONS → not rendered | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| INS-STAGES-05 | LIVE | N/A | Stage override populates that section | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX-01 | LIVE | N/A | Configure Genie BI + Foundation AI | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX-02 | LIVE | N/A | Ask question → Foundation stream renders | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX-03 | LIVE | N/A | Insights runs end-to-end | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX-04 | LIVE | N/A | Switch Genie space → reconfig | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX-05 | AUTO | SKIPPED | Both panels visible in mix mode | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-DBX-06 | AUTO | SKIPPED | Floating panel works | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-DBX-07 | AUTO | SKIPPED | Maximize AI pane | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-DBX-08 | AUTO | SKIPPED | Maximize BI pane | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-DBX-09 | LIVE | N/A | Question references BI context | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX-10 | LIVE | N/A | Discovery loop pre-fetch fires | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX2-01 | LIVE | N/A | Configure AI/BI dashboard + Genie profile | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX2-02 | LIVE | N/A | AI/BI basic mode loads | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX2-03 | LIVE | N/A | AI/BI SDK mode loads | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX2-04 | LIVE | N/A | Genie question completes | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX2-05 | LIVE | N/A | Insights references dashboard data | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX2-06 | LIVE | N/A | RLS via external viewer ID | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-DBX2-07 | AUTO | SKIPPED | Switch BI vendor mid-session | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-CROSS-01 | LIVE | N/A | PBI secure-embed + Genie profile | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-02 | LIVE | N/A | PBI iframe loads via autoAuth | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-03 | LIVE | N/A | Genie answers with PBI report context | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-04 | LIVE | N/A | Switch to PBI SSO mode | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-05 | LIVE | N/A | Switch to PBI Backend mode | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-06 | AUTO | SKIPPED | Both panels visible | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-CROSS-07 | LIVE | N/A | Foundation Model AI also works with PBI | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-08 | LIVE | N/A | Supervisor AI also works with PBI | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-09 | LIVE | N/A | Power BI Premium NOT Fabric | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-CROSS-10 | LIVE | N/A | License posture shows Premium | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-AIONLY-01 | AUTO | SKIPPED | No BI, AI profile picked | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-AIONLY-02 | LIVE | N/A | Ask Pulse works without BI context | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-AIONLY-03 | LIVE | N/A | Insights pipeline runs without BI | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-AIONLY-04 | AUTO | SKIPPED | BI panel hidden | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-AIONLY-05 | AUTO | SKIPPED | Empty-state shown when both hidden | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-BIONLY-01 | AUTO | SKIPPED | PBI embed only, no AI profile | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-BIONLY-02 | LIVE | N/A | PBI iframe loads | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-BIONLY-03 | AUTO | SKIPPED | AI panel hidden | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-BIONLY-04 | AUTO | SKIPPED | Setup readiness shows AI missing | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-BIONLY-05 | AUTO | SKIPPED | Switch to mix mode → AI panel shows empty state | AUTO scenario not included in this visible time-boxed smoke slice. |
| MTX-STUBS-01 | LIVE | N/A | Tableau + Genie | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-STUBS-02 | LIVE | N/A | Qlik + Genie | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-STUBS-03 | LIVE | N/A | Looker + Genie | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| MTX-STUBS-04 | LIVE | N/A | Generic iframe + any AI | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| FLOAT-01 | AUTO | PASS | Click float button on AI pane | Popout control opens in-app floating AI panel. |
| FLOAT-02 | MANUAL | SKIPPED | Drag floating panel | Manual visual/a11y judgment required; not scored by automation. |
| FLOAT-03 | MANUAL | SKIPPED | Drag past viewport edge → clamped | Manual visual/a11y judgment required; not scored by automation. |
| FLOAT-04 | AUTO | PASS | Dock button returns to layout | Dock control returns floating panel to layout. |
| FLOAT-05 | AUTO | PASS | BI canvas visible behind floated AI | Main canvas remains visible/available while AI panel floats. |
| FLOAT-06 | MANUAL | SKIPPED | Floating panel has shadow | Manual visual/a11y judgment required; not scored by automation. |
| FLOAT-07 | AUTO | SKIPPED | Closing floating panel restores both panels | AUTO scenario not included in this visible time-boxed smoke slice. |
| FLOAT-08 | AUTO | PASS | Surface tabs suppressed in float mode | Floating mode did not create a duplicate surface tablist. |
| PERSIST-01 | AUTO | SKIPPED | Change setting → refresh → still set | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERSIST-02 | AUTO | SKIPPED | New tab same origin → same settings | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERSIST-03 | AUTO | SKIPPED | Storage event from another tab → re-renders | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERSIST-04 | AUTO | SKIPPED | Corrupt localStorage value → fallback default | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERSIST-05 | AUTO | SKIPPED | Missing key → default | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERSIST-06 | AUTO | SKIPPED | Type mismatch (string in bool field) → coerced or defaulted | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERSIST-07 | MANUAL | SKIPPED | localStorage quota exceeded → silent fail | Manual visual/a11y judgment required; not scored by automation. |
| PERSIST-08 | LIVE | N/A | Orphan detection on allowlist update | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| PERSIST-09 | AUTO | SKIPPED | Clear all pulseplay:* keys → reverts to defaults | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERSIST-10 | AUTO | SKIPPED | Settings export → JSON valid | AUTO scenario not included in this visible time-boxed smoke slice. |
| GOV-01 | LIVE | N/A | Pick BI vendor outside allowlist → rejected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-02 | LIVE | N/A | Pick AI profile outside allowlist → rejected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-03 | LIVE | N/A | Pick pack outside allowlist → rejected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-04 | LIVE | N/A | Embed origin outside allowlist → rejected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-05 | LIVE | N/A | Workspace ID outside allowlist (PBI) → rejected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-06 | LIVE | N/A | Report ID outside allowlist (PBI) → rejected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-07 | LIVE | N/A | Genie space outside allowlist → rejected | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-08 | AUTO | SKIPPED | Strict enforcement label visible | AUTO scenario not included in this visible time-boxed smoke slice. |
| GOV-09 | LIVE | N/A | Allowlist /api/assistant/allowlist GET | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-10 | LIVE | N/A | Allowlist 500 → fallback (no allowlist) | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| GOV-11 | AUTO | SKIPPED | Embed token issuance proxy-side only | AUTO scenario not included in this visible time-boxed smoke slice. |
| ERR-01 | LIVE | N/A | Proxy down on settings load | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-02 | LIVE | N/A | /api/health returns 500 | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-03 | LIVE | N/A | /api/health returns malformed JSON | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-04 | LIVE | N/A | /api/assistant/profiles 500 | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-05 | LIVE | N/A | /api/assistant/profiles timeout | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-06 | LIVE | N/A | /api/assistant/allowlist 500 | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-07 | AUTO | SKIPPED | Invalid embed URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| ERR-08 | LIVE | N/A | AAD popup blocked | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-09 | LIVE | N/A | AAD consent denied | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-10 | LIVE | N/A | Backend token 401 → re-issue | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-11 | LIVE | N/A | Backend token 403 → permissions error | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-12 | LIVE | N/A | Genie space 404 → "Space not found" | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-13 | LIVE | N/A | Genie space 403 → "Access denied" | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-14 | LIVE | N/A | Foundation stream interrupted → resume option | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-15 | LIVE | N/A | Supervisor partial failure (3 of 5 spaces) | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-16 | AUTO | SKIPPED | Browser offline → app shell still renders | AUTO scenario not included in this visible time-boxed smoke slice. |
| ERR-17 | MANUAL | SKIPPED | localStorage disabled → fallback in-memory | Manual visual/a11y judgment required; not scored by automation. |
| ERR-18 | AUTO | SKIPPED | TypeError in render → ErrorBoundary catches | AUTO scenario not included in this visible time-boxed smoke slice. |
| ERR-19 | LIVE | N/A | Long-running query → cancel button | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| ERR-20 | LIVE | N/A | Cancel mid-flight → upstream torn down | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| HELP-01 | AUTO | SKIPPED | Every FieldRow has ⓘ button | AUTO scenario not included in this visible time-boxed smoke slice. |
| HELP-02 | MANUAL | SKIPPED | Hover ⓘ → tooltip appears | Manual visual/a11y judgment required; not scored by automation. |
| HELP-03 | AUTO | SKIPPED | Focus ⓘ via Tab → tooltip appears | AUTO scenario not included in this visible time-boxed smoke slice. |
| HELP-04 | MANUAL | SKIPPED | Click ⓘ → toggle tooltip | Manual visual/a11y judgment required; not scored by automation. |
| HELP-05 | MANUAL | SKIPPED | Tooltip wraps long text | Manual visual/a11y judgment required; not scored by automation. |
| HELP-06 | MANUAL | SKIPPED | Tooltip has arrow pointer | Manual visual/a11y judgment required; not scored by automation. |
| HELP-07 | MANUAL | SKIPPED | Tooltip max width 280px | Manual visual/a11y judgment required; not scored by automation. |
| HELP-08 | MANUAL | SKIPPED | Tooltip animates in (140ms fade) | Manual visual/a11y judgment required; not scored by automation. |
| HELP-09 | MANUAL | SKIPPED | Code snippets in tooltip styled | Manual visual/a11y judgment required; not scored by automation. |
| HELP-10 | MANUAL | SKIPPED | Links in tooltip clickable | Manual visual/a11y judgment required; not scored by automation. |
| HELP-11 | MANUAL | SKIPPED | Warn variant ⓘ has orange color | Manual visual/a11y judgment required; not scored by automation. |
| HELP-12 | MANUAL | SKIPPED | Tip variant ⓘ has sparkle ✨ | Manual visual/a11y judgment required; not scored by automation. |
| HELP-13 | AUTO | SKIPPED | aria-describedby links bubble to trigger | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-01 | AUTO | SKIPPED | Tab through Quick Setup form | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-02 | AUTO | SKIPPED | Tab through Settings rail | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-03 | AUTO | SKIPPED | Enter activates focused button | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-04 | AUTO | SKIPPED | Esc closes settings page | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-05 | AUTO | SKIPPED | Arrow keys in select dropdowns | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-06 | MANUAL | SKIPPED | Focus indicators visible | Manual visual/a11y judgment required; not scored by automation. |
| A11Y-07 | AUTO | SKIPPED | All form controls have <label> | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-08 | AUTO | SKIPPED | Status badges have aria-label | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-09 | AUTO | SKIPPED | role="tablist" on view tab strip | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-10 | AUTO | SKIPPED | role="tab" on each view button | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-11 | AUTO | SKIPPED | aria-selected on active tab | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-12 | AUTO | SKIPPED | aria-current="page" on active rail item | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-13 | AUTO | SKIPPED | aria-live="polite" on settings main pane | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-14 | AUTO | SKIPPED | aria-label on Test buttons describes action | AUTO scenario not included in this visible time-boxed smoke slice. |
| A11Y-15 | MANUAL | SKIPPED | Color contrast WCAG AA on text vs bg | Manual visual/a11y judgment required; not scored by automation. |
| RESP-01 | MANUAL | SKIPPED | 1920×1080 | Manual visual/a11y judgment required; not scored by automation. |
| RESP-02 | MANUAL | SKIPPED | 1440×900 | Manual visual/a11y judgment required; not scored by automation. |
| RESP-03 | MANUAL | SKIPPED | 1280×800 | Manual visual/a11y judgment required; not scored by automation. |
| RESP-04 | MANUAL | SKIPPED | 1024×768 | Manual visual/a11y judgment required; not scored by automation. |
| RESP-05 | MANUAL | SKIPPED | 900×600 | Manual visual/a11y judgment required; not scored by automation. |
| RESP-06 | MANUAL | SKIPPED | 768×1024 (portrait) | Manual visual/a11y judgment required; not scored by automation. |
| RESP-07 | MANUAL | SKIPPED | 640×960 | Manual visual/a11y judgment required; not scored by automation. |
| RESP-08 | AUTO | SKIPPED | Chart container caps at 420px height | AUTO scenario not included in this visible time-boxed smoke slice. |
| RESP-09 | AUTO | SKIPPED | FieldCard 2-col grid collapses to 1-col at 720px | AUTO scenario not included in this visible time-boxed smoke slice. |
| RESP-10 | MANUAL | SKIPPED | Status strip wraps on narrow viewport | Manual visual/a11y judgment required; not scored by automation. |
| SAVEBAR-01 | AUTO | SKIPPED | Change toggle on KB sub-route → bar appears | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-02 | AUTO | SKIPPED | Change theme on Appearance → bar appears | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-03 | AUTO | SKIPPED | Change text input on Governance → bar appears | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-04 | MANUAL | SKIPPED | Save bar shows pulsing dot | Manual visual/a11y judgment required; not scored by automation. |
| SAVEBAR-05 | AUTO | SKIPPED | Save bar text "Unsaved changes" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-06 | AUTO | SKIPPED | Click Save → text becomes "Settings saved" | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-07 | MANUAL | SKIPPED | Saved confirmation green | Manual visual/a11y judgment required; not scored by automation. |
| SAVEBAR-08 | AUTO | SKIPPED | Auto-dismisses after 3 s | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-09 | AUTO | SKIPPED | Click Discard → all changes reverted | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-10 | AUTO | SKIPPED | Discard restores snapshot keys | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-11 | AUTO | SKIPPED | Discard fires display-change event | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-12 | AUTO | SKIPPED | Multiple changes batched in one save | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-13 | AUTO | SKIPPED | Navigate away with unsaved changes → bar stays | AUTO scenario not included in this visible time-boxed smoke slice. |
| SAVEBAR-14 | AUTO | SKIPPED | Refresh page with unsaved changes → bar resets | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-01 | AUTO | SKIPPED | `/settings/ai/knowledge-base` direct URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-02 | AUTO | SKIPPED | `/settings/ai/supervisor-fusion` direct URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-03 | AUTO | SKIPPED | `/settings/preferences/appearance` direct URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-04 | AUTO | SKIPPED | `/settings/system/developer-tools` direct URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-05 | AUTO | SKIPPED | `/settings/bi/governance` direct URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-06 | AUTO | SKIPPED | Refresh on sub-route URL → SPA fallback works | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-07 | AUTO | SKIPPED | Unknown sub-route falls through to group page | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-08 | AUTO | SKIPPED | Sub-route highlighted in rail when active | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-09 | AUTO | SKIPPED | Browser back from sub-route → previous URL | AUTO scenario not included in this visible time-boxed smoke slice. |
| SUBNAV-10 | AUTO | SKIPPED | Click rail group while on sub-route → returns to group root | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-01 | AUTO | PASS | Open `/` | Root app shell renders PulsePlay. |
| APP-02 | AUTO | SKIPPED | Vendor picker visible in sidebar | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-03 | AUTO | SKIPPED | Embed config form visible | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-04 | AUTO | SKIPPED | AI sidebar (v0 fallback) at bottom of left rail | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-05 | MANUAL | SKIPPED | Brand title "PulsePlay" with gradient text | Manual visual/a11y judgment required; not scored by automation. |
| APP-06 | AUTO | SKIPPED | Switch UI mode → Pulse vs v0 | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-07 | AUTO | SKIPPED | Maximize AI pane | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-08 | AUTO | SKIPPED | Maximize BI pane | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-09 | AUTO | SKIPPED | Restore both panes | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-10 | AUTO | SKIPPED | "Open in separate page" → new window | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-11 | AUTO | SKIPPED | Pin AI pane | AUTO scenario not included in this visible time-boxed smoke slice. |
| APP-12 | AUTO | PASS | Setup readiness pill in top-right | Setup readiness pill visible in top-right. |
| APP-13 | AUTO | PASS | Click readiness pill → opens Settings → Setup | Readiness pill opens Settings > Setup. |
| APP-14 | AUTO | PASS | Surface tabs (AI Insights / Ask Pulse / BI Viz) when mix mode | Surface switcher shows AI Insights, Ask Pulse, BI Viz after shell stabilizes. |
| APP-15 | MANUAL | SKIPPED | Active tab pill has blue gradient | Manual visual/a11y judgment required; not scored by automation. |
| KBROOT-01 | AUTO | SKIPPED | Navigate to `/knowledge/<pack>` | AUTO scenario not included in this visible time-boxed smoke slice. |
| KBROOT-02 | AUTO | SKIPPED | Browse pack sections | AUTO scenario not included in this visible time-boxed smoke slice. |
| KBROOT-03 | AUTO | SKIPPED | Open a pack file | AUTO scenario not included in this visible time-boxed smoke slice. |
| KBROOT-04 | AUTO | SKIPPED | Back to settings preserves pack selection | AUTO scenario not included in this visible time-boxed smoke slice. |
| WB-01 | LIVE | N/A | Workbench tab in Ask Pulse | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| WB-02 | LIVE | N/A | Native Embed mode | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| WB-03 | LIVE | N/A | Verified mode | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| WB-04 | LIVE | N/A | Hybrid mode | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| WB-05 | AUTO | SKIPPED | Mode picker switches without reload | AUTO scenario not included in this visible time-boxed smoke slice. |
| WB-06 | LIVE | N/A | Composer input in workbench | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| PERF-01 | AUTO | SKIPPED | Cold dev-server load | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERF-02 | AUTO | SKIPPED | Settings page load | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERF-03 | LIVE | N/A | Foundation Model first content | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| PERF-04 | LIVE | N/A | Genie SQL execution (warm warehouse) | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| PERF-05 | LIVE | N/A | Genie SQL execution (cold warehouse) | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| PERF-06 | AUTO | SKIPPED | Bundle size under cap | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERF-07 | AUTO | SKIPPED | No console errors on idle | AUTO scenario not included in this visible time-boxed smoke slice. |
| PERF-08 | MANUAL | SKIPPED | No memory leak after 100 nav cycles | Manual visual/a11y judgment required; not scored by automation. |
| SEC-01 | AUTO | SKIPPED | No PAT in browser bundle | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-02 | AUTO | SKIPPED | No proxy key in browser | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-03 | AUTO | SKIPPED | iframe sandbox attributes narrow | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-04 | AUTO | SKIPPED | CSP frame-ancestors restrictive | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-05 | AUTO | SKIPPED | X-Frame-Options on proxy responses | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-06 | AUTO | SKIPPED | XSS in metric direction rules → escaped | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-07 | AUTO | SKIPPED | XSS in custom prompt → escaped | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-08 | AUTO | SKIPPED | XSS in embed URL → not executed | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-09 | AUTO | SKIPPED | Support bundle export redacts tokens | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-10 | AUTO | SKIPPED | localStorage cleared on Reset all | AUTO scenario not included in this visible time-boxed smoke slice. |
| SEC-11 | LIVE | N/A | SessionStorage cleared on Sign Out PBI | Requires authenticated live Databricks/AAD/vendor environment; not run in Codex solo smoke. |
| DOC-01 | AUTO | SKIPPED | README mentions PulsePlay branding | AUTO scenario not included in this visible time-boxed smoke slice. |
| DOC-02 | AUTO | SKIPPED | CLAUDE.md tripwires up to date | AUTO scenario not included in this visible time-boxed smoke slice. |
| DOC-03 | AUTO | SKIPPED | ARCHITECTURE.md reflects current state | AUTO scenario not included in this visible time-boxed smoke slice. |
| DOC-04 | AUTO | SKIPPED | HANDOVER.md has latest entry | AUTO scenario not included in this visible time-boxed smoke slice. |
| DOC-05 | AUTO | SKIPPED | WORKING_WITH_CLAUDE.md present | AUTO scenario not included in this visible time-boxed smoke slice. |
| DOC-06 | AUTO | SKIPPED | SMOKE_TEST_PLAN.md (this file) present | AUTO scenario not included in this visible time-boxed smoke slice. |
| DOC-07 | AUTO | SKIPPED | docs/ROADMAP.md up to date | AUTO scenario not included in this visible time-boxed smoke slice. |
| DOC-08 | AUTO | SKIPPED | docs/AGENDA.md tracks open work | AUTO scenario not included in this visible time-boxed smoke slice. |
