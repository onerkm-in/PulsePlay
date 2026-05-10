# PulsePlay Quality Methodology — Honest Statement

> What we measure today, what we don't, what's on the roadmap. Inherits the honesty framework from the sister project; updates the numbers to PulsePlay reality.
>
> Read this before promising any number on stage.

## What we DO measure today

### 1. Structural correctness (automated, inherited)

- **342 jest tests in `proxy/`** covering: profile resolution, OAuth M2M flow, X-Request-Id correlation, rate limiting, PII redaction, DML keyword blocking, identifier sanitization, supervisor-local fan-out, validator framework, foundation model client, bedrock signing.
- **All 342 currently green** at HEAD (`5e1036d`). The proxy was copied verbatim from Pulse and the test suite came with it.

These tests assert the code emits the right SHAPE of output (correct prompt structure, correct cache key, correct sanitization, correct API call). They do NOT assert that the AI's natural-language answer is factually correct on a given dataset.

### 2. Build hygiene

- TypeScript strict mode (playground + bi-adapters)
- Vite build clean
- Node version pin (18-22 supported)
- Lint config in place (`npm run lint`)

### 3. Live qualitative review

This is currently zero — the playground has no test fixtures, no canonical demo dataset, no manual click-through QA. v0.2 work: stand up a demo dataset (the inherited Sales/Superstore from Pulse is a candidate) and run the same canonical 5-10 representative AI questions after each significant change.

## What we DO NOT measure today

### 1. Playground tests

**Zero playground tests written.** Vitest is configured per [package.json:12](../playground/package.json#L12) (`"test": "vitest run"`) but there are no `*.test.ts*` files under `playground/`. The 2-axis abstraction (BIAdapter contract, BIPanel host, registry) has zero coverage of its own. The pickers and the AI sidebar have zero coverage.

This is the single biggest quality gap. v0.2 priority.

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

There is no conformance harness that exercises every adapter against the BIAdapter contract — every adapter except `generic-iframe` is a stub today, so there's nothing meaningful to test. v0.2 work: when the first vendor adapter graduates from stub, write a conformance suite that asserts every required event fires, every supported command executes, every BICapability advertised actually works.

### 5. Performance benchmarks

- Sidebar latency observed in dev tools but not benchmarked across releases.
- Cache hit rate not tracked (cache layer not yet ported from Pulse).
- Proxy throughput / queue depth not instrumented.

### 6. Accessibility audit

WCAG compliance is not formally tested. The playground UI is minimal today; a formal audit makes sense after v0.2 (real adapters wired) when the surface area stabilizes.

## What's on the roadmap

### Near-term (v0.2)

- **Playground tests v1** — vendor-agnostic BIAdapter contract test (every adapter must pass), BIPanel host test (mount/destroy lifecycle), registry test (lazy-loading), AISidebar test (submit + render path with mocked proxy responses). Target: 30-50 tests, all green.
- **First vendor conformance suite** — when the first real vendor adapter lands (probably Power BI), write the conformance harness that any adapter must pass. Apply retroactively to generic-iframe.
- **Smoke test against a live Databricks workspace** — adapt `scripts/smoke-full.ps1` (Pulse-shaped) to PulsePlay's profiles. Verify proxy + Genie roundtrip, profile listing, error mapping.

### Medium-term (v0.3+)

- **Eval suite v1** — 30-50 fixed questions across 3 reference datasets with ground-truth answers. Run nightly. Track regression. Estimated 2 weeks for v1.
- **Hallucination detector** — post-process AI answers to extract cited numbers and reconcile against the underlying data. Flag when the answer asserts a number not present in the bound data. 1 week heuristic v1; 3+ weeks for a robust LLM-as-judge harness.
- **Per-connector A/B harness** — same prompt across all 6 production backends, side-by-side answer comparison, qualitative score. 1 week.

### Long-term

- WCAG 2.1 AA audit
- Continuous-eval pipeline that runs against PR branches before merge
- Per-tenant quality dashboard (latency, cache hit rate, validator pass rate, recommendation acceptance)

## Honest disclosure rules

**Do say:**

- "The proxy has 342 inherited jest tests, all green."
- "The playground has zero tests today; first batch lands in v0.2."
- "The 2-axis abstraction is implemented as a contract; only generic-iframe is real."
- "Eval suite is on the roadmap as a v0.3 candidate. We're not promising answer-quality numbers without measuring them."

**Don't say:**

- "Output quality is 99%."
- "We score every answer."
- "PulsePlay outperforms [competitor] on accuracy."
- "Power BI integration is production-ready" (it's a stub).

**If asked "how do you know it works?":**

*"For structural correctness — automated tests on the proxy, all green. For the playground — manual click-through. For answer quality — qualitative review only; the formal eval rig is the next investment. The 2-axis abstraction is a contract enforced by TypeScript and tested via the inherited proxy paths; the vendor side is mostly stubs awaiting real SDK wiring."*

## Why this honesty matters

A sharp evaluator will ask "show me the test results" within 5 minutes. Better to say "342 proxy tests green; 0 playground tests; eval suite next investment" than to claim a measured number that doesn't exist. The proxy infrastructure (sanitization, OAuth, rate-limit, validator) is measurably solid today; the playground is a scaffold; the AI side is platform-team-owned. Lead with what's true; let the eval claim grow alongside the actual eval rig.

---

*Compiled 2026-05-10 during the docs consolidation cycle. Re-run when test counts change or when the eval rig lands. The historical Pulse-numbered version is archived at [inherited/PEPPULSE_BEAST_MODE_MEMORY.md](inherited/PEPPULSE_BEAST_MODE_MEMORY.md) and the original `QUALITY_METHODOLOGY.md` content this file pruned from.*
