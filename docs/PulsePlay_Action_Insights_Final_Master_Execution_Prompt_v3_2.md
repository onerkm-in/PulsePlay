# PulsePlay Unified Decision Workspace and Action Insights
## Final Master Investigation, Remediation, Implementation, and Validation Prompt — v3.2

> **Authoritative target dated 2026-07-23.**
>
> Paste this entire prompt into the implementation agent. Treat this document as the desired target contract and the pinned repository/runtime as the baseline. A contradiction is a migration requirement or an explicit architecture decision; it is never proof that a feature is complete.
>
> **Single source of truth:** this v3.2 document supersedes every earlier PulsePlay Action Insights, Decision Canvas, dual-interface, and synthetic-data POC prompt. Do not execute older drafts independently or combine them by simple concatenation.

---

## 0. Operating rule

You are working on **PulsePlay**, an existing React/Vite application with a Node/Express proxy and Databricks/Power BI integrations.

Your responsibility is to:

1. establish the factual current state;
2. reproduce every material claim;
3. resolve target-versus-current contradictions explicitly;
4. fix security and data-governance defects before expanding functionality;
5. implement the smallest production-safe increments;
6. validate each layer with independent code, API, data, audit, browser, and screenshot evidence;
7. iterate until every applicable acceptance gate passes or is reported as blocked.

Do not return a design-only response. Do not treat a commit message, handover statement, old test count, uninspected screenshot, or successful HTTP response as end-to-end proof.

### Evidence labels

Use exactly these labels for every material claim:

- `VERIFIED_CODE` — inspected directly at the pinned repository SHA.
- `VERIFIED_RUNTIME` — reproduced during this execution with current command, API, database, audit, or browser evidence.
- `DOCUMENTED_NOT_REPRODUCED` — claimed in a handover, commit, comment, or prior evidence but not reproduced now.
- `CONTRADICTED` — current evidence conflicts with the target contract or another trusted source.
- `MISSING` — required implementation or evidence does not exist.
- `BLOCKED` — external access, privilege, decision, or environment prevents verification.

Never promote `DOCUMENTED_NOT_REPRODUCED`, `MISSING`, or `BLOCKED` to working.

---

## 1. Role

Act as the:

- senior enterprise product strategist;
- Databricks AI/BI and Unity Catalog architect;
- security and identity architect;
- Python engineering lead;
- React/TypeScript and Node/Express engineering lead;
- decision-workflow and human-approval architect;
- accessibility and enterprise UX lead;
- test, evidence, and release owner.

You own the work end to end. Use specialist agents where valuable, but the primary agent remains accountable for reconciling their findings and inspecting critical evidence personally.

---

## 2. Final product objective

Evolve PulsePlay from “show me what happened” into a proactive, governed Decision Intelligence experience named **Action Insights** while preserving the existing segregated PulsePlay interface. Add **My Decision Canvas** as a second, combined presentation mode. The author—not the end user—chooses which interface is published and served.

For each detected issue, the experience must communicate:

> “[KPI] is not looking good. The issue appears to be [root cause]. This is affecting [$X and N records]. Recommended fix: [governed action]. Do you want me to [prepare or request approval for the action]?”

The user must not begin from a blank chat box.

In the combined mode, the normal journey must be possible from one workspace:

1. see prioritized business issues;
2. inspect impact and evidence;
3. ask a grounded follow-up;
4. view a related dashboard or visual;
5. prepare or request a governed action;
6. pin, bookmark, annotate, or snapshot meaningful content;
7. resume saved work without replaying the full history;
8. receive bounded, explainable suggestions based on verified role and explicit user relevance signals.

PulsePlay remains:

- AI-first but not AI-only;
- deterministic for detection, recommendation, eligibility, severity, confidence, and action policy;
- human-governed for consequential actions;
- explainable and auditable;
- embedded in the existing application;
- vendor-aware but not vendor-locked;
- compatible with existing deep links during migration.
- permanently capable of serving either the existing segregated interface or the new combined interface from one shared implementation.

PulsePlay is not:

- a generic chatbot;
- a standalone AI application;
- a custom-trained LLM;
- an autonomous executor;
- permission for a model to detect, recommend, approve, modify business data, or determine authorization;
- a reason to duplicate the existing application shell.

---

## 3. Baseline that must be pinned and reverified

Before changing code, pin the repository URL, branch, exact SHA, timestamp, dirty state, runtime profile, and application version.

The following were observed during the 2026-07-23 review and must be reverified against the current SHA:

### `VERIFIED_CODE` baseline

- Action Insights is implemented in `proxy/lib/actionInsights.js`.
- Current routes use `/insights/action-insights`, its health path, and `/:id/action`.
- UI components include `ActionInsightsPanel.tsx` and `DecisionPromptCard.tsx`.
- Action Insights is registered as a fourth surface and has desktop, mobile, and deep-link plumbing.
- Current default prompt and audit tables are `main.action_insights.decision_prompts` and `main.action_insights.decision_audit`.
- Current display personas are `Supply Chain Planner` and `Supply Chain Manager`.
- Role resolution uses broad substring matching, including terms such as `lead`, `manager`, and `director`.
- An identity-less caller can fall back to Planner behavior.
- Current action handling performs a prompt read, status update, and separate audit insert.
- Current Canvas support is `canvasTiles.ts` plus `CanvasGrid.tsx`.
- Current Canvas tiles are browser-global `localStorage` records containing chart/table rows, query/profile information, and layout.
- Current default landing is not driven by bookmarks.
- Current Action Insights evidence rendering is primarily a narrative blob.
- Current helper tests do not prove the production middleware, durable approval, concurrency, user isolation, structured snapshots, or token compaction.
- The repository does not contain the complete required `scripts/decision_assist/` six-rule engine, universal `PinnableSection`/`CanvasSection` contract, server-owned personal Canvas, structured context snapshot system, or governed relevance-ranking pipeline.

### `DOCUMENTED_NOT_REPRODUCED` baseline

Keep these claims in this category until independently rerun:

- the external Databricks job named `action-insights-detection`;
- job ID, schedule, success history, workspace notebook, and Python package;
- detection against `main.supply_chain.fact_supply_chain_kpi_monthly`;
- 576 source rows and the reported five external rules;
- prompt-store self-healing through `MERGE`;
- prior headed Manager trigger/approve/audit demonstrations;
- prior proxy/UI test counts or clean TypeScript/build claims;
- screenshots that are referenced but not opened and visually inspected;
- current token validity, target-table schema, target privileges, Genie instructions, warehouse reachability, or runtime prompt rows;
- any claim that current Canvas tile refresh reduces model-context tokens.

### Known contradictions

The reviewed implementation and documented runtime use a different data estate, ruleset, API shape, persona naming, profile resolution, and engine location from the target contract below.

The default decision is to **migrate the implementation to this target contract**.

Retaining the current `main.*` architecture requires explicit written approval from the user/data owner and a revised target contract. Do not silently rewrite this prompt to match current code.

---

## 4. Canonical target contract

Create an Architecture Decision Record and a machine-readable `canonical-contract.yaml` before implementation. The following values are authoritative unless the user explicitly changes them:

```yaml
contract_version: 3.2
domain: supply-chain

databricks:
  catalog: uc_dev_snt_supplychain_01
  schema: snp_indrct_comp_gold_ai
  source_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_sample_super_store
  prompt_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_decision_prompts
  decision_event_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_decision_events
  action_request_store: decision_event_table
  idempotency_store: decision_event_table
  transition_model: single-table-event-sourced
  canvas_section_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_canvas_sections
  canvas_preference_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_user_preferences
  context_snapshot_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_context_snapshots
  interaction_event_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_interaction_events
  genie_space_id: 01f12c6e979a1f35beef4bd5baf62dd9
  warehouse_name: pep-snp-cdo-dev-eus-dbsql01
  warehouse_id: resolve-and-verify-at-runtime

personas:
  sc-planner:
    display_label: Supply Chain Planner
  operations-manager:
    display_label: Operations Manager

rules:
  - SC-OTIF-001
  - SC-MARGIN-001
  - SC-FILL-001
  - SC-DISC-001
  - SC-DOS-001
  - SC-AGE-001

api:
  canonical_prefix: /decision-assist
  compatibility_prefix: /insights/action-insights
  canvas_prefix: /decision-canvas

experience:
  supported_modes:
    - segregated
    - combined
  published_mode: segregated
  fallback_mode: segregated
  existing_deployment_default: segregated
  end_user_mode_override: false
  author_preview_both_modes: true
  preserve_state_across_mode_changes: true

action_level_ceiling: 3
production_demo_persona_enabled: false

synthetic_poc:
  enabled_by_default: false
  input_contract_path: data-contracts/genie-01f130be/
  captured_source_space_id: 01f130be3444127a8d1991acfeb6f3e2
  captured_source_workspace_id: adb-7901759384367063
  synthetic_seed: 42
  real_values_permitted: false
  direct_application_runtime_binding: false
  serving_table: uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_sample_super_store
  serving_genie_space_id: 01f12c6e979a1f35beef4bd5baf62dd9
```

### Authorization conveyed by this prompt

Submission of this prompt approves the listed target catalog/schema/table names, Genie space, warehouse name, persona IDs, six rule IDs, API prefixes, L1–L3 ceiling, both author-selectable experience modes, and MVP direction as the intended target.

The implementation agent does not need to seek approval merely to record those values in the ADR. The ADR documents the approved target and maps the current implementation to it.

This prompt does **not** invent or approve:

- DDL execution or table creation;
- destructive changes, deletes, backfills, or legacy-data migration;
- rule thresholds, KPI formulas, entity grain, time windows, impact formulas, or remediation payloads;
- tenant, issuer, audience, app-role, or group object IDs;
- the business-entitlement source and dimension mappings;
- data classification, RLS/ABAC policy, consent, retention, export, or deletion periods;
- Power BI workspace/report/dataset/semantic-object allowlists;
- production test identities.

Those values require the owner manifests below. The agent may investigate and propose them, but must not invent or self-approve them.

### Contract controls

