# Simplification Beast-Mode Decisions

Date: 2026-05-23

Status: Decision record. Locks 7 architecture tensions identified after the [Flow Limits and Multiplicity Simplification](FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md) blueprint, informed by 5 parallel research lanes (competitor patterns, trust UI standards, multiplicity controls codebase map, generated-defaults feasibility, mobile parent-nav).

No runtime code changed by this document. It defines what the next implementation slices must build.

Related docs:

- [FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md](FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md)
- [BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md](BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md)
- [SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md](SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md)
- [PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md](PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md)
- [SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md](SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md)

## Summary of decisions

| # | Tension | Decision |
|---|---|---|
| T1 | Business Context as third top-level decision | **Smart 2-parent.** Surface picker surfaces detected Business Context as a derived chip; explicit picker appears only on ambiguous/iframe surfaces. |
| T2 | Generated defaults engine: static-only first or BI-metadata-aware day 1 | **Static-only first.** Ship the 95%-complete pack-derived defaults; wire BI-metadata-aware suggestions in a follow-up slice. |
| T3 | Pack source-of-truth: build-time generator vs runtime loader vs hybrid | **Hybrid.** Extend `pack.json` schema to declare defaults inline; drop the hand-ported TS `PACK_REGISTRY`. |
| T4 | Mobile parent-nav: Option A (bottom tabs) vs Option C (drawer + Context Bar) | **Option C** ships in Slice 3 alongside the visible flow simplification. |
| T5 | Confidence ladder: 5 tiers vs 3 tiers | **5 backend, 3 UI.** Backend keeps `draft / inferred / author-confirmed / source-reviewed / sme-reviewed` for governance; UI groups them into `draft / inferred / reviewed` with hover-reveal of the specific tier. |
| T6 | Context Bar field priority on mobile | **Context · Freshness** visible by default; Surface, Assistant, Quality on tap-to-expand. |
| T7 | Identity-optional risk-of-loss moments | **All anonymous-OK.** Sign-in fires as a nudge at risk-of-loss moments (save, export, share, publish); never blocks. Anonymous → identified merge on first sign-in. |

---

## T1 — Smart 2-parent (Surface + Assistant; Business Context derived where possible)

### Decision

Drop the strict 3-parent presentation. Show only Surface + Assistant as top-level peers; Business Context becomes a derived attribute of the Surface, surfaced as a chip in the Authoring Home and Context Bar. When the Surface metadata permits deterministic inference (Genie space tags, Power BI workspace path, semantic-model business glossary), the chip auto-populates and is editable. When metadata is absent (generic iframe), the chip says `Choose business context` and acts as a picker.

### Why

- 6/6 competitors (Tableau Pulse, ThoughtSpot Sage, Power BI Copilot, Hex AI, Snowflake Cortex Analyst, Databricks Genie) expose only 2-4 setup decisions; none expose business context as a top-level peer.
- The strict 3-parent model violates the "selected data asset IS the context" pattern that has industry validation.
- The connector-agnostic case for keeping Business Context (generic iframe, ambiguous surfaces) is preserved via the override chip.
- The internal model (`BusinessContextProfile` as canonical context owner) stays unchanged; only the surfacing changes.

### Implications

- **Authoring Home task list** drops `Business Context` as a separate step; the BI Surface step shows the inferred context chip in its right rail.
- **Generated Defaults Review** still runs and still drives the rest of the system.
- **Smart inference logic** must land in Slice 2: a small `inferBusinessContextFromSurface()` function reading available metadata (Genie space description, Power BI tagged taxonomy, native canvas pack reference). Falls back to `unknown` for iframe.
- **AGENDA item UX-ARCH-0** scope changes: rename "BusinessContextProfile and duplicate-choice collapse" to "BusinessContextProfile as derived context + duplicate-choice collapse". Surface picker grows the inference chip.

### Open follow-ups

- For each adapter, document what metadata is available for the inference function (Lane D found Databricks has the most; Power BI semantic-model has tagged glossary; generic-iframe has nothing).
- Decide the chip wording for the ambiguous case (`Choose business context` vs `No context detected` vs `Generic`).

---

## T2 — Static-only generated defaults first; BI-metadata-aware in a follow-up slice

### Decision

Ship the existing untracked `playground/src/authoring/` scaffold (`businessContextProfile.ts`, `generatedDefaults.ts`, tests) as the Slice 2 generation engine, after the source-hardening pass from `UX-ARCH-0A`. Generation is static pack lookup: `(packId, subVerticalId, overlayIds)` → `BusinessContextProfile`. "Why suggested" reasoning shows the pack and sub-vertical, not column-level metadata.

