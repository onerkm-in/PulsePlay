# Superior Build Leverage Plan

> Purpose: respect the hard-won Power BI custom visual work, promote the best parts into PulsePlay, and avoid turning a mature build into a shallow rewrite.

## Position

The sister project at `D:\Working_Folder\Projects\DwD_AI_Assistant_for_PBI` is not just legacy input. It is the strongest evidence bank for PulsePlay's first copy: live Power BI testing, Databricks Genie iteration, setup UX polish, proxy hardening, smoke scripts, PBIP demo assets, and many more tests than the playground currently has.

PulsePlay should use two simple rules:

**Best proven behavior wins, but it must enter PulsePlay through modular contracts.**

**The first production-grade build is Databricks Genie + Power BI.**

**A novice author should be able to configure that build in about 10 minutes when platform prerequisites are ready.**

That means we reuse the learning, tests, prompts, UX flows, and operational guardrails. We do not blindly recreate Power BI-only assumptions in the playground host, and we do not spread polish across every possible adapter before the first cell is robust.

## Evidence From The Scan

Old Power BI visual:

- Mature handover history through Session 76 / Cycle 47, including live-test polish.
- 37 visual test files in `genieChatVisual/tests`.
- PBIP demo assets under `PBI/DwD_PBI_Demo.*`.
- Proven smoke scripts: `smoke-full.ps1`, `smoke-rls-ols.ps1`, stress/eval helper scripts.
- Mature setup, security, prompt, SQL, cache, trace, export, and rendering flows.
- Known tripwires documented: XHR-only in Power BI Desktop, `127.0.0.1` over `localhost`, setup belongs inside the visual, security badge is informational, request-id correlation is load-bearing.

PulsePlay now:

- Has copied the Pulse visual source into `playground/src/pulse`.
- 30 of the old visual source files are still byte-identical; 12 have changed for PulsePlay adaptation.
- Has newer browser-host work: real Power BI adapter, BIAdapter conformance, Pulse host stub, pack architecture, Smart Connect direction, Power BI SSO/embed-token route, and tighter enterprise proxy hardening.
- Has 161 playground/adapter tests and 418 proxy tests in the latest local validation, but the old 37 visual test files have not been ported.

The conclusion is not "old is better" or "new is better." The conclusion is: **PulsePlay already contains valuable new host architecture, while the old project contains deeper product maturity. The winning path is fusion through contracts.**

## Leverage Map

### Promote As Core Product Behavior

These are not Power BI-specific ideas; they should become PulsePlay capabilities.

- **Setup progressive disclosure**: old Setup sections and quick tasks become a guided playground setup for AI brain + BI surface + pack.
- **AI-assisted author setup**: Genie/probe metadata drafts pack, KPI, starter-question, and field-mapping choices; the author confirms before save.
- **AI Insights pipeline**: HEADLINE, KPI SNAPSHOT, TRENDS, RISKS, OPPORTUNITIES, RECOMMENDED ACTIONS should graduate into a reusable insight pipeline, not stay buried in `visual.tsx`.
- **Conversation reuse and worker pool**: one Genie conversation per Insights run plus concurrency pooling should be preserved for performance and context continuity.
- **SQL trace and provenance**: multi-query tabs, reused-SQL attribution, request IDs, and query history need to appear in PulsePlay diagnostics.
- **Context builder discipline**: active filters, bound measures, governance posture, and PII redaction become a canonical `BIContext` builder fed by BI events.
- **Validator framework**: structure and semantic checks become reusable quality gates for AI sections, with retry hooks where supported.
- **Metric rules and presets**: domain-specific status logic belongs in `pulsepacks`, with the old preset library as seed material.
- **Quality honesty**: no answer-quality claims without an eval rig.

### Adapt Through Contracts

These are valuable, but must be translated out of the Power BI custom visual world.

