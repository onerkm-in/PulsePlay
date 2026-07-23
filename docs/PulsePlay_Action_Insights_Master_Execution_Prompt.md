# Master Execution Prompt — PulsePlay “Action Insights” Decision Assist

> Use this as a single, self-contained prompt to investigate, complete, secure, and validate the PulsePlay Action Insights capability. Do not treat any claimed implementation status as true until it is verified in the live repository and runtime.

---

## 1. Role

You are the senior enterprise product strategist, Databricks AI/BI architect, security-minded full-stack engineer, Python engineering lead, and validation owner for **PulsePlay**, an existing React (Vite) + Node/Express-proxy BI+AI application.

You own the work end to end:

1. establish the factual current state;
2. identify gaps, defects, risks, and false assumptions;
3. implement the smallest safe changes needed;
4. validate every affected path with code, API, data, governance, and headed-browser evidence;
5. iteratively fix and re-test until each acceptance criterion is either proven or explicitly reported as blocked.

Do not provide a speculative design-only response. Work against the live application and its actual conventions.

---

## 2. Mission

Evolve and complete PulsePlay’s proactive, persona-based Decision Intelligence experience named **Action Insights** and internally referred to as **Decision Assist**.

PulsePlay must detect material business issues without waiting for the user to start a chat and must present a governed, structured decision prompt:

> “[KPI] is not looking good. The issue appears to be [root cause]. This is impacting [$X and N records]. Recommended fix: [action]. Do you want me to [trigger or prepare the action]?”

The user must never begin from an empty chat box. Chat or Genie may explain a detected issue, but they are not the entry point and do not determine whether an issue exists.

Action Insights is:

- proactive rather than query-led;
- persona-aware;
- deterministic at the detection and recommendation layers;
- human-governed at the action layer;
- fully auditable;
- embedded in the existing PulsePlay experience.

Action Insights is **not**:

- a generic chatbot;
- a standalone AI application;
- a replacement for PulsePlay;
- another passive dashboard;
- a custom-trained LLM;
- an autonomous execution system;
- permission to let an LLM detect, decide, approve, or modify business data.

---

## 3. Non-negotiable separation of powers

Enforce this boundary in architecture, code, permissions, tests, and UI:

### Rules detect

A deterministic, config-driven Python rules engine runs parameterized SQL against the approved source table. Business thresholds, mappings, confidence, personas, actions, and recommendation text live in governed configuration—not scattered through executable code.

### Governed configuration recommends

Recommendations and allowed action levels originate from the rule registry. Do not allow an LLM to invent a remediation, action level, or approval path.

### LLMs explain only

Databricks Genie or an approved Foundation Model may narrate existing rule-produced fields, answer “Explain more,” or summarize evidence. The LLM must never:

- detect the issue;
- determine severity or confidence;
- create the recommendation;
- execute an action;
- write or modify business data;
- approve a request;
- bypass policy or permissions;
- invent evidence.

Every Decision Prompt must remain fully renderable without an LLM call through a deterministic template. Any optional model narration must be grounded only in rule-produced fields, checked by the grounding verifier, and replaced by the deterministic fallback if verification fails.

### Humans approve

Use the action hierarchy:

- **L1 — Inform:** display information only.
- **L2 — Prepare:** generate and audit a proposed payload, but do not send or execute it.
- **L3 — Trigger with approval:** route through the existing human-in-the-loop gate and remain `pending-approval` until an authorized approver acts.
- **L4/L5 — Forbidden for this MVP:** reject at rule-load and runtime. Do not silently downgrade.

The approval lifecycle must support approve, modify, defer, and reject with rationale, plus a T+14 outcome where the existing model supports it.

### Everything audits

Audit every prompt fetch and action attempt, including permitted, denied, failed, modified, deferred, approved, and rejected actions. Persist the prompt lifecycle:

- `new`
- `pending-approval`
- `actioned`
- `snoozed`
- `rejected`

A rejection must be able to capture `false-positive` feedback.

---

## 4. Hard platform and data boundaries

These constraints are task boundaries, not suggestions.

### Approved data scope

All data work must target only:

`uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_sample_super_store`

Any new table must be created only in:

`uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai`

The Decision Prompt store is:

`uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_decision_prompts`

Do not query, alter, seed, backfill, or create data elsewhere.

The source is reported to contain 14 seeded exception-model fields:

`exception_type`, `severity`, `root_cause_category`, `business_impact_usd`, `persona`, `owner`, `recommended_action`, `action_type`, `rule_id`, `confidence`, `approval_required`, `action_status`, `sla_due_at`, and `feedback`.

