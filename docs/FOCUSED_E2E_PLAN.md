# PulsePlay — Focused End-to-End Test Plan

> **Companion to** [`SMOKE_TEST_PLAN.md`](SMOKE_TEST_PLAN.md). The smoke plan is broad (647 surface checks). This plan is deep: **7 mandatory user-journey scenarios** that each exercise the full stack from settings → embed → AI question → answer → recovery.
>
> **Goal:** prove that a brand-new author can sit down, configure PulsePlay against a real Databricks Genie profile + Power BI Premium tenant, ask a question, and see correct grounded answers within 5 minutes.
>
> **Last updated:** 2026-05-19

---

## Live environment fixtures

These are real values from your current proxy/config.json. Codex should treat them as the single source of truth — do NOT invent IDs, do NOT use placeholders.

### Proxy
- **URL:** `http://127.0.0.1:8787`
- **Health endpoint:** `GET /health` returns `{"ok":true,"profiles":["default","supervisor"],"port":8787,"configSource":"config.json","authMode":"none"}`
- **Allowlist endpoint:** `GET /assistant/allowlist` returns `{"configured":false,"enforcement":"strict",...}` — `configured:false` means the allowlist is permissive and any vendor / profile / pack is accepted. **Don't confuse this with a broken state.**

### AI profiles (live, in proxy/config.json)

| Profile name | Type | Data domain | Genie space | Workspace |
|---|---|---|---|---|
| `default` | direct Genie | Sales Team | `01f13f...a37373` (full ID in `/assistant/profiles` response) | `dbc-f88d29ce-4aa2.cloud.databricks.com` |
| `supervisor` | supervisor-local | (multi-space) | n/a — fans out | local agent named "PulsePlay Supervisor" |

### Power BI fixture (Premium, NOT Fabric)

- **Embed URL:**
  ```
  https://app.powerbi.com/reportEmbed?reportId=c6afe35e-5dba-453a-9720-871d48f0ad0a&autoAuth=true&ctid=2b983dc1-08a4-4b13-87d9-065f8db8f99b&actionBarEnabled=true
  ```
- **Report ID:** `c6afe35e-5dba-453a-9720-871d48f0ad0a`
- **Tenant (ctid):** `2b983dc1-08a4-4b13-87d9-065f8db8f99b`
- **Auth mode:** `autoAuth=true` → AAD SSO from current browser session, no embed-token needed
- **Action bar:** enabled (the PBI toolbar is visible inside the iframe)

### Dev server

- **Primary URL:** `http://127.0.0.1:5173` (or `5174` if 5173 is bound by a parallel process)
- **Vite SPA fallback** is on; deep links like `/settings/ai/knowledge-base` work on hard refresh.

### Test fixture questions

Use these specific questions in Ask Pulse / Insights. They're small enough to render every chart type cleanly and cheap enough to not stress the warehouse:

| Question | Why we use it |
|---|---|
| `Top 5 sales reps by revenue this year` | 5 rows × 2 cols → renders KPI, bar, column, pie, donut, lollipop, pareto |
| `Show monthly sales for the last 12 months` | 12 rows × 2 cols (date + value) → line, area, sparkline, column |
| `What's the total revenue this year?` | 1 row × 1 col → KPI tile rendering, "Not enough data" for chart types that need multi-row |
| `Show sales by region and month` | 2D grid → heatmap, clustered bar, sankey |

---

## Pre-flight (run before every scenario)

```powershell
# 1. Verify proxy is healthy
curl http://127.0.0.1:8787/health
# Expected: {"ok":true,"profiles":["default","supervisor"],...}

# 2. Verify dev server is up
curl http://127.0.0.1:5173
# Expected: HTML doctype response

# 3. Verify baseline tests pass (cheap sanity gate)
cd D:\Working_Folder\Projects\PulsePlay\playground
npm run test -- --run 2>&1 | tail -3
# Expected: "Tests 918 passed (918)" — if this fails, STOP

# 4. Clean state — clear localStorage before each scenario
# In browser DevTools console:
localStorage.clear(); location.reload();
```

If any pre-flight step fails, STOP and report. Don't try to work around it.

---

## Scenario 1 · Cross-vendor full setup (Power BI Premium + Databricks Genie AI)

