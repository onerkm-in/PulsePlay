# 10-Minute Author Setup

> Product target: a novice report author can get the first production cell, Databricks Genie + Power BI, working in about 10 minutes when org prerequisites are already provisioned.

## Position

The 10-minute target is intentionally aggressive. It is not realistic if the author must create Azure app registrations, service principals, workspace permissions, Databricks tokens, Genie spaces, or production proxy config from scratch.

It is realistic if PulsePlay treats setup as an assisted path:

- The platform team pre-provisions auth, proxy profiles, and allowed embed origins.
- The author brings a Power BI report URL or workspace/report IDs.
- The author chooses or enters a Genie profile.
- PulsePlay probes Power BI and Genie, asks the AI for a bounded setup proposal, then lets the author confirm.

The experience should feel like: **connect, let AI inspect, review, apply, smoke-test.**

## Non-Negotiables

- **Novice-first.** Use everyday labels, defaults, validation, and recovery actions. Avoid making the author understand embed-token vocabulary unless they open advanced mode.
- **AI-assisted, not AI-owned.** Genie/probe responses can draft pack choice, KPI mapping, sample questions, and filter mappings. The author confirms before anything is saved or pushed.
- **One path first.** The first guided path is Genie + Power BI only. Other adapters can reuse the pattern later.
- **No secret leakage.** The browser never asks for service-principal secrets. Direct/manual token modes stay behind advanced/developer framing.
- **Explain every inference.** Every AI-generated setup choice needs a short `because` trace.
- **Fast failure.** If a prerequisite is missing, the wizard should say exactly what is missing and who usually owns it.

## 10-Minute Flow

### Minute 0-1: Preflight

PulsePlay checks:

- Proxy reachable.
- IdP/shared-key posture valid for this environment.
- Power BI auth mode available: secure embed quick preview for the first render, SSO/backend-issued token for SDK control, manual token advanced only.
- Active Genie profile exists or author can select one from profile list.

Output: green/amber/red preflight summary.

### Minute 1-3: Connect Power BI

Novice path:

- Author pastes the Power BI portal's secure embed link or iframe to get an immediate authenticated preview.
- If the author needs AI-applied filters, page navigation, or richer event capture, they upgrade the same panel to AAD SSO or backend-issued embed-token mode.
- Report embeds.
- In SSO/backend mode, adapter captures `loaded`, current page, pages list, current filters, and report metadata where available.

Needed improvement:

- Parse common Power BI report URLs into `groupId` and `reportId`.
- Offer an inline "upgrade to SDK control" checklist when the author starts from secure embed mode.
- On `loaded`, call `getPages()` and `getFilters()` immediately, not only listen for future events.

### Minute 3-5: Connect Genie

Novice path:

- Author selects a Genie profile, defaulting to `default` if only one exists.
- Smart Connect runs `/assistant/probe`.
- Genie probe reads space metadata, sample questions, declared/observed schema, and pack inference signals.

Needed improvement:

- Surface profile choices and probe status in the first-run flow, not only inside lower-level settings.

### Minute 5-7: AI Drafts Setup

PulsePlay uses the probe result, Power BI context, and installed pack vocabulary to ask for a bounded setup proposal.

Inputs:

- Genie space description/instructions/sample questions from probe.
- Power BI page names, filters, and available field targets.
- Installed pack names/sub-verticals/KPI vocabularies.
- Existing author settings, if any.

Output shape:

```json
{
  "suggestedPack": "cpg-fmcg",
  "suggestedSubVertical": "supply-chain",
  "fieldMappings": [
    {
      "powerBiField": { "table": "FactOrders", "column": "Region" },
      "genieField": { "table": "orders", "column": "region" },
      "confidence": 0.84,
      "because": ["Both fields are named region", "Both appear in active report filters"]
    }
  ],
  "starterQuestions": [
    "Why did service level change this month?",
    "Which region has the largest margin risk?"
  ],
  "kpiCandidates": [
    {
      "name": "OTIF",
      "higherIsBetter": true,
      "because": ["Genie metadata mentions OTIF", "Pack supply-chain glossary contains OTIF"]
    }
  ],
  "warnings": [
    "Power BI RLS does not automatically flow to Genie unless identity alignment is configured."
  ]
}
```

This can be powered by deterministic matching first, then a single bounded AI call when confidence is low or the mapping needs explanation.

### Minute 7-9: Author Review

One review screen shows:

- Power BI report connected.
- Genie profile connected.
- Suggested pack/sub-vertical.
- Field/filter mapping confidence.
- Starter questions.
- Security posture and known limitations.

The author can accept all, edit mappings, change pack, or skip optional suggestions.

### Minute 9-10: Smoke Test

PulsePlay runs a short live smoke:

- Ask a context-aware Genie question.
- Confirm response arrives.
- Confirm current Power BI page/filter context is included when enabled.
- Optionally apply a safe test filter back to Power BI after author confirmation.

Output: `Ready`, `Ready with warnings`, or `Blocked`.

## "Use Genie To Set It Up" Safely

Genie can help set up PulsePlay in three safe ways:

1. **Explain the space.** Use Genie/probe metadata to summarize what the space knows.
2. **Draft configuration.** Ask for pack, KPI, starter-question, and field-mapping suggestions in strict JSON.
3. **Validate with a smoke question.** Ask a known-small question and verify a response shape, SQL trace, and context use.

Genie should not silently:

- Change upstream Genie space instructions.
- Persist new production settings.
- Push filters into Power BI.
- Claim RLS/OLS parity without evidence.

Any write-through path, including Genie space sync, needs explicit author confirmation.

## Prerequisites For The 10-Minute Promise

Platform team must provide:

- Running PulsePlay proxy.
- At least one configured Genie profile.
- Power BI report access for secure embed preview; Power BI SSO app registration or service-principal embed-token profile for SDK control.
- Approved CORS/CSP origins.
- Workspace/report permissions for the target author.
- A default pack list and at least one reference pack.

Author must provide:

- Power BI report link or workspace/report IDs.
- Which Genie profile to use, unless there is only one default.
- Confirmation of AI-suggested setup.

## Production Acceptance Criteria

The first build is not production-grade until this flow exists:

- A novice can complete setup without editing JSON files.
- Setup has a visible progress/checklist UI.
- All required fields validate inline with human-readable recovery.
- Power BI connection, Genie connection, pack inference, context bridge, and smoke test each have clear status.
- AI-generated setup suggestions are explainable and editable.
- The flow completes in about 10 minutes when prerequisites are ready.
- The flow produces a saved profile that can be reopened without rework.
- Known limitations are visible before the author publishes or shares the setup.
