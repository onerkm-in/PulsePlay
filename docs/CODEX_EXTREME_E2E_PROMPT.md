# Codex prompt — PulsePlay extreme E2E run (~1,950 scenarios)

> **Paste the section between `--- BEGIN PROMPT ---` / `--- END PROMPT ---` into Codex.**
>
> This is the deepest test pass we have. Plan on it taking 4-12 hours of automated runtime depending on parallelism and live-environment availability.

---

## --- BEGIN PROMPT ---

You are executing the PulsePlay extreme end-to-end test catalog — ~2,544 scenarios across four files. This is an adversarial / complex / edge-case + functional-integrity + author-journey sweep. Treat it like a red-team + QA + architectural-review + UX-research combined assessment, NOT a smoke test. **Both end-user AND author journeys must be tested** — they're different personas with different success criteria.

## Authoritative references

Read these first (in this order):

1. `D:\Working_Folder\Projects\PulsePlay\CLAUDE.md` — project guide and tripwires
2. `D:\Working_Folder\Projects\PulsePlay\docs\WORKING_WITH_CLAUDE.md` — collaboration contract
3. `D:\Working_Folder\Projects\PulsePlay\docs\EXTREME_E2E_PLAN.md` — the catalog index and execution rules
4. `D:\Working_Folder\Projects\PulsePlay\docs\SECURITY.md` — what the product already defends against
5. `D:\Working_Folder\Projects\PulsePlay\docs\ARCHITECTURE.md` — what the system is

Then read each scenario file as you start its bucket:
- `docs/scenarios/01_adversarial.md` — ~900 adversarial scenarios
- `docs/scenarios/02_complex_edge.md` — ~640 edge scenarios
- `docs/scenarios/03_routine_complex.md` — ~410 routine-complex scenarios
- `docs/scenarios/04_functional_integrity.md` — ~570 scenarios covering component contracts, cross-component integration, design uniformity, end-user use cases, AND author journeys (configure / migrate / govern / hand off / troubleshoot / brand)

## Live environment (verified pre-write)

### Proxy on `http://127.0.0.1:8787`
- Profiles: `default` (direct Genie, Sales Team, workspace `dbc-f88d29ce-4aa2.cloud.databricks.com`, space `01f13f...a37373`) and `supervisor` (supervisor-local agent "PulsePlay Supervisor")
- Allowlist: `configured:false`, `enforcement:strict` → permissive (any vendor/profile/pack accepted). **NOT a bug.**
- Auth: `authMode:none` (dev, 127.0.0.1 bound)

### Dev server on `http://127.0.0.1:5173` (auto-bumps to 5174 if 5173 taken)

### Power BI fixture (Premium, NOT Fabric)
```
URL:       https://app.powerbi.com/reportEmbed?reportId=c6afe35e-5dba-453a-9720-871d48f0ad0a&autoAuth=true&ctid=2b983dc1-08a4-4b13-87d9-065f8db8f99b&actionBarEnabled=true
Report:    c6afe35e-5dba-453a-9720-871d48f0ad0a
Tenant:    2b983dc1-08a4-4b13-87d9-065f8db8f99b
Auth:      autoAuth=true → AAD SSO from browser session
```

### Test fixture questions (use these verbatim)
- `Top 5 sales reps by revenue this year` — small ranked result
- `Show monthly sales for the last 12 months` — time series
- `What's the total revenue this year?` — KPI single value
- `Show sales by region and month` — 2D grid

## Pre-flight (mandatory before starting)

```powershell
# 1. Proxy health
curl http://127.0.0.1:8787/health
# Expected: {"ok":true,"profiles":["default","supervisor"],...}

# 2. Dev server up
curl http://127.0.0.1:5173

# 3. Baseline tests
cd D:\Working_Folder\Projects\PulsePlay\playground
npm run test -- --run 2>&1 | tail -3
# Expected: "Tests 918 passed (918)" — if not, STOP

# 4. Lint clean
npm run lint
# Expected: exit 0 — if not, STOP
```

Failing any pre-flight → STOP and report.

## State reset (between scenarios + between buckets)

In browser DevTools console:

```javascript
localStorage.clear();
sessionStorage.clear();
indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
location.reload();
```

Skip ONLY when the scenario explicitly says "no reset" (some chain attacks need prior state).

## Execution model

### Parallelism per bucket

| Bucket | Workers | Reason |
|---|---|---|
| 01_adversarial | High (10-50) | Mostly read-only probes; fan out safely |
| 02_complex_edge | Medium (4-8) | Some need network or browser fixtures |
| 03_routine_complex | Low (1-2) | Sequential state setup; conflict-prone |
| 04_functional_integrity | Mixed | FUNC-PRIM + FUNC-UNI are cheap grep/inspect (high parallelism); FUNC-INT + FUNC-UC need full E2E (low parallelism) |

### Per-scenario protocol

For every row in the catalog:

