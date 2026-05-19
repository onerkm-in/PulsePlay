# Codex prompt — PulsePlay end-to-end smoke test

> Paste the section between the `--- BEGIN PROMPT ---` and `--- END PROMPT ---` markers into Codex (or any agent runner) to execute the smoke test plan defined in [SMOKE_TEST_PLAN.md](SMOKE_TEST_PLAN.md).

---

## --- BEGIN PROMPT ---

You are executing the end-to-end smoke test plan for PulsePlay, a React playground that hosts BI tools (Power BI, Databricks AI/BI, Databricks Genie, Tableau, Qlik, Looker, generic iframe) with an AI assistant sidebar (Databricks Genie, Foundation Model, Supervisor, Azure OpenAI, Bedrock, ResponsesAgent).

## Test plan reference
- **Authoritative test plan:** `D:\Working_Folder\Projects\PulsePlay\docs\SMOKE_TEST_PLAN.md` (~520 scenarios, 25 categories)
- **Project guide:** `D:\Working_Folder\Projects\PulsePlay\CLAUDE.md` (read first — tripwires section is load-bearing)
- **Architecture:** `D:\Working_Folder\Projects\PulsePlay\docs\ARCHITECTURE.md`
- **Working-with-Claude:** `D:\Working_Folder\Projects\PulsePlay\docs\WORKING_WITH_CLAUDE.md`

## Vendor focus
- **BI:** Power BI **Premium** (NOT Fabric — flag any test that requires Fabric capacity), Databricks AI/BI, Databricks Genie
- **AI:** Databricks Genie profiles, Foundation Model streaming, Supervisor (multi-space fan-out)
- **Out of scope for this run:** Tableau / Qlik / Looker SDKs (still stubbed — only test their iframe fallback works)

## Environment setup

1. Start the proxy:
   ```powershell
   cd D:\Working_Folder\Projects\PulsePlay\proxy
   node server.js
   ```
   Wait until you see `PulsePlay Proxy → http://127.0.0.1:8787`. Verify with `curl http://127.0.0.1:8787/health` returning `{"ok":true,...}`.

2. Start the dev server in a second terminal:
   ```powershell
   cd D:\Working_Folder\Projects\PulsePlay\playground
   npm run dev
   ```
   Wait for `Local: http://127.0.0.1:5173/`.

3. Run the existing test suite once as a baseline:
   ```powershell
   cd D:\Working_Folder\Projects\PulsePlay\playground
   npm run test -- --run
   ```
   Expect **918/918 passing**. If anything fails before you start, STOP and report — the baseline is broken.

4. Open Chrome (or your preferred browser) at `http://127.0.0.1:5173`. Sign into your Azure AD tenant if you'll be testing PBI live embeds.

## How to execute the plan

Process each category in order. Within a category, run each scenario in order. For each scenario:

1. Read the scenario row in the plan: ID · Action · Expected · Tag.
2. Decide based on the tag:
   - **`[AUTO]`** — execute via browser automation (Playwright / Puppeteer / Selenium), unit-test mock, or direct DOM/network probing. Do not skip these — they're the meat of the run.
   - **`[LIVE]`** — needs a real Databricks workspace + Power BI tenant. If you have credentials, execute. Otherwise mark `N/A` with reason `no live workspace`.
   - **`[MANUAL]`** — visual/judgement call. Take a screenshot and either review it yourself (if you have vision) or mark `SKIPPED` with the screenshot URL.
3. Record the result in the format below.

## Result format (one line per scenario)

```
[CATEGORY-SUBCATEGORY-NN] PASS | FAIL | SKIPPED | N/A
  Notes: <one-liner — required for FAIL/SKIPPED>
  Evidence: <URL / screenshot path / commit hash / log line>
```

## Test data — fixtures to use

- **Power BI embed URL (Premium, secure-embed flow):**
  ```
  https://app.powerbi.com/reportEmbed?reportId=c6afe35e-5dba-453a-9720-871d48f0ad0a&autoAuth=true&ctid=2b983dc1-08a4-4b13-87d9-065f8db8f99b&actionBarEnabled=true
  ```
  Tenant: `2b983dc1-08a4-4b13-87d9-065f8db8f99b`. AAD SSO via `autoAuth=true`. This is a known-good test URL — if your browser session is signed into the matching tenant the embed will load.

- **Databricks Genie:** already wired through the proxy as `default` profile. Verify with `curl http://127.0.0.1:8787/health` — the `profiles` array should be non-empty.