- All business/detection source queries must target only the approved source table. Application-state queries may target only the approved prompt, decision-event, Canvas, preference, snapshot, and interaction-event objects in the same schema.
- Any new Delta object must be created only in the approved schema.
- Do not query, seed, alter, backfill, or delete data in `main.*` or another catalog to complete this task.
- Inspect noncompliant paths through source code and documentation only; do not access their data.
- The default cutover is a no-data fresh cutover into the approved schema. Reading or migrating legacy prompt/action/Canvas state requires a separate approved read-only migration plan.
- Do not create the proposed tables until live privileges, schema ownership, retention, row-level access, DDL, rollback, and data classification are reviewed.
- Reuse an existing suitable table only if the ADR maps it explicitly and it is inside the approved schema.
- Resolve the named warehouse to its current warehouse ID through a read-only probe. Keep the ID in server configuration, not source code.
- Bind all Decision Assist routes server-side to the approved profile, warehouse, source, prompt store, and Genie space.
- A browser-selected active connector/profile must not redirect Decision Assist to another data source.
- Verify that Genie instructions restrict answers to the approved source table and prohibit unsupported actions.
- Credentials come from supported environment/configuration mechanisms. Never hardcode credentials, hostnames, tokens, or environment-specific IDs in executable code.
- Configuration must fail closed at startup if the effective catalog, schema, table, warehouse, or Genie space differs from the approved allowlist.

### Synthetic-data POC lane: incorporated but isolated

The supplied synthetic-data brief is incorporated as an **optional pre-runtime POC lane**, not as a second PulsePlay production source:

- The synthetic lane may reproduce captured structures for engineering validation.
- PulsePlay screens, rules, profiles, APIs, bookmarks, snapshots, suggestions, and Genie follow-ups still resolve only to the canonical serving table and serving Genie space.
- The interface author may publish `segregated` or `combined`; that setting cannot change the governed data source.
- No browser control, persona switch, profile selector, prompt parameter, or deep link may select the captured source space or a synthetic staging object.
- Synthetic staging objects are never queried directly by the application. A reviewed conformance step may materialize synthetic rows into the canonical serving table only after the gates below pass.
- Making the six captured objects application runtime sources requires an explicit replacement canonical contract. It is a data-architecture change, not an interface option.

#### Supplied capture status

Treat all capture claims as `DOCUMENTED_NOT_REPRODUCED` until the implementation run verifies the contract payload and, where authorized, source metadata:

- capture date: 2026-07-23;
- captured Genie space: “LATAM Supply Chain Dialogue with Data - AI Analysis Agent”;
- captured space ID: `01f130be3444127a8d1991acfeb6f3e2`;
- captured workspace ID: `adb-7901759384367063`;
- warehouse: `pep-snp-cdo-dev-eus-dbsql01`;
- schema: `uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai`;
- six reported objects:

| Captured object | Reported type | Reported rows | Reported columns | Synthetic role |
|---|---:|---:|---:|---|
| `mtr_vw_ltm_sc_fct_ofr` | metric view | 18,292,096 | 53 | Order Fill Rate and OTIF |
| `mtr_vw_ltm_sc_fct_operations` | metric view | 84,556 | 109 | operations, quality, safety, and emissions |
| `mtr_vw_ltm_sc_fct_performance` | metric view | 17,730 | 85 | finance, safety, and forecast accuracy |
| `vw_ltm_sc_dm_plants` | view | 602 | 10 | plant dimension |
| `vw_ltm_sc_dm_countries` | view | 20 | 7 | country dimension |
| `vw_ltm_sc_dm_sales_channel` | view | 11 | 2 | sales-channel dimension |

The reported KPI families—Forecast Accuracy, Manufacturing Fill Rate, True Efficiency, Packaging Efficiency, Quality/Food Safety Complaints, GHG emissions, Order Fill Rate, OTIF, COGS, Net Sales, DII, AOP, and prior-year comparisons—are discovery inputs only. They do not replace the approved six-rule registry or authorize formulas, thresholds, recommendations, or actions.

#### Required payload and privacy contract

The optional lane requires `data-contracts/genie-01f130be/` containing one JSON contract per object; column types, sensitivity classes, aggregate profiles, and `syntheticRule` values; literal-redacted metric-view YAML with `dimensions:` and `measures:`; `_relationships.json`; `MANIFEST.md`; and `GENERATION_PLAN.md`.

Do not infer missing contents from this summary. Validate checksums, schema versions, references, allowed literal classes, and privacy assertions. If the folder is absent, incomplete, inconsistent, or contains unredacted values, mark this lane `BLOCKED`; do not reconstruct it from memory or query real rows.

- No real row, categorical value, free text, identifier, business label, sample, or DDL literal may enter prompts, logs, fixtures, screenshots, generated tables, or reports.
- Invented values may match only governed masked patterns (`A` = letter, `9` = digit), lengths, types, ranges, cardinalities, aggregate constraints, and coverage windows.
- DDL literals remain `<REDACTED_LITERAL>` unless replaced by clearly synthetic generated values.
- Every artifact states that its values are synthetic and never implies that a generated value is real.
- Use deterministic seed `42`, a versioned generator, structured logs, and per-object error isolation.
- Run secret, identifier, rare-value, literal, and source-value leakage tests before persistence and evidence publication.

#### Reported relationship targets

Treat these as contract targets—not runtime facts—until verified from `_relationships.json`:

| Synthetic relationship | Target behavior |
|---|---|
| OFR `country_id` → countries | 100% resolve; 16 reported keys |
| OFR `plant_id` → plants | approximately 92.2% resolve; 383 reported keys |
| OFR `sales_channel_text` → sales channels | 100% resolve; 7 reported keys |
| operations `country_id` → countries | approximately 92.3% resolve |
| operations `plant_id` → plants | approximately 98.0% resolve |
| performance `country_id` → countries | approximately 89.5% resolve |
| plants `country_id` → countries | approximately 88.9% resolve |
| OFR `country_channel` → sales-channel `country_channel` | reproduce columns but do not create a join; reported resolution is 0% |

Intentional orphan rates are part of the synthetic shape; do not “clean” them into perfect referential integrity.

#### Deterministic synthetic build

Only after explicit authorization and payload validation:

1. Build synthetic countries, plants, and sales channels first.
2. Build fact base tables at the contract-defined grain.
3. Generate values within approved ranges, date windows, cardinalities, null profiles, invariants, and relationship targets.
4. Recreate the three metric views from literal-redacted YAML over synthetic bases, or use reviewed plain-view equivalents for a constrained POC.
5. Query Databricks metric-view measures with `MEASURE(column)`; do not assume `SUM(column)` is valid.
6. Default to the reported scale. If capacity requires sampling, record the exact fraction, method, seed, and analytical limitations; never silently down-scale.
7. Produce `VALIDATION_REPORT.md` with an empty schema diff, per-column range/cardinality/null comparisons, relationship conformance, invariants, row counts, checksums, and three to five representative non-empty group-by checks.
8. Run the approved six rules only after a signed mapping proves that the canonical serving table supports every required field and grain. Never invent proxy KPIs.
9. A synthetic Genie space may be created only for isolated engineering evaluation, labelled non-production, and never wired into PulsePlay.
10. Retain or remove staging objects only under an approved, recoverable lifecycle plan; never delete or overwrite captured source objects.

#### Synthetic-to-serving conformance gate

Before generated data can enter `tbl_sample_super_store`, require:

- owner-approved field mapping to the canonical serving schema;
- explicit transformation formulas and provenance;
- evidence that every value is synthetic;
- DDL/DML dry run, exact expected counts, checksums, rollback, and retention;
- least-privilege proof;
- zero-real-data leakage result;
- confirmation that all six governed rules remain semantically valid;
- confirmation that the approved serving Genie space uses only the serving table.

The conformance load is a mutation and requires a separate human `GO`. Until then, synthetic generation remains in an approved isolated POC destination and must not be represented as PulsePlay’s working data foundation.

### Required owner manifests

Create these templates during Phase 0. Implementation of their dependent phase remains `BLOCKED` until the named owner approves the populated values.

#### `rule-spec.yaml` — business/data owner

For every canonical rule, require:

```yaml
rule_id: SC-OTIF-001
ruleset_version: 1
business_owner: required
source_columns: []
entity_key_columns: []
grain: required
evaluation_window: required
detection_expression: required
thresholds: {}
severity_mapping: {}
confidence_mapping: {}
root_cause_mapping: {}
impact_formula: required
affected_record_formula: required
recommendation: required
action_code: required
action_level: 1|2|3
approval_required: true|false
payload_schema_version: required
allowed_payload_fields: {}
eligible_personas: []
required_evidence_fields: []
freshness_sla: required
```

Phase 0 must map every required field to verified source columns. If `tbl_sample_super_store` cannot support a rule at the approved grain, stop and present exactly two owner decisions: revise the approved source contract or revise/remove the unsupported rule. Do not synthesize proxy KPI fields, infer thresholds, or fabricate formulas.

The source was previously reported to contain seeded exception-model fields including `exception_type`, `severity`, `root_cause_category`, `business_impact_usd`, `persona`, `owner`, `recommended_action`, `action_type`, `rule_id`, `confidence`, `approval_required`, `action_status`, `sla_due_at`, and `feedback`. Treat this list only as a schema-probe checklist until every field, type, value domain, and lineage is `VERIFIED_RUNTIME`.

#### `identity-entitlement-privacy.yaml` — identity, data, privacy, and security owners

Require:

```yaml
allowed_tenants: []
trusted_issuers: []
audiences: []
persona_role_mappings:
  sc-planner:
    app_role_ids: []
    group_object_ids: []
  operations-manager:
    app_role_ids: []
    group_object_ids: []
approver_group_object_ids: []
experience_author:
  app_role_ids: []
  group_object_ids: []
entitlements:
  authoritative_source: required
  claim_or_lookup_keys: []
  source_column_mapping:
    region: required-or-owner-approved-not-applicable
    market: required-or-owner-approved-not-applicable
    business_unit: required-or-owner-approved-not-applicable
    owner: required-or-owner-approved-not-applicable
classification: required
row_access_model: required
interaction_retention_days: required
snapshot_retention_days: required
deletion_sla: required
consent_notice: required
```

Every entitlement dimension must have a trusted mapping or explicit owner-approved `not_applicable`. Missing mappings block release.

#### `bi-source-allowlist.yaml` — BI/data owner

List approved Power BI workspaces, reports, datasets/semantic models, pages, and visuals whose governed lineage resolves to the approved source table. The MVP may pin only allowlisted BI view states. Existing unrelated Power BI experiences remain regression-tested compatibility features but are not eligible Decision Canvas sections.

#### `benchmark-fixtures.yaml` — product, data, and test owners

Freeze:

- model and tokenizer/provider usage version;
- at least ten representative resume scenarios;
- full-history baseline construction;
- snapshot and delta inputs;
- expected decision-critical facts and citations;
- answer-quality rubric and allowed variance;
- test identities for two users with different entitlements plus a separate requester and approver;
- desktop viewport `1440x900`;
- mobile viewport `390x844`;
- browser/runtime versions.

---

## 5. Mandatory separation of powers

### Deterministic rules detect

Only the governed Python rules engine determines:

- whether an issue exists;
- rule ID and issue fingerprint;
- KPI and business scope;
- severity;
- root cause;
- evidence;
- business impact;
- recommended remediation;
- confidence;
- eligible personas;
- action level;
- approval requirement.

Business thresholds and recommendation text live in versioned governed configuration, not scattered through Python, JavaScript, TypeScript, SQL strings, or prompts.

### Governed policy recommends

Only the approved rule/action registry may define remediation text, action codes, action levels, required evidence, and approval policy.

### LLMs explain only

Databricks Genie or an approved Foundation Model may:

- explain a rule-produced issue;
- summarize existing evidence;
- answer grounded follow-ups;
- compare approved facts;
- rephrase deterministic content for clarity.

The model must never:

- detect or declare the issue;
- invent evidence, severity, confidence, business impact, remediation, or action policy;
- determine eligibility or authorization;
- execute SQL writes or business actions;
- create, approve, reject, defer, or modify an Action Request;
- bypass the human approval path;
- receive an unrestricted execution tool.

Every Decision Prompt must render fully without an LLM. Optional narration must use only rule-produced fields, pass a grounding check, and fall back to deterministic text when verification fails.

### Humans govern actions

- **L1 — Inform:** display and explain only.
- **L2 — Prepare:** create a versioned proposed payload and audit it; do not deliver or execute it.
- **L3 — Trigger with approval:** create a durable Action Request and wait for an authorized approver.
- **L4/L5 — Forbidden:** reject during rule load, API validation, and UI rendering. Never downgrade silently.

The MVP sends no email, ticket, Teams message, supplier communication, or business-data write. An approved L3 request finishes as a logged-only prepared outcome.

---

## 6. Identity, authorization, and business entitlements

### Verified user identity

Every action, approval, Canvas, bookmark, note, snapshot, preference, history, and suggestion API requires a cryptographically verified IdP identity.

- Missing verified identity: `401`.
- Verified identity without capability or data scope: `403`.
- Shared proxy keys and service credentials authenticate applications, not human users, and cannot authorize user-owned mutations.
- Do not accept email headers, persona headers, query parameters, request-body roles, browser storage, or demo selectors as authority.
- Validate token signature, issuer, audience, tenant, expiry, and not-before.
- Use immutable ownership:

  `actor_id = issuer + tenant_id + subject_id`

- Email, UPN, display name, and mutable labels are audit/display attributes only.
- Scheduled detection uses a separate `actor_type=service` identity and cannot approve.

### Exact role mapping

- Canonical persona IDs are `sc-planner` and `operations-manager`.
- Display labels are not authority identifiers.
- Map capabilities through configuration containing approved tenant IDs and exact app-role IDs or group object IDs.
- Substring, regex, partial-name, job-title, email-domain, or display-label role matching is forbidden.
- `can_approve_hitl` must come only from a dedicated approved group/app role.
- `can_configure_experience` must come only from the separately approved author app role/group. Planner, manager, or approver status does not imply author authority.
- Unknown, missing, conflicting, or unresolved mappings fail closed.
- Demo persona switching is presentation-only and disabled in production.

Minimum capabilities:

```yaml
sc-planner:
  - can_view_eligible_prompts
  - can_view_evidence
  - can_validate_evidence
  - can_prepare_action
  - can_trigger_request
  - can_snooze
  - can_mark_false_positive
  - can_attest_implementation
  - can_record_outcome

operations-manager:
  - can_view_eligible_prompts
  - can_view_evidence
  - can_validate_evidence
  - can_prepare_action
  - can_trigger_request
  - can_approve_hitl
  - can_reject_hitl
  - can_defer_hitl
  - can_modify_hitl
  - can_attest_implementation
  - can_record_outcome
```

Capabilities do not replace row-level business entitlements. Prompt reads and approvals must also enforce tenant, region, market, business unit, owner, and other approved data scopes. A manager must not automatically see the entire prompt store.

### Cache and browser controls

- User/persona-specific responses use `Cache-Control: private, no-store`.
- Browser storage may retain non-sensitive display preferences only.
- Do not store business rows, executable SQL, evidence, narratives, action payloads, authorization data, history, or snapshots in `localStorage`.
- Shared-device logout must clear user-specific presentation caches.
- On upgrade, detect the legacy `pulseplay:canvas-tiles` browser key. Never upload its raw rows or SQL. After authenticated server Canvas readiness, optionally migrate only validated non-sensitive title/layout metadata with explicit user notice, then delete the legacy key; otherwise purge it directly with notice. Record a one-time migration marker, repeat the purge on logout, and test shared-browser cleanup.

---

## 7. Deterministic Decision Prompt and rules engine

### Repository ownership

The governed source must exist under:

```text
scripts/decision_assist/
  __init__.py
  models.py
  config.py
  rules.json
  sql_client.py
  render.py
  detect.py
  logging_config.py
  tests/
```

If execution occurs through a separate Databricks workspace package/job, the repository must still contain the versioned source, rules, tests, build manifest, deployment manifest, package version, and job-to-commit mapping. An external-only package that cannot be reproduced from the pinned repository fails the source-control gate.

### CLI

`detect.py` must support:

- `--selfcheck`
- `--dry-run`
- `--persist`
- `--rule-id`
- `--as-of`
- `--json-output`

`--dry-run` is mandatory before the first persist in an environment.

### SQL execution

- Use the Databricks SQL Statement Execution API.
- Bind runtime values with Statement API parameter markers.
- Do not build SQL by choosing between backslash escaping and doubled quote escaping.
- Dynamic identifiers must come from a closed server-side registry and use the verified platform identifier mechanism.
- Extend the existing SQL wrapper safely if it does not support parameters.
- Bound timeouts, page size, row count, retries, and result size.
- Record the governed detection query/reference as provenance, but never accept executable detection SQL from the browser.

### Rule behavior

Each of the six canonical rules must:

- load from governed configuration;
- validate all required fields;
- reject L4/L5;
- run independently so one rule failure does not stop the others;
- produce structured logs and a per-rule result;
- use deterministic templates;
- produce all ten Decision Prompt parts;
- generate stable identities;
- suppress duplicates and alert fatigue;
- preserve human action state across producer reruns.

Cross-field policy validation is mandatory:

- every `action_level: 3` requires `approval_required: true`;
- `action_level: 1` cannot expose prepare, submit, approve, modify, or defer;
- `action_level: 2` can prepare/complete L2 but cannot expose L3 submit/approval transitions unless a separate governed L3 action code exists;
- low confidence cannot expose L2/L3;
- medium confidence cannot expose L2/L3 until a current validation event exists;
- invalid combinations reject the entire rule at load time with a clear error.

The producer may update detection/evidence fields only. It must not overwrite human Action Request, approval, feedback, note, or outcome state.

### Stable identity

Use a server-held, tenant-bound HMAC-SHA-256 key for client-visible issue and prompt identities so predictable entity scopes cannot be enumerated. Record a non-secret key version for controlled rotation:

- `issue_id = "iss_" + hmac_sha256(key, tenant + rule_id + canonical_entity_scope)`
- `prompt_id = "pp_" + hmac_sha256(key, tenant + issue_id + evaluation_period + ruleset_version)`
- `evidence_hash = sha256(canonical_evidence_payload)`

Use the full HMAC/SHA-256 value. Deterministic hashes are required for issue/prompt/evidence/content/payload identity and dedupe. UUIDv4, UUIDv7, or ULID is permitted and required for unique Action Request and audit-event occurrences. Non-cryptographic 32-bit hashes are forbidden.

Keep the stable `prompt_id`, but atomically increment `prompt_version` whenever governed content, evidence, severity, confidence, impact, recommendation, policy, or ruleset material changes. Preserve immutable prior versions, invalidate or revalidate active requests, and create a new prompt occurrence only when the governed identity/window rules require it.

Maintain an approved HMAC key ring:

- new identities use the active key version and include the non-secret version in the ID/record;
- detection computes candidate identities with retained prior keys and reuses an existing prior-version ID when matched;
- prior keys remain available for verification/dedupe until every referencing prompt, event, Canvas section, bookmark, and snapshot is expired, deleted, or safely re-keyed;
- key retirement requires a referential scan and migration/rollback evidence;
- never rotate by generating unrelated new IDs and breaking saved references.

### Complete Decision Prompt

Each prompt must contain:

1. Status
2. Issue
3. Root Cause
4. Evidence, including a governed detection-query reference, evidence hash, and samples
5. Business Impact in USD and affected-record count
6. Recommended Fix
7. Action Question
8. Eligible Action Buttons
9. Confidence
10. Audit Note

Required supporting fields include:

- `prompt_id`, `issue_id`, `prompt_version`, `ruleset_version`
- `rule_id`, `domain`, `kpi`, `entity_scope`
- `detected_at`, `data_as_of`, `evaluation_period`
- `severity`, `confidence`, `confidence_score`
- `persona_eligibility`, `owner`, `business_scope`
- `action_code`, `action_level`, `approval_required`
- `detection_state`, `effective_decision_status`, `freshness_state`
- `evidence_hash`, `content_hash`

### Confidence policy

- **High:** “The issue appears to be …”; L1–L3 allowed when configured.
- **Medium:** “The likely root cause is …”; a durable validation event by a user with `can_validate_evidence` is required before L2/L3. Validation records actor, rationale, prompt version, and evidence hash, and is invalidated whenever that version/hash changes.
- **Low:** “A possible factor is …”; investigation-only. L2/L3 requests are prohibited.

Enforce these constraints in config loading, API behavior, tests, and UI—not only in wording.

---

## 8. Prompt lifecycle, Action Requests, and audit

Keep Decision Prompt state and Action Request state separate.

### Detection lifecycle

- `new`
- `refreshed`
- `resolved`
- `expired`
- `revoked`

### User disposition

Store user dispositions only as immutable `tbl_pp_decision_events` events:

- `none`
- `snoozed`
- `false-positive`

Do not update producer-owned prompt rows for snooze or false-positive actions. The effective projection combines detection state, latest valid disposition event, and Action Request state.

### Effective decision status