A separate Slice 2.5 wires the Databricks schema introspector (`proxy/lib/schemaIntrospector.js`) and the existing `BIAdapter.getMetadata()` contract to enrich the `BusinessContextProfile.biMetadata` field. Column-aware "Suggested because Campaign, Spend, Revenue columns detected" reasoning only appears after Slice 2.5 ships.

### Why

- The static scaffold is 95% complete with passing tests; throwing BI-metadata scope at Slice 2 risks shipping nothing.
- BI-metadata extraction has uneven adapter coverage (Lane D: Databricks fully wired, Power BI / Tableau / Looker stubs). Shipping a feature that works on one adapter and fails silently on others would confuse authors.
- Honest "why suggested" copy at Slice 2: `Pack-derived default. Column-aware suggestions will appear after BI metadata wiring.`

### Implications

- Slice 2 ships with static "why suggested" text and zero claims about column-level inference.
- Slice 2.5 (new AGENDA item) covers: `BIAdapter.getMetadata()` implementation per vendor, `inferDefaultsFromBIMetadata()` function, "why suggested" upgrade.
- Tests at Slice 2 must explicitly assert that `BusinessContextProfile.biMetadata` is `{}` and that no column-level claims appear.

### Open follow-ups

- Sequence Power BI vs Databricks adapter metadata wiring in Slice 2.5 (Databricks has working introspector → ship first).
- Generic-iframe will likely never have schema discovery — its "why suggested" wording stays pack-only.

---

## T3 — Hybrid pack source-of-truth: defaults declared inline in `pack.json`; TS `PACK_REGISTRY` dropped

### Decision

Extend the `pulsepacks/PACK_SPECIFICATION.md` schema so `pack.json` declares its own defaults inline, alongside the existing `subVerticals`, `industries`, and `references` fields. The new fields are:

```jsonc
{
    "defaults": {
        "insightTemplates": [...],
        "starterQuestions": [...],
        "kpiBehaviors": [...],
        "guidedFilters": [...],
        "strategicLens": { ... }
    }
}
```

Each default item carries provenance referencing IDs from the same `pack.json`'s `references[]` register. The hand-ported `PACK_REGISTRY` constant inside `playground/src/authoring/businessContextProfile.ts` is dropped; `buildBusinessContextProfile()` loads pack JSONs at runtime through a single manifest (`pulsepacks/manifest.json`) and merges.

### Why

- The claims audit's "invented source IDs" finding is a direct consequence of the hand-ported TS registry drifting from the pack source register. Single source of truth eliminates that drift.
- Pack authors already write `pack.json` for the existing fields; extending it is easier than maintaining two parallel structures.
- Validators become trivial: every runtime `sourceId` must exist in the same pack's `references[]`. The validator runs at build-time and at runtime.
- Build-time generation was the alternative but adds a new script + a generated TS file that bloats the repo and breaks the "one download = every enabler" principle from ADR-0010 if the file is generated but not committed.

### Implications

- `pulsepacks/PACK_SPECIFICATION.md` gains a new section documenting the `defaults` block.
- New module `playground/src/authoring/packLoader.ts` reads `pulsepacks/manifest.json` and loads each pack's JSON lazily.
- The validator from `UX-ARCH-0A` updates: it asserts every `defaults.*.sourceIds[]` entry exists in `pack.json#references[]`.
- Each existing pack (`cpg-fmcg`, `retail-digital`, `saas-product`) gets its `defaults` block populated by porting the current hardcoded TS values into its `pack.json`, with claims-audit corrections applied during the port (real `GHG-*` IDs not `ESG-*`, `sme-reviewed` removed unless real).

### Open follow-ups

- Define the JSON schema for the new `defaults` block (`pulsepacks/pack.schema.json`) and add CI validation.
- Decide whether `pulsepacks/manifest.json` is hand-maintained or auto-generated from directory listing.

---

## T4 — Mobile Option C (drawer + persistent Context Bar in header) ships in Slice 3

### Decision

Mobile parent-nav at viewport `<= 640px` becomes a slide-in drawer (left edge, dismiss on tap-outside or swipe), with a persistent Context Bar in the header row at all viewport widths. Option A (bottom tabs) is rejected because it cannot host the Context Bar without competing with the Save bar and Ask composer.

### Why

