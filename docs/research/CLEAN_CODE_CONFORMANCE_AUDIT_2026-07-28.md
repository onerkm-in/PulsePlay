# Clean Code Conformance Audit — 2026-07-28

## Verdict

**PulsePlay partially follows the standard, with unusually strong proof and
boundary practices but two severe maintainability concentrations.**

The repository is not a "Clean Code failure." Its vendor adapter contract,
conformance harness, problem-envelope boundary, extensive tests, CI gates,
small-commit habit, and explicit debt register are substantive strengths.
However, the core Pulse UI and proxy composition roots have accumulated too
many independently changing responsibilities. Static-analysis and coverage
claims are also looser than the tooling actually enforces.

This is a read-only conformance audit. It does **not** authorize a broad
refactor. Remediation should be incremental and behaviour-preserving.

## Scope and method

- Standard: [Clean Code Knowledge Base](../CLEAN_CODE_KNOWLEDGE_BASE.md),
  derived from the owner-supplied 2025 second-edition PDF.
- Revision reviewed: committed `HEAD` after knowledge-base commit `1065398` on
  branch `design/nav-consistency`.
- Repository sample: application shell, active Pulse surface, proxy composition
  root, BI adapter boundary, connector/profile registries, problem envelopes,
  test configuration, CI, quality docs, and debt register.
- Mechanical inventory: production source under `playground/src`, `proxy/lib`,
  and `bi-adapters`; largest-file scan; route-registration scan; suppression and
  loose-typing scan; test/lint/coverage configuration inspection.
- Exclusion: pre-existing uncommitted Lakeview/server work and untracked
  artifacts were not attributed to this audit. They were visible in the
  worktree but are owned by another in-flight change.

File length and route count are triage signals. Findings below are based on
responsibility and tooling evidence, not length alone.

## Findings

### High — CC-01: the active Pulse `App` remains a multi-responsibility hotspot

**Evidence**

- `playground/src/pulse/visual.tsx` is 13,086 lines in the working checkout.
- Its `App` starts at `visual.tsx:1318`; the next top-level declaration begins
  at `visual.tsx:8153`, making the component approximately 6,835 lines.
- The same file also owns host bridging, persisted chat state, setup flows,
  request orchestration, insights rendering, message rendering, charts,
  narrative parsing, KPI formatting, and display preferences.
- The repository already records the same root cause and a phased extraction
  plan in `docs/DEBT_REGISTER.md:54-62` (D5).

**Standard**