The prompt store is expected to include the durable prompt identity, detection time, KPI and domain context, source reference, impact and affected-record values, issue/root-cause/evidence fields, recommendation and action fields, confidence, audit note, approval requirement, and lifecycle status. Verify the live schemas rather than creating or altering columns from this description alone.

### Approved Genie scope

All Action Insights screens and profiles must resolve to:

- Genie space: `01f12c6e979a1f35beef4bd5baf62dd9`
- SQL warehouse: `pep-snp-cdo-dev-eus-dbsql01`

Genie space instructions must steer answers to the approved source table. Do not substitute another space or warehouse because it appears convenient.

### Credentials and configuration

- Never hardcode tokens, secrets, endpoints, table names, warehouse IDs, or environment-specific profiles in implementation code.
- Resolve credentials from environment variables and then the supported Databricks configuration path.
- Use explicit configuration and existing repository conventions.
- Treat any Databricks `403` as an authentication or authorization fact to investigate, including token expiry; do not assume a product capability is unavailable.

### Change boundaries

- Preserve the existing PulsePlay interface and working behavior.
- Prefer minimal, additive, reversible changes.
- New proxy capability must follow the repository’s drop-in connector pattern; do not modify core server wiring unless live inspection proves the pattern cannot satisfy a mandatory requirement and you document why.
- Python decision logic belongs under `scripts/decision_assist/`.
- Preserve existing middleware, authorization, rate limiting, kill switch, audit, persona, and HITL facilities; reuse rather than duplicate them.
- Mount every Decision Assist route behind all applicable authentication and rate-limit middleware stacks.
- In the repository’s Spark SQL literal builder, use its verified escaping convention consistently. The reported convention is backslash escaping (`\'`) rather than doubled single quotes; confirm this against the live implementation and tests before changing it.

---

## 5. Target product experience

Action Insights must be the fourth peer surface:

**AI Insights · Ask Pulse · Action Insights ⚡ · Dashboard**

Register and validate it across:

- the typed surface registry;
- surface availability and profile resolution;
- desktop tab navigation;
- mobile bottom navigation;
- keyboard and accessibility navigation;
- deep links via `?surface=action-insights`.

The Action Insights surface must render the Decision Prompt stack as a full pane. Respect the existing PulseShell layout, the fixed 36 px footer, absolute pane-control icons, and all shell spacing conventions.

### Decision Prompt Card

Use one reusable card component and one stack. Required behavior:

- “NEEDS YOUR DECISION (N)” stack heading;
- “Viewing as” persona selector for demo use only;
- production authority derived from verified identity claims, never the demo selector;
- severity rail and severity chip;
- bold headline;
- issue statement;
- compact `WHY · FIX` scan line;
- right-aligned hero impact value using tabular numerals;
- impact caption in the form `est. impact · N records`;
- single-hue impact mini-bar scaled relative to the largest impact in the current stack;
- action question;
- one primary action, selected as the first eligible trigger-type action;
- ghost styling for secondary actions;
- muted metadata footer containing confidence, action level, `rule_id`, and owner;
- evidence drawer containing detection SQL, supporting samples, and audit note.

Confidence language is controlled by configuration:

- **High:** “The issue appears to be …” and may ask for approval.
- **Medium:** “The likely root cause is …” and must validate before action.
- **Low:** “A possible factor is …” and must remain investigation-only.

Required resilience:

- On a full Action Insights surface, loading, error with Retry, and empty states must be explicit and usable.
- In any legacy overlay mode, a fetch failure must fail safely and must not block the underlying screen.
- A failed action must show a visible error and preserve the card.
- An empty-but-reachable response should show a slim empty band rather than look broken.

---

## 6. Deterministic Decision Prompt architecture

The expected architecture is:

```text
Approved Delta source
  → parameterized deterministic SQL rules
  → typed 10-part DecisionPrompt
  → Delta prompt store
  → Decision Assist proxy connector
  → persona-filtered React stack/card
  → optional grounded explanation
  → governed HITL action path
  → durable status and audit
```

The Python engine under `scripts/decision_assist/` must provide:

- typed dataclass models;
- governed `rules.json`;
- detection CLI with `--selfcheck`, `--dry-run`, and `--persist`;
- parameterized SQL execution through the Databricks SQL Statement API;
- structured logging;
- explicit errors;
- per-rule failure isolation;
- stable content-hash `prompt_id` generation;
- duplicate suppression to control alert fatigue;
- rejection of L4/L5 actions when rules load.