- **Allowlist:** the proxy serves it at `/api/assistant/allowlist`. Check what's allowed before you start picking vendors / profiles, otherwise GOV-* tests will misfire.

## Ground rules

- **Do not modify production code to make tests pass.** If a scenario fails, file an issue with the failure summary — do not commit a "fix" without a separate PR review.
- **Do not commit credentials.** If you needed a PAT, AAD token, or secret to run a LIVE test, redact it from logs before reporting.
- **Do not skip categories.** If a category isn't applicable (e.g., no live Databricks), mark every scenario in it `N/A` with the same reason — don't silently omit.
- **Tests are read-only against real services unless explicitly stated.** No DROP TABLE, no DELETE, no write-back to dashboards. The reset / clear scenarios (ADV-08, ADV-09) ARE allowed because they reset *local* state only.
- **Re-run failures once before reporting.** Many UI scenarios are flaky on the first run (network warmup, JIT). If a `[LIVE]` test fails, give it one retry. If it fails again, report it.
- **Save your work incrementally.** Emit a partial report every 50 scenarios so progress is recoverable if the session dies.
- **Honest reporting beats high pass rates.** A run with 70% PASS and accurate FAIL diagnoses is more useful than 95% PASS with hidden silent failures.

## Special rules per category

### Category 10 · Vendor Matrix (MTX-*)

For each combo (Databricks-only, Databricks dual-product, Cross-vendor, AI-only, BI-only):
1. Reset state: `localStorage.clear()` then refresh
2. Configure the combo via Quick Setup
3. Run the listed sub-scenarios
4. Tear down: `localStorage.clear()` again before the next combo

### Category 8 · Ask Pulse Chat (CHAT-*)

- For chart type rendering (CHAT-CHARTS-03 through CHAT-CHARTS-23), use a query that returns a small predictable result set (10-20 rows max). Suggested query: `Top 5 sales reps by revenue this year` — small enough to render every chart type cleanly.
- For "Not enough data" (CHAT-CHARTS-25), trigger by asking for `Total revenue` — a single value — then switching to scatter or sankey which need multi-row data.

### Category 14 · Error Handling (ERR-*)

Several scenarios require breaking things on purpose:
- **ERR-01 / ERR-02:** Stop the proxy with Ctrl+C, run the scenario, restart it.
- **ERR-08 / ERR-09:** Use Chrome's pop-up blocker setting to deny AAD popup.
- **ERR-16:** DevTools → Network → Offline checkbox.
- **ERR-17:** Chrome → Settings → Privacy → Cookies → block site data, then reload.

Restore the environment between scenarios — don't leave things broken for the next category.

## Final report

When complete, write the summary report to `D:\Working_Folder\Projects\PulsePlay\docs\SMOKE_TEST_RESULTS_<YYYY-MM-DD>.md` in this format:

```markdown
# PulsePlay smoke test results — <YYYY-MM-DD>

## Summary
- Total: 520
- PASS:    XXX (NN%)
- FAIL:    XXX
- SKIPPED: XXX (reasons: a / b / c)
- N/A:     XXX (reasons: a / b / c)
- Duration: HH:MM:SS
- Environment: Chrome <version> · 1920×1080 · proxy commit <hash> · Databricks workspace <name>

## Failures (cluster related ones)

### Cluster 1: <short title>
- Affected: SHELL-NAV-12, SHELL-HEADER-03, ...
- Symptom: <one-liner>
- Likely cause: <hypothesis>
- Suggested action: <fix in <file> at <line> OR file issue>

### Cluster 2: ...

## Skipped (with reasons)

## Notable observations

- <anything that wasn't a scenario but is worth flagging>
```

Then post the summary block (just the counts) to chat so the user can see the headline result quickly.

## Stop conditions

- If the baseline test suite (`npm run test`) fails before you start: STOP and report.
- If the proxy or dev server crashes: report, attempt one restart, then either continue or STOP.
- If you see security-sensitive data leaking into screenshots or logs (PAT, token, AAD secret): STOP immediately and report which scenario triggered it.
- If you've consumed your token / time budget: emit the partial report and STOP cleanly — do not abandon the run silently.

## Begin

Read CLAUDE.md, SMOKE_TEST_PLAN.md, and WORKING_WITH_CLAUDE.md first. Confirm the environment is healthy (proxy + dev server + baseline tests). Then start at Category 1 · SHELL-NAV-01.

## --- END PROMPT ---