| Old concept | PulsePlay contract |
|---|---|
| Power BI `DataView` | Canonical `BIContext` built from `BIEvent`, SDK metadata, and optional schema mapping |
| `host.applyJsonFilter` | `BICommand` with `apply-filter` / `clear-filter` |
| Format pane settings | Playground setup profile + local/session storage + future server profile |
| Power BI data roles | Pack-aware semantic field mapping |
| PBIP demo report | First live reference fixture for Power BI cell |
| Power BI visual lifecycle | Browser host lifecycle around `BIPanel` and adapter readiness |
| Power BI-only styling/theme inheritance | Host theme contract, with per-BI adapter theme hints where available |

### Keep As Historical Or Host-Specific

These should remain documented, but should not shape the generic playground architecture.

- XHR-only API calls: required in Power BI Desktop custom visual sandbox, not for the web playground.
- `.pbiviz` packaging and size caps: important for the sister visual, not a PulsePlay browser constraint.
- Power BI data-role bindings as the only context source: PulsePlay needs event and metadata sources across vendors.
- Power BI-only wording in user-facing UI.
- Any direct import of vendor SDKs into AI or pack logic.

## Current Gaps

1. **Visual test migration gap**: the old 37 visual tests have not been ported. Highest-value pure tests should move first: prompt redaction, context builder, setup validation, SQL sections, insight validation, rendering edge cases, cache.
2. **Context parity gap**: current Power BI context is browser-event-derived, not full DataView parity. First copy should add `getFilters()` / `getPages()` refresh and table/column mapping.
3. **Setup cohesion gap**: Genie profile and Power BI embed setup still feel like separate panels. First copy needs one guided path.
4. **Novice setup gap**: setup still exposes too many separate controls. First build needs a guided 10-minute path with preflight, AI-drafted configuration, review, and live smoke.
5. **Quality evidence gap**: no semantic eval suite yet. Old qualitative learning should become measured fixed-question evals.
6. **Plugin maturity gap**: adapters and connectors need capability negotiation, versioning, and conformance gates before the playground can scale safely.
7. **Market-change gap**: APIs and AI platforms will keep changing. PulsePlay needs a recurring probe/eval/docs update loop, not static assumptions.

## Operating Model

Every inherited or new feature should pass this gate before being called "migrated":

1. **Source evidence**: which old behavior, test, smoke, doc, or live finding proves this matters?
2. **Contract mapping**: which PulsePlay contract owns it: `BIAdapter`, proxy profile, `pulsepack`, setup profile, `BIContext`, or diagnostics?
3. **Adapter neutrality**: does it work when the BI surface is not Power BI or the AI brain is not Genie?
4. **Test proof**: at least one unit/conformance test or smoke path.
5. **Demo proof**: visible in the first playable cell.
6. **Fallback story**: what happens if the vendor lacks the capability?

## First Build Recommendation

Use Databricks Genie + Power BI as the first production-grade playground cell because it has the strongest evidence and the most hard-won learning.

Build it as:

- Power BI through `BIAdapter`.
- Genie through proxy profile.
- Domain behavior through `pulsepacks`.
- Report context through canonical `BIContext`.
- Actions through canonical `BICommand`.
- Setup through one guided first-run path.
- Novice-author acceleration through the 10-minute setup flow in [TEN_MINUTE_AUTHOR_SETUP.md](TEN_MINUTE_AUTHOR_SETUP.md).
- Quality through tests, live smoke, and later eval suite.
- Production readiness through security review, diagnostics, runbook, known limitations, and release acceptance gates.

The tagline remains practical: **bring a BI surface, bring an AI brain, bring a pack, and play here.** For the first build, the supported surface is Power BI and the supported brain is Databricks Genie. Others stay as clean future slots.

## Near-Term Work

- Port the top old pure visual tests into the playground test run.
- Convert the old Setup learnings into a first-run Genie + Power BI guided setup.
- Add the 10-minute author setup path: preflight, report link/SSO, Genie probe, AI setup proposal, review, smoke test.
- Add the Power BI health strip and context refresh.
- Use the PBIP demo model/report as the first credentialed reference fixture.
- Turn old smoke scripts into PulsePlay smoke scripts.
- Start an eval suite with fixed questions from the old live-test prompts and `pulsepacks` sample questions.
- Add capability negotiation: AI features show only when both connector and BI adapter can support them.
- Hold Tableau/Qlik/Looker SDK graduation until the Genie + Power BI production gate passes.
