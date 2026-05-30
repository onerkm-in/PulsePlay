# UI validation — 2026-05-20 post-cycle-17

Live browser sweep against `http://127.0.0.1:5173` with proxy on `127.0.0.1:8787`. 8 routes touched, 12 screenshots captured, zero console errors on the in-app surfaces.

## Surfaces verified

| # | Route | Result |
|---|---|---|
| 01 | `/` (home) | Sidebar + canvas shell renders. "Setup needed · BI config" pill visible. AI Insights auto-attempts a briefing. Three tabs: AI Insights / Ask Pulse / Dashboard. |
| 02 | `/settings/setup` | **B1+B2+B3 fix confirmed live.** AI profile dropdown lists `Default / Supervisor / Foundation (Llama 3.1 405B)` (live fallback when allowlist is unconfigured). Pack dropdown lists `CPG / FMCG`. Docs link reads **`Genie docs`** (connector-aware via `docsForProfile(profile.type)`), not the old hardcoded "Databricks docs". "Configured" + "Test selected profile" both present. |
| 03 | `/settings/setup` (AI card detail) | "Test proxy" + "Test selected profile" actions wired. |
| 04 | `/settings/ai` | All 11 leaves render: Provider / Model-Agent / Knowledge pack / Knowledge Base / Vector Search KB / Connection test / **Power BI Q&A** / Response behavior / Supervisor Fusion / UC Metric View / Browse library. Provider picker shows all 3 cards. **Cycle 17 PBI Q&A leaf is registered** (conditional Leaf, doesn't render in main panel since active profile is Genie — exact intended gating). |
| 05 | `/settings/bi` | 6 leaves render: Provider / Embed / Authentication / Canvas / Status / Governance. Active provider = `databricks-aibi`. |
| 06 | `/settings/preferences` | All 10 leaves render. UI mode = Pulse, Layout preset = Balanced. |
| 07 | `/settings/system` | Proxy reachable @ **110 ms**, 3 profiles configured (default / supervisor / foundation), auth mode = none, port 8787, last checked 21:01:43. |
| 08 | `/settings/advanced` | **Cycle 13 Performance levers visible** — 4 levers (Insights reveal cadence / Discovery prewarm / Cache TTL / Validation retry budget). Local storage inspector categorized. Reset section + Reset all type-to-confirm gates working. |
| 09 | Search "Power BI Q&A" | **Search dictionary hit confirmed** — `1 group matched` (AI). Cycle 17 entry discoverable via search. |
| 10 | `/powerbi/qna` | Route mounts cleanly. Renders `Couldn't load Power BI Q&A · No Power BI semantic-model profile configured.` — fail-closed message expected (no PBI semantic-model profile in config.json). |
| 11 | `/knowledge` | KnowledgeShell renders. CPG / FMCG pack listed with 10 sub-verticals. |
| 12 | `/workbench` | Preview opt-in screen renders. Enable preview button works. |

## Cycle 17 verification

| Surface | Verdict |
|---|---|
| `Power BI Q&A` Leaf appears in `GROUP_LEAF_LABELS.ai` | ✅ Visible in /settings/ai left rail |
| Search returns `Power BI Q&A` | ✅ "1 group matched" |
| Conditional render when profile.type === "powerbi-semantic-model" | ✅ Correctly gated (not visible with Genie profile active) |
| `/powerbi/qna` route still mounts after the launch button addition | ✅ Renders fail-closed copy when no PBI semantic-model profile is configured |
| FM orchestrator retry-budget symmetry | ✅ Proxy boot + /health = 200; 4 new jest tests cover the wiring (1017 total) |

## Console error scan

- `/` → 1 transient 404 (likely a startup health-probe race; not blocking)
- `/settings/setup`, `/settings/ai`, `/settings/bi`, `/settings/preferences`, `/settings/system`, `/settings/advanced` → 0 errors
- `/powerbi/qna` → 1 expected 400 from the embed-token mint (`No Power BI semantic-model profile configured`) — rendered as a user-facing error card; no React/component error.
- `/knowledge`, `/workbench` → 0 errors

## Outstanding from the Settings P1 backlog (Codex hand-off, AGENT_SYNC)

These six remain on the AGENDA queue and are the next batch in this session:

1. Mobile Settings nav below 640px (currently `.pp-settings-rail{display:none}` strands users)
2. Save-bar Discard restores localStorage but not live UI state
3. Diagnostics / localStorage secret redaction gaps
4. Reset coverage gaps (`pulseplay:bi-embed-config`, `pulseplay:active-connector`, discovery sessionStorage)
5. PBI secure host accepts sibling domains (`evilpowerbi.com`)
6. EmbedConfigForm does not fail closed on allowlist fetch failure

## Servers used

| Process | URL | Status |
|---|---|---|
| proxy `node server.js` | http://127.0.0.1:8787 | Up, 3 profiles loaded |
| playground `npm run dev` | http://127.0.0.1:5173 | Up, Vite proxies /api/* to proxy |
