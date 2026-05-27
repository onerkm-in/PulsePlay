# ARCH-P1 Slice 3 — Feature-Feasibility Registry + Capability Resolver

**Handoff doc for the next coding session.** Read this end-to-end before touching code.

**Date:** 2026-05-27
**Author:** Claude (synthesized from 4 parallel read-only research lanes)
**Status:** SIGNED OFF 2026-05-27 — all 6 §8 questions resolved (see §8). Ready for the next coding session to implement directly.
**Predecessors:** [project_uimode_default_p0.md](../../C:/Users/rajes/.claude/projects/d--Working-Folder-Projects-PulsePlay/memory/project_uimode_default_p0.md) (ARCH-P0), commits `9807ad6` (ARCH-P0 single-source-of-truth), `f892b55` (slice 1 chrome port), `eecdcbe` (slice 2 BI metadata wiring).

---

## 0. TL;DR

The current code has **one** capability shape: a `DEFAULT_UI_MODE: UiMode = "v0"` constant + 7 ad-hoc localStorage flags + a `tabVisibility` model + a `getSetupReadiness()` check. They don't talk to each other. The result: a feature like "executive briefing" exists only on PulseShell, but nothing in code declares that fact — the discovery lives in screenshots and tribal knowledge.

This slice ships a **static TypeScript feature manifest** (one descriptor per feature) + a **capability resolver** (`resolveDefaultSurface(args)` replacing `DEFAULT_UI_MODE`). Pattern is borrowed from **VS Code's contribution-point manifest**, encoded as a **TS discriminated union with `as const` literals** so adding a feature is one descriptor edit and the compiler enforces every consumer handles it.

Scope is intentionally narrow: **build the registry primitive + tag ~10 high-signal features + replace `DEFAULT_UI_MODE`**. Tagging the remaining 36 features happens incrementally as they're touched. Slice 4 ("switch surface to access" affordance) consumes the registry but isn't built here.

**Estimated effort:** 1.5–2 days when picked up. Self-contained, no proxy changes, no migrations.

---

## 1. Why this exists (problem statement)

After today's ARCH-P0 + slice 1+2 ship, three observations stick:

1. **The default surface is a hardcoded constant** ([settingsStore.tsx:DEFAULT_UI_MODE](../../playground/src/settings/settingsStore.tsx)). Flipping it is 1 line — but there's no automated way to know whether flipping it leaves the user without features they need. A user with sectioned-chat enabled gets a degraded experience if defaulted to a surface where it doesn't work.
2. **The surfaces have asymmetric feature support** (Lane 3 matrix below). PulseShell has 11 features v0 lacks; Dashboard has 4 nobody else has. Today the code doesn't enforce this — a developer can wire a feature into v0 that silently breaks in pulse mode, and the build won't catch it.
3. **The 7 existing flags don't compose** (Lane 2 inventory). `uiMode`, `enabledComponents`, `tabVisibility`, `enabledFeatures`, `isSectionedChatEnabled`, `forceWizard`, performance levers — each was added in isolation. Six were already pre-existing tribal knowledge before ARCH-P0; the seventh (`DEFAULT_UI_MODE`) is the one we just added. None of them share a contract.

The fix isn't "add an 8th flag." The fix is to **declare the contract once**, then route every existing flag + every future feature through it.

---

## 2. Scope of this slice

**In scope (build now):**
- `playground/src/featureRegistry/types.ts` — `Surface`, `FeatureId`, `FeatureDescriptor` types (TS discriminated union, `as const`)
- `playground/src/featureRegistry/manifest.ts` — single static manifest with ~10 entries (the high-signal subset, list at §6.2)
- `playground/src/featureRegistry/resolver.ts` — `resolveDefaultSurface(args) → Surface` + `featureSupportsSurface(featureId, surface) → boolean`
- Wire `resolveDefaultSurface` into `App.tsx readInitialUiMode()` + `settingsStore readUiMode()` — `DEFAULT_UI_MODE` becomes the resolver's fallback when nothing in the args narrows the choice
- 3 test files (resolver, manifest type-narrowing assertions, integration with settingsStore)
- AGENDA + HANDOVER + memory updates