The six governed MVP rule IDs are:

- `SC-OTIF-001`
- `SC-MARGIN-001`
- `SC-FILL-001`
- `SC-DISC-001`
- `SC-DOS-001`
- `SC-AGE-001`

Each rule must produce the complete 10-part Decision Prompt:

1. Status
2. Issue
3. Root Cause
4. Evidence, including detection SQL and samples
5. Business Impact in USD
6. Recommended Fix
7. Action Question
8. Action Buttons
9. Confidence
10. Audit Note

The serving layer is expected to expose:

- `GET /decision-assist/prompts?persona=...`
- `POST /decision-assist/prompts/:id/action`
- a Decision Assist health endpoint where the repository convention supports it.

The reported implementation uses:

- `proxy/connectors/decision-assist.js`
- `proxy/lib/decisionPromptStore.js`
- `proxy/lib/personaGate.js`
- `proxy/lib/hitlGate.js`
- the existing kill switch and audit facilities
- `playground/src/components/DecisionPromptCard.tsx`
- the typed surface registry and availability layer

Treat these as orientation pointers, not proof. Inspect the live tree, imports, middleware registration, tests, and runtime behavior before deciding that a component exists or works.

The reported default profile is `sc-latam-mvp02`, configurable through `PROXY_DECISION_ASSIST_PROFILE`. Confirm profile resolution and warehouse binding in the live environment. The reported local port convention is proxy `7000` and playground `7001`; verify and use the repository’s actual current scripts.

---

## 7. MVP scope

Keep the MVP deliberately narrow:

- proving domain: supply chain;
- personas:
  - `sc-planner` requests or prepares;
  - `operations-manager` approves and may hold `can_approve_hitl`;
- six governed rule-backed exception types;
- L1–L3 only;
- prepared payloads are audited but not delivered;
- no live email, Teams, ticketing, or downstream write integration;
- complete prompt, action, approval, feedback, and audit traceability.

The product architecture should remain domain-extensible through rule configuration, but do not broaden implementation scope during this task.

---

## 8. Known risks and reported defects to verify first

These are reported findings, not permission to assume the current code still has them. Reproduce each against the live implementation and test behavior.

### P0 — authorization and approval truth

#### ACT-02: possible HITL approval bypass

Reported behavior: the action endpoint may trust client-supplied `approvalRequired:false`, may not read `approval_required` and `action_level` from the stored prompt, and may therefore move an L3 prompt directly to `actioned`.

Required safe behavior:

- ignore client-supplied approval authority;
- fetch the stored prompt server-side;
- derive action level and approval requirement from trusted stored/configured data;
- route every stored L3 or `approval_required=true` action through `hitlGate`;
- never mark such an action `actioned` before approval;
- add negative tests proving a forged client flag cannot bypass HITL.

Fix this before feature expansion if reproduction confirms it.

#### SEC-01: possible client-selected persona authority

Reported behavior: visibility or action authority may derive from browser-supplied persona query/body values while the existing IdP-aware persona resolver is unused.

Required safe behavior:

- derive authorization from server-verified identity claims;
- treat the “Viewing as” selector as presentation-only;
- permit demo persona switching only behind an explicit non-production demo control;
- return `403` before any SQL mutation or action execution when the verified persona lacks `can_approve_hitl`;
- render view-only actions for unauthorized personas;
- add negative tests for forged persona values.

If the repository’s identity-model decision remains unresolved, do not invent it. Complete any independent safe fix, isolate the claim-dependent work, and document the exact decision and owner needed.

### Durability and operational gaps

Verify and record the current state of:

- in-memory HITL queue persistence and restart loss;
- absent notification/ticket adapters;
- on-demand-only detection and unverified Lakeflow job-create permission;
- any unapproved legacy-row backfill.

Never run a destructive or broad backfill without explicit authorization. The reported `--backfill-only` operation for legacy rows requires a separate user approval.

---

## 9. Mandatory execution method

Follow this loop for each feature or defect:

**Investigate → reproduce → design minimally → implement → test → inspect evidence → fix → re-test**

### Phase 0 — protect the workspace

1. Read repository instructions and relevant handover documents.
2. Inspect version-control status.
3. Preserve unrelated user changes.
4. If Git is unavailable or nonfunctional, make timestamped backups of every file before modifying it.
5. Record the baseline commands, ports, profiles, and known failures.

Do not claim a clean regression result if the baseline was already failing; distinguish inherited failures from introduced failures with evidence.

### Phase 1 — factual discovery

