# Enterprise Modernization Charter

> Status: **DRAFT — queued for [CHALLENGE] cycle** as of 2026-05-17.
> Builds on the Pulse-port detangling decision locked in
> [`PULSE_PORT_DETANGLING.md`](PULSE_PORT_DETANGLING.md) and the
> Error Intelligence Layer locked in
> [`ERROR_HANDLING_STRATEGY.md`](ERROR_HANDLING_STRATEGY.md).
>
> This document is the contract everything else hangs off. Until it
> moves to **LOCKED**, individual architecture commitments
> (state library, server-state library, design system, slicing
> topology) stay open for challenge in `AGENT_SYNC.md`. Once locked,
> phased migration begins.

## 1. Framing — what PulsePlay is, what it isn't

### What it is

**PulsePlay is a greenfield enterprise React + TypeScript application
running at top-level origin in a real modern browser.** It HOSTS BI
vendor surfaces (Power BI / Tableau / Qlik / Looker / generic-iframe)
inside narrowed sandbox iframes it defines, and orchestrates AI
connector backends (Genie / Azure OpenAI / Bedrock RAG + direct /
Foundation Model / Mosaic AI Supervisor / ResponsesAgent — nine
runtime backend paths) via a shared Node proxy.

The 2-axis abstraction (BI vendor × AI connector) is the defining
architectural pillar. Any combination of (vendor, connector) is valid;
switching either is independent.

### What it isn't (per Path C — inner-source-first)

PulsePlay v1 is scoped as an **internal-org enabler**, NOT a public
commercial platform. Public-OSS distribution items (license decision,
SBOM signing, conformance harness, public docs site, multi-tenant
isolation, full ISO / EU AI Act compliance) are explicitly deferred to
[`PUBLIC_OSS_AGENDA.md`](PUBLIC_OSS_AGENDA.md). They are NOT in this
charter's scope.

### What it is NOT (Pulse-PBI detangling, applied)

PulsePlay is **not the iframe guest**. The Pulse PBI custom-visual
sibling is. PulsePlay does not inherit sandbox constraints from Pulse-PBI.
All Pulse-PBI tripwires are categorized + retired in
[`PULSE_PORT_DETANGLING.md`](PULSE_PORT_DETANGLING.md). When this
charter says "modern web platform features are available", it means
all of them — `fetch`, native streaming, Workers, Service Workers,
IndexedDB, Web Speech, WebGPU, View Transitions, native PDF/PNG/Excel
generation, popups, File System Access.

## 2. Why this charter exists now

Three pressures converged:

1. **The 2026-05-17 architectural audit** identified real concentration
   risks in the current codebase: `App.tsx` ~93 KB / 60+ hooks,
   `FirstRunWizard.tsx` ~66 KB, no API caching layer, three styling
   vocabularies coexisting, no `useQuery`-style server-state pattern.
2. **The Pulse-port detangling decision** clarified that the "constraints"
   limiting modernization were actually Pulse-PBI baggage, not PulsePlay
   constraints. With those retired, the modernization aperture widens.
3. **The error-handling lane completing** (Slices 1a–1d landed; the
   Problem Details envelope, OAuth normalization, streaming in-band
   errors, raw-leak elimination all shipped) means the backend is
   ready to support a richer frontend without the legacy raw-`err.message`
   leak surface that would have polluted any new client design.

The charter consolidates the modernization direction into one
challengeable, lockable document — same pattern as
[`ERROR_HANDLING_STRATEGY.md`](ERROR_HANDLING_STRATEGY.md) used for
the error-handling lane.

## 3. Architecture pillars (open decisions)

Each pillar below opens a [DECISION] cycle in `AGENT_SYNC.md`. They
are listed in dependency order — earlier decisions constrain later
ones. Pillars that have a strong default recommendation note it.

### 3.1 Client state library

**Decision needed**: how is cross-cutting client state managed?