- The blueprint's acceptance criteria require the Context Bar (`Surface | Assistant | Context | Quality | Freshness`) to be persistently visible. Option A cannot satisfy that on mobile without occupying both top and bottom safe-area regions, which fights with platform conventions.
- The drawer pattern preserves the full nav hierarchy at all viewports, satisfying the existing Settings nav requirements.
- Cost is modest: ~200 lines of CSS + a `MobileNavDrawer` component using `position: fixed` and `transform: translateX()`.
- Lane B confirms the drawer + sticky context strip combination is well-precedented (Slack, Linear, Notion mobile).

### Implications

- Slice 3 grows by ~1-2 days for the mobile work (drawer component + Context Bar component + safe-area-inset CSS).
- `playground/src/settings/settings.css:634-636` rule (`.pp-settings-rail { display: none }`) is replaced with drawer positioning.
- New components: `playground/src/components/MobileNavDrawer.tsx`, `playground/src/components/ContextBar.tsx`.
- Existing tests (e.g., `setup-audit-probe.mjs`) extend to assert: drawer present at 390px, Context Bar visible at all widths.

### Open follow-ups

- Pick drawer behavior on opening (push content right vs overlay).
- Decide if Context Bar is sticky on scroll-down (App Bar pattern) or static.

---

## T5 — 5 tiers backend, 3 tiers UI for the confidence ladder

### Decision

Keep the 5-tier classification in the data layer for governance (`draft / inferred / author-confirmed / source-reviewed / sme-reviewed`). The user-facing UI collapses these into 3 buckets:

| UI bucket | Backend tier(s) | Visual |
|---|---|---|
| `Draft` | `draft` | Pencil icon, neutral chip, amber accent |
| `Inferred` | `inferred` | Sparkle icon, neutral chip |
| `Reviewed` | `author-confirmed`, `source-reviewed`, `sme-reviewed` | Check icon, success chip; hover/expand reveals the specific tier |

### Why

- The 5 distinct backend states carry real governance meaning (Lane B + the claims audit). They must survive in audit logs, attestations, and the source proof drawer.
- Users do not need to distinguish `author-confirmed` from `source-reviewed` from `sme-reviewed` at the chip level; the difference matters only on the source proof drawer.
- 3 UI buckets reduces cognitive load while keeping the audit trail intact.
- WCAG: icon + word + non-color treatment (Lane B). Color is secondary; the icon and word carry the meaning.

### Implications

- The `confidence` type stays 5-valued in `BusinessContextProfile` + `GeneratedDefaults` provenance.
- A new `confidenceUiBucket(confidence)` helper maps 5 → 3 for the chip.
- Source proof drawer reveals the full backend tier with explanation.
- Claims-audit validator from `UX-ARCH-0A` continues to gate `sme-reviewed` behind real SME approval markers.

### Open follow-ups

- Pick the specific icons (sparkle for AI-generated, check for human-reviewed) and document in the design system.
- Decide if there is a separate `Blocked` chip for failed validation, or if `Draft + blocked-reason` covers it.

---

## T6 — Context Bar mobile collapse: `Context · Freshness` default; rest on tap-to-expand

### Decision

At viewport `<= 640px`, the Context Bar shows only `Context` and `Freshness` by default. A small chevron next to the chips expands to reveal `Surface`, `Assistant`, and `Quality`. At desktop widths (`> 1024px`) all five are visible by default.

### Why

- 5 fields on 390px is unreadable; the user needs to know what context the answer is using and how fresh it is.
- Surface and Assistant are operational details — useful for debugging, secondary for daily use.
- Quality (`Full / Limited / Pack-only / Sample / Source-review-required / Blocked`) is a flag, not a primary identifier; it belongs in the expand drawer or as an inline icon on the chip when not `Full`.

### Implications

- `ContextBar.tsx` is a single component with a responsive layout, not separate desktop/mobile components.
- The expand state persists per session (a chip-expand preference written to `pulseplay:context-bar-expanded`).
- When `Quality !== "Full"`, an inline alert icon appears on the always-visible row regardless of expand state, so users do not have to expand to see degraded-trust signals.

### Open follow-ups

- Decide the tablet (640-1024px) intermediate behavior (3-field always-visible? Or full expansion?).
- Confirm icon set with the design system.

---

## T7 — All anonymous-OK; sign-in is a nudge at risk-of-loss moments, never a block

### Decision

PulsePlay actions that could lose user work (saving a Business Context profile, exporting a handoff bundle, sharing an answer link, publishing a deployment configuration) are all available anonymously by default. The sign-in nudge appears at the moment of action, not on first launch, and the user can dismiss it and proceed. The publish-deployment path is the only one that can require sign-in for admin-policy reasons, and only when the deployment target enforces it (Azure App Service with Easy Auth, Databricks App with workspace authentication).

### Why