Inspect, do not infer:

- code structure and current components;
- route registration and middleware order;
- environment/config resolution;
- token validity;
- warehouse reachability;
- Unity Catalog read/write/create privileges within the approved schema;
- source-table columns and sample values;
- prompt-store schema and lifecycle fields;
- Genie space reachability and instructions;
- persona claim resolution;
- HITL behavior and queue persistence;
- audit behavior;
- current unit, integration, proxy, and UI test baselines;
- whether the six rules exist and render all ten parts.

Create an evidence-backed matrix with:

| Requirement | Current state | Evidence | Gap | Planned change | Risk |
|---|---|---|---|---|---|

Classify every item as:

- **Verified working**
- **Verified defective**
- **Missing**
- **Blocked**
- **Unverified**

Never convert “not tested” into “working.”

### Phase 2 — prove complex or uncertain changes

For a complex, security-sensitive, or capability-uncertain change:

1. inspect official product documentation or established repository patterns;
2. build the smallest focused proof where needed;
3. capture the proof result;
4. proceed only when the approach is supported by evidence.

Do not use blogs or generic patterns as stronger evidence than the live code, official documentation, and actual API behavior.

### Phase 3 — implement minimally

Prioritize in this order:

1. approval and authorization correctness;
2. data and prompt-store integrity;
3. audit completeness;
4. deterministic rules and prompt rendering;
5. proxy serving and error behavior;
6. UI integration and accessibility;
7. optional narration polish;
8. future enhancements.

Avoid refactoring unrelated code. Keep business logic in configuration. Use typed interfaces, explicit error handling, and existing conventions.

### Phase 4 — validate each layer

Run applicable checks:

- TypeScript type checking;
- Python compilation and self-check;
- JavaScript syntax checks;
- rule-loading tests;
- complete 10-part rendering tests;
- confidence-tier tests;
- deterministic/stable dedupe-ID tests;
- L4/L5 rejection tests;
- SQL escaping and parameterization tests;
- persona filtering and authority tests;
- forged persona and forged approval-flag negative tests;
- HITL transition tests;
- audit tests;
- prompt-store lifecycle tests;
- proxy connector unit and integration tests;
- complete proxy and UI suites;
- existing-surface regression tests.

Use the repository’s actual package scripts. Report exact counts from the current run rather than copying historical counts. Historical baselines reportedly included approximately 1,582 proxy tests and 1,965 UI tests; treat those only as comparison hints.

### Phase 5 — headed browser validation

Use a real headed browser at desktop and mobile widths. Capture screenshots for every required state and personally inspect each image rather than trusting automation labels.

Prove:

1. Action Insights opens from the desktop tab.
2. Action Insights opens from the mobile navigation.
3. `?surface=action-insights` deep-links correctly.
4. A proactive stack appears with no user typing.
5. Persona switching changes presentation as designed but cannot change authority.
6. Planner and operations-manager views show the correct cards and buttons.
7. The evidence drawer opens and shows SQL, samples, and audit note.
8. Impact values, record counts, confidence language, action level, owner, and severity render correctly.
9. A valid L3 trigger becomes “Sent for approval.”
10. The corresponding HITL queue entry and Delta status transition are verified independently.
11. A forged approval flag cannot bypass approval.
12. An unauthorized persona receives view-only controls and server-side `403` with zero action SQL executed.
13. Approve, modify, defer, and reject behave as supported by the current MVP.
14. Reject can capture false-positive feedback.
15. Empty, loading, error, Retry, and failed-action states are visible and non-destructive.
16. AI Insights, Ask Pulse, and Dashboard still work.
17. There are no unexpected console errors, page errors, unhandled exceptions, or API failures.
18. Layout respects the footer, pane controls, keyboard behavior, and mobile viewport.

For every screenshot, record:

- scenario;
- persona/claims;
- viewport;
- relevant prompt/rule ID;
- expected result;
- observed result;
- PASS/FAIL;
- screenshot path;
- defects found during visual review.

If a screenshot contradicts the automated verdict, the screenshot and runtime evidence win. Fix and repeat.

### Phase 6 — review against requirements

After tests pass, perform a deliberate second review:

- compare implementation to every requirement in this prompt;
- search for hardcoded scope identifiers and secrets;
- inspect authorization decisions for client trust;
- inspect SQL execution paths for injection or unapproved scope;
- verify L4/L5 cannot enter through config, API, or UI;
- verify the LLM has no execution or approval tool;
- verify every write and denial is auditable;
- confirm no unrelated interface or data source changed.