**Options**:
- (a) Extend the existing `settingsStore.tsx` (React context + custom
  hook) pattern. Lower commitment. Continues to scale poorly past
  60+ pieces of state.
- (b) **Adopt zustand** — small (~3KB), no provider tree, selectors-based.
  Industry-standard, plays well with React Query.
- (c) Recoil / Jotai — atomic state, more complex mental model.

**Recommendation**: (b) zustand. Reasoning: matches the
"feature-sliced" topology the codebase will move toward; low commitment
(can be migrated out if it doesn't scale); proven at enterprise scale;
TypeScript-first.

**Out of scope for this pillar**: server state. That's pillar 3.2.

### 3.2 Server state / data fetching

**Decision needed**: how are REST fetches (Packs, conversations, profiles,
discovery, history, etc.) cached + retried + invalidated?

**Options**:
- (a) Keep ad-hoc fetch + XHR + manual cache. Status quo. Pulse-port
  code stays XHR for sibling compat; new code keeps reinventing.
- (b) **Adopt TanStack Query (React Query)** for new playground code.
  Pulse-port code stays XHR. Hybrid.
- (c) tRPC — type-safe end-to-end. Requires proxy refactor.

**Recommendation**: (b) React Query for new code only. Reasoning:
modern web platform features are available (per the detangling lock);
React Query is the industry standard; Pulse-port stays untouched so
the sibling doesn't break.

**Subscope decisions**:
- Default `staleTime` / `gcTime` / `retry` strategy
- Whether to adopt React Query devtools in dev builds
- How `requestId` correlation threads through queries

### 3.3 Routing

**Decision needed**: page-level routing topology.

**Current**: react-router-dom — has a Settings route family and
launchpad/onboarding routes. Working.

**Options**:
- (a) Keep react-router-dom + harden it (add type-safety via a
  custom hook).
- (b) **Migrate to TanStack Router** — type-safe routes, type-safe
  search params, layout routes, file-based routing optional.
- (c) Next.js / Remix — full SSR/SSG framework. Probably overkill for
  an inner-source SPA.

**Recommendation**: (a) keep react-router-dom for v1 inner-source.
Migrating routing is a 2-3 cycle disruption with limited payoff for
PulsePlay's modest route count. Revisit when route count grows or when
type-safety pain becomes acute. Add a wrapper hook for type-safe
nav in the meantime.

### 3.4 Forms + validation

**Decision needed**: form library + schema validation for the wizard,
embed-config forms, settings panels.

**Options**:
- (a) Keep ad-hoc `useState` + manual validation. Status quo.
- (b) **react-hook-form + zod** — type-safe, performant (uncontrolled
  inputs by default), excellent error UX patterns. Pairs with React
  Query nicely.
- (c) Formik — older, more boilerplate, less performant for large forms.

**Recommendation**: (b) react-hook-form + zod. The `FirstRunWizard` +
`EmbedConfigForm` are the highest-payoff targets — both currently
~40-60 KB of hand-rolled form state.

### 3.5 Design system

**Decision needed**: visual language + component primitives.

**Options**:
- (a) Formalize the existing Pulse `gn-*` design language. Document
  tokens, extract to a `@pulseplay/ui` package within the repo,
  Storybook-ify. Pulse-port stays. Lower commitment, slower velocity.
- (b) **Tailwind CSS + Radix UI primitives** — utility-first styling
  with battle-tested a11y primitives for Dialog, Tabs, Popover, Tooltip,
  Menu, etc. New code uses it from day one; Pulse-port stays on `gn-*`
  indefinitely. Two design languages coexist on a known seam.
- (c) Mantine / Chakra — opinionated component library. Faster to ship
  but more theme-lock-in.

**Recommendation**: (b) Tailwind + Radix. Reasoning:
- Tailwind utility-first gives consistent spacing/typography across
  the new code without three competing vocabularies (current state:
  Pulse `gn-*`, inline styles, ad-hoc CSS variables).
- Radix UI primitives are unopinionated about visual style but
  bake in WCAG 2.2 a11y for the hardest interactive primitives.
  This is the single biggest enterprise-grade win.
- The Pulse `gn-*` design language stays in the `pulse/*` directory
  (per detangling Category B); the two coexist on a clean directory
  boundary.

**Subscope decisions**:
- W3C Design Tokens Format adoption (already grounded in the
  adaptive-theme research packet from 2026-05-17 [CHALLENGE] cycle)
- Theme switcher (light / dark / HC) + `prefers-color-scheme`
- Container queries vs media queries
- View Transitions API for navigation animation

### 3.6 Component slicing topology

**Decision needed**: how are large components broken down + where do
they live?

**Options**:
- (a) Keep flat `playground/src/components/` and `playground/src/pulse/`.
  Status quo.
- (b) **Feature-sliced architecture**: `playground/src/features/{canvas,
  sidebar, onboarding, config, knowledge, ...}` with each feature
  containing its own `ui/`, `model/`, `lib/`, `api/` sub-directories.
- (c) Domain-driven design with bounded contexts. Overkill for inner-
  source v1.

**Recommendation**: (b) feature-sliced. Reasoning: maps naturally to
the 2-axis abstraction (each BI vendor adapter, each AI connector,
each Settings group is its own feature); supports incremental
modernization (slice one feature at a time off the monoliths); standard
pattern in enterprise React (FSD methodology).

**Migration strategy**: do NOT empty-stub `features/` directories
again. Each feature folder ships with at least its component +
1 test in the same commit. No empty scaffolds.

### 3.7 Test pyramid

**Decision needed**: what's the target test surface for v1?

**Current**: Vitest (unit + component), no Playwright e2e, no axe,
no visual regression, no Lighthouse CI.

**Recommendation** (low-controversy, ship in phases):
- **Unit + component**: keep Vitest. Already shipping at 578/578.
- **E2E**: adopt Playwright. Target the 5 critical paths:
  (1) First-run wizard happy path, (2) embed Power BI report,
  (3) ask AI Insights question and see HEADLINE, (4) ask follow-up
  Chat question, (5) Settings → Setup → Ready state.
- **A11y**: axe-core in CI as a gate. Critical paths must pass WCAG
  2.2 AA. Per-component axe in Storybook stories.
- **Visual regression**: Chromatic / Percy. Storybook-based. Catches
  unintended visual changes during refactors.
- **Lighthouse CI**: page-level Web Vitals budget (LCP <2.5s, INP
  <200ms, CLS <0.1). Bundle-size budget per route.

### 3.8 Observability

**Decision needed**: frontend telemetry.

**Current**: Proxy side strong (`X-Request-Id` correlation, structured
audit log, redacted error trail). Frontend side: console only.

**Recommendation**:
- Frontend errors → Sentry (or organization-approved equivalent)
- Web Vitals → batched POST to proxy for organization-aggregated dashboard
- `X-Request-Id` propagates browser → proxy → upstream Databricks
  (already wired in proxy; needs frontend extension)
- Custom AI-session telemetry — the `SustainabilityIndicator` is a
  precursor; can grow to a full session-quality dashboard (tokens,
  latency, retries, validator pass rate)

### 3.9 Security hardening

**Decision needed**: CSP tightening, Trusted Types, BFF auth, secret
audit cadence.

**Current**: CSP in HTML allows `unsafe-eval` (Vite dev requirement);
embed tokens correctly server-side; allowlist enforcement strong.

**Recommendation**:
- **Production build CSP**: drop `unsafe-eval` for the prod bundle.
  Vite emits a non-eval bundle when not in dev mode.
- **Trusted Types**: adopt for the BI iframe sandbox attribute
  construction (the one place we construct strings used as security
  primitives).
- **SRI**: subresource integrity on any external scripts/styles
  (currently none — the budget is "all bundled"; if any external is
  ever added, SRI gate fires).
- **Dependency audit**: `npm audit` in CI; weekly automated PR for
  patch-level updates via Dependabot or equivalent.
- **BFF auth pattern**: confirm no tokens in `localStorage`. Embed
  tokens are already proxy-issued. Verify viewer-session-key is
  HttpOnly cookie, not localStorage.

### 3.10 Pulse-port detangling phasing

**Already decided** in [`PULSE_PORT_DETANGLING.md`](PULSE_PORT_DETANGLING.md):

- Category A items stay until Pulse-PBI sibling sunsets
- Category B items get PulsePlay-native parallels (don't touch ported files)
- Category C items retire on touch

**This charter's contribution**: each modernization phase explicitly
identifies which Category B items it touches + which it leaves alone
+ which Category C items can drop along the way.

## 4. Phased migration plan

Each phase is a real shippable cycle (1-3 weeks of work). Every phase
ends with: real commits, real tests, AGENT_SYNC entry, working software.
No empty scaffolds.

### Phase 0 — Charter [CHALLENGE] + [DECISION] (current cycle)

- Codex reviews this charter, challenges any pillar where they
  disagree, surfaces options I missed
- Open ADRs (`docs/adr/`) for each locked decision
- AGENT_SYNC [DECISION] block per pillar
- **Exit criterion**: every Section 3 pillar has either a LOCKED
  recommendation or an explicit DEFERRED stamp

### Phase 1 — State + server-state foundation (~1 week)

**Touches**: state library decision (3.1), server-state library
decision (3.2), one feature end-to-end as proof.

- Install + configure decided libraries (zustand, React Query) with
  proper provider wiring in App.tsx — minimal change, no migration yet
- Pick ONE vertical to migrate end-to-end as proof: probably
  **Pack discovery** (small surface, clear boundaries, no Pulse-port
  entanglement)
- Migrate that vertical's data fetching to React Query
- Migrate its local state to zustand
- Add tests for the migrated surface
- Document the pattern in `docs/adr/` so future migrations follow
- **Exit criterion**: one vertical fully on the new state model;
  pattern documented; tests green; no other code touched

### Phase 2 — App.tsx incremental decomposition (~2 weeks)

**Touches**: component slicing topology (3.6), state library (3.1),
forms (3.4 — only the wizard subsection).

- Slice App.tsx feature-by-feature into `features/canvas/`,
  `features/sidebar/`, `features/bi-host/`, `features/ai-host/`
- Each slice: extract component → migrate its state to zustand →
  add component test → commit
- App.tsx becomes a thin router-and-providers shell
- **Exit criterion**: App.tsx under 10 KB; every feature is its own
  folder; existing functionality unchanged; 578/578 tests still green
  (plus new tests for sliced components)

### Phase 3 — FirstRunWizard + EmbedConfigForm decomposition (~1-2 weeks)

**Touches**: forms + validation (3.4), component slicing (3.6).

- Adopt react-hook-form + zod for the wizard
- Slice each wizard step into its own feature module under
  `features/onboarding/steps/{vendorPick, embedConfig, profileAuth,
  packSelect, ...}`
- Same treatment for `EmbedConfigForm` — per-vendor sub-forms
- Zod schemas for each form input shape; runtime validation matches
  TypeScript types
- **Exit criterion**: each wizard step <300 LOC; per-step tests; zod
  schemas covering 100% of form fields; e2e wizard test in Playwright

### Phase 4 — Design system foundation (~2 weeks)

**Touches**: design system (3.5), accessibility (3.7).

- Adopt Tailwind + Radix in `features/*` and `components/*` (NOT in
  `pulse/*`)
- Migrate the new sliced components from Phase 2-3 to Tailwind +
  Radix primitives
- Storybook setup with axe integration
- W3C Design Tokens for color / typography / spacing
- Theme switcher (light / dark) with `prefers-color-scheme`
- **Exit criterion**: every new component has a Storybook story +
  axe pass; design tokens documented; theme switcher works; Pulse-port
  surface unchanged

### Phase 5 — Quality + observability (~2 weeks)

**Touches**: test pyramid (3.7), observability (3.8).

- Playwright setup; 5 critical-path e2e tests
- axe-core CI gate on critical paths
- Chromatic / Percy visual regression hooked into PR CI
- Lighthouse CI with per-route budgets
- Frontend Sentry-equivalent wired
- Web Vitals telemetry to proxy
- `X-Request-Id` propagation from browser through proxy to upstream
- **Exit criterion**: all 5 critical paths pass Playwright + axe;
  per-route LCP/INP/CLS budgets configured; first error rolls up in
  Sentry; first Web Vital appears in dashboard

### Phase 6 — Security hardening (~1 week)

**Touches**: security (3.9).

- Production build CSP audit; drop `unsafe-eval`
- Trusted Types adoption for iframe sandbox attribute construction
- Dependency audit cadence (Dependabot or equivalent)
- BFF auth verification (no tokens in localStorage)
- Threat-model review against the new architecture
- **Exit criterion**: prod CSP locked; Trusted Types enabled; weekly
  audit cadence running; threat model documented in `docs/adr/`

## 5. Open decisions queued for [CHALLENGE]

Each row gets its own ADR + AGENT_SYNC entry once Codex weighs in:

| Pillar | Recommendation | Alternatives | Decision-blocker |
|---|---|---|---|
| 3.1 State library | zustand | context-extend, Recoil, Jotai | None — small commit |
| 3.2 Server-state | React Query | trpc, ad-hoc | Confirm fetch is OK (it is, per detangling) |
| 3.3 Routing | keep react-router | TanStack Router | None |
| 3.4 Forms | react-hook-form + zod | Formik, ad-hoc | None |
| 3.5 Design system | Tailwind + Radix | Mantine, Chakra, formalize gn-* | Visual-language preferences |
| 3.6 Slicing | Feature-sliced | flat, DDD | Codex review of feature seams |
| 3.7 Test pyramid | Vitest + Playwright + axe + Chromatic + Lighthouse | partial subset | Budget tolerance |
| 3.8 Observability | Sentry + Web Vitals + RID propagation | partial | Vendor selection (Sentry vs alternative) |
| 3.9 Security | CSP tighten + Trusted Types + Dependabot | partial | None |
| 3.10 Pulse-port phasing | Already locked in PULSE_PORT_DETANGLING.md | — | — |

## 6. Out of scope

Out of v1 scope (deferred to PUBLIC_OSS_AGENDA.md):
- License decision
- SBOM signing + supply-chain attestation
- Conformance harness for third-party adapters
- Public docs site (vs inner-source docs)
- Multi-tenant isolation
- Full ISO 27001 / SOC 2 / EU AI Act compliance posture
- Public OSS contribution flow

Out of this charter's scope (separate concerns):
- Proxy modernization (separate lane; error-handling already locked)
- BI vendor adapter graduation (each vendor adapter is its own ADR)
- Pack format evolution (separate domain concern)
- AI connector evolution (separate domain concern)

## 7. Maintenance

- Each Section 3 pillar moves from RECOMMENDATION → LOCKED via an
  `AGENT_SYNC.md` [DECISION] block
- Each phase exit criterion is a commit gate, not a soft suggestion
- Phase additions/reorderings happen via AGENT_SYNC [PROPOSAL] blocks,
  not silent doc edits
- This document shrinks as phases complete (each completed phase moves
  to a "Completed" appendix with commit SHAs)

## 8. Status checklist

| Item | Status |
|---|---|
| Pulse-port detangling locked | ✅ 2026-05-17 (`02eb301`) |
| Error Intelligence Layer locked | ✅ 2026-05-17 (Slices 1a-1d, latest `36a8c11`) |
| This charter drafted | 🟡 (this commit) |
| Charter [CHALLENGE] from Codex | ⏳ awaiting |
| Section 3 pillar decisions locked | ⏳ per-pillar ADRs pending |
| Phase 1 kickoff | ⏳ blocked on pillar 3.1 + 3.2 decision lock |
