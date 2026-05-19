# Codex prompt — PulsePlay tough test run (~600 executable scenarios)

> **Paste everything between the `═══` lines into Codex.**
>
> This is the Codex-executable tough plan: persona × element × break-it. The full 2,544-scenario catalog in `EXTREME_E2E_PLAN.md` is the deep reference; this run focuses on what a visible in-app browser can drive solo in 3-5 hours.

═══════════════════════════════════════════════════════════════════

You are executing the PulsePlay tough test plan — a persona × element × break-it run targeting ~600 scenarios. This is the second-generation plan after the 2026-05-19 visible E2E pass; it focuses on what you can actually execute in a visible browser session rather than aspirational lab scenarios.

**Mindset:** be tough. Try to find what's broken. Honest "X failed" beats false "all green." If a persona feels confused, time-out, or hits a dead end — that's a fail. If a break-it attempt succeeds — that's a Critical vulnerability, not "expected."

## References

Read in this order before starting:

1. `D:\Working_Folder\Projects\PulsePlay\CLAUDE.md` — project guide + tripwires (especially Power BI Premium NOT Fabric)
2. `D:\Working_Folder\Projects\PulsePlay\docs\WORKING_WITH_CLAUDE.md` — collaboration contract
3. `D:\Working_Folder\Projects\PulsePlay\docs\CODEX_TOUGH_TEST_PLAN_2026-05-19.md` — the authoritative scenario catalog for this run
4. `D:\Working_Folder\Projects\PulsePlay\docs\SURFACE_COMPANION_HANDOFF_2026-05-19.md` — what just landed (surface contract, switcher, BI peer empty state, mobile clamp) and what's deferred
5. `D:\Working_Folder\Projects\PulsePlay\docs\EXTREME_E2E_RESULTS_2026-05-19-1146.md` — previous run's honest gaps

## Live environment

### Proxy on `http://127.0.0.1:8787`
- Profiles: `default` (direct Genie, Sales Team domain, workspace `dbc-f88d29ce-4aa2.cloud.databricks.com`) + `supervisor`
- Allowlist: `configured:false`, `enforcement:strict` → permissive
- Auth: `authMode:none` (dev, 127.0.0.1 bound)

### Dev server on `http://127.0.0.1:5173` (auto-bump to 5174)

### Power BI fixture (Premium, NOT Fabric)
```
URL:    https://app.powerbi.com/reportEmbed?reportId=c6afe35e-5dba-453a-9720-871d48f0ad0a&autoAuth=true&ctid=2b983dc1-08a4-4b13-87d9-065f8db8f99b&actionBarEnabled=true
Report: c6afe35e-5dba-453a-9720-871d48f0ad0a
Tenant: 2b983dc1-08a4-4b13-87d9-065f8db8f99b
Auth:   autoAuth=true → AAD SSO from your browser session
```

### Test fixture questions (use these — don't invent)
- `Top 5 sales reps by revenue this year` — small ranked, exercises chart picker
- `Show monthly sales for the last 12 months` — time series, line/area
- `What's the total revenue this year?` — KPI single value
- `Show sales by region and month` — 2D grid, heatmap

## Pre-flight (mandatory; run once)

```powershell
curl http://127.0.0.1:8787/health
# Expected: {"ok":true,"profiles":["default","supervisor"],...}

curl http://127.0.0.1:5173

cd D:\Working_Folder\Projects\PulsePlay\playground
npm run test -- --run 2>&1 | tail -3
# Expected: "Tests 918 passed (918)"

npm run lint
# Expected: exit 0
```

If any pre-flight fails → STOP and report. Don't paper over a broken baseline.

## State reset between personas

```javascript
// Browser DevTools console
localStorage.clear();
sessionStorage.clear();
indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
location.reload();
```

## Execution order

The plan has 4 parts. Run in this order:

**Part 2 · Persona track (260 scenarios)** — twelve personas, each with 12-25 scenarios. Most important — this is where the product is judged.

Personas:
- P1 New end-user (20) — "What is this? How do I do anything?"
- P2 Returning end-user (16) — "Don't slow me down."
- P3 First-time author (20) — "I'm setting this up for my team. Time it."
- P4 Updating author (20) — "Regular tweaks; rollback must work."
- P5 Compliance author (18) — "Audit posture; confirm Premium NOT Fabric."
- P6 Troubleshooting author (12) — "Something's broken; diagnose."
- P7 Power user (15) — "Keyboard + multi-tab + URL bar."
- P8 Adversary (18) — "Can I break or exfiltrate?"
- P9 Accessibility user (15) — "Screen reader / high-contrast / zoom."
- P10 Mobile user (12) — "390 × 844 viewport."
- P11 Demoer (8) — "Clean visual; presenter mode."
- P12 QA / regression (13) — "Deliberate state corruption."

**Part 3 · Element audit (220 scenarios)** — every primitive, sub-route, shell, settings group, chart, embed form, status badge, tooltip gets a 5-point audit (render, interaction, persistence, a11y, copy).

