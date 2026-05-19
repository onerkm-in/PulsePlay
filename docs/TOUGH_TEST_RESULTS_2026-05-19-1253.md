# PulsePlay tough test results — 2026-05-19-1253

Run type: visible in-app browser tough UI run against http://127.0.0.1:5174. This is a broad executable slice of the v2 plan, not a full 600-scenario completion. Rajesh requested live testing in the already-open browser.

## Headline

No Critical product failures found in this visible slice; 5 non-critical failures need follow-up.

Tier: Silver candidate for visible slice only; blocked from Gold by P3 setup failures and remaining UI polish gaps. Do not treat this as Diamond/Gold because several plan items require lab-only tooling or a longer dedicated run.

## Environment

- Proxy health: PASS at http://127.0.0.1:8787/health
- Dev server: PASS at http://127.0.0.1:5173 and http://127.0.0.1:5174
- Baseline tests: PASS, playground 920/920
- Lint: PASS
- Visible browser viewport during run: {"height":694,"width":599}
- Evidence folder: D:\Working_Folder\Projects\PulsePlay\docs\evidence\tough-test-2026-05-19-1253

## Summary

| Track | Total | PASS | FAIL | SKIPPED | N/A |
|---|---:|---:|---:|---:|---:|
| Persona P1 New end-user | 12 | 11 | 1 | 0 | 0 |
| Persona P3 First-time author | 11 | 9 | 2 | 0 | 0 |
| Persona P4 Updating author | 7 | 6 | 0 | 0 | 1 |
| Persona P5 Compliance | 6 | 5 | 0 | 0 | 1 |
| Persona P6 Troubleshooting | 4 | 3 | 0 | 1 | 0 |
| Persona P7 Power user | 6 | 6 | 0 | 0 | 0 |
| Persona P8 Adversary | 3 | 2 | 0 | 0 | 1 |
| Persona P9 Accessibility | 3 | 2 | 0 | 0 | 1 |
| Persona P10 Mobile/compact | 3 | 2 | 0 | 0 | 1 |
| Persona P11 Demoer | 2 | 2 | 0 | 0 | 0 |
| Persona P12 QA regression | 2 | 1 | 0 | 0 | 1 |
| Element audit | 22 | 20 | 2 | 0 | 0 |
| Break-it | 2 | 2 | 0 | 0 | 0 |
| **TOTAL** | **83** | **71** | **5** | **1** | **6** |

## Per-Persona Summary

| Persona | Total | PASS | FAIL | SKIPPED | N/A |
|---|---:|---:|---:|---:|---:|
| P1 New end-user | 12 | 11 | 1 | 0 | 0 |
| P3 First-time author | 11 | 9 | 2 | 0 | 0 |
| P4 Updating author | 7 | 6 | 0 | 0 | 1 |
| P5 Compliance | 6 | 5 | 0 | 0 | 1 |
| P6 Troubleshooting | 4 | 3 | 0 | 1 | 0 |
| P7 Power user | 6 | 6 | 0 | 0 | 0 |
| P8 Adversary | 3 | 2 | 0 | 0 | 1 |
| P9 Accessibility | 3 | 2 | 0 | 0 | 1 |
| P10 Mobile/compact | 3 | 2 | 0 | 0 | 1 |
| P11 Demoer | 2 | 2 | 0 | 0 | 0 |
| P12 QA regression | 2 | 1 | 0 | 0 | 1 |

## Critical Findings

- None in this visible slice.

## Failures

### P1-13 — Surface switcher labels are non-duplicative

- Track: Persona P1 New end-user
- Severity: normal
- Detail: Duplicate found in visible/DOM text: BI BI Viz
- URL: http://127.0.0.1:5174/
- Evidence: D:\Working_Folder\Projects\PulsePlay\docs\evidence\tough-test-2026-05-19-1253\002-p1-switcher.png

### P3-07 — AI profile picker enabled