**Why this matters:** This is the marquee user journey — author with PBI Premium tenant + Databricks workspace configures both, asks a question, sees the report load + Genie answer + chart picker working together.

### Steps

| # | Action | Verification | Evidence |
|---|---|---|---|
| 1 | Open `http://127.0.0.1:5173/settings/setup` | Quick Setup page renders with 3 step cards (BI / AI / Knowledge pack); top-right chip says "Setup needed" | Screenshot the page |
| 2 | In Step 1, select Provider = **Power BI** | Textarea labeled "Embed URL or iframe HTML" appears below the select | Screenshot |
| 3 | Paste the PBI embed URL fixture into the textarea | Apply button enables (was disabled) | DOM: button.pp-setup__primary.disabled === false |
| 4 | Click **Apply embed** | Green success message appears below the textarea; card status badge changes to "Configured" (green) | Screenshot |
| 5 | In Step 2, click **Test proxy** in the card header | Green chip appears: "Proxy online · 2 profiles · <Xms>" | Screenshot AND verify network tab shows `GET /api/health` 200 |
| 6 | In Step 2, select AI profile = **default** | Profile persists; status badge becomes "Configured" | localStorage: `pulseplay:active-ai-profile === "default"` |
| 7 | Click **Test selected profile** | Green chip: "Profile reachable · direct · space 01f13f...…" | Verify `GET /api/assistant/profiles?assistantProfile=default` 200 |
| 8 | Click **← Back to app** in header | URL becomes `/` | DOM ready |
| 9 | Wait for PBI iframe to mount in canvas pane | Iframe with src containing `app.powerbi.com/reportEmbed` becomes visible; report content (visuals) loads (AAD SSO completes silently because of `autoAuth=true` + your existing browser session) | Screenshot the canvas |
| 10 | Open the AI sidebar (or click **Ask Pulse** tab in mix mode) | Compose input visible; "Try asking" pills may appear | Screenshot |
| 11 | Type the fixture question `Top 5 sales reps by revenue this year` and press Enter | Question appears as blue user bubble on the right | Screenshot |
| 12 | Wait for the response (warehouse spin-up may take 30-90 s on cold start; ≤30 s if warm) | Progress indicator shows stages: Getting started → Reading data → Working out the query → Warming up the warehouse → Pulling the data → COMPLETED. Then the assistant card appears with markdown text. | Screenshot at each stage transition |
| 13 | Verify the response includes 5 sales reps with revenue figures | Text contains 5 names + dollar amounts | Read the markdown |
| 14 | If `queryResult` was attached, view tabs Chart / Table / SQL appear above the response | Click **Chart** | Chart renders (default recommended type — likely bar or column). Container is < 420 px tall. |
| 15 | Use the chart picker to switch to **KPI Tile** | Single value renders | Screenshot |
| 16 | Switch to **Heat Map** | Either renders with a 2D grid OR shows "Not enough data — try Bar or Table" — both are valid for a 1D dataset | Screenshot |
| 17 | Switch to **Table** view | Tabular data renders with 2 columns and 5 rows | Screenshot |
| 18 | Click 👍 (thumbs up) | Button highlights | localStorage update |
| 19 | Hard refresh the page (Ctrl+Shift+R) | The PBI iframe re-loads (silent AAD); the message history rehydrates from localStorage if persisted, OR starts fresh — both are acceptable contracts | Screenshot |

### Acceptance criteria (Scenario 1)

- ✅ PASS if: all 19 steps complete without console errors, the PBI iframe shows actual visuals (not the blue AAD login screen, not a blank rectangle), and the Genie answer contains real sales-rep data from the connected Genie space.
- ❌ FAIL if: any step fails with a red error banner, or the iframe shows X-Frame-Options blocked, or the Genie answer is "no data" / "I don't know" / error.
- ⏸ DEFER if: cold warehouse spin took > 5 minutes (Databricks-side issue, not PulsePlay).

### What to record

- Screenshots at steps 1, 4, 9, 12 (final response), 14, 15, 16, 17
- The first 200 chars of the Genie response text
- The full network log for the message exchange (`/api/assistant/conversations/...`)
- Console log (any red errors)

---

## Scenario 2 · Databricks-only end-to-end (Genie BI + Genie AI)

### Steps

