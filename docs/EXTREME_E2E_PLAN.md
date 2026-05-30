# PulsePlay — Extreme End-to-End Test Catalog

> **The "evil mind" plan.** Companion to:
> - [`SMOKE_TEST_PLAN.md`](SMOKE_TEST_PLAN.md) — 647 surface checks
> - [`FOCUSED_E2E_PLAN.md`](FOCUSED_E2E_PLAN.md) — 7 user-journey scenarios
>
> This plan goes deeper into adversarial, complex, and high-difficulty territory.
> Target: **1,500–2,000 unique scenarios**.

---

## Catalog files

The catalog is split across four files for ease of editing + parallel test execution:

| File | Focus | Scenarios | Lead author |
|---|---|---:|---|
| [`scenarios/01_adversarial.md`](scenarios/01_adversarial.md) | Security · injection · prompt injection · governance bypass · race conditions · state corruption · network adversarial · auth · iframe · exfil | ~900 | Red-team research agent |
| [`scenarios/02_complex_edge.md`](scenarios/02_complex_edge.md) | I18N · perf under load · network conditions · browser diversity · privacy mode · time/locale · form validation extremes · UI state corruption · resource exhaustion | ~640 | QA research agent |
| [`scenarios/03_routine_complex.md`](scenarios/03_routine_complex.md) | Config drift · accessibility · time + locale · form validation · recovery · sub-route routing · multi-user · compliance · deployment | ~410 | Claude (this assistant) |
| [`scenarios/04_functional_integrity.md`](scenarios/04_functional_integrity.md) | Component contracts (primitives) · cross-component integration · design + behavior uniformity · end-user use cases · author journeys | ~570 | Claude (this assistant) |

**Total: ~2,544 scenarios.**

> **End-user vs author journeys:** File 4 separates these explicitly. End users open PulsePlay and consume insights. Authors configure PulsePlay so end users can do that. Both must succeed — the catalog tests both paths.

---

## Severity taxonomy

| Tag | Meaning | Example |
|---|---|---|
| **Critical** | Release-blocker. Bug here would risk data loss, security breach, or unusable app. | XSS executes in chart label · embed token leaks · localStorage cleared accidentally |
| **High** | Wrong answer, broken core flow, or compliance violation. | Genie returns DML · governance toggle ignored · accessibility WCAG fail |
| **Medium** | UX broken but recoverable. | Save bar doesn't appear · sub-route 404s with no fallback |
| **Low** | Cosmetic, dev-only, or minor inconvenience. | Animation skipped · log entry format · debug-only field |

---

## Coverage map

### What's covered

| Domain | Adv (file 1) | Edge (file 2) | Routine (file 3) | Func (file 4) | Total |
|---|---:|---:|---:|---:|---:|
| Settings shell · sub-routes | — | — | 50 | — | 50 |
| Authentication · session | 100 | — | — | — | 100 |
| Iframe · embed security | 80 | — | — | — | 80 |
| Injection · XSS · SQL | 120 | — | 60 (form) | — | 180 |
| Data exfiltration | 100 | — | — | — | 100 |
| Prompt injection · AI manipulation | 120 | — | — | — | 120 |
| Governance bypass | 100 | — | 40 (compliance) | — | 140 |
| Race conditions · concurrency | 80 | — | — | — | 80 |
| Network adversarial | 80 | 80 | — | — | 160 |
| State corruption | 120 | — | 60 (config drift) | — | 180 |
| Internationalization | — | 80 | 50 (time/locale) | — | 130 |
| Performance under load | — | 80 | — | — | 80 |
| Browser diversity | — | 80 | — | — | 80 |
| Privacy mode | — | 50 | — | — | 50 |
| Form validation | — | 70 | 60 | — | 130 |
| UI state corruption | — | 80 | — | — | 80 |
| Resource exhaustion | — | 80 | — | — | 80 |
| Accessibility | — | — | 60 | — | 60 |
| Recovery + resilience | — | — | 60 | — | 60 |
| Multi-user + collaboration | — | — | 40 | — | 40 |
| Compliance + audit | — | — | 40 | — | 40 |
| Deployment + ops | — | — | 50 | — | 50 |
| Primitives (component contracts) | — | — | — | 90 | 90 |
| Cross-component integration | — | — | — | 90 | 90 |
| Design + behavior uniformity | — | — | — | 110 | 110 |
| End-user use cases | — | — | — | 140 | 140 |
| **Author journeys** | — | — | — | 140 | 140 |
| **Total** | **~900** | **~640** | **~410** | **~570** | **~2,544** |

### What's NOT covered (intentionally deferred)

- **Vendor SDK internals** — we test that the embed loads, not Tableau/Qlik/Looker internal rendering
- **Databricks workspace operations** — DAB deploys, cluster lifecycle, Unity Catalog setup
- **AAD tenant administration** — app registration, secret rotation
- **Network infrastructure** — firewall rules, NSGs, ingress controllers
- **Public OSS readiness** — license, SBOM signing, conformance harness (see `PUBLIC_OSS_AGENDA.md`)