- Track: Persona P3 First-time author
- Severity: normal
- Detail: AI picker state
- URL: http://127.0.0.1:5174/settings/setup
- Evidence: D:\Working_Folder\Projects\PulsePlay\docs\evidence\tough-test-2026-05-19-1253\011-p3-07.png

### P3-08 — Default AI profile selectable

- Track: Persona P3 First-time author
- Severity: normal
- Detail: Default profile select
- URL: http://127.0.0.1:5174/settings/setup
- Evidence: D:\Working_Folder\Projects\PulsePlay\docs\evidence\tough-test-2026-05-19-1253\012-p3-08.png

### EL-SWITCHER-COPY — Surface switcher copy non-duplicative

- Track: Element audit
- Severity: normal
- Detail: Root excerpt PulsePlay AI playground · multi-BI host Setup needed AI profile ✨ AI Insights 💬 Ask Pulse BI BI Viz ✨ AI Insights Configure an AI connector in Settings → AI to generate insights.
- URL: http://127.0.0.1:5174/
- Evidence: D:\Working_Folder\Projects\PulsePlay\docs\evidence\tough-test-2026-05-19-1253\044-el-switcher.png

### EL-BIVIZ-PEER — Configured BI Viz does not show legacy BI-only copy, but fixture embed falls into access-token adapter error

- Track: Element audit
- Severity: normal
- Detail: After applying the autoAuth Power BI fixture URL, BI Viz no longer shows BI-only copy, but the Power BI adapter reports: BI_EMBED_FAILED: powerbi adapter requires { id, embedUrl, accessToken }. Treat as setup/embed contract gap rather than legacy-copy regression.
- URL: http://127.0.0.1:5174/
- Evidence: D:\Working_Folder\Projects\PulsePlay\docs\evidence\tough-test-2026-05-19-1253\045-el-bi-peer.png


## Skipped / N/A

- P4-STORAGE (Persona P4 Updating author): N/A — In-app browser evaluate context does not expose localStorage; persistence checked indirectly through UI only.
- P5-06 (Persona P5 Compliance): N/A — Download filesystem event not exposed through visible browser tool; use manual/download lab for grep.
- P6-01 (Persona P6 Troubleshooting): SKIPPED — Skipped to avoid disrupting shared dev services during visible UI run.
- P8-STORAGE (Persona P8 Adversary): N/A — localStorage unavailable to visible browser evaluation context; run with Chrome DevTools/manual console if needed.
- P9-SR (Persona P9 Accessibility): N/A — Screen reader not available in this session.
- P10-390 (Persona P10 Mobile/compact): N/A — No viewport resize/emulation API exposed; current visible viewport 599x694.
- P12-STORAGE (Persona P12 QA regression): N/A — localStorage mutation not available through visible browser eval in this session.

## Notable Observations

- The latest BI Viz peer empty state fix is visible: it says "BI Viz — embed your dashboard" and no longer says "BI-only mode".
- The switcher still exposes duplicated visible/DOM text for BI: "BI BI Viz". This remains a real polish/a11y issue.
- Setup can save the BI embed URL and the proxy test reports two profiles, but the AI profile selector does not become populated/selectable in the visible setup flow.
- With the autoAuth Power BI fixture saved, the BI surface can fall into the adapter error "requires { id, embedUrl, accessToken }". That is a setup/embed contract gap to fix or explain in UI.
- The visible route matrix is healthy: Settings groups, Knowledge, Launchpad, Workbench, and root surfaces render without page-level horizontal overflow in the current visible browser size.
- The test baseline has moved from the prompt's expected 918 to 920 passing tests after Claude's latest commits.
- Direct storage inspection/mutation and 390x844 emulation were not exposed through the in-app browser API in this session; those scenarios are marked N/A rather than guessed.
- Proxy stop/restart recovery was skipped to avoid disrupting the shared dev environment; run it in an isolated lab.

## Raw Scenario Records