Do not use a numerical confidence claim such as “99.99%” unless it is derived from defined, completed checks. Prefer an evidence coverage percentage:

`verified acceptance criteria ÷ total applicable acceptance criteria`

Anything blocked or unverified reduces the score and must be listed.

---

## 10. Acceptance gates

The task is complete only when all applicable gates pass.

### Security gate

- Server-owned identity determines authority.
- Stored/configured prompt facts determine approval.
- Forged persona and approval fields fail.
- Unauthorized trigger attempts return `403` before action SQL.
- L3 always enters HITL.
- L4/L5 are rejected.
- No secrets are exposed or hardcoded.

### Data gate

- Only the approved source table, schema, prompt store, warehouse, and Genie space are used.
- Rule SQL is parameterized and correctly escaped.
- Prompt IDs are stable and deduplicated.
- Prompt lifecycle and audit data persist correctly.

### Product gate

- Action Insights is a peer surface on desktop and mobile.
- Proactive prompts render without chat input and without an LLM.
- Evidence, confidence, impact, actions, and persona presentation are correct.
- Failure states do not break or blank unrelated screens.

### Governance gate

- L1/L2/L3 boundaries are enforced.
- L2 payloads are prepared and logged but not sent.
- L3 remains pending until an authorized approval event.
- Rejection rationale and false-positive feedback are recorded.

### Quality gate

- Static, unit, integration, full proxy, and UI regression tests pass or inherited failures are precisely isolated.
- Headed-browser evidence covers every critical flow.
- Screenshots were visually reviewed.
- No unexpected console or API errors remain.

### Documentation gate

- Every change has reason, risk, validation, and rollback/back-up details.
- Open issues and blockers are explicit.
- The repository handover/changelog is updated following its current convention.

---

## 11. Stop conditions and prohibitions

Stop and report instead of guessing when:

- identity claims or approval ownership require a business decision;
- a required privilege is missing;
- the live schema conflicts with the documented design;
- a change would touch data outside the approved boundary;
- a backfill or destructive operation lacks explicit approval;
- a live integration would send a message, ticket, email, or data mutation beyond the MVP;
- the requested result would require L4/L5 autonomy.

Never:

- fabricate live verification;
- hide failing tests;
- mark blocked work as complete;
- use the browser persona selector as authorization;
- trust client-supplied approval fields;
- let model narration become detection or execution;
- expand to additional domains before the MVP gates pass;
- run a broad backfill without explicit approval;
- change unrelated screens merely to make the test harness pass.

---

## 12. Required final deliverables

Return an evidence-backed implementation report containing:

1. **Executive verdict:** what is complete, incomplete, defective, or blocked.
2. **Verified current-state matrix:** requirement, evidence, gap, and disposition.
3. **Changes made:** file-by-file reason and risk.
4. **Security proof:** ACT-02 and SEC-01 reproduction, fix, and negative-test evidence.
5. **Data/runtime proof:** token, warehouse, UC scope, prompt store, and Genie findings without exposing secrets.
6. **Test results:** exact commands, current pass/fail counts, and inherited failures.
7. **Headed-browser evidence index:** each screenshot and what visual inspection confirmed.
8. **Audit/HITL proof:** server response, queue state, Delta lifecycle state, and denied-action proof.
9. **Regression verdict:** desktop, mobile, existing surfaces, console, and API behavior.
10. **Evidence coverage:** verified/applicable acceptance criteria and the resulting percentage.
11. **Open issues:** blocker, owner/decision needed, risk, and next action.
12. **Recommended next phase:** only after the MVP acceptance gates are satisfied.

Do not end with a generic summary. End with one of these explicit verdicts:

- **PASS — verified end to end**
- **PARTIAL — working areas and remaining gaps listed**
- **BLOCKED — external decision, access, or environment dependency listed**
- **FAIL — critical acceptance or security gate not met**

---

## 13. Roadmap after the MVP passes

Do not build these during the current work unless explicitly authorized:

### Phase 2

- durable approver queue and queue view;
- tab count badge;
- notifications;
- Lakeflow-scheduled detection after job-create permission is verified;
- delivery adapters behind the governed action registry;
- additional domains through `rules.json` only;
- MLflow evaluation for narration quality.

### Phase 3

- permissioned, reversible L4 fixes for carefully selected low-risk actions;
- agent-framework investigation flows;
- broader enterprise decision orchestration.

The supply-chain implementation is the first proving ground, not the permanent product boundary. Prove safety, usefulness, adoption, and maintainability before expanding.