Expose one derived, read-only `effective_decision_status` for compatibility and UI:

- `new`
- `prepared`
- `pending-approval`
- `awaiting-implementation`
- `actioned`
- `snoozed`
- `rejected`
- `deferred`
- `false-positive`
- `resolved`
- `expired`
- `revoked`

Derive it from the detection state plus the latest valid Action Request/event. Do not maintain a second independently writable status that can diverge. For example, an L2 `prepared-complete` or resumable L3 `prepared` request produces `prepared`; an open submitted request produces `pending-approval`; `approved-awaiting-implementation` produces `awaiting-implementation`; a rejected request produces `rejected`; and a request that reaches `logged-only-complete` after implementation attestation produces `actioned`.

### Canvas freshness

- `current`
- `changed`
- `stale`
- `resolved`
- `revoked`

Freshness is not an approval state.

### Action Request lifecycle

- `prepared`
- `prepared-complete`
- `pending-approval`
- `approved`
- `approved-awaiting-implementation`
- `rejected`
- `deferred`
- `cancelled`
- `expired`
- `logged-only-complete`

Track outcome separately:

- `not-due`
- `pending`
- `overdue` — derived from time
- `recorded`

### Allowed MVP transitions

| From | Operation | To | Required authority |
|---|---|---|---|
| none | Prepare L2-only action | `prepared-complete` | `can_prepare_action` |
| none | Prepare L3 request | `prepared` | `can_prepare_action` |
| `prepared` | Submit L3 | `pending-approval` | `can_trigger_request` |
| `pending-approval` | Approve | `approved` | `can_approve_hitl` |
| `pending-approval` | Reject | `rejected` | `can_reject_hitl` |
| `pending-approval` | Defer | `deferred` | `can_defer_hitl` |
| `pending-approval` | Modify | new immutable version, `pending-approval` | `can_modify_hitl` |
| `deferred` | Resubmit | `pending-approval` | requester with `can_trigger_request` |
| `approved` | Log approved payload | `approved-awaiting-implementation` | system transition |
| `approved-awaiting-implementation` | Attest implemented outside PulsePlay | `logged-only-complete` | action owner with `can_attest_implementation` |
| `prepared` / `pending-approval` / `deferred` | Cancel | `cancelled` | requester or administrator |

Rules:

- L3 submission creates a durable Action Request. Updating only the prompt status is forbidden.
- Every request records `intent_level: 2|3`. An L2-only action ends at `prepared-complete` after its payload is durably prepared/audited and cannot enter approval transitions. An L3 request uses `prepared` as the resumable pre-submission state and remains discoverable in Action Inbox with next action Submit or Cancel.
- Inspect the repository’s existing `hitlGate` and related approval facilities. Reuse or extend them only if they meet the durable identity, separation-of-duties, versioning, idempotency, concurrency, and audit requirements here; otherwise record the gap in the ADR and replace the unsafe path without maintaining two approval systems.
- The requester cannot approve their own request.
- Approval verifies assigned approval scope, current identity, current capability, business-data entitlement, request version, evidence version/hash, prompt freshness, and action policy.
- Reject requires rationale.
- Defer requires rationale and `defer_until`.
- Modify creates a new immutable request/payload version and requires reapproval.
- False-positive feedback records rationale and classification.
- Snooze requires an explicit `snooze_until` between one hour and 30 days in the future. It reappears in Action Inbox when due. `defer_until` is reserved for an Action Request defer and is never reused for prompt snooze.
- A medium-confidence prompt must have a current durable validation event before Prepare/Submit.
- Before L2, L3, or approval, refresh prompt state, permissions, evidence, source freshness, and policy.
- A saved snapshot is never sufficient approval evidence.
- Approval alone does not prove implementation. Because the MVP sends/executes nothing, an approved request becomes `approved-awaiting-implementation`. The server assigns `action_owner_actor_id` from the governed owner mapping and current entitlements.
- The action owner—or an entitled manager with `can_attest_implementation`—must attest that the approved action was implemented outside PulsePlay, including `implemented_at`, bounded note, and governed evidence reference. Only then does the request become `logged-only-complete`.
- Reaching `logged-only-complete` sets `outcome_due_at = implemented_at + 14 days`. The assigned action owner or entitled user with `can_record_outcome` records the T+14 outcome with baseline KPI, observed KPI, assessment (`improved|no-change|worsened|unknown`), evidence reference, and note. Due/overdue outcomes appear in Action Inbox until recorded.

### Idempotency and concurrency

Every mutation requires an `Idempotency-Key` and the expected current version of the resource being changed.

Decision-critical prompt/request mutations additionally require the current `evidence_hash`. Canvas mutations use the section version and `content_hash`; preference mutations use the preference version. Do not require an evidence hash for a resource that has no decision evidence.

Scope the key by actor, resource, operation, and version.

Create semantics:

- First creation uses `expected_version=0`.
- The request includes a UUID/ULID `client_operation_id`.
- Canvas creation also includes source/parent ID, source version, and content hash.
- Snapshot creation includes parent section ID/version/content hash.
- Preference creation uses preference version `0`.
- Action Request creation uses prompt ID/version/evidence hash and the selected action-code version.
- Idempotency scope for creation is actor + tenant + parent/source + operation + `client_operation_id`.
- A successful replay returns the originally created resource ID and response.

- Same key and same payload returns the original result.
- Same key with a different payload returns `409`.
- Stale version/evidence returns `409`.
- Concurrent approve/reject/defer calls must allow exactly one accepted transition.
- Prove concurrency behavior on the target warehouse with a focused POC before claiming the design is safe.

### Durable audit

Use UUIDv4, UUIDv7, or ULID event IDs and SHA-256 payload hashes.

`tbl_pp_decision_events` is the authoritative single-table event-sourced store for:

- Action Request identity and immutable versions;
- accepted and denied decision operations;
- idempotency key, canonical request hash, and replay response reference;
- previous/next request state and expected version;
- compliance audit fields;
- optional downstream-delivery/outbox state.

Do not maintain an independently writable Action Request status table. Derive the effective request and prompt decision projection from the latest valid events. If a materialized projection/view is added for performance, it is a rebuildable cache and not the authority.

Before implementation, run a target-warehouse POC proving that the chosen conditional `MERGE`/append design permits exactly one event for a resource/version under concurrent approve/reject/defer attempts and returns the original result for an idempotent replay. If the POC cannot prove this, stop and select a transactional service/store or another platform primitive through the ADR; do not simulate a cross-table transaction.

Audit:

- fetches of Decision Prompts;
- evidence access;
- allowed, denied, stale, replayed, conflicting, failed, and successful actions;
- prepare, submit, approve, modify, defer, reject, cancel, expire, and outcome events;
- false-positive feedback;
- Canvas/bookmark/snapshot writes and deletes;
- cross-user denials and permission revocations.

Use a versioned event schema with event-type-specific requirements.

Common required fields for every event:

- event ID/type/schema version;
- actor ID/type and tenant;
- verified role reference when actor type is human;
- request/correlation ID;
- resource ID/type and current visible version;
- permission/result classification;
- source/profile reference;
- timestamp.

Mutation/decision events additionally require idempotency key, canonical request/payload hash, expected version, prior/new state, and applicable rule/evidence/action-request fields.

Prompt/evidence read events require prompt/rule/evidence reference and access result, but idempotency key, rationale, payload hash, and prior/new state are nullable/not-applicable. Never insert fabricated placeholder values merely to satisfy one flat schema.

State transitions and durable audit/outbox evidence must not diverge. The default target is the single-table event-sourced model above. A classic outbox split across Delta tables is not accepted unless one proven transaction spans both writes. Updating state and then attempting a best-effort audit insert is forbidden.

Do not acknowledge success until the transition and durable audit/outbox record exist.

If a denied-action audit write fails, still perform zero business-state mutation and return a safe error with a correlation ID. Never silently swallow the failure.

For a denied action, “zero mutation” means zero business/action-state mutation; the required denial audit write is permitted.

---

## 9. Canonical serving APIs

Implement the canonical API as a drop-in connector using repository conventions. Keep the current `/insights/action-insights` route only as a thin compatibility adapter after canonical parity is proven.

### Decision Assist

```text
GET  /decision-assist/health
GET  /decision-assist/prompts
GET  /decision-assist/prompts/:prompt_id/evidence
POST /decision-assist/prompts/:prompt_id/actions
GET  /decision-assist/action-requests
GET  /decision-assist/action-requests/:request_id
POST /decision-assist/action-requests/:request_id/actions
POST /decision-assist/action-requests/:request_id/decisions
POST /decision-assist/action-requests/:request_id/outcomes
```

`GET /prompts` supports bounded server-validated filters, detection state, effective decision status, and cursor pagination. It does not accept persona as authorization. Persona and business scope come from verified server identity.

`GET /action-requests` is the MVP approval/outcome discovery contract. It returns only requests assigned or entitled to the current actor and supports bounded server-validated state, due/overdue, and cursor filters. The Action Inbox uses it for pending approvals and T+14 outcomes. A dedicated standalone approver-queue screen may remain post-MVP, but approval discovery cannot.

`POST /prompts/:id/actions` accepts intent only:

```json
{
  "action": "validate|prepare|snooze|mark-false-positive",
  "action_code": "server-registry action code when preparing",
  "expected_prompt_version": 3,
  "expected_evidence_hash": "sha256-value",
  "rationale": "required where policy says so",
  "snooze_until": "ISO-8601 timestamp required only for snooze"
}
```

`action_code` must exist in the versioned server action registry. Its registry entry defines level, approval policy, allowed/required payload fields, field types, classification, and maximum lengths.

`POST /action-requests/:id/actions` accepts request-scoped transitions:

```json
{
  "action": "submit|resubmit|cancel|attest-implemented",
  "expected_request_version": 2,
  "expected_evidence_hash": "sha256-value",
  "rationale": "required where policy says so",
  "implemented_at": "required for attest-implemented",
  "implementation_evidence_ref": "required for attest-implemented"
}
```

`POST /action-requests/:id/decisions` accepts:

```json
{
  "decision": "approve|reject|defer|modify",
  "expected_request_version": 2,
  "expected_evidence_hash": "sha256-value",
  "rationale": "required",
  "defer_until": null,
  "modified_payload": null
}
```

`modified_payload` must validate against the selected action registry’s versioned allowlist/schema. Unknown fields, raw SQL, executable content, and unrestricted destinations are rejected. A modification creates an immutable request version and returns it to `pending-approval`.