Functions should have a recognizable responsibility; orchestration, parsing,
I/O, rendering, and persistence should separate when they change independently
([knowledge base §2](../CLEAN_CODE_KNOWLEDGE_BASE.md#2-keep-functions-cohesive-and-explicit);
book PDF pp. 227-389).

**Risk**

Changes to one surface have a large regression radius, hook dependency mistakes
are hard to reason about, and reviewers cannot cheaply establish which state
transitions a local edit affects. The very large test suite reduces behavioural
risk but does not remove comprehension cost.

**Action**

Do not rewrite. Execute existing D5 in order:

1. mechanically move already-top-level pure renderers/helpers;
2. move setup UI behind its own boundary or retire it with D3;
3. extract one state machine hook at a time, beginning with chat or insights;
4. run focused tests plus full playground TypeScript/Vitest/build after every
   extraction.

### High — CC-02: `proxy/server.js` is both composition root and implementation

**Evidence**

- `proxy/server.js` is 8,885 lines in the current checkout.
- It contains 119 `app.use/get/post/put/patch/delete` registrations.
- In addition to composition, it owns environment/profile parsing
  (`server.js:132-515`), credentials and OAuth (`:669-1306`), warehouse
  lifecycle (`:1406-1548`), authentication/rate limiting (`:1653-2242`),
  audit logging (`:2276-2363`), Power BI token/RLS logic (`:4376-4662`),
  history SQL (`:5320-5630`), multiple connector conversations
  (`:5854-9088`), and final error handling (`:9094-9123`).
- Some domains have already graduated to `proxy/lib/*`, proving an incremental
  module boundary is compatible with the runtime.

**Standard**

Separate independently changing policy, I/O, and vendor concerns, and depend on
stable contracts at boundaries
([knowledge base §§2-3](../CLEAN_CODE_KNOWLEDGE_BASE.md#2-keep-functions-cohesive-and-explicit);
book PDF pp. 227-448 and 671-732).

**Risk**

The composition root is a high-conflict file, connector changes can accidentally
touch shared auth/error policy, and isolated tests require broad server-module
loading. Optional dependencies and test exports further expand its reasons to
change.

**Action**

Create a measured proxy split plan before moving code. Start with cohesive,
already-tested route families (for example Power BI embed/Q&A or history), each
exporting an Express router plus injected dependencies. Keep cross-cutting auth,
rate limiting, problem envelopes, and profile resolution centralized. Require
byte-compatible route contracts and full proxy Jest after each extraction.

### Medium — CC-03: the playground's `lint` gate is TypeScript only

**Evidence**

- `playground/package.json:11` defines `"lint": "tsc --noEmit"`.
- No ESLint configuration exists for `playground/` or `proxy/`; ESLint configs
  exist only in the two PBI enablers.
- Production files contain `eslint-disable` comments, including
  `playground/src/features/config/useAskPulseHomeMeta.ts:119` and
  `playground/src/biPanel/BIPanel.tsx:182,204`, but the playground gate never
  evaluates them.
- `docs/QUALITY.md:22` says "Lint config in place," which overstates the current
  gate. CI at `.github/workflows/test.yml:54` runs the TypeScript-only script.

**Standard**

Team formatting and code rules should be mechanically enforceable where
practical ([knowledge base §1](../CLEAN_CODE_KNOWLEDGE_BASE.md#1-make-intent-easy-to-recover);
book PDF pp. 197-226).

**Risk**

The repository gets strong type checking but no automated rules for React hook
dependencies, unreachable suppressions, accidental console usage, import
consistency, or agreed readability hazards. Calling this "lint" hides the gap.

**Action**

Immediately correct the quality claim to "TypeScript check." Adopt ESLint only
as a separately baselined task: start with correctness rules, run it
non-blocking, classify existing findings, then gate new violations. Do not land
a formatting avalanche with the configuration.

### Medium — CC-04: tests are numerous, but coverage risk is not measured

**Evidence**

- Vitest and Jest run in CI (`.github/workflows/test.yml:37,55`).
- `@vitest/coverage-v8` is installed (`playground/package.json:32`), but
  `playground/vitest.config.ts` has no coverage configuration or thresholds.
- `proxy/jest.config.js` has no collection rules or thresholds.
- The repository reports test counts, which measure executed cases rather than
  which critical branches remain unproved.

**Standard**

Coverage is a diagnostic—not correctness—but critical boundaries need
repeatable negative/failure proof
([knowledge base §5](../CLEAN_CODE_KNOWLEDGE_BASE.md#5-make-behaviour-repeatedly-provable);
book PDF pp. 449-489 and 756-787).

**Risk**

High test counts can coexist with unexecuted failure branches. There is no
machine-visible regression signal when a critical module silently loses
coverage.

**Action**

Do not impose a repository-wide percentage target. First publish a baseline for
security, governance, profile resolution, problem envelopes, BIAdapter
conformance, and paid-compute gates. Add per-critical-module floors only after
measuring stable baselines. Trial mutation testing on one small deterministic
module before considering wider adoption.

### Medium — CC-05: the outer application shell is another concentration point

**Evidence**

- `playground/src/App.tsx` is 2,696 lines.
- `AppRouted` begins at `App.tsx:390` and coordinates routes, first run,
  settings, surface navigation, BI configuration, viewport/layout state,
  developer tooling, knowledge, launchpad, Power BI Q&A, and the Pulse host.

**Standard**

Composition roots may be larger, but independent state and surface policies
should live behind named units ([knowledge base §2](../CLEAN_CODE_KNOWLEDGE_BASE.md#2-keep-functions-cohesive-and-explicit);
book PDF pp. 227-389).

**Risk**

Navigation and configuration changes have a broad shell regression radius.
This is lower priority than CC-01 because the file genuinely is the application
composition root and many child surfaces are already extracted.

**Action**

After D5 Phase 1, inventory `AppRouted` by state machine. Prefer extracting
route/surface resolution and viewport persistence as pure hooks or reducers.
Keep the top-level composition explicit rather than hiding it behind generic
abstractions.

## Standards that are demonstrably followed

### Strong — vendor and connector boundaries

- `BIAdapter` is explicit at `playground/src/biPanel/BIAdapter.ts:137`.
- Adapters load through the lazy registry at
  `playground/src/biPanel/registry.ts:108`.
- A shared conformance battery begins at
  `playground/src/biPanel/__conformance__/adapterConformance.ts:98`.
- Proxy profile and connector registries centralize lookup rather than allowing
  route-local vendor discovery (`proxy/server.js:543-600`,
  `proxy/lib/connectorRegistry.js`).

This strongly follows the component/boundary/dependency guidance (book PDF pp.
559-586 and 671-732) and protects PulsePlay's defining two-axis architecture.

### Strong — error boundary normalization

`proxy/lib/problemDetails.js:86-211` owns problem creation, redaction, legacy
compatibility, and sending. The final Express handler delegates to it at
`proxy/server.js:9094-9123`. Some older routes still construct legacy-shaped
errors directly, but the architectural direction is clear and testable.

### Strong — repeatable proof and small-cycle discipline

- CI gates proxy Jest, playground TypeScript/Vitest/build, desktop tests, and
  the PBI enabler (`.github/workflows/test.yml:21-103`).
- Adapter conformance, negative security cases, fail-closed governance, and
  connector contract tests go beyond happy-path snapshots.
- `docs/HANDOVER.md`, `docs/memory/project_state.md`,
  `docs/MAINTENANCE_PLAYBOOK.md`, and `docs/DEBT_REGISTER.md` make status,
  evidence, and deferred structure visible.

The remaining qualification is CC-04: test quantity is not branch-risk
measurement.

### Strong — explicit exceptions and honest debt

The repository documents the `pulse/*` compatibility boundary, vendor stubs,
upstream Genie limitations, paid-compute policy, and known structural debt.
That is more maintainable than superficially "clean" code whose constraints are
implicit.

## Scorecard

| Standard area | Rating | Basis |
|---|---|---|
| Intent and vocabulary | Partial/strong | Rich domain names and tripwire comments; huge owning units reduce recoverability |
| Function/module cohesion | Weak in hotspots | CC-01, CC-02, CC-05 |
| Architectural boundaries | Strong | BIAdapter, registries, problem envelopes, two-axis design |
| Simple/continuous design | Partial/strong | Explicit debt and incremental commits; accumulated composition roots |
| Repeatable proof | Strong with visibility gap | Broad CI/test suite; no coverage-risk baseline |
| Concurrency/side effects | Partial/strong | Explicit cancellation/spend rules and tests; not exhaustively audited here |
| AI-change discipline | Strong process | Diff-first rule, validators, provenance and fail-closed contracts |
| Team/craft discipline | Strong | Handover, memory, debt register, honest blockers |

## Recommended order

1. Correct the `QUALITY.md` lint claim.
2. Register CC-02 and CC-03/04 as explicit debt, without starting a rewrite.
3. Execute already-planned D5 Phase 1 in small mechanical commits.
4. Baseline critical-module coverage and introduce correctness-first linting.
5. Write and execute the proxy route-family extraction plan.
6. Re-audit after those structural changes; do not use raw line-count reduction
   as the success metric.

Success means lower change coupling, clearer ownership, and equally strong or
better proof—not simply more files or shorter functions.