1. **Read** ID, vector, action, expected, severity
2. **Verify prerequisites** — if not met, mark `N/A` with reason
3. **Reset state** if not in a chained sub-attack
4. **Execute** the action exactly as described
5. **Verify** the expected behavior is observed
6. **Record** result with one of: `PASS · FAIL · SKIPPED · N/A`
7. **Capture evidence** mandatory for FAIL of any Critical/High scenario:
   - Screenshot of the failure state
   - Network log excerpt (METHOD URL → status · duration)
   - Console log (red errors only, redact tokens)
   - localStorage snapshot at failure (mask token-shaped values)

### Ground rules

- **Never edit production code to make a test pass.** If a scenario fails, file an issue or note the FAIL — don't fix sneakily.
- **Never commit credentials.** AAD tokens, PATs, embed tokens — redact in all output.
- **Don't invent fixture values.** Use the embed URL, report ID, tenant, profile names exactly as listed above.
- **Retry once on flaky LIVE failures** (cold warehouse, AAD popup race). If still failing, report.
- **Save partial reports.** After every 100 scenarios completed, append to the results file so progress survives a crash.
- **For adversarial scenarios that succeed at attacking** (e.g., XSS executes): treat as FAIL with severity = scenario's severity. Do NOT exploit further — just record the proof of the vulnerability and move on.
- **Stop conditions:**
   - Baseline test failure during pre-flight
   - Proxy crash that won't restart
   - Credential or token visible in any log/screenshot (STOP immediately, redact, report)
   - Token budget exhausted (emit partial report and STOP cleanly)
   - Any Critical FAIL on a security scenario (continue the run but flag for war-room)

## Special handling per category

### SEC-INJ-* (Injection / XSS)
For each XSS payload, the expected behavior is "rendered as text, not executed." If a payload executes, capture:
- The exact payload that triggered execution
- The DOM path that rendered it
- The CSP / sanitizer that should have caught it
- A minimal reproducer (URL + steps)

### SEC-AUTH-* (Authentication)
Most need a real AAD session. If AAD is not available, mark `N/A: AAD session required`. Don't fake tokens.

### SEC-PROMPT-* (Prompt injection)
The expected behavior is "assistant does not comply with attempted hijack and answers the actual question (or refuses safely)." Document the prompt + response. If the assistant complies with the attack, that's a FAIL with severity from the scenario.

### SEC-GOV-* (Governance bypass)
Run these against the actual configured governance (sub-route BI Governance + UC policies). If the bypass succeeds, capture the SQL that ran + the data returned.

### SEC-RACE-* / SEC-STATE-* (Concurrency)
These often need timing tools. If a race or state-corruption bug surfaces, capture a HAR file + repro steps. Many will be Heisenbugs — note "intermittent" and the rate.

### EDGE-PERF-* / EDGE-RESOURCE-*
Use Chrome DevTools Performance + Memory panels. Capture the perf timeline as evidence. Soft pass = "completed under acceptable time/memory"; hard fail = "browser hung or crashed".

### EDGE-BROWSER-*
You probably won't have access to every browser. Run what's available (Chrome variants definitely; Firefox / Safari if installed). Mark unavailable browsers `N/A: browser not in lab`.

### EDGE-PRIVACY-*
Open an incognito window for these. State persistence assumptions change — read the expected behavior carefully.

### EDGE-TIME-*
Some need OS clock manipulation. Don't actually change the system clock — use mocked Date.now() in browser DevTools or skip with `SKIPPED: OS clock manipulation not safe`.

### A11Y-*
Requires a screen reader (NVDA/JAWS/VoiceOver). If unavailable, run aXe / Lighthouse a11y audits as a partial substitute and note which scenarios are auto-verified vs manually deferred.

### COMPLIANCE-*
Some can be observed (cookie consent UI, privacy notice link, telemetry disclosure). Others (SOC 2 evidence, GDPR access review) require admin tooling — mark `N/A: admin tool` if not exposed.

### DEPLOY-*
Run these by exercising `npm install`, `npm run build`, `npm run test` in a clean clone OR by reading CI logs. Don't deploy to production.

### FUNC-PRIM-* (component contracts)
For each primitive (HelpTip, StatusBadge, TestButton, FieldRow, FieldCard, Toggle, SettingsSaveBar, useSettingsDraft) — verify each contract row. Most are testable via the existing Vitest suite; gaps should result in a new Vitest test, NOT a manual checkbox. If a contract violates, FAIL with severity from plan.

### FUNC-INT-* (cross-component integration)
These need the app wired up end-to-end. Configure Quick Setup, then trace the path from UI action → store write → localStorage event → React re-render → DOM update. Use DevTools to verify each link in the chain. PASS only when the entire chain works.

