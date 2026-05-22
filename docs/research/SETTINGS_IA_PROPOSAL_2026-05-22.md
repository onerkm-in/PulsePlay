# Settings Page IA — Research-Backed Proposal (2026-05-22)

> **Status**: Research complete · **Implementation**: deferred per user direction *"make sure we keep everything documented so that it will help in the future, taking a discussion"*.
>
> **Triggering feedback** (verbatim): *"the menu or navigations are not smooth for the author, it's very confusing, it should follow Parent - Child pattern and should be progressive and should be interactive, I mean the author should feel like they are engaged and well informed of the settings they are doing, this applies for all the sections those fall in the setting page, can we please do a proper mapping here."*
>
> **Research method**: 4 parallel agents per `feedback_research_first.md` — offline in-tree IA audit + offline design-spec archaeology + online industry IA patterns + online engagement-pattern research.
>
> **URL signatures**: 28 sources logged in [EXTERNAL_REFERENCES.md](EXTERNAL_REFERENCES.md#2026-05-22--settings-page-ia-progressive-parent-child--engagement-patterns).
>
> **Authoritative existing design contract**: [docs/SETTINGS_SPEC.md](../SETTINGS_SPEC.md). This proposal layers on top, doesn't replace.

---

## TL;DR

The Settings IA is well-documented in `SETTINGS_SPEC.md` and was thoughtfully designed. The user's frustration is about **execution gaps**, not the architecture. **5 high-impact additions** plus **4 P1 fixes from heritage lessons** would close the gap without any restructure of the 6-group / 3-tier hierarchy.

| # | Affordance | Impact | Complexity |
|---|---|---|---|
| 1 | Cmd+K settings palette (fuzzy + recents + synonyms) | **HIGH** — collapses 42-setting IA to one keypress | Medium |
| 2 | Live impact callout under each setting | **HIGH** — delivers the "engaged + well-informed" feel directly | Medium-High |
| 3 | Sticky dirty-state action bar + Cloudscape 2-tier nav guard | **HIGH** — prevents the "wait, I had unsaved changes" trust disaster | Low-Medium |
| 4 | "Recommended" pill + one-line rationale on trade-off settings | **MEDIUM** — turns dropdown roulette into guided choice | Low (metadata only) |
| 5 | Time-stamped status chips that deep-link to their check | **MEDIUM** — auditable status, not stale-green decoration | Low-Medium |

**P1 fixes from heritage lessons (also queued):**

- Settings role/scope metadata (4-scope distinction: deployment-policy / author-default / viewer-preference / developer)
- Save bar semantic honesty (either real draft or rename)
- Mobile navigation restoration (rail → tab strip below 720px)
- Unified `AuthoringStateSnapshot` facade

---

## 1. Current state (offline audit)

### 1.1 The IA today

```
6 groups × 4 subsections avg × 42 leaf settings × optional sub-routes

SETUP
  └─ (No Leafs; inline FieldCards: BI surface, AI assistant, Domain knowledge)
BI
  ├─ Current state → [Leaf: Provider]
  ├─ Connect and embed → [Leaf: Embed, Leaf: Authentication]
  ├─ Governance and policy → [Leaf: Canvas, Leaf: Status]
  └─ Sub-route: /settings/bi/governance
AI
  ├─ Connector catalogue → ConnectorBrandGrid (non-Leaf)
  ├─ Assistant → [Leaf: Model/Agent, Leaf: Connection test, Leaf: Power BI Q&A (conditional)]
  ├─ Shared context → [Leaf: Knowledge pack, Leaf: Vector Search KB (conditional×2 variants), Leaf: UC Metric View, Leaf: Browse library]
  ├─ Response behavior → [Leaf: Response behavior]
  ├─ Surface-specific behavior → [Leaf: Supervisor Fusion (sub-route), Leaf: Knowledge Base (sub-route)]
  ├─ Sub-route: /settings/ai/knowledge-base
  └─ Sub-route: /settings/ai/supervisor-fusion
PREFERENCES
  ├─ Mode → [Leaf: UI mode]
  ├─ Layout → [Leaf: Layout preset, Leaf: Visible panels, Leaf: AI position, Leaf: Default landing tab]
  ├─ Mix composition (conditional: enabledComponents === "mix") → 4 leaves
  ├─ Display policy → [Leaf: Canvas tiles (read-only)]
  └─ Sub-route: /settings/preferences/appearance
SYSTEM
  ├─ ReconDisclaimer (locked in EXE mode)
  ├─ Status → [Leaf: Proxy status, Leaf: Network and auth]
  ├─ Policy → [Leaf: Security posture, Leaf: License posture]
  ├─ (Listed but unrendered): Profile inventory, Diagnostics, Setup wizard, Export support bundle
  └─ Sub-route: /settings/system/developer-tools
ADVANCED
  ├─ [Leaf: Performance levers]
  ├─ [Leaf: Local storage inspector]
  ├─ [Leaf: Reset section]
  ├─ [Leaf: Reset all]
  └─ [Leaf: Danger zone]
```

### 1.2 Reusable IA primitives

| Primitive | Purpose | Source |
|---|---|---|
| `Leaf` | Renders article with `id="settings-{group}-{slug}"`, label, deep-link copy, helper, children | `BiGroup.tsx:352-373` |
| `SubSection` | Renders titled bucket of Leafs with optional anchor | `BiGroup.tsx:293-350` |
| `CurrentValue` | Read-only label + value pair (monospace) | `BiGroup.tsx:422-429` |
| `FieldCard` | Numbered step container (Setup group's 3 steps) | `SetupGroup.tsx` primitives |
| `FieldRow` | Label + input row with optional hint, tip, required badge | `SetupGroup.tsx` primitives |
| `ButtonGroup<T>` | Toggle-like inline-flex button row (UI mode, Layout, AI position, etc.) | `PreferencesGroup.tsx:294-322` |
| `Toggle` | Checkbox-like switch (Knowledge Base, Appearance, etc.) | primitives |
| `DeepLinkButton` | Triggers route change to a sub-route | various |
| `OrphanBanner` | Alert when saved value no longer in allowlist | `BiGroup.tsx:450-467` |

### 1.3 Status strip (chips at top of screenshot)

6 live-bound chips: **Setup** · **BI** · **AI** · **Pack** · **Proxy** · **Security**. Each computed from a different subsystem (setupReadiness, biVendor, activeAiProfile, packSelection, `/api/health` 10s poll, allowlist.enforcement). Clickable → `navigateToSettings(group, leaf)`.

### 1.4 Save / Discard model

- `useSettingsDraft` snapshots all `pulseplay:*` localStorage keys on Settings mount
- Polls every 500 ms + listens to `pulseplay:display-change` event for dirty detection
- "Save" updates snapshot reference + fires `pulseplay:settings-saved` event; "Discard" restores snapshot
- **Problem**: many leaves write LIVE to localStorage; "Save" bar's draft semantics don't match. Documented as P1 gap in `SETTINGS_AUTHOR_VIEWER_UX_SCAN.md`.

### 1.5 The 12 friction points

1. **No breadcrumbs at depth 3** — sub-pages (`/settings/ai/knowledge-base`) lack visible path back to parent
2. **Sub-route navigation is button-click indirect** — slower than left-rail single-click
3. **Conditional leaves silent fallback** — "Power BI Q&A" missing → lands on "Connector catalogue" with no explanation
4. **Settings change → silent impact** — toggle "Visible panels: Mix" reveals 4 new leaves with no visual hint
5. **42 leaves without intra-group progressive disclosure** — all leaves render; nothing folds away
6. **Search doesn't index helper text** — only leaf labels + group descriptions
7. **Left rail subitems don't distinguish leaf vs sub-route vs conditional**
8. **Orphan badges only on setup/advanced** — but a stale `activeAiProfile` is in AI group
9. **Sub-pages don't preserve scroll position**
10. **No "what does this control" cross-reference** — toggle "Show SQL tab" → user wonders "where does this appear?"
11. **Mixed immediate vs draft application is confusing** — some settings apply live, some require Save
12. **Save bar semantics don't match the live-write reality**

### 1.6 The 10 strengths to preserve

1. Explicit save gate prevents accidental loss
2. Left rail + chip navigation dualism
3. Search spans all 42 leaves
4. Deep-link per-leaf (copy button)
5. Live edit preview in app
6. SubSection + Leaf semantic clarity (after Codex audit fixed all-caps)
7. Multi-form sub-pages for dense UIs
8. Orphan detection + banners
9. Read-only display of governed state (CurrentValue)
10. Status badges per setting

---

## 2. Heritage lessons (from `docs/inherited/SETTINGS_AUTHOR_VIEWER_UX_SCAN.md`)

Pulse-PBI sibling surfaced four deeper structural issues PulsePlay inherits:

### 2.1 Four scope-confusion

Settings mixes **4 distinct scopes** without explicit metadata:

| Scope | What | Editable by | Example |
|---|---|---|---|
| **deployment-policy** | Set by admin in proxy/config.json or allowlist | Read-only in Settings | Allowlist, tile mode, license tier |
| **author-default** | Author choice for the deployment | Author | Default landing tab, layout preset, default profile |
| **viewer-preference** | Viewer's per-session override | Viewer | UI mode (Pulse/v0), color scheme |
| **developer** | Special affordances | Dev mode only | SQL tab, Trace tab, raw localStorage inspector |

Proposed metadata:

```ts
interface SettingsLeafMeta {
    readonly role: "viewer" | "author" | "admin" | "support";
    readonly scope: "deployment-policy" | "author-default" | "viewer-preference" | "session-runtime" | "developer";
    readonly lifecycle: "connect" | "ground" | "shape" | "verify" | "operate" | "recover";
    readonly sourceOfTruth: "allowlist" | "localStorage" | "settingsStore" | "embedConfigStore" | "pulseVisualSettingsStore";
    readonly editMode: "immediate-apply" | "draft-then-save" | "type-to-confirm" | "read-only";
}
```

### 2.2 Save bar dishonesty

Many leaves write LIVE; Save bar implies draft. **Two fixes possible:**

- **(A)** Implement real draft semantics — buffer all writes in memory until Save click
- **(B)** Rename the affordance — "Last saved 30s ago · Reload defaults" instead of "Save / Discard"

### 2.3 Fail-closed UX

When proxy is down or policy unavailable, the Setup page still renders downstream controls. Should show a blocked setup state with "Check proxy" + support details.

### 2.4 Mobile navigation lost

Below 640px the left rail hides — leaves search as the only nav. SPEC says rail → horizontal segmented group at 720px, chips → dots at 480px. Implementation missing.

### 2.5 AuthoringStateSnapshot facade

State spans `settingsStore`, `embedConfigStore`, `pulseVisualSettingsStore`, runtime shell state, allowlist data, pack data, proxy health. Hard to reason about. Proposed pure snapshot:

```ts
interface AuthoringStateSnapshot {
    biSurface:        { requestedVendor: string; effectiveVendor: string; configured: boolean; blockedReason?: string };
    assistant:        { requestedProfile: string; effectiveProfile?: string; configured: boolean; blockedReason?: string };
    knowledge:        { requestedPack?: string; effectivePack?: string; configured: boolean };
    viewerExperience: { requestedSurface: SurfaceId; effectiveSurface: SurfaceId; layoutPreset: string; fallbackReason?: string };
}
```

### 2.6 BI mode cards (UX3)

The BI page should lead with author-oriented mode cards (Native canvas / Generic iframe / Power BI quick preview / Power BI SSO / Power BI service principal). Only after a mode is selected should dense fields appear.

---

## 3. Industry IA patterns (online research)

### 3.1 Tree depth — 3-level cap consensus

| Product | Depth | Notes |
|---|---|---|
| Stripe Dashboard | 2-level with 3-level islands (Connect, Tax) | `SettingsView` component standardises leaf page header |
| Linear | 2-level (Workspace / Account / Integrations → leaf) | Strict minimalism. 42 settings would break this. |
| **Vercel** | **3-level (Scope → Settings → Leaf)** | **Closest fit for PulsePlay.** Scope picker = parent-most level. |
| GitHub | 2-level mostly; 3-level for Org/Enterprise | Per-page filter only (no global search) |
| Notion | n-level pages-as-tree with toggles | Breadcrumbs for nested context |
| AWS Console | 4-5 level (Service → Resource → Tab → Sub-tab → field) | **Anti-pattern**. Visibility ≠ complexity. |

**Verdict**: 3-level hard cap (Group → SubSection → Leaf, sub-routes for dense UIs). PulsePlay already does this.

### 3.2 Progressive disclosure

Jakob Nielsen's 1995 principle still rules: show 80% defaults, hide expert behind explicit "Advanced" reveal at the moment of readiness.

- **Always-visible** wins for low-cardinality leaves (≤ 5 fields)
- **Expand-on-demand** wins for >5 fields where long tail is rarely touched
- Pattern: `Core → (Show advanced) → Advanced → (Show expert)`

### 3.3 Save model

- **Explicit save** for declarative forms (multiple fields, commits intended)
- **Auto-save** for imperative controls (toggles, single-select)
- **Cardinal sin**: mixing the two within one form
- **Robust admin pattern**: auto-save + draft envelope — changes commit immediately but a "You have unsaved changes / Reset to saved" banner appears at leaf level until publish

### 3.4 Status chips at the top

PatternFly + Carbon both endorse the pattern with rules:

- Severity rollup (aggregate to highest-attention color)
- Filled icons for high-severity
- 3-5 chips max
- Each chip must (a) be clickable, (b) jump to controlling group, (c) honor severity rollup
- Goes from strong → cluttered when chips don't map to actionable below, or restate what user just typed

### 3.5 Cmd+K palette

Standard for 40+ settings. Linear, Figma, Notion, Vercel, Raycast all converged.

Build spec (Superhuman):
- Always-on shortcut
- Fuzzy match
- Synonyms / aliases
- Frequency-weighted ranking
- Contextual boosts based on recent activity

---

## 4. Engagement patterns (online research)

### 4.1 "What does this setting affect?"

**Live Preview pattern** (ui-patterns.com): update result on every keystroke; commit-or-explore.

**LaunchDarkly admin-grade version**: "simulate flag states and preview targeting rules before rollout."

**For PulsePlay**: a small "Affects:" callout under each setting listing the dependent settings + active sessions. Requires a setting-dependency graph (the `AuthoringStateSnapshot` facade enables this).

### 4.2 Status indicators

Strongest when each chip:
- Deep-links to its source-of-truth
- Shows a `lastCheckedAt` timestamp ("Proxy Connected · checked 12s ago →")
- Represents a verified recent check, not a "config was saved" tautology

Noise when too many chips compete, stale-green, or restate user input.

### 4.3 Parent context

Standard B2B SaaS pattern (Atlassian, Vercel, Stripe Connect):

- Breadcrumb chain at the top of every leaf page at depth 3+
- Persistent sidebar showing currently selected leaf highlighted
- "Related settings" rail when settings cross-cut

### 4.4 Decision guidance

Stripe Connect onboarding: three named configurations each with a tagged trade-off summary, one tagged **Recommended** with a one-line "why" + link to longer doc.

Don't put the recommendation in a tooltip — make it visible at rest.

### 4.5 Save-aware navigation

AWS Cloudscape's pattern is the most concrete public spec:

- **2-tier guard**: in-page modal for app-level nav (Cancel button, breadcrumb click) **plus** `beforeunload` for browser-level close/reload
- Confirm only when `hasChanges === true`
- Auto-save recommended when "data entered is large and changes could be difficult to reproduce"
- For settings (small payload, high stakes): **explicit save with sticky dirty-state bar** is the right default

### 4.6 Search-first via Cmd+K

At 42+ settings, search is the **primary** affordance — IA is the fallback.

### 4.7 Empty-state guidance

Onboarding checklists drive activation 25-30% → 40%+ ([UserOnboard](https://www.useronboard.com/onboarding-ux-patterns/empty-states/), [Userpilot](https://userpilot.medium.com/onboarding-ux-patterns-and-best-practices-in-saas-c46bcc7d562f)).

Each uninitialized section should answer "What now?" with one CTA, not a wall of fields. Stripe's `OnboardingView` is the prescriptive version.

---

## 5. Proposed work items

### 5.1 Priority queue

| # | Item | Type | Effort | Impact | Notes |
|---|---|---|---|---|---|
| **1** | **Cmd+K settings palette** | New | 4-6 hr | HIGH | Always-on shortcut, fuzzy + synonyms + frequency-weighted. Collapses 42-setting IA to one keypress. |
| **2** | **Live impact callout under each setting** | New | 6-8 hr | HIGH | "Changing this affects: Connector X, 3 active sessions." Requires `AuthoringStateSnapshot` + setting-dependency graph. |
| **3** | **Save bar honesty (rename to "Last saved · Reload defaults")** | Refactor | 2 hr | HIGH | Either build real draft semantics OR rename. Latter is cheaper and equally honest. |
| **4** | **Cloudscape 2-tier nav guard** | New | 2-3 hr | HIGH | In-page modal + `beforeunload`. Confirm only when hasChanges. |
| **5** | **"Recommended" pill + rationale metadata** | New | 1-2 hr | MEDIUM | Data-only — add `recommended: bool` + `rationale: string` to leaves with trade-offs. |
| **6** | **Time-stamped status chips with last-checked + click-to-source** | Refactor | 2-3 hr | MEDIUM | Add `lastCheckedAt` to each chip + deep-link click handler. |
| **7** | **Breadcrumbs at depth 3 (sub-pages)** | New | 1-2 hr | MEDIUM | Path back to parent group from `/settings/ai/knowledge-base`. |
| **8** | **Conditional-leaf reveal indicator** | New | 1 hr | LOW | When "Power BI Q&A" requires a specific profile, show a "configure profile first" hint in the rail. |
| **9** | **Mobile navigation restoration** | Refactor | 3-4 hr | MEDIUM | Rail → tab strip below 720px; chips → dots below 480px (already in SPEC, not implemented). |
| **10** | **Settings role/scope metadata** | Refactor | 4-5 hr | HIGH (foundation) | Add `SettingsLeafMeta` interface; tag every leaf with role/scope/lifecycle. Enables scope-aware rendering. |
| **11** | **AuthoringStateSnapshot facade** | New | 3-4 hr | HIGH (foundation) | Pure snapshot composing biSurface + assistant + knowledge + viewerExperience. |
| **12** | **Search indexes helper text + synonyms** | Refactor | 2 hr | MEDIUM | Extend `useSettingsSearch` to walk into helper text + a synonym registry. |

### 5.2 Suggested sequencing

If implementing later, do **(10) + (11)** first (foundation), then **(3) + (4)** (save model), then **(1) + (6) + (7)** (navigation), then **(2) + (5) + (12)** (engagement), then **(8) + (9)** (polish).

Total: ~35-45 hours of focused work.

---

## 6. Decisions for future discussion

- **Do we want auto-save + draft envelope (item 3 alt) or rename?** Stripe/Linear go explicit; Atlassian/Notion auto-save. PulsePlay's audience is admin-grade — explicit reads as more deliberate.
- **Cmd+K palette scope** — settings only OR everything (settings + chat + dashboards)? Linear/Vercel did global; cleaner to land settings-only first.
- **Live impact callout cost** — is the dependency-graph work worth it? Could ship a static "Affects:" string per leaf (manually-curated) first; upgrade to dynamic later.
- **Mobile navigation** — is mobile a real audience for PulsePlay Settings? If not, ship Phase A without and revisit.
- **Role/scope metadata** — invasive (every leaf gets tagged) but unlocks future capabilities (per-role visibility, scope-aware previews, deployment-config diff against canonical). Worth doing once, painful to retrofit later.

---

## 7. References

- **In-tree current state**: [docs/SETTINGS_SPEC.md](../SETTINGS_SPEC.md) (canonical design contract); [playground/src/settings/](../../playground/src/settings/); [docs/inherited/SETTINGS_AUTHOR_VIEWER_UX_SCAN.md](../inherited/SETTINGS_AUTHOR_VIEWER_UX_SCAN.md)
- **External sources**: 28 URLs logged at [EXTERNAL_REFERENCES.md](EXTERNAL_REFERENCES.md#2026-05-22--settings-page-ia-progressive-parent-child--engagement-patterns)
- **Triggering screenshot**: User's annotated Settings page (red circles around left rail Setup/BI/Provider/Embed/Authentication + right-pane Status/Save bar)
- **Triggering memory rule**: `feedback_research_first.md` (7-step process)
- **Heritage docs**: `docs/inherited/PEPPULSE_ARCHITECTURE.md`, `docs/inherited/CONTROL_ENVIRONMENT_FEASIBILITY_MAPPING.md`
