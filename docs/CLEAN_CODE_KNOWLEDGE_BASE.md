# Clean Code Knowledge Base

> Repository interpretation of Robert C. Martin, *Clean Code: A Handbook of
> Agile Software Craftsmanship*, second edition, 2025 early-release PDF.
>
> Source supplied locally by the project owner:
> `D:\Working_Folder\References\975179421-Clean-Code-a-Handbook-of-Agile-Software-Craftsmanship-Robert-C-Martin-2-2025-Addison-Wesley-Professional-9780135398579-Fd353adc5f0.pdf`
>
> Citations below use **PDF page numbers**, not printed-page numbers. The
> reviewed file has 912 PDF pages. This document is a derived engineering
> reference, not a reproduction of the book.

## Purpose and authority

This knowledge base turns the book into reviewable PulsePlay practices. It is a
decision aid, not an automatic mandate:

- Project contracts, security requirements, product behaviour, and tests win
  over stylistic preferences.
- Advice is adapted to React 19, TypeScript, Node/Express, asynchronous I/O, and
  PulsePlay's inherited compatibility surface.
- A finding needs observable repository evidence. File length alone is a
  signal to investigate, not proof that code is defective.
- Cleanup must preserve behaviour and arrive in small, tested changes. A broad
  rewrite called "clean code" is not acceptable evidence of improvement.

The book itself acknowledges that experienced programmers disagree and includes
contrary views in its debate appendix (PDF pp. 827-906). PulsePlay therefore
uses the rules below as heuristics with explicit exceptions.

## The PulsePlay standard

### 1. Make intent easy to recover

**Book basis:** meaningful names (PDF pp. 138-159), comments (pp. 160-196),
formatting and team rules (pp. 197-226), and polite top-to-bottom reading
(pp. 380-389).

- Name modules, types, functions, state, and tests for the domain intent they
  carry. Avoid locally invented abbreviations unless they are established
  domain terms such as BI, KPI, RLS, SQL, or DAX.
- Keep one vocabulary for one concept across UI, proxy, contracts, tests, and
  docs. Translation belongs at a named boundary.
- Organize files from policy and public entry points toward implementation
  detail where the language/framework permits it.
- Comments explain **why**, constraints, non-obvious risks, and empirical
  tripwires. They must not narrate syntax or preserve dead code.
- Prefer executable contracts, types, and tests over comments that can drift.
- Formatting is team-owned and mechanically enforceable where practical.

**Review prompts:** Can a maintainer predict the effect from the name? Are two
names hiding one concept? Does a comment explain information absent from the
code? Does the comment still match behaviour?

### 2. Keep functions cohesive and explicit

**Book basis:** small functions and the stepdown rule (PDF pp. 227-258),
function heuristics (pp. 259-289), the cleaning method (pp. 290-332), and doing
one thing (pp. 333-379).

- A function should operate at one recognizable level of abstraction and have
  one reason to change.
- Separate orchestration from parsing, validation, policy, I/O, rendering, and
  persistence when those concerns can change independently.
- Prefer a small parameter object when multiple related arguments travel
  together. Avoid boolean arguments whose meaning is unclear at the call site.
- Do not mix a query with a surprising mutation. Make state changes visible in
  naming and API shape.
- Treat errors consistently. At external boundaries, convert exceptions and
  vendor failures into PulsePlay's established problem-envelope contract.
- Extract when the new unit earns a domain name, enables focused testing, or
  removes mixed responsibilities. Do not fragment code merely to meet a line
  limit.

**PulsePlay exception:** React components often co-locate render structure with
small event handlers, and asynchronous orchestration may be longer than a pure
calculation. The decisive tests are cohesion, navigability, and isolation of
effects—not an arbitrary maximum line count.

### 3. Protect boundaries and dependency direction

**Book basis:** objects and data structures (PDF pp. 390-416), clean classes and
modules (pp. 417-448), SOLID (pp. 525-558), component cohesion/coupling
(pp. 559-586), architectural boundaries (pp. 671-721), and the dependency rule
(pp. 722-732).

- Keep PulsePlay's two axes independent: BI-vendor details stay behind
  `BIAdapter`; AI-connector details stay behind proxy profile/client contracts.
- Normalize untrusted, vendor-specific, or weakly typed data once at an adapter
  boundary. Core code should consume a stable PulsePlay shape.
- Depend on capabilities/contracts, not a vendor SDK, UI component, Express
  request, storage engine, or global singleton.
- Keep transport DTOs distinct from behaviour-rich domain objects when mixing
  them would couple policy to a wire format.
- Components/modules that change together should live together; components
  released or reused independently should not be forced into one dependency
  unit.
- Dependency cycles and cross-axis imports are architectural findings, not
  style nits.

**PulsePlay exception:** `playground/src/pulse/*` is a documented compatibility
surface shared conceptually with the sister Power BI visual. Its constraints
must be assessed against `docs/PULSE_PORT_DETANGLING.md` before refactoring.

### 4. Prefer simple, continuously improved design

**Book basis:** simple design—YAGNI, tests, expression, duplication (PDF
pp. 510-524); continuous design (pp. 587-640); preserving software's ability to
change (pp. 662-669); and relentless improvement (pp. 785-789).

- Build the simplest design that satisfies current, evidenced requirements.
- Remove knowledge duplication, especially duplicated policy, schema,
  capability, security, or formatting rules. Superficially similar code is not
  automatically the same knowledge.
- Keep options open at boundaries that are known to vary; do not introduce
  speculative abstraction for imagined vendors or connectors.
- Apply the Boy Scout rule: leave touched code slightly clearer when a
  behaviour-preserving improvement is safe and tested (PDF p. 55).
