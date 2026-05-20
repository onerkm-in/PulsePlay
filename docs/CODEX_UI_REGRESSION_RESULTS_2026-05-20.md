# Codex UI Regression Results - 2026-05-20

## Scope

Visible in-app browser regression after reading the current PulsePlay docs and memory. The pass focused on the latest cycle 11-15.5 state: cross-backend discovery context, performance levers, Power BI deterministic semantic-model connector, and the new Power BI Q&A route.

## Environment

- App: `http://127.0.0.1:5173`
- Proxy: `http://127.0.0.1:8787`
- Proxy health after restart: `ok:true`, profiles `default`, `supervisor`, `foundation`, auth mode `none`, config source `config.json`
- Evidence: `docs/evidence/ui-regression-2026-05-20-codex/`
- Note: the proxy already running at the start of the pass was stale and returned `Cannot POST /powerbi/qna/embed-token`; restarting the local proxy picked up the current route.

## Documents Read

- `scripts/llm_onboard.py --terse`
- `docs/HANDOVER.md`
- `docs/AGENDA.md`
- `docs/ARCHITECTURE.md`
- `docs/memory/project_state.md`
- `docs/PROXY_REFERENCE.md`
- `docs/QUALITY.md`
- `docs/ROADMAP.md`
- `docs/AGENT_SYNC.md`
- Recent UAT/smoke docs: `CODEX_FINAL_UAT_RESULTS_2026-05-19-0914.md`, `CODEX_FINAL_UAT_REGRESSION_HANDOFF_2026-05-19.md`, `SMOKE_TEST_RESULTS_2026-05-19.md`, `TOUGH_TEST_RESULTS_2026-05-19-1253.md`

## Summary

| Area | Result | Notes |
|---|---:|---|
| Root shell | PASS | App loads. Surface switcher shows `AI Insights`, `Ask Pulse`, `Dashboard`. Old `BI BI Viz` duplication is gone. |
| Surface terminology | REVIEW | Current UI uses `Dashboard`, while several older regression docs still expect `BI Viz`. Preferences copy also says Dashboard, so this looks intentional but docs/acceptance criteria need alignment. |
| Settings Setup | FAIL-P1 | AI profile select is disabled with `No profiles available`, despite `/api/assistant/profiles` returning 3 profiles. `/api/assistant/allowlist` returns `configured:false` with `aiProfiles:[]`, and Setup filters everything out. |
| Setup AI status pill | PASS/PARTIAL | The older green `Configured` cascade did not reproduce. It now says `Not picked`, which is honest. |
| Setup docs link | FAIL-P2 | `Databricks docs` is still hardcoded on Setup -> AI regardless of connector context. |
| Settings AI | PASS | Four tiers render: Assistant, Shared context, Response behavior, Surface-specific behavior. Provider cards show Default, Supervisor, Foundation. No visible `AI brain` copy. |
| Settings Advanced | PASS | Performance levers render with cadence, discovery prewarm, cache TTL, retry budget, and defaults state. |
| Settings BI/Preferences/System | PASS | Routes render. System reports proxy reachable and 3 profiles. |
| Knowledge | PASS | `/knowledge` loads installed CPG/FMCG pack content. |
| Workbench | PASS | `/workbench` preview gate loads. Route health only. |
| Power BI Q&A | PASS/PARTIAL | Route renders. After proxy restart, the fetch no longer 404s and surfaces `No Power BI semantic-model profile configured.` Live Q&A cannot be embedded until such a profile exists. |
| Ask Pulse | PARTIAL | Initially blocked because no AI profile was selected. After selecting Default in Settings -> AI, suggested prompts enable and submit through the UI. The run fails on environment TLS: proxy logs `unable to verify the first certificate`. |
| HelpTips | PARTIAL | Mutual exclusion works, and open tooltip contains no interactive controls. Content is still dense paragraph prose. Browser console also records a React setState-in-render error from `HelpTip`. |
| Mobile/narrow | PASS | At 390x844, root and Settings Setup have no horizontal overflow. |

## Findings

1. **Setup profile hydration remains broken.** `/api/assistant/profiles` returns `default`, `supervisor`, and `foundation`, but Setup's AI profile select remains disabled because the allowlist payload has `configured:false` and `aiProfiles:[]`. This is the biggest visible author-flow blocker.
2. **Setup's connector docs link is still Databricks-specific.** The hardcoded `Databricks docs` link remains visible on Setup -> AI.
3. **Power BI Q&A route is code-current after proxy restart.** The initial 404 was a stale local proxy process, not the current code. Current behavior is a friendly config error because no `powerbi-semantic-model` profile is configured.
4. **Live Ask Pulse is blocked by local CA trust, not UI wiring.** The UI enables and submits after selecting Default; the proxy fails with `unable to verify the first certificate`. Restart with `NODE_EXTRA_CA_CERTS` or Node `--use-system-ca` before judging live Databricks answer quality.
5. **HelpTip still emits a React console error.** Browser console shows: `Cannot update a component while rendering a different component ... HelpTip`. Mechanics worked in the visible test, but the console regression remains.
6. **Docs and UI naming are out of sync around BI Viz/Dashboard.** Current UI consistently says `Dashboard`; older UAT docs still expect `BI Viz`.

## Evidence Files

- `01-root-ai-insights-ready.png`
- `02-root-ask-pulse.png`
- `03-root-dashboard.png`
- `04-settings-setup.png`
- `05-settings-ai.png`
- `06-settings-advanced.png`
- `07-settings-bi.png`
- `08-settings-preferences.png`
- `09-settings-system.png`
- `10-knowledge.png`
- `11-workbench.png`
- `12-powerbi-qna-after-proxy-restart.png`
- `13-setup-helptip-open.png`
- `14-mobile-root-ready.png`
- `15-mobile-settings-setup.png`
- `16-ask-pulse-blocked.png`
- `17-settings-ai-default-selected.png`
- `18-ask-pulse-after-profile.png`

## Not Run

- Full proxy/playground unit suites were not rerun in this UI-only pass.
- Live Power BI Q&A embed was not run because no Power BI semantic-model profile is configured.
- Live Databricks answer correctness was not evaluated because local Node CA trust blocks the upstream TLS connection.