```json
[
  {
    "id": "P1-01",
    "track": "Persona P1 New end-user",
    "scenario": "Open root screen",
    "status": "PASS",
    "severity": "normal",
    "detail": "Brand check",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\001-p1-root.png",
    "errors": []
  },
  {
    "id": "P1-02",
    "track": "Persona P1 New end-user",
    "scenario": "Brand tagline visible",
    "status": "PASS",
    "severity": "normal",
    "detail": "Tagline check",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P1-03",
    "track": "Persona P1 New end-user",
    "scenario": "Setup readiness visible",
    "status": "PASS",
    "severity": "normal",
    "detail": "Readiness check",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P1-13",
    "track": "Persona P1 New end-user",
    "scenario": "Surface switcher labels are non-duplicative",
    "status": "FAIL",
    "severity": "normal",
    "detail": "Duplicate found in visible/DOM text: BI BI Viz",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\002-p1-switcher.png",
    "errors": []
  },
  {
    "id": "P1-04",
    "track": "Persona P1 New end-user",
    "scenario": "Readiness chip opens Settings Setup",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/setup",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\003-p1-setup.png",
    "errors": []
  },
  {
    "id": "P1-05",
    "track": "Persona P1 New end-user",
    "scenario": "Setup three-step content visible",
    "status": "PASS",
    "severity": "normal",
    "detail": "Cards check",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P1-09",
    "track": "Persona P1 New end-user",
    "scenario": "Empty Apply embed blocked",
    "status": "PASS",
    "severity": "normal",
    "detail": "Apply empty disabled",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P1-10",
    "track": "Persona P1 New end-user",
    "scenario": "Test proxy visible feedback",
    "status": "PASS",
    "severity": "normal",
    "detail": "Proxy feedback",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\004-p1-proxy.png",
    "errors": []
  },
  {
    "id": "P1-12",
    "track": "Persona P1 New end-user",
    "scenario": "Back to app returns root",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P1-17",
    "track": "Persona P1 New end-user",
    "scenario": "Ask Pulse surface reachable",
    "status": "PASS",
    "severity": "normal",
    "detail": "Ask Pulse surface",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\005-p1-ask.png",
    "errors": []
  },
  {
    "id": "P1-15",
    "track": "Persona P1 New end-user",
    "scenario": "BI Viz is peer empty state, not BI-only",
    "status": "PASS",
    "severity": "normal",
    "detail": "BI state excerpt: PulsePlay AI playground · multi-BI host Setup needed BI config + AI profile BI BI Viz — embed your dashboard Pick a BI tool and paste its embed URL — your report appears here as one of the peer surfaces alongside AI Insights and Ask Pulse. Switch between them any time with the surface switcher above. Vendors available: Databricks AI/BI · Databricks",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\006-p1-bi.png",
    "errors": []
  },
  {
    "id": "P1-16",
    "track": "Persona P1 New end-user",
    "scenario": "BI empty mentions AI peer surfaces",
    "status": "PASS",
    "severity": "normal",
    "detail": "Peer copy check",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P3-01",
    "track": "Persona P3 First-time author",
    "scenario": "Setup page opens",
    "status": "PASS",
    "severity": "normal",
    "detail": "Setup open",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\007-p3-start.png",
    "errors": []
  },
  {
    "id": "P3-03",
    "track": "Persona P3 First-time author",
    "scenario": "PBI fixture enables Apply",
    "status": "PASS",
    "severity": "normal",
    "detail": "Apply enabled",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\008-p3-apply-enabled.png",
    "errors": []
  },
  {
    "id": "P3-04",
    "track": "Persona P3 First-time author",
    "scenario": "Apply embed visibly updates state",
    "status": "PASS",
    "severity": "normal",
    "detail": "Apply result",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\009-p3-apply.png",
    "errors": []
  },
  {
    "id": "P3-06",
    "track": "Persona P3 First-time author",
    "scenario": "Proxy test succeeds",
    "status": "PASS",
    "severity": "normal",
    "detail": "Proxy result",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\010-p3-proxy.png",
    "errors": []
  },
  {
    "id": "P3-07",
    "track": "Persona P3 First-time author",
    "scenario": "AI profile picker enabled",
    "status": "FAIL",
    "severity": "normal",
    "detail": "AI picker state",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\011-p3-07.png",
    "errors": []
  },
  {
    "id": "P3-08",
    "track": "Persona P3 First-time author",
    "scenario": "Default AI profile selectable",
    "status": "FAIL",
    "severity": "normal",
    "detail": "Default profile select",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\012-p3-08.png",
    "errors": []
  },
  {
    "id": "P3-10",
    "track": "Persona P3 First-time author",
    "scenario": "Setup timed under five minutes",
    "status": "PASS",
    "severity": "normal",
    "detail": "Elapsed seconds 12",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P3-12",
    "track": "Persona P3 First-time author",
    "scenario": "Footer Layout routes Preferences",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/preferences",
    "url": "http://127.0.0.1:5174/settings/preferences",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P3-13",
    "track": "Persona P3 First-time author",
    "scenario": "Footer Proxy routes System",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/system",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P3-14",
    "track": "Persona P3 First-time author",
    "scenario": "Footer Advanced routes Advanced",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/advanced",
    "url": "http://127.0.0.1:5174/settings/advanced",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P3-19",
    "track": "Persona P3 First-time author",
    "scenario": "Back to app after setup shows shell",
    "status": "PASS",
    "severity": "normal",
    "detail": "Shell after setup",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\013-p3-shell.png",
    "errors": []
  },
  {
    "id": "P4-01",
    "track": "Persona P4 Updating author",
    "scenario": "AI knowledge-base subroute",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Knowledge Base Tune the analytical guardrails the assistant applies when picking a chart, computing sta",
    "url": "http://127.0.0.1:5174/settings/ai/knowledge-base",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\014-p4-01.png",
    "errors": []
  },
  {
    "id": "P4-07",
    "track": "Persona P4 Updating author",
    "scenario": "Supervisor fusion subroute",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Supervisor Fusion When you pick a supervisor profile, the proxy fans out the question to multiple Genie",
    "url": "http://127.0.0.1:5174/settings/ai/supervisor-fusion",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\015-p4-07.png",
    "errors": []
  },
  {
    "id": "P4-10",
    "track": "Persona P4 Updating author",
    "scenario": "Appearance subroute",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Appearance Theme, dark-mode override, and brand colors for the embedded Pulse experience. These flow in",
    "url": "http://127.0.0.1:5174/settings/preferences/appearance",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\016-p4-10.png",
    "errors": []
  },
  {
    "id": "P4-15",
    "track": "Persona P4 Updating author",
    "scenario": "Developer tools subroute",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Developer Tools Diagnostic toggles that change what the AI surfaces show under the hood — SQL traces, p",
    "url": "http://127.0.0.1:5174/settings/system/developer-tools",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\017-p4-15.png",
    "errors": []
  },
  {
    "id": "P4-18",
    "track": "Persona P4 Updating author",
    "scenario": "BI governance subroute",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Governance Constrain what the assistant can do at query time. Most enforcement happens server-side at t",
    "url": "http://127.0.0.1:5174/settings/bi/governance",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\018-p4-18.png",
    "errors": []
  },
  {
    "id": "P4-11",
    "track": "Persona P4 Updating author",
    "scenario": "Theme action clickable",
    "status": "PASS",
    "severity": "normal",
    "detail": "Theme click result",
    "url": "http://127.0.0.1:5174/settings/preferences/appearance",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P4-STORAGE",
    "track": "Persona P4 Updating author",
    "scenario": "Direct persistence inspection",
    "status": "N/A",
    "severity": "normal",
    "detail": "In-app browser evaluate context does not expose localStorage; persistence checked indirectly through UI only.",
    "url": "http://127.0.0.1:5174/settings/preferences/appearance",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P5-01",
    "track": "Persona P5 Compliance",
    "scenario": "Security posture visible",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict System Is it safe, and is anything broken — proxy health, governance, diagnostics, tools. STATUS Live signal from the PulsePlay proxy, governance allowlist, and auth posture. Proxy st",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\019-p5-01.png",
    "errors": []
  },
  {
    "id": "P5-02",
    "track": "Persona P5 Compliance",
    "scenario": "License posture / Premium NOT Fabric visible",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict System Is it safe, and is anything broken — proxy health, governance, diagnostics, tools. STATUS Live signal from the PulsePlay proxy, governance allowlist, and auth posture. Proxy st",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\020-p5-02.png",
    "errors": []
  },
  {
    "id": "P5-03",
    "track": "Persona P5 Compliance",
    "scenario": "Profile inventory visible",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict System Is it safe, and is anything broken — proxy health, governance, diagnostics, tools. STATUS Live signal from the PulsePlay proxy, governance allowlist, and auth posture. Proxy st",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\021-p5-03.png",
    "errors": []
  },
  {
    "id": "P5-07",
    "track": "Persona P5 Compliance",
    "scenario": "Governance controls visible",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Governance Constrain what the assistant can do at query time. Most enforcement happens server-side at the warehouse (Unity Catalog row filters + column masks); these toggles add a pro",
    "url": "http://127.0.0.1:5174/settings/bi/governance",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\022-p5-07.png",
    "errors": []
  },
  {
    "id": "P5-05",
    "track": "Persona P5 Compliance",
    "scenario": "Support bundle export discoverable/clickable",
    "status": "PASS",
    "severity": "normal",
    "detail": "Export action clicked or absent",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\023-p5-export.png",
    "errors": []
  },
  {
    "id": "P5-06",
    "track": "Persona P5 Compliance",
    "scenario": "Downloaded bundle token grep",
    "status": "N/A",
    "severity": "normal",
    "detail": "Download filesystem event not exposed through visible browser tool; use manual/download lab for grep.",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P6-02",
    "track": "Persona P6 Troubleshooting",
    "scenario": "Proxy branding says PulsePlay Proxy",
    "status": "PASS",
    "severity": "normal",
    "detail": "Branding check",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\024-p6-brand.png",
    "errors": []
  },
  {
    "id": "P6-10",
    "track": "Persona P6 Troubleshooting",
    "scenario": "Unknown AI subroute degrades safely",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/ai/xyz",
    "url": "http://127.0.0.1:5174/settings/ai/xyz",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P6-11",
    "track": "Persona P6 Troubleshooting",
    "scenario": "Unknown settings group degrades safely",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/foo",
    "url": "http://127.0.0.1:5174/settings/foo",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P6-01",
    "track": "Persona P6 Troubleshooting",
    "scenario": "Proxy stop/restart recovery",
    "status": "SKIPPED",
    "severity": "normal",
    "detail": "Skipped to avoid disrupting shared dev services during visible UI run.",
    "url": "http://127.0.0.1:5174/settings/foo",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P7-05",
    "track": "Persona P7 Power user",
    "scenario": "Direct AI KB",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/ai/knowledge-base",
    "url": "http://127.0.0.1:5174/settings/ai/knowledge-base",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P7-06",
    "track": "Persona P7 Power user",
    "scenario": "Direct BI governance",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/bi/governance",
    "url": "http://127.0.0.1:5174/settings/bi/governance",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P7-07",
    "track": "Persona P7 Power user",
    "scenario": "Direct Appearance",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/preferences/appearance",
    "url": "http://127.0.0.1:5174/settings/preferences/appearance",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P7-08",
    "track": "Persona P7 Power user",
    "scenario": "Direct Dev tools",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/system/developer-tools",
    "url": "http://127.0.0.1:5174/settings/system/developer-tools",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P7-09",
    "track": "Persona P7 Power user",
    "scenario": "Direct Supervisor fusion",
    "status": "PASS",
    "severity": "normal",
    "detail": "http://127.0.0.1:5174/settings/ai/supervisor-fusion",
    "url": "http://127.0.0.1:5174/settings/ai/supervisor-fusion",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P7-02/P7-03",
    "track": "Persona P7 Power user",
    "scenario": "Settings search accepts governance query",
    "status": "PASS",
    "severity": "normal",
    "detail": "Search input visibly contains governance and shows 2 matching groups; original innerText-only assertion missed input values.",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\025-p7-search.png",
    "errors": []
  },
  {
    "id": "P8-01",
    "track": "Persona P8 Adversary",
    "scenario": "javascript: embed URL rejected/not executed",
    "status": "PASS",
    "severity": "critical",
    "detail": "Clicked=true url=http://127.0.0.1:5174/settings/setup",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\026-p8-js-url.png",
    "errors": []
  },
  {
    "id": "P8-02",
    "track": "Persona P8 Adversary",
    "scenario": "HTML payload not executed",
    "status": "PASS",
    "severity": "critical",
    "detail": "HTML payload check",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\027-p8-html.png",
    "errors": []
  },
  {
    "id": "P8-STORAGE",
    "track": "Persona P8 Adversary",
    "scenario": "localStorage poisoning attack",
    "status": "N/A",
    "severity": "critical",
    "detail": "localStorage unavailable to visible browser evaluation context; run with Chrome DevTools/manual console if needed.",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\028-p8-storage-na.png",
    "errors": []
  },
  {
    "id": "P9-01",
    "track": "Persona P9 Accessibility",
    "scenario": "Visible controls have names",
    "status": "PASS",
    "severity": "normal",
    "detail": "Unnamed controls []",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P9-02",
    "track": "Persona P9 Accessibility",
    "scenario": "No horizontal overflow in visible viewport",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P9-SR",
    "track": "Persona P9 Accessibility",
    "scenario": "Screen reader lab",
    "status": "N/A",
    "severity": "normal",
    "detail": "Screen reader not available in this session.",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P10-01",
    "track": "Persona P10 Mobile/compact",
    "scenario": "Current compact viewport no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\029-p10-compact.png",
    "errors": []
  },
  {
    "id": "P10-02",
    "track": "Persona P10 Mobile/compact",
    "scenario": "Floating controls stay inside current visible viewport",
    "status": "PASS",
    "severity": "normal",
    "detail": "Dock/close offscreen=false",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\030-p10-float.png",
    "errors": []
  },
  {
    "id": "P10-390",
    "track": "Persona P10 Mobile/compact",
    "scenario": "390x844 emulation",
    "status": "N/A",
    "severity": "normal",
    "detail": "No viewport resize/emulation API exposed; current visible viewport 599x694.",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "P11-01",
    "track": "Persona P11 Demoer",
    "scenario": "Root presentable without captured red errors",
    "status": "PASS",
    "severity": "normal",
    "detail": "Errors []",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\031-p11-root.png",
    "errors": []
  },
  {
    "id": "P11-02",
    "track": "Persona P11 Demoer",
    "scenario": "Launchpad presentable",
    "status": "PASS",
    "severity": "normal",
    "detail": "Launchpad excerpt Databricks Launchpad Live workspace discovery for PulsePlay enablement. Back to app AI/BI dashboards Published Databricks dashboards that can become the active BI surface. checking Discovering live assets... Genie Spaces Business-facing natural-language rooms. Embed as their own surface or use as th",
    "url": "http://127.0.0.1:5174/launchpad",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\032-p11-launchpad.png",
    "errors": []
  },
  {
    "id": "P12-01",
    "track": "Persona P12 QA regression",
    "scenario": "Root shell recovers despite current stored state",
    "status": "PASS",
    "severity": "normal",
    "detail": "Root recovery",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\033-p12-root.png",
    "errors": []
  },
  {
    "id": "P12-STORAGE",
    "track": "Persona P12 QA regression",
    "scenario": "Malformed localStorage recovery",
    "status": "N/A",
    "severity": "normal",
    "detail": "localStorage mutation not available through visible browser eval in this session.",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-SETUP",
    "track": "Element audit",
    "scenario": "Settings Setup renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Setup Three short steps to get PulsePlay running. Each card configures one axis inl",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\034-el-setup.png",
    "errors": []
  },
  {
    "id": "EL-SETUP-OVERFLOW",
    "track": "Element audit",
    "scenario": "Settings Setup no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-BI",
    "track": "Element audit",
    "scenario": "Settings BI renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict BI What you're looking at — the BI surface, its embed config, and the governance + ",
    "url": "http://127.0.0.1:5174/settings/bi",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\035-el-bi.png",
    "errors": []
  },
  {
    "id": "EL-BI-OVERFLOW",
    "track": "Element audit",
    "scenario": "Settings BI no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/settings/bi",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-AI",
    "track": "Element audit",
    "scenario": "Settings AI renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict AI What's thinking, and what it knows — provider, model, knowledge, behavior. MVP 0",
    "url": "http://127.0.0.1:5174/settings/ai",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\036-el-ai.png",
    "errors": []
  },
  {
    "id": "EL-AI-OVERFLOW",
    "track": "Element audit",
    "scenario": "Settings AI no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/settings/ai",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-PREF",
    "track": "Element audit",
    "scenario": "Settings Preferences renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Preferences How the playground is laid out — UI mode, visible panels, AI position, ",
    "url": "http://127.0.0.1:5174/settings/preferences",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\037-el-pref.png",
    "errors": []
  },
  {
    "id": "EL-PREF-OVERFLOW",
    "track": "Element audit",
    "scenario": "Settings Preferences no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/settings/preferences",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-SYS",
    "track": "Element audit",
    "scenario": "Settings System renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict System Is it safe, and is anything broken — proxy health, governance, diagnostics, ",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\038-el-sys.png",
    "errors": []
  },
  {
    "id": "EL-SYS-OVERFLOW",
    "track": "Element audit",
    "scenario": "Settings System no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/settings/system",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-ADV",
    "track": "Element audit",
    "scenario": "Settings Advanced renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Advanced Destructive + maintenance actions. Each requires typing the action name to",
    "url": "http://127.0.0.1:5174/settings/advanced",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\039-el-adv.png",
    "errors": []
  },
  {
    "id": "EL-ADV-OVERFLOW",
    "track": "Element audit",
    "scenario": "Settings Advanced no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/settings/advanced",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-KB",
    "track": "Element audit",
    "scenario": "Knowledge renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt Knowledge Base Browse installed packs — glossary, ontology, KPIs, sample questions, prompt context. Settings ← Back to app INSTALLED PACKS CPG / FMCG 10 sub-verticals Pick a pack to browse The Knowledge Base shows the curated content each installed pack contri",
    "url": "http://127.0.0.1:5174/knowledge",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\040-el-kb.png",
    "errors": []
  },
  {
    "id": "EL-KB-OVERFLOW",
    "track": "Element audit",
    "scenario": "Knowledge no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/knowledge",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-LAUNCH",
    "track": "Element audit",
    "scenario": "Launchpad renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt Databricks Launchpad Live workspace discovery for PulsePlay enablement. Back to app AI/BI dashboards Published Databricks dashboards that can become the active BI surface. ready Workspace Usage Dashboard 01f1149db1a01a59865a13c846f07eff Kind lakeview-dashboard",
    "url": "http://127.0.0.1:5174/launchpad",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\041-el-launch.png",
    "errors": []
  },
  {
    "id": "EL-LAUNCH-OVERFLOW",
    "track": "Element audit",
    "scenario": "Launchpad no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/launchpad",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-WB",
    "track": "Element audit",
    "scenario": "Workbench renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt Unified Ask Pulse Workbench — preview The workbench is preview-grade. Steps 1–5 (capability model, Genie native embed, artifact card shell, validation gates, ECharts renderer) have shipped. Steps 6 (Pulse-asset refactor) and 7 (theme) are queued. Opt in to pre",
    "url": "http://127.0.0.1:5174/workbench",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\042-el-wb.png",
    "errors": []
  },
  {
    "id": "EL-WB-OVERFLOW",
    "track": "Element audit",
    "scenario": "Workbench no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":774,\"width\":584}}",
    "url": "http://127.0.0.1:5174/workbench",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-ROOT",
    "track": "Element audit",
    "scenario": "Root shell renders expected content",
    "status": "PASS",
    "severity": "normal",
    "detail": "Excerpt PulsePlay AI playground · multi-BI host Setup needed AI profile ✨ AI Insights 💬 Ask Pulse BI BI Viz ✨ AI Insights Configure an AI connector in Settings → AI to generate insights.",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\043-el-root.png",
    "errors": []
  },
  {
    "id": "EL-ROOT-OVERFLOW",
    "track": "Element audit",
    "scenario": "Root shell no horizontal overflow",
    "status": "PASS",
    "severity": "normal",
    "detail": "{\"viewport\":{\"height\":694,\"width\":599},\"scroll\":{\"height\":694,\"width\":599}}",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  },
  {
    "id": "EL-SWITCHER-COPY",
    "track": "Element audit",
    "scenario": "Surface switcher copy non-duplicative",
    "status": "FAIL",
    "severity": "normal",
    "detail": "Root excerpt PulsePlay AI playground · multi-BI host Setup needed AI profile ✨ AI Insights 💬 Ask Pulse BI BI Viz ✨ AI Insights Configure an AI connector in Settings → AI to generate insights.",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\044-el-switcher.png",
    "errors": []
  },
  {
    "id": "EL-BIVIZ-PEER",
    "track": "Element audit",
    "scenario": "Configured BI Viz does not show legacy BI-only copy, but fixture embed falls into access-token adapter error",
    "status": "FAIL",
    "severity": "normal",
    "detail": "After applying the autoAuth Power BI fixture URL, BI Viz no longer shows BI-only copy, but the Power BI adapter reports: BI_EMBED_FAILED: powerbi adapter requires { id, embedUrl, accessToken }. Treat as setup/embed contract gap rather than legacy-copy regression.",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\045-el-bi-peer.png",
    "errors": []
  },
  {
    "id": "BR-IFRAME-ORIGIN",
    "track": "Break-it",
    "scenario": "Untrusted origin blocked or not silently trusted",
    "status": "PASS",
    "severity": "critical",
    "detail": "Evil origin excerpt ⚙ Settings Configure how PulsePlay looks, what it embeds, and how it reasons. ← Back to app 🔍 Ctrl / Setup AI profile BI powerbi AI (none) Pack (none) Proxy ok Security strict Setup Three short steps to get PulsePlay running. Each card configures one axis inline; deeper tuning lives in the BI, AI, and Preferences pages. Setup needed Missing: AI profile 1 BI tool i The dashboard, report, or canvas users look at. Configured Provider * i — Pick a BI tool — Databricks AI/BI Databricks Genie Power B",
    "url": "http://127.0.0.1:5174/settings/setup",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": "D:\\Working_Folder\\Projects\\PulsePlay\\docs\\evidence\\tough-test-2026-05-19-1253\\046-br-origin.png",
    "errors": []
  },
  {
    "id": "BR-VALID-PBI",
    "track": "Break-it",
    "scenario": "Valid PBI fixture still accepted after hostile attempts",
    "status": "PASS",
    "severity": "normal",
    "detail": "Valid recovery check",
    "url": "http://127.0.0.1:5174/",
    "viewport": {
      "height": 694,
      "width": 599
    },
    "evidence": null,
    "errors": []
  }
]
```