- The persona/first-launch architecture work (locked 2026-05-23) committed PulsePlay to identity-optional with anonymous as first-class.
- Lane B confirms the convention: GOV.UK, Miro, CodeSandbox all anchor the sign-in prompt to risk-of-loss, never to time or first launch.
- PulsePlay's internal-org-first scope still works without identity for most flows; the workspace authentication for admin actions can wrap only those specific actions.

### Anonymous fallback strategy per action

| Action | Anonymous mechanism |
|---|---|
| Save Business Context profile | Persist to `pulseplay:anon:{renderId}:authoring:bc-profile` localStorage key |
| Export redacted handoff bundle | Generate downloadable file client-side; no server save |
| Share Ask Pulse answer link | Single-use signed URL with embedded payload (expires 7 days); no server account required |
| Publish deployment config | Anonymous OK for `local` / `demo` deployment targets; sign-in required only when target enforces it |

### Anonymous → identified merge

On first sign-in, PulsePlay prompts: `We saved your work in this browser. Move it to your account?` Accept copies all `pulseplay:anon:{renderId}:*` keys to `pulseplay:user:{userIdHash}:*`. Decline leaves anonymous state alone.

### Implications

- The localStorage namespacing pattern (`pulseplay:anon:{renderId}:*` and `pulseplay:user:{userIdHash}:*`) goes into the persistence design from the persona architecture work.
- The sign-in nudge component is one shared dismissible card surfaced at the action moment.
- Audit logs still capture the anonymous `renderId` for traceability; cross-session tracking requires sign-in.
- Slice 2 includes the namespacing scaffolding; Slice 3 includes the merge prompt.

### Open follow-ups

- Identity provider decision (the persona architecture work proposed Logto 3-phase; revisit after the simplification slices ship).
- Decide signed-URL signing key management (server-held secret vs per-tenant key).

---

## Sequencing impact on AGENDA

| Existing AGENDA item | Change |
|---|---|
| `UX-ARCH-0A - Business Context source hardening before UI` | Add T3 + T5 implications: extend `pack.json` schema, add JSON schema validator, port hardcoded TS registry values into pack files, preserve 5 backend confidence tiers |
| `UX-ARCH-0B - Parent-model flow simplification` | Add T1 implication: shape becomes smart 2-parent (Surface + Assistant; Business Context as derived chip on Surface picker). Strategic Lens stays a child of Generated Defaults Review |
| `UX-ARCH-0 - BusinessContextProfile and duplicate-choice collapse` | Rename to `UX-ARCH-0 - BusinessContextProfile as derived context + duplicate-choice collapse`. Add T1 + T2 implications: `inferBusinessContextFromSurface()` function, static defaults engine landing, "why suggested" copy that doesn't claim column-level reasoning yet |
| (new) `UX-ARCH-0C - Mobile drawer + Context Bar (Slice 3 prerequisite)` | T4 + T6 implication: `MobileNavDrawer.tsx`, `ContextBar.tsx`, safe-area CSS, mobile collapse rule (`Context · Freshness` default; rest on tap-to-expand) |
| (new) `UX-ARCH-0D - BI-metadata-aware defaults (Slice 2.5)` | T2 implication: `BIAdapter.getMetadata()` per-vendor implementation, `inferDefaultsFromBIMetadata()`, "why suggested" copy upgrade to column-level reasoning |
| (new) `UX-ARCH-0E - Anonymous-first persistence + sign-in nudge` | T7 implication: `pulseplay:anon:{renderId}:*` and `pulseplay:user:{userIdHash}:*` namespacing, merge prompt on first sign-in, action-anchored sign-in nudge component |

## Acceptance gates

Before declaring this decision set "implemented":

- `pack.json` schema extended; all 3 existing packs (`cpg-fmcg`, `retail-digital`, `saas-product`) port their hardcoded TS values into `pack.json` with claims-audit corrections.
- Surface picker shows the inferred Business Context chip; chip is editable; iframe surfaces fall back to explicit picker.
- Generated Defaults Review page ships with static-only "why suggested" copy. BI-metadata-aware copy is a follow-up.
- Confidence ladder uses 3 UI buckets with backend tier preserved; source proof drawer reveals the specific tier.
- Context Bar renders 5 fields at desktop, `Context · Freshness` at mobile, with tap-to-expand.
- Anonymous flows work for save / export / share without sign-in; sign-in nudge fires at the action moment; merge prompt works on first sign-in.

## Bottom line

The 7 tensions are now locked. The simplification blueprint stays intact in shape; the corner cases are decided. The remaining work is to update `AGENDA.md` with the new item structure, then ship slice-by-slice per beast-mode discipline.
