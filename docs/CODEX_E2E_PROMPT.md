# Codex prompt — PulsePlay focused E2E run

> Paste the section between `--- BEGIN PROMPT ---` and `--- END PROMPT ---` into Codex. This run is **deep, not wide** — 7 scenarios that prove the product works end-to-end. Companion to the broad smoke run in [CODEX_SMOKE_TEST_PROMPT.md](CODEX_SMOKE_TEST_PROMPT.md).

---

## --- BEGIN PROMPT ---

You are executing 7 focused end-to-end scenarios against PulsePlay. Each scenario is a complete user journey from settings → embed → AI question → answer → recovery. The full plan with verification probes is in `D:\Working_Folder\Projects\PulsePlay\docs\FOCUSED_E2E_PLAN.md`.

## What's already known + verified

- **Project guide:** `D:\Working_Folder\Projects\PulsePlay\CLAUDE.md` (read FIRST — tripwires are load-bearing, especially the Power BI Premium NOT Fabric rule)
- **Working-with-Claude:** `docs/WORKING_WITH_CLAUDE.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Focused E2E plan:** `docs/FOCUSED_E2E_PLAN.md` — the authoritative scenario reference
- **Previous broad smoke run results:** `docs/SMOKE_TEST_RESULTS_2026-05-19.md` (for context on what's already verified)

## Live environment (verified at plan-write time)

### Proxy on `http://127.0.0.1:8787`
- Profiles registered: `default` (direct Genie, Sales Team domain, workspace `dbc-f88d29ce-4aa2.cloud.databricks.com`) and `supervisor` (supervisor-local agent "PulsePlay Supervisor")
- Allowlist: `configured:false`, `enforcement:strict` → permissive in this state (any vendor / profile / pack accepted). **Don't confuse `configured:false` with a broken state.**
- Auth: `authMode:none` (dev posture, bound to 127.0.0.1)

### Dev server on `http://127.0.0.1:5173` (or `5174` if duplicate)

### Power BI fixture (Premium tenant, NOT Fabric)
```
URL:       https://app.powerbi.com/reportEmbed?reportId=c6afe35e-5dba-453a-9720-871d48f0ad0a&autoAuth=true&ctid=2b983dc1-08a4-4b13-87d9-065f8db8f99b&actionBarEnabled=true
Report ID: c6afe35e-5dba-453a-9720-871d48f0ad0a
Tenant:    2b983dc1-08a4-4b13-87d9-065f8db8f99b
Auth:      autoAuth=true → AAD SSO via your existing browser session (no embed token)
```

### Test fixture questions (use these, don't invent your own)
- `Top 5 sales reps by revenue this year` — exercises chart picker (5 rows × 2 cols)
- `Show monthly sales for the last 12 months` — exercises line/area/sparkline (12 rows × date+value)
- `What's the total revenue this year?` — exercises KPI tile + "not enough data" fallback (1×1)
- `Show sales by region and month` — exercises heatmap / clustered bar / sankey (2D grid)

## Pre-flight (mandatory before EVERY scenario)

```powershell
# 1. Proxy health
curl http://127.0.0.1:8787/health
# Must return: {"ok":true,"profiles":["default","supervisor"],...}

# 2. Dev server up
curl http://127.0.0.1:5173

# 3. Baseline tests (cheap sanity gate — only run ONCE at start, not before every scenario)
cd D:\Working_Folder\Projects\PulsePlay\playground
npm run test -- --run 2>&1 | tail -3
# Must say: "Tests 918 passed (918)" — if this fails, STOP and report
```

If any pre-flight step fails, STOP. Don't try to work around it.

## Between-scenario reset (mandatory)