**Out of scope (slice 4 territory — see §3):**
- The `<SwitchSurfaceAffordance>` component itself
- Per-feature "this feature requires PulseShell" affordances rendered on v0
- Surface-switch animations
- Allowlist-driven surface restriction (governance-level, not per-feature)

**Out of scope (parked for incremental work):**
- Tagging the other ~36 features. Manifest entries get added as features get touched in future PRs. The 10 we tag now are the ones that materially differ across surfaces; the rest don't yet need the registry to compile.
- `@supports`-style runtime capability detection (Lane 4's pattern 2). Useful when a surface conditionally loses capability (detached popup, missing Web Speech, etc.) — overkill for the static case we have today.
- Plan-tier / multi-tenant feature gating (irrelevant per CLAUDE.md "Path C — inner-source first").

---

## 3. Out of scope, explicitly named (so they aren't quietly added)

These are tempting to bundle but make this slice >2 weeks instead of 2 days:

- **Allowlist-as-registry-input.** The allowlist already has `display.biTileMode`, `license.fabricEnabled` etc. (Lane 2). Tempting to feed it into `resolveDefaultSurface` as governance-level surface restriction. **Defer.** Today's resolver only consults user-facing feature toggles + setup readiness; the allowlist already gates feature visibility upstream, so re-consulting it would be double-checking. If a real governance use case emerges (e.g. "this allowlist forbids v0 for compliance reasons"), add a thin `allowedSurfaces?: Surface[]` field to the resolver input then — not now.
- **Runtime resolver re-evaluation.** Boot-time resolution is enough for slice 3. If a user enables a feature mid-session that would have changed the resolver outcome, they keep the boot-time surface. Slice 4 (switch-surface affordance) gives the user the manual exit hatch.
- **Per-pack surface preferences.** Pack manifests could say "this pack works best on PulseShell." Cleanly out of scope — packs already shape feature behavior; surface choice is orthogonal.
- **Sustainability indicator orb migration to v0.** A real feature gap (Lane 3 says "removed 2026-05-23, code remains"), but a separate UI port, not a registry concern.

---

## 4. Inventory we're working from

### 4.1 The 7 existing capability primitives (Lane 2)

| Primitive | Type | Today's role | Slice 3 role |
|---|---|---|---|
| `uiMode` (`pulse` \| `v0`) | localStorage + settings | Direct user override of default surface | Becomes the manual escape hatch. Resolver reads this LAST, after computing the default. |
| `enabledComponents` | localStorage | Legacy pane composition | Untouched. Resolver doesn't consume. |
| `tabVisibility` | localStorage + settings | Per-tab on/off in PulseShell | Resolver INPUT: if only one tab is visible, that tab's surface becomes the default. |
| `enabledFeatures` (Pulse format pane) | Pulse-only setting | Power BI sandbox toggle | Out of scope (Pulse-port compat surface; doesn't reach v0). |
| `isSectionedChatEnabled()` | localStorage flag | Feature-flag for sectioned chat in v0 | Resolver INPUT: when true, feature `sectioned-chat` is required → surface support intersection narrows. |
| `forceWizard()` | localStorage flag | Setup wizard trigger | Untouched. |
| Performance Levers | localStorage JSON | Author-tunable knobs | Untouched. |

### 4.2 Surface-feature support matrix (Lane 3)

10 high-signal features that differ across surfaces (full 46-feature list in Lane 1 output, archived in the agent transcript):

| Feature | PulseShell | UnifiedAssistantSurface | Dashboard |
|---|---|---|---|
| `chat-composer` | ✓ | ✓ | N/A |
| `chat-history` | ✓ | ✓ | N/A |
| `frame-picker` | ✓ | ✓ | N/A |
| `trust-badge` | ✓ | ✓ | N/A |
| `surface-context-strip` | ✓ | ✓ (slice 1) | N/A |
| `executive-briefing` | ✓ | ✗ | N/A |
| `custom-sql-sections` | ✓ | ✗ | N/A |
| `briefing-exports` (PDF/PNG/XLSX/MD) | ✓ | ✗ | N/A |
| `sustainability-orb` | ✓ | ✗ | N/A |
| `bi-iframe-canvas` | N/A | N/A | ✓ |

(N/A = not applicable for that surface, vs ✗ = applicable but not implemented.)

### 4.3 Surface-defining quirks (Lane 3) — do NOT register

- PulseShell's **3-tab strip** IS PulseShell's identity. Don't tag it as a "feature with surface support" — it's a surface integrant. v0 should never claim to support it; that would dilute v0's "single conversational surface" identity.
- v0's **single-pane chat** IS v0's identity. Same reasoning.
- Dashboard's **BI vendor embeds** ARE Dashboard's identity. The chat/composer would be wrong on Dashboard; don't even surface the question via a "switch surface" affordance there.

These quirks become a **`coreIdentity: true`** flag on the surface descriptor (§6.1) so the resolver knows never to migrate them.

---

## 5. Design options considered

### Option A — Plain map: `Record<FeatureId, Surface[]>` (rejected)

Simplest. One file: `export const FEATURE_SUPPORT: Record<FeatureId, Surface[]> = { ... }`. Resolver does set intersection.

**Pro:** 30 lines of code. **Con:** Loses TS narrowing (every consumer has to `featureSupport[id] ?? []`). Loses descriptor metadata (which is the load-bearing piece for slice 4's affordances). Loses static analysis — can't detect "feature claims to support a surface that the surface doesn't expose." Rejected.

### Option B — VS Code-style contribution-point manifest + TS discriminated union (Lane 4 recommendation) ⭐

Each feature exports a typed descriptor; a single `MANIFEST` array imports them all; the resolver computes routing at boot.

**Pro:** Compile-time enforcement (every consumer handles every feature, TS narrows on `Extract<FeatureDescriptor, { id: 'briefing' }>['surfaces']`). Carries the metadata slice 4 needs (`fallback: { kind: "switch-surface", target: "pulse" }`). Adding a feature is one descriptor edit. Pattern is widely understood (VS Code, Atom, Sublime all use it).

**Con:** ~150 lines of code instead of 30. Worth it.

### Option C — Hybrid (B + `@supports`-style runtime detection for conditional capabilities) (defer)

Add runtime capability detection only where a surface conditionally loses capability (detached popup, missing Web Speech, etc.). **Defer to slice 4 or later.** No current PulsePlay surface has runtime-conditional capability today; building the abstraction without a use case is speculative.

**Recommendation: Option B.** Lane 4's analysis converges on the same answer. The TS discriminated union (Lane 4's pattern 3) is the implementation substrate.

---

## 6. Recommended design

### 6.1 Registry shape (TS types)

```typescript
// playground/src/featureRegistry/types.ts

/** The user-visible PulsePlay surfaces. New surfaces (e.g. a "Mobile"
 *  surface or a "Headless API" surface) add a literal here, then the
 *  resolver + every descriptor must handle them — enforced by TS. */
export type Surface = "pulse" | "v0" | "dashboard";

/** Surface descriptor — declares identity + which features are
 *  surface-integrant (cannot be ported elsewhere). */
export interface SurfaceDescriptor {
    id: Surface;
    /** Human-readable name for affordances + telemetry. */
    label: string;
    /** Features that ARE this surface's identity. The resolver never
     *  migrates these to another surface, and slice 4 doesn't render
     *  "switch to X" affordances pointing at them. */
    coreIdentity: readonly FeatureId[];
}

export const SURFACES: readonly SurfaceDescriptor[] = [
    {
        id: "pulse",
        label: "PulseShell",
        coreIdentity: ["tab-strip-3", "executive-briefing-grid"],
    },
    {
        id: "v0",
        label: "Ask Pulse (UnifiedAssistantSurface)",
        coreIdentity: ["single-pane-chat"],
    },
    {
        id: "dashboard",
        label: "Dashboard",
        coreIdentity: ["bi-vendor-embed"],
    },
] as const;

/** Static manifest of all feature IDs. Add a literal here whenever a
 *  new feature gets registered. The discriminated union below pins
 *  the shape per-feature. */
export type FeatureId =
    | "chat-composer"
    | "chat-history"
    | "frame-picker"
    | "trust-badge"
    | "surface-context-strip"
    | "executive-briefing"
    | "custom-sql-sections"
    | "briefing-exports"
    | "sustainability-orb"
    | "bi-iframe-canvas";

/** One descriptor per feature. `surfaces` is the set of surfaces that
 *  CAN render this feature today. `preferredSurface` is where the
 *  resolver should default a user who requires this feature, when
 *  multiple surfaces support it. */
export interface FeatureDescriptor {
    id: FeatureId;
    label: string;
    /** Surfaces that render this feature today. Empty array means the
     *  feature is registered but not yet shipped anywhere — slice 4
     *  affordances will show "coming soon" instead of "switch surface." */
    surfaces: readonly Surface[];
    /** The surface to prefer when this feature is required. Must be
     *  in `surfaces`. */
    preferredSurface: Surface;
    /** Optional: this feature is gated by a runtime flag the resolver
     *  must consult. Today only `isSectionedChatEnabled` qualifies. */
    runtimeGate?: () => boolean;
}
```

### 6.2 Initial manifest (10 entries)

```typescript
// playground/src/featureRegistry/manifest.ts
import type { FeatureDescriptor } from "./types";
import { isSectionedChatEnabled } from "../components/UnifiedAssistantSurface";

export const FEATURE_MANIFEST: readonly FeatureDescriptor[] = [
    { id: "chat-composer",         label: "Chat composer",          surfaces: ["pulse", "v0"], preferredSurface: "v0"        },
    { id: "chat-history",          label: "Chat history",           surfaces: ["pulse", "v0"], preferredSurface: "v0"        },
    { id: "frame-picker",          label: "FramePicker",            surfaces: ["pulse", "v0"], preferredSurface: "v0"        },
    { id: "trust-badge",           label: "TrustBadge",             surfaces: ["pulse", "v0"], preferredSurface: "v0"        },
    { id: "surface-context-strip", label: "Surface context strip",  surfaces: ["pulse", "v0"], preferredSurface: "v0"        },
    { id: "executive-briefing",    label: "Executive briefing",     surfaces: ["pulse"],       preferredSurface: "pulse"     },
    { id: "custom-sql-sections",   label: "Custom SQL sections",    surfaces: ["pulse"],       preferredSurface: "pulse"     },
    { id: "briefing-exports",      label: "Briefing exports",       surfaces: ["pulse"],       preferredSurface: "pulse"     },
    { id: "sustainability-orb",    label: "Sustainability orb",     surfaces: ["pulse"],       preferredSurface: "pulse"     },
    { id: "bi-iframe-canvas",      label: "BI iframe canvas",       surfaces: ["dashboard"],   preferredSurface: "dashboard" },
] as const;
```

### 6.3 Resolver shape

```typescript
// playground/src/featureRegistry/resolver.ts
import { SURFACES, FEATURE_MANIFEST, type Surface, type FeatureId } from "./types";
import { DEFAULT_UI_MODE } from "../settings/settingsStore";

export interface ResolveDefaultSurfaceArgs {
    /** User's explicit override from localStorage, if any. Wins over
     *  every other input — that's how the escape hatch stays load-bearing. */
    explicitUiMode?: "pulse" | "v0" | null;
    /** Required features for this user — drives surface intersection.
     *  Today: empty array (no feature requires any specific surface
     *  before the user has interacted). When ARCH-P1 slice 4 ships,
     *  user-enabled features (e.g. sectioned-chat) appear here. */
    requiredFeatures: readonly FeatureId[];
    /** Per-tab visibility from settingsStore. If only one tab is
     *  visible, that surface wins (today's tabVisibility behavior). */
    tabVisibility: {
        aiInsights: boolean;
        askPulse:   boolean;
        dashboard:  boolean;
    };
}

/** Replaces `DEFAULT_UI_MODE` in App.tsx readInitialUiMode() and
 *  settingsStore readUiMode(). Pure function — no React, no globals. */
export function resolveDefaultSurface(args: ResolveDefaultSurfaceArgs): Surface {
    // 1. Explicit user override wins. Always.
    if (args.explicitUiMode === "pulse" || args.explicitUiMode === "v0") {
        return args.explicitUiMode;
    }

    // 2. Required features narrow the candidate surfaces.
    const candidates: Surface[] = ["pulse", "v0", "dashboard"];
    for (const featureId of args.requiredFeatures) {
        const descriptor = FEATURE_MANIFEST.find(f => f.id === featureId);
        if (!descriptor) continue; // unknown feature, skip (don't crash)
        // Intersect: surface must support EVERY required feature.
        for (let i = candidates.length - 1; i >= 0; i--) {
            if (!descriptor.surfaces.includes(candidates[i])) {
                candidates.splice(i, 1);
            }
        }
    }

    // 3. Tab visibility — if only one tab visible, that surface wins
    //    (matches today's per-tab-visibility lock). dashboard tab maps
    //    to dashboard surface; askPulse → v0; aiInsights → pulse.
    const visibleSurfaces: Surface[] = [];
    if (args.tabVisibility.aiInsights) visibleSurfaces.push("pulse");
    if (args.tabVisibility.askPulse)   visibleSurfaces.push("v0");
    if (args.tabVisibility.dashboard)  visibleSurfaces.push("dashboard");
    const stillVisible = candidates.filter(c => visibleSurfaces.includes(c));
    if (stillVisible.length === 1) return stillVisible[0];

    // 4. Otherwise return the preferred surface of the first required
    //    feature (if any), else DEFAULT_UI_MODE.
    if (args.requiredFeatures.length > 0) {
        const first = FEATURE_MANIFEST.find(f => f.id === args.requiredFeatures[0]);
        if (first && stillVisible.includes(first.preferredSurface)) {
            return first.preferredSurface;
        }
    }
    return stillVisible.includes(DEFAULT_UI_MODE) ? DEFAULT_UI_MODE : (stillVisible[0] ?? DEFAULT_UI_MODE);
}

export function featureSupportsSurface(featureId: FeatureId, surface: Surface): boolean {
    const descriptor = FEATURE_MANIFEST.find(f => f.id === featureId);
    return descriptor?.surfaces.includes(surface) ?? false;
}
```

### 6.4 Integration sites

| Site | Change |
|---|---|
| `App.tsx readInitialUiMode()` | Replace `return DEFAULT_UI_MODE` with `return resolveDefaultSurface({ explicitUiMode: stored, requiredFeatures: [], tabVisibility: readTabVisibility() })`. The escape-hatch parsing of `stored === "v0" / "pulse"` stays. |
| `settingsStore readUiMode()` | Same pattern as App.tsx for the mirror. |
| `featureRegistry/__tests__/resolver.test.ts` | NEW. ~15 cases covering each branch. |
| `featureRegistry/__tests__/manifest.test.ts` | NEW. Asserts every descriptor's `preferredSurface ∈ surfaces` (catches manifest mistakes at test-time). |

---

## 7. Migration plan (slice 3 deliverables)

1. **Create `playground/src/featureRegistry/types.ts`** with the type definitions from §6.1.
2. **Create `playground/src/featureRegistry/manifest.ts`** with the 10-entry manifest from §6.2.
3. **Create `playground/src/featureRegistry/resolver.ts`** with the resolver + helper from §6.3.
4. **Wire `resolveDefaultSurface` into `App.tsx readInitialUiMode()`** — preserves the explicit-override escape hatch.
5. **Wire `resolveDefaultSurface` into `settingsStore.tsx readUiMode()`** — mirror.
6. **Write tests:** resolver (~15 cases), manifest type assertions (~3 cases), one integration test in `settingsStore.test.tsx` proving the resolver replaces the previous default-mode return path.
7. **Update memory + AGENDA** — `project_uimode_default_p0.md` notes the resolver is in place; AGENDA marks slice 3 done with the next-slice tripwires.
8. **Commit.**

**No file deletions.** `DEFAULT_UI_MODE` constant stays — the resolver uses it as the final fallback. This keeps the ARCH-P0 single-source-of-truth contract intact: changing the default is still "edit `DEFAULT_UI_MODE` in one place," because the resolver returns it when no narrowing input fires.

**Done definition:**
- All 7 migration steps complete
- Lint clean, full playground test suite green (target: 1640+ tests after +20 new)
- Browser smoke: cold boot with no localStorage still mounts UnifiedAssistantSurface (same as today); cold boot with `tabVisibility = { aiInsights: false, askPulse: false, dashboard: true }` now mounts Dashboard (was: ignored)
- Commit message includes the ARCH-P1 slice 3 marker

---

## 8. Resolved decisions (signed off 2026-05-27)

All 6 questions answered. Implement as resolved below — do NOT revisit during the coding session.

1. **Surface enum cardinality → KEEP 3 SURFACES.** `Surface = "pulse" | "v0" | "dashboard"`. Each surface declares its own `coreIdentity`. Dashboard's lack of chat/composer makes folding it into v0 a cross-cutting special-case generator; better to let TS narrow over 3 literals.

2. **`tabVisibility` vs explicit override → EXPLICIT `uiMode` ALWAYS WINS.** The escape hatch is unconditional. If a user wrote `pulseplay:ui-mode = "v0"` into localStorage, they get v0 regardless of tabVisibility. `tabVisibility` narrows the resolver ONLY when no explicit override is set. The resolver shape in §6.3 already implements this — step 1 returns immediately on `explicitUiMode === "pulse" || "v0"`.

3. **Initial manifest scope → 10 HIGH-SIGNAL FEATURES ONLY.** Manifest at §6.2 stays as written. Tag the rest as future PRs touch them. Don't land 46 in this slice.

4. **`runtimeGate` field → DECLARE IN SLICE 3, CONSUME IN SLICE 4.** Add the optional `runtimeGate?: () => boolean` field to `FeatureDescriptor` (already in §6.1) and tag `sectioned-chat` with `runtimeGate: () => isSectionedChatEnabled()` in the manifest. Resolver does NOT consume it yet. Slice 4 wires the consumer. Avoids a type-shape migration between slices.

5. **Telemetry → DEFER.** Do NOT emit a `pulseplay:bi-event` on resolver decisions in this slice. The resolver runs cheaply and silently. If a support incident demands forensic visibility later, add the event in a follow-up.

6. **Pattern sign-off → OPTION B (VS Code-style manifest + TS discriminated union).** Implement directly from this doc. No design revisit.

### Manifest entry update for Q4

`sectioned-chat` is NOT in the §6.2 10-entry list as written. Add it as an 11th entry to exercise the `runtimeGate` field:

```typescript
{
    id: "sectioned-chat",
    label: "Sectioned chat (Genie HEADLINE/TRENDS/RISKS/ACTIONS)",
    surfaces: ["pulse", "v0"],
    preferredSurface: "v0",
    runtimeGate: () => isSectionedChatEnabled(),
},
```

(Updates §6.2 count from 10 to 11 — slice 3 ships 11 entries, slice 4+ continues incrementally.)

---

## 9. What slice 4 looks like (forward reference, NOT part of this slice)

For continuity:
- Slice 4 introduces `<SwitchSurfaceAffordance featureId={...} />` — when rendered on a surface that doesn't support the feature, shows a "this requires PulseShell — switch?" link. Otherwise renders `null`.
- Slice 4 lights up the `runtimeGate` resolver branch — when `isSectionedChatEnabled()` is true, sectioned-chat becomes a required feature, and the resolver pre-narrows surfaces accordingly.
- Slice 4 doesn't touch the manifest or types from this slice — it consumes them.

That's the natural shape. The doc you'd write for slice 4 needs its own research pass; do NOT start designing it now.

---

## 10. Research transcripts

The 4 parallel research lanes that informed this doc:

- **Lane 1 — Codebase feature inventory:** 46 features cataloged in 8 categories. Used in §4.2 (selected 10), full list in agent transcript.
- **Lane 2 — Existing capability plumbing:** 7 primitives + governance allowlist + readiness machinery. Drives §4.1 table.
- **Lane 3 — Surface differences audit:** Support matrix + surface-defining quirks. Drives §4.2 matrix + §4.3 "do NOT register" list.
- **Lane 4 — Industry patterns:** VS Code contribution-points + TS discriminated unions converged as the recommendation. Drives §5 + §6.

Transcripts are in this conversation's tool history; archive to `docs/research/agent-transcripts/2026-05-27-arch-p1-slice-3/` if you want them retained.