`POST /action-requests/:id/outcomes` accepts the T+14 observation:

```json
{
  "expected_request_version": 4,
  "baseline_kpi": 0,
  "observed_kpi": 0,
  "assessment": "improved|no-change|worsened|unknown",
  "evidence_ref": "governed reference",
  "note": "bounded plain text"
}
```

The server ignores client-supplied persona, role, capability, action level, approval requirement, status, owner, and user ID.

### My Decision Canvas

```text
GET    /decision-canvas
GET    /decision-canvas/sections
POST   /decision-canvas/sections
PATCH  /decision-canvas/sections/:section_id
DELETE /decision-canvas/sections/:section_id
GET    /decision-canvas/snapshots
POST   /decision-canvas/sections/:section_id/snapshots
GET    /decision-canvas/snapshots/:snapshot_id
POST   /decision-canvas/snapshots/:snapshot_id/restore
DELETE /decision-canvas/snapshots/:snapshot_id
GET    /decision-canvas/suggestions
POST   /decision-canvas/suggestions/:suggestion_id/actions
GET    /decision-canvas/relevance-profile
PATCH  /decision-canvas/relevance-profile
GET    /decision-canvas/preferences
PUT    /decision-canvas/preferences
POST   /decision-canvas/visits/ack
DELETE /decision-canvas/relevance-profile
```

`GET /sections` supports `save_state=pinned|bookmarked|pinned-and-bookmarked` and returns only current-user objects. `GET /snapshots` returns the authorized snapshot index needed for resume. Snapshot restore revalidates identity, authorization, hashes, freshness, and expiry.

Suggestion actions are `dismiss|suppress|follow|correct`. Relevance-profile PATCH accepts only the versioned explicit preference schema; it never accepts persona, permission, severity, business priority, or action level.

All routes:

- derive owner, tenant, role, capability, and business scope server-side;
- reject cross-user references without revealing object existence;
- validate source/provenance against the approved registry;
- enforce idempotency and optimistic versioning;
- enforce payload, page, and history limits;
- audit writes, deletes, denials, and restores;
- revalidate authorization on refresh and restore;
- return redacted problem-details envelopes;
- apply per-user and route-level rate limits;
- use `private, no-store` for user-specific responses.

For cookie/Easy-Auth deployments, protect every `POST`, `PUT`, `PATCH`, and `DELETE` with restrictive CORS, exact Origin/Referer validation, approved `SameSite` cookie policy, and an anti-CSRF token or equivalent platform mechanism. Prove cross-origin mutation fails.

All persisted/displayed titles, tags, notes, rationale, narratives, evidence samples, URLs, and modified payload fields require bounded schemas, length limits, Unicode normalization, output encoding, safe-Markdown sanitization when Markdown is permitted, URL allowlisting, and stored-XSS tests. SQL parameterization does not satisfy this control.

---

## 10. Author-selectable interface modes

PulsePlay permanently supports two presentation modes:

### `segregated` — existing interface

- Preserve the current application experience and existing screens:

  **AI Insights · Ask Pulse · Action Insights ⚡ · Dashboard**

- Preserve the current desktop tab strip, mobile bottom navigation, PulseShell behavior, routes, deep links, settings, pane behavior, fixed 36 px footer, absolute pane-control icons, and existing default-landing logic.
- Do not route these screens through My Decision Canvas.
- Do not remove, redesign, or degrade the segregated experience merely because the combined mode exists.
- This is the mandatory fallback and the default for every existing deployment.

### `combined` — My Decision Canvas

- Serve **My Decision Canvas** as the primary experience.
- Compose AI Insights, Ask Pulse, Action Insights, Dashboard/BI view state, Saved Items, snapshots, and suggestions inside the combined workspace.
- Existing deep links such as `?surface=action-insights` remain valid but focus the corresponding Canvas section/mode.
- Use the common CanvasSection, Action Request, snapshot, history, and relevance services.
- Respect the existing shell footer and pane-control constraints while the combined shell is mounted.

### Author control

Add an author-only setting under the existing Settings/authoring conventions:

> **Interface type**
>
> - **Segregated screens** — existing PulsePlay navigation and screens
> - **Combined Decision Canvas** — the new single-workspace experience

Use a typed configuration:

```ts
type PulsePlayExperienceMode = "segregated" | "combined";

interface AuthorExperienceConfig {
  mode: PulsePlayExperienceMode;
  version: number;
  scope_id: string;
  updated_by_actor_id: string;
  updated_at: string;
}
```

Rules:

- Only an authenticated author with `can_configure_experience` may preview, change, or publish the mode.
- The published author configuration is server-governed, versioned, audited, and protected by optimistic concurrency.
- Do not use end-user `localStorage`, URL parameters, persona selectors, or browser state as the authority for the served mode.
- End users cannot override the author’s published mode.
- Authors can preview both modes before publishing without changing the end-user experience.
- If configuration is absent, invalid, unavailable, or killed by the operational safety switch, serve `segregated`.
- Changing modes must never delete or rewrite Canvas, bookmark, history, prompt, or user-preference data.
- Switching back to `segregated` is an immediate rollback, not a data migration.
- Both modes use the same backend contracts, authorization, prompt/card components, action workflow, evidence services, and governed data. Do not fork business logic.
- A mode-specific presentation adapter is allowed; a duplicated API, rules engine, approval workflow, or data store is forbidden.
- The author may publish `combined` only after the combined-mode gate passes. Until then it is author-preview only.

### Mode resolution

Resolve the interface in this order:

1. authenticated author preview context, visible only to that author;
2. published author configuration for the deployment/report scope;
3. fail-safe `segregated` fallback.

Record the resolved mode and configuration version in diagnostics and headed-test evidence without exposing sensitive author information.

### Combined-mode desktop order

1. **Context bar** — verified persona, business scope, filters, data-as-of, and trust/freshness status.
2. **Action Inbox** — governed open decisions requiring attention.
3. **Since You Last Visited** — changed, stale, resolved, or permission-revoked saved items.
4. **My Canvas** — user-pinned sections in saved order and groups.
5. **Saved Items** — bookmarks and snapshots not currently placed on Canvas.
6. **Suggested for You** — no more than three explainable suggestions; collapsed by default.
7. **One contextual detail drawer** — evidence, grounded chat, dashboard exploration, or approval details.

Only one detail layer may own focus. Do not stack modals, drawers, chat panes, dashboards, and approval panels.

On desktop, selecting an Inbox, Canvas, Saved, or Suggested item always opens the same contextual drawer; do not alternate between full in-place expansion and a nested drawer. Evidence, grounded chat, dashboard detail, approval, and outcome are tabs/modes inside that drawer. Opening a new mode replaces the active mode while retaining a bounded back stack of ten entries. Closing returns focus to the exact originating item.

### Combined-mode mobile

- Preserve the same content order in one column.
- Convert the detail drawer into one accessible full-width sheet.
- Closing the sheet returns focus to the originating section.
- Preserve section identity, state, filters, and scroll/focus context.

### Action Inbox

Action Inbox appears before personalized content and is a joined projection of entitled Decision Prompts, active Action Requests, assigned approvals, and due outcomes. It never copies request state into the producer-owned prompt row.

Detection states represented:

- `new`
- `refreshed`
- `snoozed` when due again

Linked request/outcome states represented:

- `prepared` for resumable L3 submission;
- `pending-approval`
- `deferred`
- `approved-awaiting-implementation`
- `outcome pending`
- `outcome overdue`

Each compact row shows severity, headline, impact, SLA/due state, owner, prompt detection state, linked request state, outcome state, and one unambiguous next action. Selecting a row opens the single contextual drawer.

L2 `prepared-complete` is a terminal prepared artifact, not an open approval item. Show it in the originating prompt history and Saved Items when saved; do not leave it indefinitely in Action Inbox. L3 `prepared` remains open and resumable.

Ranking is two-stage:

1. governed business tier: critical, overdue approval, high, medium, low;
2. within a tier: impact, SLA urgency, unresolved state, then personal relevance.

Personal relevance may reorder items only within the same governed tier. It cannot suppress a critical item or move a lower-severity item above it.

### Decision Prompt card

Use one reusable card:

- `NEEDS YOUR DECISION (N)` heading;
- production persona from verified claims;
- demo selector only in explicit non-production mode;
- severity rail and chip;
- bold headline;
- issue statement;
- confidence-controlled root-cause wording;
- compact `WHY · FIX` line;
- right-aligned tabular impact value;
- `est. impact · N records`;
- single-hue mini-bar scaled to current stack maximum;
- action question;
- one primary eligible action;
- accessible secondary actions;
- footer with confidence, action level, rule ID, owner, status, and data-as-of;
- evidence drawer with detection-query reference, evidence hash, samples, and audit note;
- rationale/defer/modify inputs where required;
- visible lifecycle and freshness states.

“Evidence drawer” means the Evidence mode inside the one workspace contextual drawer; do not create a second nested drawer. Opening it must create the required durable evidence-access audit event. Evidence remains accessible for terminal prompts when authorization permits.

Required states:

- loading;
- explicit error with Retry;
- empty-but-reachable band;
- failed action with the card retained;
- prompt detection state plus separately linked pending/modified/deferred/rejected request state;
- false positive;
- effective `actioned` projection backed by request `logged-only-complete`;
- outcome pending, overdue, and recorded;
- stale/resolved/revoked.

Use WCAG 2.2 AA behavior: keyboard navigation, visible focus, labelled controls, touch-size targets, non-color status cues, and no hover-only action.

---

## 11. Universal CanvasSection contract

Every meaningful generated section must pass through one shared typed contract. Do not make arbitrary DOM fragments pinnable.

MVP section types:

- `decision_prompt`
- `data_insight`
- `grounded_answer`
- `bi_view_state`

An eligible section must have:

- stable ID and schema version;
- typed deterministic content;
- server-derived owner;
- source/provenance reference;
- data-as-of timestamp;
- authorization classification;
- governed refresh binding or explicit immutable state;
- content hash;
- lifecycle/freshness state.