| # | Action | Verification |
|---|---|---|
| 1 | `localStorage.clear(); location.reload();` | Quick Setup shows "Setup needed" |
| 2 | Provider = **Databricks Genie** | Textarea appears with Genie placeholder |
| 3 | Get an embed iframe HTML from your Genie space (Databricks UI → Share → Embed space). Paste it. | Apply enables |
| 4 | Apply | Green success; card shows "Configured" |
| 5 | AI profile = **default** | Persists |
| 6 | Test proxy + test profile | Both green |
| 7 | Back to app | Genie iframe loads in canvas |
| 8 | Open Ask Pulse | Compose input ready |
| 9 | Ask `Show monthly sales for the last 12 months` | Response within 30-90 s |
| 10 | View tabs render | Chart → Line is the recommended view |
| 11 | Switch chart → Sparkline | Renders as a mini-line |
| 12 | Switch chart → Area | Renders filled area |
| 13 | Switch tab → SQL (requires Developer Tools → Show SQL = on; enable first if needed) | SQL displayed |

### Acceptance criteria

- ✅ PASS if Genie answer has 12 monthly data points and the line chart renders correctly.

---

## Scenario 3 · AI-only Foundation Model streaming

### Steps

| # | Action | Verification |
|---|---|---|
| 1 | `localStorage.clear(); location.reload();` | Clean state |
| 2 | In Quick Setup, do NOT pick a BI vendor — leave empty | Step 1 status stays "Not picked" |
| 3 | AI profile = (any foundation-stream profile if one exists in /health profiles — otherwise SKIP this scenario as N/A: `requires foundation-stream profile in proxy/config.json`) | If foundation-stream not in profiles → SKIPPED |
| 4 | Back to app — go to AI Insights surface | Insights pipeline triggers |
| 5 | Watch the network tab for `/foundation/conversations/start-stream` | NDJSON streaming response | 
| 6 | First section (HEADLINE) should appear in browser within ~5 s | Streaming working |
| 7 | Subsequent sections (TRENDS / RISKS / ACTIONS) render as they arrive | Progressive render |

### Acceptance criteria

- ✅ PASS if first section appears in < 8 s AND all 4 sections eventually render.
- ⏸ N/A if no `foundation-stream` profile is registered on the proxy.

---

## Scenario 4 · Supervisor fusion (multi-space fan-out)

### Steps

| # | Action | Verification |
|---|---|---|
| 1 | `localStorage.clear(); location.reload();` | Clean |
| 2 | Configure any BI (Genie iframe is easiest) | BI ready |
| 3 | AI profile = **supervisor** | Persists |
| 4 | Settings → AI → `/settings/ai/connection-test` | Per-space probe matrix appears |
| 5 | Per-space probes run with 2000 ms stagger between starts (per ADR-0003) | Network tab shows staggered timing |
| 6 | Aggregate summary appears: "N/M spaces reachable" | Status visible |
| 7 | Settings → AI → `/settings/ai/supervisor-fusion` | Sub-page renders |
| 8 | Toggle Auto-fusion off → save | Persists |
| 9 | Ask a question | Response shows per-space results (not synthesised) |
| 10 | Toggle Auto-fusion back on → save | Persists |
| 11 | Ask same question | Now a single synthesised answer |

### Acceptance criteria

- ✅ PASS if supervisor fan-out works in both modes (synthesised + raw).
- ⏸ N/A if the supervisor profile in proxy/config.json has zero spaces configured.

---

## Scenario 5 · Settings persistence + discard

### Steps

| # | Action | Verification |
|---|---|---|
| 1 | Configure full setup (any combo) | Save bar appears as you change values |
| 2 | Verify save bar text "Unsaved changes" with pulsing dot | DOM check |
| 3 | Click **Save changes** | Bar turns green "✓ Settings saved" |
| 4 | Wait 3 s | Bar fades / auto-dismisses |
| 5 | Hard refresh page | All settings persist (vendor, profile, pack, embed, sub-route toggles) |
| 6 | Open `/settings/ai/knowledge-base` and toggle ALL 4 toggles off → click Save | Persists |
| 7 | Hard refresh | All 4 still off |
| 8 | Open the same page and click **Discard** without saving | Reverts to the snapshot taken when settings opened |
| 9 | Verify the toggles return to the previous saved state | localStorage diff |