In the browser DevTools console:
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload();
```

Do NOT skip this. Every scenario assumes a clean slate.

## Scenarios to execute (in this order)

### Scenario 1 · Cross-vendor full setup [MANDATORY]

**Power BI Premium BI + Databricks Genie AI, end-to-end.** This is the marquee user journey. If this fails the whole run is FAIL.

Steps and verification probes are in `FOCUSED_E2E_PLAN.md` § Scenario 1 (19 steps). Highlights:
1. Open `/settings/setup`
2. Paste the PBI fixture URL → Apply
3. Pick AI profile `default` → Test proxy → Test profile (both must be green)
4. Back to app — PBI iframe must load real visuals (NOT the AAD login screen — that means your tenant cookie isn't set; pause and sign in to PBI manually in the same browser first, then continue)
5. Open Ask Pulse, send `Top 5 sales reps by revenue this year`
6. Wait through warehouse cold-start (up to 90s on first run)
7. Verify response has 5 reps with revenue figures
8. Switch chart types: KPI Tile → Bar → Heat Map → Table — capture screenshot of each
9. Hard refresh — verify state rehydrates

### Scenario 2 · Databricks-only end-to-end [MANDATORY]

Genie BI + Genie AI. Plan § Scenario 2.

### Scenario 3 · AI-only Foundation Model streaming [OPTIONAL]

Only run if proxy has a `foundation-stream` profile in `/health` profiles list. If not, mark `N/A: requires foundation-stream profile`.

### Scenario 4 · Supervisor fusion [OPTIONAL]

Only run if the `supervisor` profile has 2+ spaces configured. Probe `/api/assistant/profiles?assistantProfile=supervisor` and check `spaces` array length. If 0 or 1, mark `N/A: supervisor needs ≥2 spaces`.

### Scenario 5 · Settings persistence [MANDATORY]

Save bar / Discard / refresh round-trip. Plan § Scenario 5.

### Scenario 6 · Error recovery [MANDATORY]

Stop the proxy mid-session, verify banner, restart, verify recovery. Plan § Scenario 6.
**Important:** restart the proxy after Scenario 6 finishes so Scenario 7 has a working backend.

### Scenario 7 · Power BI embed mode switch [OPTIONAL]

Secure / SSO / Manual mode switching. Plan § Scenario 7. SSO requires AAD client ID — if not available, mark `N/A: awaiting AAD client config` and skip the SSO sub-steps.

## What to capture per scenario

For each scenario produce:

1. **Scenario header:** name, start UTC, end UTC, verdict
2. **Step-by-step results:** one line per step, PASS/FAIL/SKIPPED + one-liner
3. **Screenshots** at the verification milestones in the plan (numbered to match step numbers)
4. **Network log excerpt:** for the key API calls only (`/api/assistant/conversations/...`, `/api/health`, `/api/assistant/profiles`) — one line each: METHOD URL → status · duration
5. **Console log:** any RED errors only (info/warn ignored); redact anything that looks like a token (`dapi...`, `eyJ...`)
6. **localStorage snapshot:** at end of scenario — `Object.entries(localStorage).filter(([k]) => k.startsWith('pulseplay:'))` JSON-encoded, with any token-shaped values masked to `<redacted>`
7. **Verdict:** PASS / FAIL / SKIPPED / N/A + one-paragraph explanation

## Ground rules

- **Never edit production code to make a test pass.** If a scenario fails, file an issue with the failure summary — don't sneak a "fix" into the codebase mid-run.
- **Never commit credentials.** AAD tokens, PATs, embed tokens — all redacted before reporting.
- **Don't invent fixture values.** Use the embed URL, report ID, tenant ID, and Genie profile exactly as listed above. If a value isn't listed and you need one, mark the scenario SKIPPED with reason `awaiting <field> from user`.
- **Tests are read-only against live services** except for the local-state operations explicitly in the plan (localStorage.clear, Discard button, Reset all).
- **Retry once on flaky LIVE failures** (network warmup, AAD popup race) — if it still fails, report it.
- **Save partial reports.** After each scenario completes, append to the results file so progress survives a session crash.

## Special handling

### Cold warehouse spin-up
Databricks SQL warehouse first-touch can take 30-90 s. The proxy logs `[warehouse] Starting <id>...` then polls until `RUNNING`. This is expected on Scenario 1 first question. Don't mark FAIL purely on duration if the answer eventually arrives.

### AAD silent auth
The PBI embed URL has `autoAuth=true`. If your browser session is already signed into the matching tenant (`2b983dc1-08a4-4b13-87d9-065f8db8f99b`), the iframe loads silently. If not, you'll see an AAD login screen. **Sign in manually once outside the iframe** (open `https://app.powerbi.com` in a tab, complete login), then retry the embed.

### Genie answers without `queryResult`
Sometimes Genie returns a narrative-only answer (no SQL attachment). When that happens, the Chart / Table / SQL tabs do NOT appear — only the narrative bubble. This is correct behavior, not a bug. Note it in the scenario log but don't mark FAIL.

### Proxy port collision
If `npm run dev` starts on `5174` instead of `5173`, use `5174`. Both are equally valid; Vite auto-bumps.

## Stop conditions

- Baseline `npm run test` fails → STOP
- Proxy refuses to start → STOP, attempt one restart, then STOP if still down
- Token / secret appears in screenshot or log → STOP immediately, report which step exposed it
- Session token / time budget exhausted → emit partial report and STOP cleanly
- Scenario 1 fails → continue the other scenarios but flag this as the run-blocking failure in the summary

## Result file

Write to: `D:\Working_Folder\Projects\PulsePlay\docs\E2E_RESULTS_<YYYY-MM-DD-HHMM>.md`

Format:

```markdown
# PulsePlay focused E2E results — <YYYY-MM-DD HH:MM UTC>

## Summary
| Scenario | Verdict | Duration | Note |
|---|---|---|---|
| 1 · Cross-vendor full setup | PASS/FAIL/SKIPPED | MM:SS | (one-liner) |
| 2 · Databricks-only | … | | |
| 3 · AI-only FM streaming | … | | |
| 4 · Supervisor fusion | … | | |
| 5 · Persistence | … | | |
| 6 · Error recovery | … | | |
| 7 · PBI embed mode switch | … | | |

**Overall verdict:** PASS / SOFT-PASS (1-2-5-6 PASS, 3-4-7 SKIPPED) / FAIL

## Environment
- Git HEAD: <hash>
- Proxy version / config source: <from /health>
- Browser: <vendor + version>
- Viewport: <WxH>
- AAD tenant signed in: <yes/no>
- Databricks workspace: <hostname>

## Scenario 1 · Cross-vendor full setup
- Start: HH:MM:SS UTC
- End: HH:MM:SS UTC
- Verdict: <verdict>
- Steps:
  - Step 1: PASS — Quick Setup loaded
  - Step 2: PASS — vendor select changed to powerbi
  - Step 3: PASS — Apply button enabled
  - ... (one line per step from the plan)
- Screenshots:
  - step-01-setup-page.png
  - step-04-embed-applied.png
  - step-09-pbi-canvas.png
  - step-12-genie-response.png
  - step-14-chart-bar.png
  - step-15-chart-kpi.png
  - step-16-chart-heatmap.png
  - step-17-chart-table.png
- Network log:
  - GET /api/health → 200 · 12ms
  - GET /api/assistant/profiles?assistantProfile=default → 200 · 18ms
  - POST /api/assistant/conversations/start → 200 · 340ms
  - GET /api/assistant/conversations/.../messages/... → 200 · (polled N times until COMPLETED)
- Console (red errors only): none
- localStorage end-state: { "pulseplay:bi-vendor": "powerbi", "pulseplay:active-ai-profile": "default", ... }
- Verdict explanation: <one paragraph>

## Scenario 2 · ... (same shape)
## Scenario 3 · ... (same shape — or "N/A: foundation-stream profile not registered")
## Scenario 4 · ... (same shape — or "N/A: supervisor has 0 spaces")
## Scenario 5 · ... (same shape)
## Scenario 6 · ... (same shape)
## Scenario 7 · ... (same shape — or "N/A: AAD client ID not provided")

## Failures (if any)
### <Scenario name> — <step #>
- Symptom: <what you saw>
- Expected: <what the plan said should happen>
- Diagnosis: <what you think broke>
- Suggested action: <file in <path> at <line> OR open issue>
- Evidence: <screenshot path, network log excerpt>

## Final state at end of run
- Browser left at: <URL>
- Settings dirty state: <yes / no>
- Proxy state: <running / stopped>
- Did you save the Settings unsaved-changes bar? <yes / no / not applicable>
```

Then post the **Summary table** (the first block) to chat so the user sees the headline result quickly.

## Begin

1. Read `CLAUDE.md` first (tripwires)
2. Read `docs/FOCUSED_E2E_PLAN.md`
3. Run pre-flight
4. Execute Scenarios 1 → 2 → 3 → 4 → 5 → 6 → 7 in order
5. Write the result file
6. Post the Summary table back

## --- END PROMPT ---

---

## Optional: extra credentials the user may need to provide

The 7 scenarios above are executable with what's already in the repo + proxy + the public PBI embed URL fixture. To unlock the OPTIONAL sub-steps, the user can also share:

| Field | Used by | Source |
|---|---|---|
| AAD client ID for Power BI SSO mode | Scenario 7 SSO sub-steps | Azure portal → App registrations → your PBI embed app → Application (client) ID |
| Power BI workspace ID (groupId) | Scenarios 5-7 SSO/Backend modes | `app.powerbi.com` → Workspace settings → Workspace ID |
| Power BI dataset ID | Scenarios 5-7 SSO/Backend modes | Power BI report → Settings → Dataset ID |
| Foundation Model serving endpoint name | Scenario 3 | Databricks → Serving → Endpoint name (e.g., `databricks-meta-llama-3-1-70b-instruct`) — also requires adding a `foundation-stream` profile to `proxy/config.json` |
| Genie space IDs (additional) | Scenario 4 supervisor fan-out | Databricks → Genie → each space's URL — also requires populating `supervisor.spaces[]` in `proxy/config.json` |
| Service principal Client ID + Secret | Scenario 7 Backend mode | Azure AD app registration with PBI API permissions — added to `proxy/config.json` server-side, never in browser |

These are all OPTIONAL — the run can produce a clean SOFT-PASS without them.