```ts
interface CanvasSection {
  section_id: string;
  schema_version: number;
  owner_actor_id: string; // server-derived
  type: "decision_prompt" | "data_insight" | "grounded_answer" | "bi_view_state";
  title: string;
  source: {
    surface: string;
    prompt_id?: string;
    rule_id?: string;
    conversation_id?: string;
    message_id?: string;
    source_object_id?: string;
  };
  provenance: {
    semantic_ref: string;
    evidence_ref?: string;
    refresh_binding_id?: string;
    data_as_of: string;
    filters: Record<string, string | number | boolean | string[] | number[]>;
    content_hash: string;
    classification: string;
  };
  state: {
    lifecycle: string;
    freshness: "current" | "changed" | "stale" | "resolved" | "revoked";
    save_state: "none" | "pinned" | "bookmarked" | "pinned-and-bookmarked";
    emphasis: "normal" | "highlighted";
    note?: string;
    tags?: string[];
  };
  capabilities: {
    can_pin: boolean;
    can_bookmark: boolean;
    can_snapshot: boolean;
    can_highlight: boolean;
    can_note: boolean;
    can_refresh: boolean;
    can_act: boolean;
  };
  layout?: {
    group_id?: string;
    order: number;
    size?: "small" | "medium" | "large";
  };
  version: number;
  created_at: string;
  updated_at: string;
}
```

Never persist a client-supplied owner, persona, role, permission, severity, confidence, action level, or unrestricted executable query.

### Atomic section rules

- One Decision Prompt is one section; its headline, evidence, recommendation, and action controls are not separate pinnable fragments.
- A grounded answer includes its citations/evidence as one section.
- An AI Insight is eligible only when grounded in retained data/evidence.
- A BI section stores the report/visual semantic reference, page, filters, view state, and permitted refresh binding—not copied iframe HTML. It is eligible only when its workspace/report/dataset/semantic object appears in `bi-source-allowlist.yaml` and its governed lineage resolves to the approved source table.
- Loading, error, empty, tooltip, hover, debug, trace, ungrounded, raw button, and duplicate child fragments are ineligible.

### Save action channel

Avoid six permanent icons on every section. Provide one consistent **Save** affordance and an accessible overflow menu:

- **Pin to Canvas** — create a visible live/refreshable section.
- **Bookmark** — save a reference/state without requiring Canvas placement.
- **Capture snapshot** — create an immutable versioned point-in-time record.
- **Highlight section** — apply a durable, accessible whole-section emphasis without changing business priority.
- **Add note** — attach one user note.
- **Unpin** — remove from Canvas while optionally preserving a bookmark.
- **Delete saved item** — remove the user-owned saved reference under policy.

Pinning an existing source focuses the existing section and offers Refresh/Replace. It must not create duplicates.

Whole-section highlighting is included in the MVP. Freeform text-range underline/highlight is deferred until user testing proves a clear workflow. A visual highlight must have a non-color label/state for accessibility and must never change governed severity or ranking.

A highlight requires a saved server object. Highlighting an unsaved eligible section atomically creates a bookmark plus the highlight state, clearly tells the user it was saved, and follows the same first-save home behavior. Bookmark-only and snapshot-only objects appear in **Saved Items**, so no saved object becomes undiscoverable.

Adding a note to an unsaved eligible section atomically creates a bookmark plus the note and follows first-save home behavior. Capturing a snapshot from an unsaved eligible source creates a minimal server backing section with `save_state=none` plus the immutable snapshot; the snapshot appears in Saved Items, but snapshot-only capture does not pin/bookmark the live section or change the home preference.

Viewer-edited raw SQL is forbidden. Governed authors may use a separate permissioned authoring mode; viewers store a governed refresh-binding reference.

---

## 12. Default landing behavior

This section applies only when the author publishes `combined`.

When `segregated` is published, preserve the existing surface/default-landing behavior exactly. Do not redirect a segregated deployment to Canvas because a user has pins or bookmarks.

Navigation precedence:

1. explicit deep link;
2. explicit user-selected home preference;
3. active user-created pin or bookmark;
4. deployment default.

After the first explicit user pin or bookmark, **only when the user has never set an explicit home preference**:

- make **My Decision Canvas** the default home;
- show:

  > “My Decision Canvas is now your home because you saved your first item. Undo · Change preference”

- provide immediate Undo;
- preserve any pre-existing explicit Dashboard, Ask Pulse, AI Insights, Action Inbox, or Canvas preference;
- respect every later explicit home choice.

System suggestions, auto-seeded tiles, migrations, or administrator-curated content must never change the user’s home.

Available home choices:

- My Decision Canvas
- Action Inbox
- AI Insights
- Ask Pulse
- Dashboard

Removing the final saved item does not silently change the preference. Show a clear empty Canvas and a reset-home option.

### Since You Last Visited

- Maintain a server-owned `last_seen_event_cursor` and `last_visit_at` in user preferences.
- On workspace load, return at most ten entitled saved-item changes after the cursor plus a `next_cursor`.
- Sort first by governed severity/due state, then event time.
- Qualifying changes are content-hash change, freshness transition, prompt/request transition, outcome due/overdue, snapshot expiry, or authorization revocation.
- The MVP uses page acknowledgement, not ambiguous per-item acknowledgement. “Mark this page seen” sends the exact displayed event IDs and page cursor to `/decision-canvas/visits/ack`; retries are idempotent.
- Advance `last_seen_event_cursor` only through the highest contiguous acknowledged event. Unacknowledged events and later pages remain available. If more than ten changes exist, the user can load/acknowledge subsequent pages without skipping earlier items.
- Acknowledgement removes the change from the delta band but never removes its Canvas/Saved Items object.
- A revoked item is a redacted tombstone containing only “This saved item is no longer available,” revocation time, and a remove action. Do not return the old title, KPI, summary, values, note, or evidence after entitlement loss.

---

## 13. Structured snapshots and token-efficient resume

A screenshot may be attached for human reference, but it is never sufficient machine context.

Each snapshot stores:

- snapshot ID/version and section ID/version;
- deterministic concise summary;
- typed KPI/key facts;
- prompt, rule, evidence, and semantic references;
- selected filters and time period;
- Decision Prompt and Action Request state;
- unresolved questions;
- user note;
- data-as-of timestamp;
- content/source/evidence hashes;
- authorization classification;
- expiry and refresh policy;
- schema and ruleset versions.

### Resume sequence

1. Fetch authorized layout and snapshot index.
2. Revalidate identity, ownership, business scope, and current authorization.
3. Render authorized cached summaries with clear data-as-of labels.
4. Compare hashes, schema versions, and freshness.
5. Fetch only changed, expired, stale, revoked, or unresolved sections.
6. Build model context from the selected section, compact summary, relevant delta, and current question.
7. Retrieve full history/evidence only when required.
8. Before every L2/L3/approval operation, synchronously reload the current prompt, permissions, evidence, and approval policy.

Measure:

- full-history baseline input size/tokens;
- compact resume input size/tokens;
- percentage reduction;
- snapshot size;
- cache hit rate;
- delta-fetch volume;
- stale/revoked rejection rate;
- time to meaningful first render;
- grounded answer quality and citation correctness.

Use only the approved `benchmark-fixtures.yaml`. Acceptance requires:

- median input-token reduction of at least **50%** across the frozen scenarios;
- no individual scenario below **30%** reduction;
- 100% preservation of the fixture’s decision-critical facts and required citations;
- no stale authorization, cross-user leakage, or incorrect action eligibility;
- answer-quality rubric within the approved variance;
- raw provider usage/token counts when available, otherwise the frozen tokenizer/version.

Do not claim token reduction merely because a chart refresh avoids an LLM call.

---

## 14. Governed history and relevance profile

Verified organizational persona and behavior-derived relevance are separate.

- **Persona:** verified identity/role authority.
- **Relevance profile:** non-authoritative user preferences and continuity signals.

The relevance profile may rank already-eligible content. It must never change persona, permission, data scope, severity, confidence, business priority, action level, or approval authority.

### MVP relevance signals

Capture only deliberate, meaningful signals:

- pin or bookmark;
- followed KPI/domain;
- pending/unresolved work;
- dismiss or suppress;
- approval responsibility;
- thumbs-up/down;
- false-positive feedback;
- completed decision outcome;
- session resume and last meaningful state.

Do not persist raw mouse movement, hover streams, keystrokes, unrestricted prompts, secrets, complete dashboard payloads, or incidental clicks as preferences.

General product telemetry and immutable compliance audit must be separate stores and policies.

Views, drills, filters, hovers, and clicks may be collected only as minimized operational telemetry under the approved telemetry policy. They do not become MVP relevance preferences. A later phase may propose a deterministic multi-session threshold, but it requires separate user testing and privacy approval.

### Suggestion pipeline

1. Enforce verified persona, ACL, business scope, and source eligibility.
2. Assign governed business tier.
3. Deduplicate against Inbox, Canvas, bookmarks, prior prompts, and suppressions.
4. Rank within the tier using explicit relevance and recency.
5. Return no more than three suggestions.
6. Show one deterministic reason:
   - “Bookmarked KPI changed”
   - “Related to your pending approval”
   - “Relevant to your verified operations role”
   - “You follow OTIF for this market”
7. Allow dismiss, suppress, correct, and reset.

Users must be able to inspect and clear inferred relevance. Apply approved consent, classification, retention, export, deletion, masking, and audit policy. Default product-interaction retention may be proposed as 90 days but requires privacy/data-owner approval; compliance audit follows its separate policy.

The profile API must expose each explicit preference, its source, creation/update time, expiry, and the explanation factors it can affect. Correction updates only the selected preference; reset/delete clears the governed profile without deleting compliance audit.

Control semantics:

- **Dismiss:** hides only the exact suggestion occurrence until its content hash changes or seven days pass, whichever occurs first.
- **Suppress:** hides suggestions for the selected `rule_id + canonical entity scope + KPI` for 30 days. Domain-wide suppression requires a separate explicit Settings confirmation. Suppression never removes an eligible item from Action Inbox.
- **Follow:** creates an explicit KPI + business-scope relevance preference until the user removes it.
- **Correct:** may remove/change an explicit relevance preference or mark a suggestion reason inapplicable; it cannot change identity, entitlement, persona, severity, confidence, business tier, or action policy.
- **Reset:** removes all non-audit relevance preferences/suppressions after confirmation.

Every control is versioned, visible in the relevance profile, reversible where applicable, and covered by expiry tests.

---

## 15. Required phased execution

Do not implement this as one uncontrolled mega-change.

Each phase is a separately reviewable change set with its own evidence and rollback point. At the end of every phase, stop, return its gate report, and require an explicit human `GO` before beginning the next phase—even when the gate passed. Stop immediately after a failed or blocked gate. Do not begin any DDL, persist, migration, or destructive phase without the specific authorization required here. Never batch Phases 1–9 into one unreviewable change.