### Acceptance criteria

- ✅ PASS if persistence round-trips correctly AND Discard restores the open-time snapshot.

---

## Scenario 6 · Error recovery (intentional break + recover)

### Steps

| # | Action | Verification |
|---|---|---|
| 1 | Configure full setup, prove it works (ask one question) | Baseline working |
| 2 | Stop the proxy (Ctrl+C in the proxy terminal) | Proxy down |
| 3 | Refresh the app | "Proxy Offline" banner appears in the AI sidebar |
| 4 | Verify banner text says "PulsePlay Proxy" (NOT "UniBridge AI Proxy") | Branding fix verified |
| 5 | Try to send a chat message | Graceful error, not a blank page |
| 6 | Restart the proxy (`node server.js` again) | Proxy up |
| 7 | Click **Retry** on the banner (if present) OR wait for next 10-s health poll | Banner clears within 10 s |
| 8 | Send the same question again | Now works |
| 9 | In Settings → System → Proxy status → status chip should be green | Visual |

### Acceptance criteria

- ✅ PASS if the app recovers cleanly without page refresh and without losing state.

---

## Scenario 7 · Embed mode switch within Power BI

**Why this matters:** Power BI has 4 embed modes (Secure / SSO / Backend / Manual). Most orgs need to test 2 of them. Verify the form switches correctly and persists the mode.

### Steps

| # | Action | Verification |
|---|---|---|
| 1 | `localStorage.clear()` | Clean |
| 2 | `/settings/bi/embed`, vendor = Power BI, mode = **Secure** | Textarea visible |
| 3 | Paste fixture URL, apply | Persists |
| 4 | Switch mode to **SSO (AAD)** | Multi-field form appears (groupId, reportId, datasetId, permissions, client ID, tenant) |
| 5 | Fill `groupId` = (workspace ID from your PBI tenant — ask user or skip), `reportId` = `c6afe35e-5dba-453a-9720-871d48f0ad0a`, `datasetId` = (ask user or skip), permissions = `View`, client ID = (ask or skip) | If user can't provide, mark SKIPPED with reason `awaiting AAD client config` |
| 6 | If filled, click **Sign in & embed** | MSAL flow opens popup; sign in with same AAD account | 
| 7 | After sign in, embed should load | iframe visible | 
| 8 | Switch mode to **Manual** | Two textareas appear (embedUrl + accessToken) | 
| 9 | Mode persists across page refresh | localStorage round-trip | 

### Acceptance criteria

- ✅ PASS if Secure + at least one of SSO/Manual works.
- ⏸ N/A for Backend mode unless service principal is configured proxy-side.

---

## Acceptance bar for the whole E2E pass

- **Hard pass:** Scenarios 1 + 2 + 5 + 6 all PASS. (Cross-vendor live, Databricks-only live, persistence, error recovery — these prove the core product works.)
- **Soft pass:** Scenarios 3, 4, 7 may be SKIPPED with explicit reasons if prerequisites aren't met.
- **FAIL the whole run if:** Scenario 1 fails (the marquee user journey).

---

## What to capture per scenario

For each scenario, the executor must produce:

1. A **scenario header** block with the scenario number, name, start time, end time
2. **Step-by-step results** — one line per step: PASS / FAIL / SKIPPED with one-liner
3. **Screenshots** at the verification milestones (numbered to match steps)
4. **Network log excerpt** for the key API calls (one line per call with status + duration)
5. **Console log** — any red errors (one block per scenario, redact tokens)
6. **localStorage snapshot** at the end of the scenario (`JSON.stringify(localStorage)` minus token-shaped values)
7. **Verdict:** PASS / FAIL / SKIPPED / N/A with one-paragraph explanation

---

## What changes vs. the broad smoke plan

| Aspect | Broad smoke (SMOKE_TEST_PLAN.md) | This focused plan |
|---|---|---|
| Scenarios | 647 (surface checks) | 7 (full journeys) |
| Goal | Coverage breadth | Workflow correctness |
| When to run | Pre-release regression | Sprint demo · per-PR for risky changes · new vendor onboarding |
| Failure mode | Many small misses | One big miss = release blocker |
| Live env requirement | Optional (most AUTO) | Mandatory (Scenarios 1-2-6 need real Databricks + AAD) |