**Part 4 · Break-it / adversarial (100 scenarios)** — explicit hostile attempts:
- 4A Visual + state attacks (25)
- 4B Network adversarial (25)
- 4C Permission + escalation (20)
- 4D Prompt injection (15)
- 4E UI race conditions (15)

## Per-scenario protocol

1. Read ID + scenario + pass signal + evidence requirement
2. Reset state if persona changed (not between sibling scenarios)
3. Execute action
4. Verify pass signal
5. Record: PASS / FAIL / SKIPPED / N/A
6. Evidence: for any FAIL OR for any Critical scenario regardless of result:
   - Screenshot saved to `docs/evidence/tough-test-<YYYY-MM-DD-HHMM>/<persona>-<scenario>-<step>.png`
   - Network log (key calls only, METHOD URL → status · duration)
   - Console log (red errors only, redact tokens)
   - localStorage snapshot at failure (mask token-shaped values)

## Ground rules

- **Never edit production code to make a test pass.** If something fails, file the failure — don't sneak a fix.
- **Never commit credentials.** AAD tokens, PATs, embed tokens — redact in all output.
- **Don't invent fixture values.** Use exactly what's listed above.
- **Tests are read-only against live services** except local-state ops the plan explicitly allows (localStorage.clear, Discard, Reset all).
- **Retry once on flaky LIVE failures** (cold warehouse, AAD popup race). If still failing, report.
- **Save partial reports every 50 scenarios** to the results file so progress survives a crash.

## Special handling

### Break-it section
For each break-it scenario where the attack succeeds (XSS executes, token leaks, prompt injection bypasses guard, etc.):
- That's a FAIL at the scenario's severity
- Do NOT exploit further — capture proof and move on
- Mark in the headline: "Critical vulnerabilities found: N"

### Persona timing
For P3 (First-time author), time the full setup flow. If it takes > 5 minutes from `/settings/setup` to "Ready" status, that's a FAIL regardless of whether individual steps work.

### Mobile (P10)
Use DevTools device emulation at 390 × 844. The handoff doc confirms the floating panel mobile clamp landed — verify it via measured x + width values. If Dock or Close button has `x + buttonWidth > viewportWidth`, that's a FAIL.

### Accessibility (P9)
Use aXe browser extension or Lighthouse a11y audit. Score `Critical` findings only as FAIL; `Serious` as Medium; `Moderate` as Low. Screen reader scenarios (NVDA/JAWS/VO) require lab — mark `N/A: screen reader not in lab` if unavailable.

### Surface UX (just-landed work)
Verify these recent fixes haven't regressed:
- BI Viz empty state does NOT say "BI-only mode" in unified mode
- SurfaceSwitcher pills don't duplicate ("AI AI Insights" etc.)
- Floating panel stays inside viewport on mobile
- "PulsePlay Proxy" branding (not "UniBridge")

## Stop conditions

- Baseline test failure during pre-flight → STOP
- Proxy crash that won't restart → STOP, attempt one restart, then STOP if still down
- Any token/secret visible in screenshot or log → STOP immediately, redact, report
- Token / time budget exhausted → emit partial report and STOP cleanly
- Any Critical break-it FAIL → CONTINUE the run but flag in chat headline so we can war-room

## Result file

Write to: `D:\Working_Folder\Projects\PulsePlay\docs\TOUGH_TEST_RESULTS_<YYYY-MM-DD-HHMM>.md`

Use the format defined in `CODEX_TOUGH_TEST_PLAN_2026-05-19.md` § Part 5 "Result file format". Mandatory: Headline + Per-persona summary + Element audit summary + Break-it summary + Critical failures with full reproducer + Notable observations + Environment.

After writing the file, post the **Headline + Per-persona summary table** to chat so the bottom line is visible quickly.

## Tier acceptance

| Tier | Criteria |
|---|---|
| Diamond | All P3 + P5 + P6 PASS + ≥90% Persona + ≥95% Element + 100% Critical break-it secure |
| Gold | All P3 PASS + ≥80% Persona + ≥90% Element + 100% Critical break-it secure |
| Silver | ≥70% Persona + ≥80% Element + 100% Critical break-it secure |
| Bronze | ≥50% Persona + ≥70% Element + any Critical break-it flagged for fix |
| Red | Any unflagged Critical break-it FAIL → block ship |

## Begin

1. Read CLAUDE.md
2. Read CODEX_TOUGH_TEST_PLAN_2026-05-19.md
3. Pre-flight (proxy + dev + tests + lint)
4. Part 2 — Personas (run all 12 in order P1 → P12, reset state between each)
5. Part 3 — Element audit
6. Part 4 — Break-it / adversarial
7. Write results file
8. Post headline summary to chat

═══════════════════════════════════════════════════════════════════

## What to send to me when you're done

Paste:
1. The Headline + Per-persona table (from the results file)
2. The path to the results file
3. The path to the evidence folder
4. Any Critical findings (one-line summary each) — so I can prioritize the next Claude pass

I'll triage and respond with the next round of focused fixes, following the same pattern as the 2026-05-19 surface-UX pass: small focused fixes, regression tests, handoff doc, repeat.