### Phase 0 — Baseline and live probes

Perform read-only repository, token, warehouse, Unity Catalog, source schema, prompt store, Genie space/instructions, job, API, middleware, identity-claim, test, and browser probes.

Deliver:

- pinned baseline;
- `baseline-evidence-matrix.md`;
- current test baseline;
- runtime blocker register;
- no-mutation query/access log.
- when the synthetic lane is requested: payload inventory, checksums, privacy scan, and capture-claim verification matrix.

Gate: every target dependency is `VERIFIED_RUNTIME` or `BLOCKED`.

### Phase 1 — Canonical contract and P0 security

Record the ADR and `canonical-contract.yaml` using the target values approved by this prompt. Obtain owner sign-off on the populated rule, identity/entitlement/privacy, BI allowlist, and benchmark manifests before their dependent work.

Fix:

- mandatory verified human identity for mutations;
- exact IdP role/group mapping;
- business-data entitlements;
- no anonymous/shared-key-only mutation;
- stored/configured action policy enforcement;
- durable Action Request;
- no self-approval;
- L4/L5 rejection;
- idempotency, optimistic concurrency, and durable audit/outbox;
- per-user rate limiting;
- redacted errors and no-store responses;
- unsafe client-owned history access.

Gate: all release-blocking authorization, replay, stale-state, concurrency, IDOR, and audit-failure tests pass.

### Phase 2 — Canonical data and rules engine

Implement/version the Python engine, typed models, six-rule configuration, stable IDs, deterministic rendering, parameterized SQL, per-rule isolation, selfcheck/dry-run/persist, and approved-schema persistence.

Gate:

- source-scope evidence proves zero access outside the allowlist;
- all six rules produce valid ten-part prompts;
- L4/L5 cannot load;
- dry-run reviewed before persist;
- row counts, checksums, migration, and rollback are recorded;
- producer reruns preserve human state.

### Optional Phase 2A — Synthetic foundation and conformance

Run this phase only after the synthetic lane receives an explicit human `GO`; otherwise mark it `NOT_APPLICABLE`.

Validate the complete `data-contracts/genie-01f130be/` payload, generate the six synthetic structures in an approved isolated POC destination, recreate reviewed metric/plain views, and emit `VALIDATION_REPORT.md`. Do not access real row values.

Gate:

- schema diff is empty;
- privacy and zero-source-value leakage tests pass;
- generated dimensions, facts, invariants, aggregate profiles, and intentional relationship/orphan rates conform within owner-approved tolerances;
- scale or sampling fraction is disclosed;
- representative queries are plausible and non-empty;
- no PulsePlay runtime route can address a staging object or captured source space;
- the synthetic-to-serving mapping, dry run, rollback, retention, and six-rule semantic review are owner-approved.

Stop and request a second explicit human `GO` before any conformance load into the canonical serving table.

### Phase 3 — Canonical serving layer

Implement the canonical connector/API, server binding, explicit evidence fields, compatibility adapter, health checks, pagination, error behavior, and middleware.

Gate: contract, middleware-order, profile-binding, persona/entitlement, lifecycle, audit, failure, and compatibility tests pass.

### Phase 4 — Combined-mode shell and Action Insights vertical slice

Add the author-previewable `combined` shell, Context bar, Action Inbox, Saved Items region, and one contextual drawer without replacing or routing through the `segregated` shell. Implement the complete Action Insights card, evidence, confidence/validation policy, rationale/modify/defer/outcome flows, separate prompt/request states, accessibility, mobile, and deep links as the first end-to-end Canvas section.

Gate: one Action Insights vertical slice works end to end inside the combined Canvas shell at desktop/mobile sizes, with independent database/request/audit reconciliation and compatibility deep links; the segregated experience passes its unchanged regression gate.

### Phase 5 — Universal CanvasSection foundation

Implement server-owned Canvas persistence and complete the four MVP section types. Reuse the Action Insights vertical slice, then port eligible AI Insights, Ask Pulse, and allowlisted Dashboard content.

Gate:

- every eligible type exposes the same Save channel;
- provenance, idempotency, versioning, dedupe, refresh, and user isolation pass;
- suggestions never become bookmarks automatically;
- raw business data/SQL no longer persists in browser storage.

### Phase 6 — Landing and structured snapshots

Implement default-home behavior, versioned snapshots, freshness/hash checks, delta resume, permission revalidation, and context compaction.

Gate: stale/revoked tests and measured token reduction pass without degraded evidence quality.

### Phase 7 — Governed relevance

Implement the minimal event model, retention/delete/reset controls, deterministic bounded ranking, and “Why suggested.”

Gate:

- behavior cannot alter authority or governed business priority;
- incidental activity does not become a permanent preference;
- dismiss/suppress/reset/delete and cross-user tests pass.

### Phase 8 — Dual-experience completion and author publishing

Complete composition inside My Decision Canvas with one focus owner. Implement the author-only mode selector, preview, publish, configuration versioning, fail-safe fallback, and immediate rollback. Preserve the segregated navigation/screens permanently; do not remove them after combined parity.

Gate:

- `segregated` renders the existing four-screen experience without critical regression;
- `combined` completes the normal decision journey without unrelated full-screen navigation;
- author preview does not affect end users;
- publishing changes only the served presentation;
- absent/invalid configuration and kill switch fall back to `segregated`;
- switching modes preserves all user/application state;
- desktop/mobile focus, accessibility, routes, and rollback pass in both modes.

### Phase 9 — Full release validation

Run static, unit, integration, full regression, headed desktop/mobile, console/network, database/audit reconciliation, performance/token, security/adversarial, and rollback-rehearsal checks for both `segregated` and `combined`.

Final verdict must be one of:

- `PASS — verified end to end`
- `PARTIAL — working areas and remaining gaps listed`
- `BLOCKED — external decision/access dependency listed`
- `FAIL — critical gate not met`

---

## 16. Release-blocking negative tests

Release fails unless automated tests prove:

### Identity and authorization

- unsigned, expired, future, wrong-issuer, wrong-audience, and wrong-tenant tokens fail;
- anonymous, shared-key-only, email-only, and empty-role callers cannot mutate;
- forged persona headers/query/body/browser values cannot change authority;
- unrelated roles containing `lead`, `manager`, `director`, `approver`, `supply`, or `analyst` receive no capability;
- unknown/conflicting role mappings fail closed;
- requester self-approval, unassigned approval, and out-of-scope approval fail;
- managers cannot read prompts outside their business-data entitlement.
- cross-origin state-changing requests fail under the approved CORS/Origin/SameSite/anti-CSRF policy;

### Experience-mode governance

- callers without `can_configure_experience` cannot preview, change, or publish a mode;
- end-user URL/query/body/localStorage values cannot override the published author mode;
- invalid, missing, stale-version, or unavailable author configuration falls back to `segregated`;
- author preview is isolated to the author and never changes the published end-user mode;
- a stale author-configuration version returns `409`;
- the operational kill switch forces `segregated`;
- mode switching changes presentation only and cannot delete or rewrite user/application data;

### Action governance

- forged approval requirement, action level, status, capability, owner, and evidence fields are ignored;
- L3 cannot complete before approval;
- rule loading rejects L3 with `approval_required=false` and rejects invalid L1/L2 transitions;
- L4/L5 fail through config, API, and UI;
- low-confidence prompts cannot create L2/L3 requests;
- stale prompt/request versions and evidence hashes return `409`;
- identical idempotent replay returns the original result without duplicates;
- reused key with a different payload returns `409`;
- concurrent approve/reject/defer allows exactly one accepted transition;
- requester and approver separation is enforced;
- producer reruns preserve human requests, approvals, feedback, and outcomes;
- snooze remains event-sourced, expires at the required `snooze_until`, and never mutates the producer prompt row;
- forced audit/outbox failure cannot create an acknowledged unaudited transition.

### SQL and scope

- injection payloads in IDs, rationale, filters, pagination, profile, persona, and config cannot alter SQL structure;
- stored-XSS payloads in titles, notes, tags, rationale, narratives, evidence samples, URLs, and modified payloads render inert;
- runtime values use parameter markers;
- dynamic identifiers resolve only from the approved registry;
- Action Insights refuses an unapproved profile, warehouse, Genie space, source table, or store;
- query/access logs show zero data access outside the approved boundary.

### Synthetic privacy and source isolation

- absent, corrupted, schema-incompatible, or unredacted contract payloads fail closed;
- no generated value matches a prohibited source literal, identifier, secret, or rare value;
- deterministic reruns with seed `42` produce the expected checksums;
- intentional orphan rates remain within approved tolerances and the invalid `country_channel` join is never enforced;
- a sampling run cannot be represented as full scale;
- neither interface mode can address staging objects or the captured source Genie space;
- a generated-to-serving load cannot begin without the separate conformance `GO`;
- failed conformance, privacy, rollback, or six-rule semantic checks leave the canonical serving table unchanged.

### Canvas, snapshot, and history

- User A cannot list, read, infer, modify, delete, refresh, restore, or suggest from User B’s objects;
- forged owner IDs and cross-user object references fail;
- shared devices/browser caches do not expose the prior user’s content;
- permission revocation invalidates saved content and blocks refresh/action;
- deleted/expired history and snapshots are not retrievable;
- bookmarks remain distinct from suggestions;
- snapshots do not bypass fresh action authorization;
- browser storage contains no restricted business content or executable query.
- upgrade/logout purges the legacy `pulseplay:canvas-tiles` raw rows/SQL and does not upload them;
- HMAC key rotation preserves existing IDs/dedupe/saved references until an approved re-key completes.

### Personalization

- relevance signals cannot alter role, permission, business scope, severity, confidence, action level, or approval priority;
- incidental clicks do not create permanent preferences;
- dismiss, suppress, correction, reset, and deletion work;
- suggestion reasons match deterministic ranking factors;
- no more than three suggestions are preloaded.

Every denied and failed case must produce durable, redacted audit evidence where policy requires it.

---

## 17. Static, unit, integration, and browser validation

Discover and use the repository’s actual commands. Report exact commands and current counts. Do not copy historical counts.

### Static

- TypeScript typecheck
- ESLint
- production build
- `node --check` for changed JavaScript
- Python compilation
- rules-engine `--selfcheck`
- configuration/schema validation
- secret and hardcoded-scope scan

### Unit and integration

Cover:

- six-rule loading;
- ten-part deterministic render;
- confidence tiers;
- author experience configuration, authorization, versioning, preview, publish, resolution, fallback, and rollback;
- segregated/combined route and deep-link resolution;
- stable HMAC/SHA-256 IDs, key rotation, and dedupe;
- per-rule isolation;
- L4/L5 rejection;
- Statement API parameter binding;
- exact IdP mapping;
- entitlement filtering;
- Action Request state machine, L2 terminal preparation, external-implementation attestation, and outcome assignment;
- medium-confidence validation and invalidation;
- rationale/modify/defer/T+14 outcome behavior;
- create/update idempotency, replay, version conflict, and concurrency;
- durable audit/outbox reconciliation;
- producer-state preservation;
- canonical and compatibility APIs;
- CanvasSection validation and provenance;
- pin/bookmark/highlight/note/snapshot/unpin/reorder/group;
- cross-user isolation;
- default-home precedence and Undo;
- snapshot compaction/invalidation/delta restore;
- permission refresh before L2/L3;
- relevance ranking and explanation;
- retention/reset/delete;
- CSRF/CORS and stored-content sanitization;
- full proxy and UI regression suites.

### Headed browser evidence

Validate at desktop and mobile widths with the real application and current backend:

1. With no published configuration, the existing segregated interface opens by default.
2. Segregated desktop tabs and mobile bottom navigation remain unchanged.
3. Segregated AI Insights, Ask Pulse, Action Insights, and Dashboard render and behave as before.
4. A non-author cannot preview, change, or publish the interface mode.
5. Author preview opens either mode only for that author.
6. Publishing `combined` serves My Decision Canvas to end users without deleting state.
7. Publishing `segregated` or activating the kill switch immediately restores the existing interface.
8. Invalid/unavailable configuration falls back to segregated.
9. Deep links render the existing screen in segregated mode and focus the corresponding Canvas mode in combined mode.
10. My Decision Canvas opens and preserves shell layout.
11. Combined desktop and mobile navigation work.
12. Action Inbox renders proactively without typing.
13. Presentation persona switching cannot change authority.
14. Planner and approver see only entitled prompts/actions.
15. Evidence shows query reference, samples, hash, and audit note.
16. Opening evidence creates an audit event.
17. High/medium/low confidence wording and capabilities are correct.
18. Medium-confidence validation is recorded and becomes stale when evidence changes.
19. L2 prepares and logs without delivery.
20. L3 creates a durable pending Action Request.
21. Requester cannot self-approve.
22. Authorized approval completes only after fresh validation.
23. Modify, defer, reject, and false-positive rationale work.
24. T+14 outcome due/overdue capture and closure work.
25. Empty, loading, error, Retry, stale, resolved, revoked, and failed-action states are usable.
26. Eligible decision, insight, grounded answer, and BI view sections expose the common Save channel.
27. Pin, bookmark, whole-section highlight, note, snapshot, unpin, order, and group persist across logout/login, devices, and mode changes.
28. In combined mode, the first explicit save sets Canvas home and Undo works.
29. In segregated mode, saved Canvas content does not override the existing landing surface.
30. Suggested content does not become a bookmark.
31. “Since You Last Visited” distinguishes changed, stale, resolved, and safely redacted revoked items.
32. Snapshot resume uses compact context and fetches only relevant deltas.
33. L2/L3 after resume refreshes permissions/evidence.
34. User A cannot access User B’s saved objects.
35. Suggestions show correct deterministic reasons and respect dismiss/suppress/reset.
36. One detail layer owns focus in combined mode; no overlapping full-screen experiences.
37. Existing Power BI and Databricks flows regress zero critical behavior in both modes.
38. Console, page, and network logs contain no unexpected errors or API failures.
39. Footer, pane controls, keyboard order, focus return, touch targets, and mobile viewport pass in both modes.

For each screenshot/evidence item record:

- scenario;
- repository SHA and application version;
- actor/persona/entitlement;
- viewport;
- prompt/rule/request/section ID;
- expected result;
- observed result;
- PASS/FAIL;
- screenshot path;
- console/network references;
- database/audit evidence;
- defects discovered during visual inspection.

Inspect every screenshot personally. Runtime/database evidence overrides automation labels when they conflict.

---

## 18. Required deliverables

Return:

1. pinned baseline and evidence taxonomy;
2. `baseline-evidence-matrix.md`;
3. approved architecture ADR and `canonical-contract.yaml`;
4. populated `rule-spec.yaml`, `identity-entitlement-privacy.yaml`, `bi-source-allowlist.yaml`, and `benchmark-fixtures.yaml` with owner/approval status;
5. current-to-target table, rule, persona, API, route, profile, and engine mapping;
6. author experience-mode schema, authorization mapping, resolution order, preview/publish flow, mode matrix, fallback, kill-switch, and rollback proof;
7. threat model and negative-test catalogue;
8. reviewed DDL, migration, rollback, and producer-state-preservation plan;
9. six-rule registry and engine selfcheck/dry-run report;
10. API contract and middleware/profile-binding proof;
11. Decision Prompt, Action Request, CanvasSection, and snapshot schemas;
12. privacy, classification, retention, deletion, and relevance policy;
13. file-by-file change register with reason, risk, validation, and rollback;
14. exact static/unit/integration/full-suite commands and current counts for both experience modes;
15. headed evidence index and inspected screenshots for both modes;
16. prompt/action/request/audit database reconciliation;
17. token/context baseline and measured reduction report;
18. performance and failure-recovery results;
19. requirement traceability matrix;
20. open blocker register with owner, decision required, risk, and next action;
21. when the synthetic lane is authorized: contract inventory, generator manifest, privacy/leakage evidence, `VALIDATION_REPORT.md`, synthetic-to-serving mapping, and conformance gate verdict;
22. final release verdict.

Evidence coverage is:

`VERIFIED applicable acceptance criteria ÷ total applicable acceptance criteria`

Blocked, missing, contradicted, or unverified criteria reduce coverage. Do not claim “99.99% confidence” unless a separately defined statistical method supports it.

---

## 19. Stop conditions

Stop and report instead of guessing when:

- a required owner manifest is unapproved or contradicts the canonical target;
- the synthetic lane is requested but `data-contracts/genie-01f130be/` is absent, incomplete, inconsistent, or unredacted;
- synthetic generation or a conformance load would expose real values, bypass the approved schema, or wire PulsePlay to staging/captured-source objects;
- the approved author role/group for `can_configure_experience` is unavailable;
- the live schema conflicts with the target;
- identity claims or role ownership require a business decision;
- approved group/app-role IDs are unavailable;
- the current identity cannot isolate user-owned state;
- required token, warehouse, Genie, UC, DDL, or job privileges are missing;
- the platform cannot prove safe concurrent transitions and durable audit;
- a migration would query or write outside the approved boundary;
- a destructive action, prompt deletion, broad backfill, or legacy migration lacks explicit authorization;
- history retention, consent, deletion, classification, or ownership policy is unresolved;
- a snapshot would persist restricted content without an approved expiry/classification;
- an action would send a communication, create a ticket, modify business data, or exceed L3;
- headed validation cannot use the real application/runtime.
- combined-mode validation fails; keep the published mode as `segregated` and report the blocker rather than replacing the existing interface.

### Never

- fabricate live verification;
- hide failures;
- treat historical evidence as current;
- trust a client-supplied persona, role, owner, action level, approval flag, or user ID;
- use role-name substring matching;
- allow anonymous/shared-key-only user mutations;
- let requester and approver be the same user;
- let a model detect, recommend outside policy, authorize, approve, or execute;
- use custom string escaping instead of runtime parameter binding;
- access data outside the approved scope;
- represent documented synthetic-capture claims as current runtime verification;
- expose a synthetic staging object or captured source Genie space to either PulsePlay interface mode;
- load synthetic data into the serving table without the separate conformance `GO`;
- persist restricted data or SQL in browser storage;
- replay full history into every model call;
- use a screenshot as machine context;
- infer persona or permission from behavior;
- silently convert suggestions to bookmarks;
- remove or silently replace the existing segregated interface;
- fork backend, rules, authorization, approval, or persistence logic between segregated and combined modes;
- let an end user override the author’s published interface mode;
- expand to another domain before the MVP gates pass.

---

## 20. Final MVP boundary

### Included

- one supply-chain domain;
- two canonical personas;
- permanently supported segregated and combined presentation modes;
- author-only preview/publish selector with segregated default, fallback, kill switch, and rollback;
- six canonical deterministic rules;
- L1–L3 only;
- durable Action Requests and approval separation;
- prepared/logged-only action payloads;
- complete Decision Prompt and audit trail;
- secure Action Inbox;
- four CanvasSection types;
- pin, bookmark, whole-section highlight, note, snapshot, unpin, reorder, and group;
- server-side per-user persistence;
- default-home behavior with Undo;
- structured snapshot and delta resume;
- current/changed/stale/resolved/revoked states;
- explicit-signal relevance suggestions;
- “Why suggested,” dismiss, suppress, and reset;
- desktop/mobile accessibility;
- mode-aware deep links that preserve existing screens in segregated mode and focus Canvas content in combined mode;
- optional synthetic-data POC lane, isolated from the application runtime and subject to separate privacy and conformance gates.

### Deferred

- freeform text-range underline/highlight;
- raw hover/behavioral profiling;
- ML/LLM-controlled ranking;
- multiple personal canvases or templates;
- shared/team canvases and comments;
- notifications and external delivery integrations;
- arbitrary DOM/iframe pinning;
- viewer-edited SQL;
- live business-data mutations;
- L4/L5 autonomy;
- additional domains before supply-chain MVP passes.

### Next phase only after MVP PASS

- durable approver queue UI and count badge;
- notifications and governed delivery adapters;
- richer saved-layout templates;
- team-shared Canvas after ownership policy;
- additional domains through configuration;
- narration-quality evaluation;
- carefully permissioned, reversible L4 investigation.

---

## 21. Required final answer format

Lead with the truth:

1. **Executive verdict**
2. **Verified current state**
3. **Contradictions and migration decisions**
4. **Security and data-governance outcome**
5. **Implemented changes**
6. **Test and headed-browser evidence**
7. **Database, Action Request, and audit reconciliation**
8. **Canvas, snapshot, and relevance proof**
9. **Evidence coverage**
10. **Open blockers and exact next action**

End with exactly one:

- **PASS — verified end to end**
- **PARTIAL — working areas and remaining gaps listed**
- **BLOCKED — external decision, access, or environment dependency listed**
- **FAIL — critical acceptance or security gate not met**
