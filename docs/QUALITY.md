# PulsePlay Quality Methodology — Honest Statement

> What we measure today, what we don't, what's on the roadmap. Inherits the honesty framework from the sister project; updates the numbers to PulsePlay reality.
>
> Read this before promising any number on stage.

## What we DO measure today

### 1. Structural correctness (automated)

- **1137 jest tests in `proxy/`** in the latest recorded 2026-05-21 validation, covering profile resolution, OAuth M2M flow, X-Request-Id correlation, rate limiting, PII redaction, DML keyword blocking, identifier sanitization, supervisor-local fan-out, validator framework, foundation model client, bedrock signing, connector probe, discovery-context injection, pack prompt injection, Power BI embed-token flow, Power BI deterministic semantic-model templates, Power BI Q&A token minting, metadata-read rate-limit exemptions, analytics paths, the PX1 client identity contract, G3 governance attestation route wiring, admin auth-mode parity, SQL preview CTE validation, streaming error redaction, SS2 smoke-fixture profile, and FW1 query-result fixture shape.
- **1382 vitest tests in `playground/` + `bi-adapters/`** in the latest recorded 2026-05-21 validation, covering BIAdapter conformance, generic iframe behavior, Power BI adapter behavior including secure embed preview and developer snapshots, Tableau/Qlik/Looker iframe stubs, native adapter skeleton guardrails, native governance fail-closed behavior, PulseShell host behavior, health-probe single-flight caching, performance levers, discovery probe status, Power BI Q&A client behavior, AI Insights output polish, card-style Insights rendering, raw-data Excel export helpers, AISidebar, pack preset merge, PII redaction, layout surface availability, Databricks source refs, governance attestation shape validation, native canvas/fusion, G5 BI surface mode, Quick Setup embed config integrity, FW1 AISidebar-to-native envelope mapping, and the pure visualization result-to-chart pipeline.
- **93 vitest tests in `enablers/pulse-pbi/`** in the latest recorded 2026-05-21 validation, now covering PB1a shared-proxy headers/routes/result parsing in addition to the existing Pulse PBI unit surface. Lint and `pbiviz package` also pass locally, but the `pbiviz` toolchain is not yet pinned in the enabler lockfile.

These tests assert the code emits the right SHAPE of output (correct prompt structure, correct cache key, correct sanitization, correct API call). They do NOT assert that the AI's natural-language answer is factually correct on a given dataset.

### 2. Build hygiene

- TypeScript strict mode (playground + bi-adapters)
- Vite build clean
- Node version pin (18-22 supported)
- Lint config in place (`npm run lint`)

### 3. Live qualitative review

The playground has local browser smoke coverage for shell mount (SS1) and a proxy-backed AISidebar round-trip (SS2). It still does not prove live Databricks answer correctness unless an org Power BI report and Databricks profile are connected. v0.2 work: promote the inherited Sales/Superstore PBIP and old live-test prompts into a credentialed PulsePlay reference fixture, then run the same canonical 5-10 representative AI questions after each significant change.

## What we DO NOT measure today

### 1. Inherited visual parity tests

The old Power BI visual has **37 visual test files** under `genieChatVisual/tests`. They cover many pure behaviors that PulsePlay still depends on: context building, prompt redaction, setup validation, SQL sections, insights rendering, cache, metric rules, theme inheritance, and security.

PulsePlay has new tests, but those 37 old tests are not yet ported. This is the single biggest parity gap because it means mature behavior exists without equivalent browser-host regression coverage.

### 2. Answer correctness (semantic)

There is no automated harness that:

- Compares an AI sidebar answer against a known-good ground-truth answer
- Scores responses against an expected SQL or expected number
- Detects hallucinations (the AI confidently asserting a fact that isn't in the data)
- Tracks regression in answer quality across releases

When the team or an external doc claims "output quality is high" — that is a qualitative observation by the maintainer, NOT a number from a measured benchmark.

### 3. Per-connector quality parity

We have not measured whether Genie, Azure OpenAI, AWS Bedrock, Foundation Model, and supervisor-local produce equivalent answer quality on the same question. Inherited anecdote: Genie produces the strongest SQL-grounded answers; OpenAI / Bedrock are functional but require schema context to generate accurate SQL; Foundation Model is best for reasoning sections (RECOMMENDED ACTIONS, RISKS) where Genie's Chat mode is weak.

### 4. Per-vendor adapter compliance

There is now a BIAdapter conformance harness, and Power BI has graduated to the real `powerbi-client` SDK. Tableau, Qlik, and Looker still use iframe fallbacks. v0.2 work: make the conformance suite deeper for real SDK adapters so every advertised capability is proven by a test or explicitly marked as unsupported.

### 5. Performance benchmarks

- Sidebar latency observed in dev tools but not benchmarked across releases.
- Cache hit rate not tracked (cache layer not yet ported from Pulse).
- Proxy throughput / queue depth not instrumented.

### 6. Accessibility audit

WCAG compliance is not formally tested. The playground UI is minimal today; a formal audit makes sense after v0.2 (real adapters wired) when the surface area stabilizes.

## What's on the roadmap

### Near-term (v0.2)

- **Playground tests v1** — vendor-agnostic BIAdapter contract test (every adapter must pass), BIPanel host test (mount/destroy lifecycle), registry test (lazy-loading), AISidebar test (submit + render path with mocked proxy responses). Target: 30-50 tests, all green.
- **Inherited visual parity tests** — port highest-value old pure tests into `playground/src/pulse` or equivalent browser-host test folders.
- **First vendor conformance suite expansion** — deepen the existing BIAdapter harness around real Power BI load/context/filter behavior. Apply the same expectations retroactively to generic-iframe where meaningful.
- **Smoke test against a live Databricks workspace** — adapt `scripts/smoke-full.ps1` (Pulse-shaped) to PulsePlay's profiles. Verify proxy + Genie roundtrip, profile listing, error mapping.

### Medium-term (v0.3+)

- **Eval suite v1** — 30-50 fixed questions across 3 reference datasets with ground-truth answers. Run nightly. Track regression. Estimated 2 weeks for v1.
- **Hallucination detector** — post-process AI answers to extract cited numbers and reconcile against the underlying data. Flag when the answer asserts a number not present in the bound data. 1 week heuristic v1; 3+ weeks for a robust LLM-as-judge harness.
- **Per-connector A/B harness** — same prompt across all 10 backend paths where applicable, side-by-side answer comparison, qualitative score. 1 week.

### Long-term

- WCAG 2.1 AA audit
- Continuous-eval pipeline that runs against PR branches before merge
- Per-tenant quality dashboard (latency, cache hit rate, validator pass rate, recommendation acceptance)

## Honest disclosure rules

**Do say:**

- "The proxy has 1137 jest tests, all green in the latest recorded local run."
- "The playground and BI adapters have 1382 vitest tests, all green in the latest recorded local run."
- "The Pulse PBI enabler has 93 unit tests, all green in the latest recorded local run; its package lane passes locally but the pbiviz toolchain pin is still queued."
- "The 2-axis abstraction is implemented as a contract; Power BI is real, Tableau/Qlik/Looker are still iframe fallbacks."
- "The old Power BI visual has a larger visual test bank; we are porting the most valuable pure tests."
- "Eval suite is on the roadmap as a v0.3 candidate. We're not promising answer-quality numbers without measuring them."

**Don't say:**

- "Output quality is 99%."
- "We score every answer."
- "PulsePlay outperforms [competitor] on accuracy."
- "Every BI integration is production-ready."

**If asked "how do you know it works?":**

*"For structural correctness — automated tests on the proxy, playground, BI adapters, and Pulse PBI enabler are green. For answer quality — qualitative review only; the formal eval rig is the next investment. The 2-axis abstraction is a contract enforced by TypeScript and conformance tests; Power BI is the first real SDK adapter, while other BI vendors remain iframe fallbacks until their SDK adapters graduate."*

## Why this honesty matters

A sharp evaluator will ask "show me the test results" within 5 minutes. Better to say "1137 proxy tests green; 1382 playground/adapter tests green; 93 Pulse PBI enabler unit tests green; SS2/FW1 proxy-backed shell smoke green in the latest recorded validation; eval suite next investment" than to claim a measured answer-quality number that doesn't exist. The proxy infrastructure is measurably solid, Power BI is the first real BI adapter, and the playground architecture is becoming test-backed. Lead with what's true; let the eval claim grow alongside the actual eval rig.

---

*Compiled 2026-05-10 during the docs consolidation cycle. Updated 2026-05-21 after FW1/PB1a raised latest recorded validation to proxy 1137/1137, playground 1382/1382, Pulse PBI enabler 93/93, a passing proxy-backed shell smoke, and a passing Pulse PBI `.pbiviz` package. Re-run when test counts change or when the eval rig lands. The historical Pulse-numbered version is archived at [inherited/PEPPULSE_BEAST_MODE_MEMORY.md](inherited/PEPPULSE_BEAST_MODE_MEMORY.md) and the original `QUALITY_METHODOLOGY.md` content this file pruned from.*