---

## How to execute

### Parallel execution buckets

Codex (or any runner) should process the four files independently:

| File | Recommended parallelism | Why |
|---|---|---|
| `01_adversarial.md` | High (10-50 workers) | Read-only probes mostly; safe to fan out |
| `02_complex_edge.md` | Medium (4-8 workers) | Some need real browser/network constraints |
| `03_routine_complex.md` | Low (1-2 workers) | Many require sequential state setup |
| `04_functional_integrity.md` | Mixed — split FUNC-PRIM/UNI to high (cheap inspect/grep), FUNC-INT/UC to low (full E2E flows) | Component contracts and uniformity rules are static checks; integration + use cases need wired-up app |

### Per-scenario execution

For each scenario row:

1. **Read** the ID, attack vector / edge condition, action, expected behavior, severity
2. **Decide** whether prerequisites are met (live env, browser, credentials)
3. **Execute** the action in a clean state
4. **Verify** the expected secure / correct behavior
5. **Record** the result: `PASS · FAIL · SKIPPED · N/A`
6. **Capture evidence** — for FAIL/Critical/High, always: screenshot + network log + console log + localStorage snapshot

### State reset rules

- **Adversarial file:** reset between sub-categories (e.g., before all SEC-INJ-* then between SEC-INJ and SEC-AUTH). Some attacks chain.
- **Edge file:** reset between scenarios where state could carry over (performance bloat, language drift).
- **Routine file:** reset between scenarios as default.

Reset script (browser DevTools console):
```javascript
localStorage.clear();
sessionStorage.clear();
indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
location.reload();
```

---

## Acceptance bar

This is a tiered plan, not a binary pass/fail. Use these tiers in the final report:

| Tier | Definition | Action |
|---|---|---|
| **Diamond** | 100% Critical PASS + ≥ 95% High PASS + ≥ 90% Medium PASS | Ship with confidence; mention in release notes |
| **Gold** | 100% Critical PASS + ≥ 90% High PASS | Ship; track Medium failures as P2 |
| **Silver** | 100% Critical PASS + ≥ 80% High PASS | Ship with explicit risk register |
| **Bronze** | All Critical PASS, < 80% High PASS | Hold; fix High failures first |
| **Red** | Any Critical FAIL | Block release; war-room |

---

## Result file format

```markdown
# PulsePlay extreme E2E results — <YYYY-MM-DD-HHMM>

## Summary
| File | Total | PASS | FAIL | SKIPPED | N/A | Critical FAIL | High FAIL |
|---|---:|---:|---:|---:|---:|---:|---:|
| 01_adversarial | 900 | XXX | XXX | XXX | XXX | XXX | XXX |
| 02_complex_edge | 640 | XXX | XXX | XXX | XXX | XXX | XXX |
| 03_routine_complex | 410 | XXX | XXX | XXX | XXX | XXX | XXX |
| 04_functional_integrity | 574 | XXX | XXX | XXX | XXX | XXX | XXX |
| **TOTAL** | **2544** | **XXX** | **XXX** | **XXX** | **XXX** | **XXX** | **XXX** |

**Tier achieved:** Diamond / Gold / Silver / Bronze / Red

## Critical failures (with full evidence)
### <ID>: <one-line summary>
- Severity: Critical
- Attack vector / Edge: <from plan>
- Action taken: <verbatim>
- Observed: <what happened>
- Expected: <from plan>
- Evidence: <screenshot path + network log excerpt + console log + localStorage state>
- Suggested action: <fix in <file>:<line> OR open issue <title>>

## High failures (clustered)
### <Cluster name>
- Affected IDs: SEC-INJ-005, SEC-INJ-014, ...
- Pattern: <one-liner>
- Suggested action: <one fix addresses cluster>

## Skipped (with reasons)
| Reason | Count | Sample IDs |
|---|---:|---|
| No live Databricks workspace | XXX | LIVE-* |
| No AAD tenant credential | XXX | SEC-AUTH-* |
| Requires browser not in lab | XXX | EDGE-BROWSER-* |
| Manual visual judgment required | XXX | A11Y-* |

## Notable observations
- <findings that weren't scenarios but matter>

## Environment
- Date: <UTC>
- Duration: HH:MM:SS
- Git HEAD: <hash>
- Proxy: <version, profiles, allowlist state>
- Dev server: <URL, version>
- Browsers tested: <list>
- AAD tenant: <yes/no>
- Databricks workspace: <hostname>
- Test runner: <Codex / Playwright / human + Codex hybrid>
```

---

## Maintenance

- Add new scenarios as feature ships; never delete a failing scenario without explicit decision
- Rotate severity if real-world impact changes (e.g., a Critical XSS becomes Medium after fix lands)
- Mark scenarios as DEPRECATED when the underlying feature is removed; don't delete (keeps the history)
- The catalog files can grow; review yearly for relevance