### FUNC-UNI-* (design + behavior uniformity)
Most are static grep/inspect checks against the codebase. Run them as ad-hoc shell commands:
- "All sub-pages import SubPageHeader" → `grep -L "SubPageHeader" playground/src/settings/groups/sub/*.tsx` should be empty
- "All localStorage keys use pulseplay: prefix" → `grep "localStorage.setItem" playground/src | grep -v "pulseplay:"` should be empty
- "All async ops wrapped in try/catch" → review each `fetch(` call site
- A FAIL here means inconsistency landed; suggest refactor in the report.

### FUNC-UC-* (end-user use cases)
Multi-step user journeys for **end users** (people who open PulsePlay to ask questions). Script as Playwright/Cypress flows OR walk through manually. Each scenario has 3-10 steps; PASS only if all steps complete and the expected outcome is observed. Capture a video or sequential screenshots for evidence.

### FUNC-AUTH-* (author journeys) — **distinct persona, distinct success criteria**
These are journeys for **authors** — the people who configure PulsePlay for their org. The author's success criteria are different from the end user's:
- **Discoverability:** can the author find every setting?
- **Reversibility:** can they undo any change cleanly?
- **Observability:** can they see what's broken and why?
- **Portability:** can they hand off config to a colleague?
- **Diagnosability:** when an end user complains, can the author find the root cause?

Author journeys span 7 sub-categories: First-time setup, Updating, Migration, Multi-environment, Governance/Compliance, Handoff/collaboration, Troubleshooting, Pack/Theme/Brand authoring.

For each AUTH scenario:
- Time it. If "configure PulsePlay" takes > 5 min, that's likely a FAIL even if the steps work.
- Watch for moments of confusion (long pauses, doubling back, re-reading tooltips). Note them.
- Verify the author can RECOVER if they make a mistake (Discard, Reset section, Reset all).
- Verify the change is OBSERVABLE downstream (end user sees the new behavior).

A great app wins both end-user and author minds. A mediocre app wins one. Test both.

## Result file

Write to: `D:\Working_Folder\Projects\PulsePlay\docs\EXTREME_E2E_RESULTS_<YYYY-MM-DD-HHMM>.md`

Use the format defined at the bottom of `docs/EXTREME_E2E_PLAN.md`. The summary table is mandatory; per-scenario detail is mandatory only for FAIL Critical/High; SKIPPED can be bucketed by reason.

Then post the **Summary table + Tier achieved + first 5 Critical/High failures** to chat so the user gets the headline.

## Begin

1. Read CLAUDE.md
2. Read EXTREME_E2E_PLAN.md
3. Pre-flight
4. Bucket 1: `01_adversarial.md` (~900 scenarios)
5. Bucket 2: `02_complex_edge.md` (~640 scenarios)
6. Bucket 3: `03_routine_complex.md` (~410 scenarios)
7. Bucket 4: `04_functional_integrity.md` (~430 scenarios) — start with FUNC-UNI grep checks (cheap), then FUNC-PRIM (Vitest), then FUNC-INT (E2E flow), then FUNC-UC (multi-step journeys)
8. Write results file
9. Post summary

## --- END PROMPT ---

---

## Estimated execution time

| Run mode | Wall clock | Coverage achieved |
|---|---|---|
| Single-threaded Codex, no live env | 6-8 hours | ~50% (most AUTO scenarios; LIVE marked N/A) |
| 10-worker Codex, no live env | 1-2 hours | ~50% |
| 10-worker Codex + live Databricks + AAD | 3-5 hours | ~85% |
| Full lab (10 workers, all browsers, all credentials, manual a11y) | 8-12 hours | ~95% |

The remaining ~5% are scenarios that require infrastructure you may not have access to (real penetration testing tools, multi-region deployments, SOC 2 audit-grade access review). Those should be marked `N/A: out of test lab scope`.

---

## What you can prepare on your side to maximize coverage

| Credential / asset | Unlocks |
|---|---|
| AAD tenant signed in to `2b983dc1-08a4-4b13-87d9-065f8db8f99b` | SEC-AUTH-*, SEC-IFRAME-*, EDGE-PRIVACY-* (PBI flows) |
| AAD app registration with PBI scopes | SEC-AUTH-* SSO + Backend modes |
| Foundation Model serving endpoint in proxy/config.json | SEC-PROMPT-* streaming variants |
| Supervisor profile with ≥ 2 Genie spaces | SEC-RACE-* multi-space, SEC-GOV-* cross-space |
| Service principal cert for PBI Backend mode | SEC-AUTH-* service-principal paths |
| Browsers in lab: Chrome stable + canary, Firefox, Safari, Edge, Brave | EDGE-BROWSER-* |
| Network throttling tool (Chrome DevTools is enough) | EDGE-NET-* |
| Screen reader: NVDA (Win) or VoiceOver (Mac) | A11Y-* |
| Lighthouse / aXe / WAVE installed | A11Y-*, DEPLOY-046 onwards |

Without these, the run still completes — just with more `N/A` rows. The honest result file always beats a fake-high pass rate.
