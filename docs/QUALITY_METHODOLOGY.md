# Quality Methodology — Honest Statement

> What we measure today, what we don't, and what's on the roadmap.
>
> This doc closes the credibility gap surfaced in the PepPulse Narrative Audit (now [`ROADMAP.md`](ROADMAP.md) Part 6) demo risk #5: *"the 70%→99% accuracy claim is unmeasured."* The honest answer is below — read this before promising any number on stage.

---

## What we DO measure today

### 1. Structural correctness (automated)
- **874 vitest unit tests** covering: prompt assembly, sanitization, cache key composition, settings serialization, locale formatting, validation logic, rendering primitives, dark-mode overrides.
- **152 jest unit tests** covering: proxy routing, profile resolution, OAuth M2M flow, X-Request-Id correlation, rate limiting, PII redaction, DML keyword blocking, identifier sanitization.
- **Smoke tests**: `smoke-full.ps1` (10/10) + `smoke-rls-ols.ps1` (4/4) — validate end-to-end proxy + Direct paths against a live Databricks workspace.

These tests assert that the code emits the **right shape** of output (correct prompt structure, correct cache key, correct sanitization, correct API call). They do **not** assert that the AI's natural-language answer is factually correct on a given dataset.

### 2. Build hygiene
- `.pbiviz` size cap (350 KB enforced)
- Lint + TypeScript strict mode
- Node version pin (18-22)
- Pre-commit hook gates

### 3. Live qualitative review (manual)
After each Wave shipment, the maintainer manually clicks through the visual against the canonical demo PBIP (`PBI/DwD_PBI_Demo.Report/`) and reviews 5-10 representative AI Insights / Chat outputs. Defects are filed in the feedback tracker (now [`CONTINUITY.md`](CONTINUITY.md) Part 1) and addressed in the next cycle.

---

## What we DO NOT measure today

### 1. Answer correctness (semantic)
There is **no automated harness** that:
- Compares an AI Insights output against a known-good ground-truth answer
- Scores Chat responses against an expected SQL or expected number
- Detects hallucinations (the AI confidently asserting a fact that isn't in the data)
- Tracks regression in answer quality across Wave shipments

When the narrative says *"output quality lifted from ~70% to ~99%"* this is a **qualitative observation** by the maintainer based on iterative live testing — it is NOT a number from a measured benchmark.

### 2. Per-backend quality parity
We have not measured whether Direct mode, Proxy mode, Azure OpenAI mode, and Bedrock mode produce equivalent answer quality on the same question + dataset. Anecdotally Direct + Proxy modes (Databricks Genie) produce the strongest answers; OpenAI and Bedrock modes are functional but have not been A/B'd.

### 3. Performance benchmarks
- AI Insights stage latency is observed in dev tools but not benchmarked across releases.
- Cache hit rate is not tracked.
- Proxy throughput / queue depth not instrumented.

### 4. Accessibility audit
WCAG compliance is not formally tested. Wave 30 shipped a forced-colors media block + composer aria-label + chat live region (cycle 5), but no comprehensive WCAG 2.1 AA audit has been performed.

---

## What's on the roadmap

### Near-term (Wave 32 / 33)
- **Wave 32 — One-click "Test my whole config"**: orchestrates connectivity + test question + insights stage. Single button, green/red per stage, timing visible. Does NOT score answer quality — just verifies the pipeline executes end-to-end.
- **Wave 33 — Trend pill consistency**: ensures ▲/▼ + colors flow uniformly across all sections (today inconsistent — see Wave 33 spec).

### Medium-term (proposed, not yet specced)
- **Eval suite v1**: 30-50 fixed questions per backend across 3 reference datasets (Superstore, HR sample, healthcare sample) with ground-truth answers. Run nightly. Track regression. **Estimated effort: 2 weeks for v1.**
- **Hallucination detector**: post-process AI answers to extract cited numbers and reconcile against the underlying data. Flag when the answer asserts a number not present in the bound dataset. **Estimated effort: 1 week for a heuristic v1; 3+ weeks for a robust LLM-as-judge harness.**
- **Per-backend A/B harness**: same prompt across all 4 production backends, side-by-side answer comparison, qualitative score from a panel. **Estimated effort: 1 week.**
- **WCAG 2.1 AA audit**: formal third-party or in-house pass against axe-core / Lighthouse. **Estimated effort: 1 week.**

### Long-term
- Customer-facing quality dashboard (per-tenant cache hit rate, answer latency, supervisor confidence distribution)
- Continuous-eval pipeline that runs against PR branches before merge

---

## Honest stage advice

**Do say:**
- "We have 874 + 152 unit tests covering structural correctness, sanitization, and the security layer."
- "We have 10/10 + 4/4 smoke tests covering end-to-end proxy and Direct paths."
- "Output quality has improved materially through Wave 22-30 prompt engineering — qualitatively excellent for the demo paths we use."
- "Eval suite is on the roadmap as a Wave 36 candidate — we're not promising 99% without measuring it."

**Don't say:**
- "Output quality is 99%."
- "We score every answer."
- "We benchmark against [competitor]."

**If asked "how do you know it works?":**
*"For structural correctness — automated tests, all green. For answer quality — qualitative review against representative datasets, with a formal eval suite as the next investment. We've designed the cache + sanitization layers to be measurable; the eval rig sits on top."*

---

## Why this honesty matters

A sharp executive or technical evaluator will ask "show me the eval rig" within 5 minutes. Better to say "it's on the roadmap, here's why" than to claim a measured number that doesn't exist. The connector architecture, defense-in-depth security, and cache governance are **measurably good** today (audit by `connectorRegistry.ts` + Wave 22-30 commits) — lead with those, and let the eval claim grow alongside the actual eval rig.

---

*Compiled May 2026, Wave 30 cycle 6, in response to forum-prep audit findings.*