- Track structural debt explicitly when a safe cleanup cannot fit the current
  change. Never disguise deferred work as completed.

### 5. Make behaviour repeatedly provable

**Book basis:** TDD, TCR, and small bundles (PDF pp. 449-468); clean tests and
FIRST (pp. 469-482); acceptance testing (pp. 483-489); repeatable proof
(pp. 756-767); small cycles and CI/CD (pp. 768-784); test coverage and mutation
testing (pp. 785-787).

- A defect fix starts with a focused failing test or equally strong reproducible
  evidence, then the smallest correction.
- Tests must be fast enough for their layer, independent, repeatable,
  self-validating, and timely. Network-dependent/live-workspace proof is a
  separate layer from deterministic unit and contract tests.
- Test observable behaviour and contracts. Avoid pinning incidental internal
  steps unless the step is itself a required safety or cost contract.
- Keep tests readable with domain-specific builders/helpers. Test duplication
  is allowed when removing it would hide the scenario.
- Every logical commit must remain buildable and must run proportionate tests.
- Coverage is a diagnostic, not a claim of correctness. Critical boundaries
  need explicit contract, negative, and failure-path tests.

### 6. Control concurrency and side effects

**Book basis:** concurrency motivations and defence principles (PDF pp.
641-659).

- Separate concurrency policy from business work.
- Make cancellation, timeout, retry, ordering, idempotency, and partial-failure
  behaviour explicit.
- Avoid shared mutable state. Where unavoidable, define ownership and lifecycle.
- Tests must cover race-sensitive invariants with deterministic controls rather
  than timing luck.
- For PulsePlay, "no Databricks spend on page load" is also a side-effect
  boundary: paid compute requires an explicit user intent.

### 7. Treat AI output like untrusted code

**Book basis:** AI/LLM programming and the continued need for programmer
judgement, tests, and careful inspection (PDF pp. 490-508).

- Never accept an AI-authored change because it looks cleaner. Inspect
  `git diff HEAD`, understand every changed contract, and run the relevant
  proof.
- Generated code is held to the same naming, boundary, security, testing, and
  review standard as human code.
- Prompts are specifications only when their required behaviour is backed by
  validators, deterministic gates, or acceptance evidence.
- Do not let an LLM invent numeric evidence, authorization, SQL scope, or vendor
  capability. Validate and fail closed at the owning boundary.
- Preserve provenance for AI claims and distinguish generated narrative from
  verified data.

### 8. Preserve both behaviour and structure

**Book basis:** avoiding harm to function and structure (PDF pp. 733-744), no
defects in either dimension (pp. 745-755), and respect for fellow programmers
(pp. 818-819).

- Passing tests do not excuse an unnecessarily opaque design; attractive design
  does not excuse changed behaviour.
- Refactoring is behaviour-preserving. Behaviour changes and structural cleanup
  should be separate commits unless inseparable.
- Optimize for the next maintainer: clear scope, small diffs, honest handover,
  and no hidden skipped work.
- Estimates and status must separate fact, inference, uncertainty, and blockers
  (PDF pp. 804-817).

## Pull-request checklist

Use this list for new or materially changed production code:

1. **Intent:** Are names and module boundaries domain-revealing?
2. **Cohesion:** Does each changed unit have a recognizable responsibility?
3. **Effects:** Are I/O, mutation, paid compute, retries, and cancellation clear?
4. **Boundaries:** Are vendor/transport shapes normalized at the edge?
5. **Axes:** Did the change preserve BI-vendor and AI-connector independence?
6. **Simplicity:** Is every new abstraction required by present evidence?
7. **Duplication:** Is policy/schema knowledge defined once?
8. **Errors:** Do failure paths retain PulsePlay's problem-envelope semantics?
9. **Tests:** Is there focused proof, including negative/failure cases where
   material?
10. **AI safety:** Was the full diff inspected and generated behaviour validated?
11. **Docs:** Are HANDOVER, memory, and owning architecture/reference docs current?
12. **Commit:** Is the change small enough to review and green on its own?

## Review severity

- **Critical:** security, authorization, data leakage, destructive behaviour, or
  unbounded paid side effects.
- **High:** broken architectural boundary, untestable critical path, major
  mixed-responsibility hotspot, or duplicated policy likely to drift.
- **Medium:** meaningful maintainability/testability cost with a safe incremental
  remediation path.
- **Low:** local readability or consistency issue that should normally be fixed
  only when touching the area.
- **Accepted exception:** apparent deviation justified by framework convention,
  compatibility, generated artifacts, or measured performance.

## Source map

| Topic | PDF pages |
|---|---:|
| Clean code, reading cost, Boy Scout rule | 32-55 |
| Cleaning process and first principles | 57-137 |
| Names, comments, formatting | 138-226 |
| Functions, heuristics, cohesive methods | 227-389 |
| Objects, data, modules/classes | 390-448 |
| Testing disciplines, clean tests, acceptance tests | 449-489 |
| AI and LLM-assisted programming | 490-508 |
| Simple design and SOLID | 510-558 |
| Component and continuous-design principles | 559-640 |
| Concurrency | 641-659 |
| Architectural value, independence, boundaries | 662-732 |
| Craftsmanship, proof, cycles, improvement | 733-819 |
| Debate and counterpoints | 827-906 |

## Maintenance rule

When this standard drives a review:

- cite this knowledge-base section and the supporting PDF page range;
- cite repository evidence by file and line;
- distinguish committed HEAD from uncommitted working-tree observations;
- record accepted exceptions instead of repeatedly reopening them;
- update this file only when the interpretation changes, not for every finding.
