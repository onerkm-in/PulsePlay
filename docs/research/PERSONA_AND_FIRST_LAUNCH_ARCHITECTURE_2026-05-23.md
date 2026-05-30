# Persona + First-Launch Architecture — Locked Model (2026-05-23)

> **Status**: Model locked via brainstorm with user · **Research dispatched** · **Implementation deferred** pending research synthesis.
>
> **Triggering feedback** (verbatim, chronological):
> - *"the guided screen on first launch is not at all in sync"*
> - *"the guided setup should be something to be used to users' expectations meaning the end users not the authors"*
> - *"the end users set their modes — but that I believe either cookies or browser local storage stores that or the app itself will track"*
> - *"we have to plan properly where the persona is stored otherwise it will impact the application and make it heavy"*
> - *"no one liked the clumsy design — everyone was confused"* (live demo feedback)
> - *"it may happen so that, since it's a open system, people might not have the initial process of making the okta count, in such case a simple setup would do, so let's keep it open for now, but yet the guided setup should allow user to setup their own layout how they want it, and they can choose to change it anytime"*
>
> **Companion triggering bug**: AI Insights briefing-format trim leaked from Ask Pulse helper, surfaced in live demo as "only EXECUTIVE BRIEF + WHAT CHANGED" instead of full multi-section briefing. Fixed at commit `5363ff9`. Lesson captured in `memory/feedback_shared_helper_split.md`.

## Locked model

### Diagram

```
┌──────────────────────────────────────────────────────────┐
│  IDENTITY  (OPTIONAL — open system; anonymous supported) │
│  When present: userId + persona claims + cross-device    │
│  When absent: anonymous, per-device state                 │
│  Sources: Databricks Apps auth, Okta, AAD, custom IdP    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  3 STATE ZONES                                            │
│  1. Deployment              — global; identity-indep      │
│  2. User-explicit            — keyed by userId if present │
│                                 else "anon" per-device    │
│  3. User-implicit (behavior) — same keying                │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  GUIDED SETUP  (UNIVERSAL, MUTABLE, NON-BLOCKING)         │
│  - First launch: non-blocking entry point on the page     │
│  - Anytime: reachable via "Customize your view" link      │
│  - Asks 2-3 light layout questions only                   │
│  - Writes to user-explicit zone                           │
│  - Editable forever                                       │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  ADAPTATION VISIBILITY LAYER  (when behavior kicks in)    │
│  - Inline annotations: "your usual", "your default"       │
│  - "What we learned" inspection panel                     │
│  - Universal "stop adapting" toggle                       │
│  - Reversible always                                      │
└──────────────────────────────────────────────────────────┘
```

### Persona priority order

Persona is **never asked at launch**. It's resolved by precedence:

1. **User-explicit override** (highest — set via Customize / Settings → Preferences, wins always)
2. **IdP role claim** (if identity present, e.g. AAD `extension_Role`, Databricks SSO role)
3. **Group membership inference** (e.g., AAD group `Sales-Analysts` → analyst persona)
4. **Behavioral observation** (e.g., 8/10 sessions on Ask Pulse → ask-pulse-first)
5. **Deployment default** (`pulseplay:default-landing-surface` — author-set)

### 3-zone storage

| Zone | Keyed by | Storage | Heaviness |
|---|---|---|---|
| Deployment | n/a (global) | proxy config / `app.yaml` env | 0 |
| User-explicit | userId hash if identity, else "anon" | `pulseplay:user:{userIdHash}:*` localStorage | ~bytes per write |
| User-implicit (behavioral counters) | userId hash if identity, else "anon" | `pulseplay:behavior:{userIdHash}:*` localStorage | 1 increment per event |

Cross-device sync = Phase 2 server-side feature, only when identity present AND user opts in.

### First-launch UX

**0:00 — page loads**
- App resolves identity if present (no error if absent)
- Reads user-explicit overrides from `pulseplay:user:{userIdHash || "anon"}:*`
- Reads behavioral signals from `pulseplay:behavior:{userIdHash || "anon"}:*`
- Resolves starting surface via priority order above
- Renders briefing card with real data

**0:00 visible**
- Briefing card (real data, not empty state)
- Three tabs (AI Insights / Ask Pulse / Dashboard), active labeled per priority resolution
- Chip strip + chat input below briefing
- Bottom corner: "Customize your view →" link (the guided setup entry)
- **NO modal, NO wizard, NO persona question**

**Anytime**
- Click "Customize" → guided setup opens (overlay or sub-route, non-blocking)
- 2-3 light layout questions:
  - "Where would you like to start?" → AI Insights / Ask Pulse / Dashboard
  - "How do you want the AI sidebar laid out?" → Side-by-side / Unified / Hidden
  - "Density?" → Compact / Balanced / Spacious
- Writes to `pulseplay:user:{userIdHash || "anon"}:*`
- Closes back to the active surface with the new layout applied
- Same controls available in Settings → Preferences for power users

### What this rules out (the things we said NOT to do)

- ❌ Asking "what's your role?" (clumsy)
- ❌ A blocking welcome modal
- ❌ A wizard that gates data
- ❌ Admin chrome (status chips, "Setup needed") in end-user's face
- ❌ Identity required to use the system
- ❌ Asking for an Okta account before first use
- ❌ Forcing one-time decisions (everything is mutable)

### What this enables (the things we DO want)

- ✅ Open system: anonymous use works
- ✅ Identity is an enhancement, not a gate
- ✅ Guided setup is reachable but not mandatory
- ✅ Layout is mutable anytime
- ✅ Persona resolved by precedence, not asked
- ✅ Adaptation is visible + correctable
- ✅ Storage is light (localStorage namespaced; no new backend for v1)

## Research dispatched

4 parallel agents (see `EXTERNAL_REFERENCES.md` "Persona + First-Launch Architecture" once they return):

1. **OFFLINE — in-tree state map**: every `pulseplay:*` key, Databricks Apps identity resolution, current FirstRunWizard flow, where identity claims live today
2. **ONLINE — anonymous-first SaaS patterns**: Linear / Figma / Vercel / Notion — when do they allow use without account, how do they upsell identity, what state is per-device vs per-account
3. **ONLINE — non-blocking guided setup**: Stripe Connect / Notion / Vercel — patterns where setup is reachable and resumable but never a blocking wizard
4. **ONLINE — BI tool first-launch UX**: Tableau Pulse / Power BI / ThoughtSpot / Looker / Sigma — what works, what's called "clumsy" in reviews

## Implementation queue (not started)

When synthesis is back, expected work items (rough):

| # | Item | Estimated effort |
|---|---|---|
| 1 | State namespace refactor: `pulseplay:user:*` + `pulseplay:behavior:*` keyed by userId hash | 4-6 hr |
| 2 | Identity resolution helper: returns userIdHash from Databricks Apps auth, falls back to "anon" | 2-3 hr |
| 3 | Persona priority resolver: applies 5-tier precedence at page load | 2-3 hr |
| 4 | Guided setup overlay/route — 2-3 question layout picker | 4-5 hr |
| 5 | Behavioral counters (page surface opens, etc.) | 2-3 hr |
| 6 | Adaptation visibility annotations + "What we learned" panel | 6-8 hr |
| 7 | Tests + docs + cross-surface impact audit (per `feedback_shared_helper_split.md`) | 3-4 hr |

**Total estimate: ~25-30 focused hours.** Implementation only after research synthesis + user direction.

## Research synthesis (2026-05-23)

4 parallel agents (1 offline + 3 online) returned ~52 URL signatures. **All four converge on one verdict: PulsePlay's "clumsy" demo reaction maps directly onto the canonical Power BI anti-pattern** ("It's all a big mess"). The fix shape is concrete and documented across the BI industry — no architectural invention needed.

### Convergent findings

**What every agent agreed on:**

| Principle | Source |
|---|---|
| Show **finished sample insight** above the fold on first launch | Tableau Pulse · Userflow · NN/g · Carbon Design |
| Offer **3-5 pre-seeded "Common Questions"** in the AI sidebar | Databricks Genie · assistant-ui Suggestions API · ThoughtSpot Search Assist |
| Have **ONE high-affordance entry point**, not three pickers competing | ThoughtSpot (single search bar) · github.dev (open editor) |
| Defaults must be **functional on day zero**; configuration is opt-in | Vercel (framework auto-detect) · Notion (blank canvas + intent quiz) |
| Guided setup is a **non-blocking re-entrant surface**, never a wizard | Stripe Connect · Linear preferences · Figma overlay tips |
| Use **"Maybe later"** not "Skip"; deferral matters | Riya Jawandhiya (Medium UX deferral copy study) |
| **Anonymous-first**, identity ONLY at write-back | github.dev · Vercel "Anyone with the link" · Logto guest→identified merge |
| **Don't promise persistence you can't deliver** | CodePen 2019 retreat · Replit anon phaseout |
| **Pre-seeded sample data ready** beats "no data connected" empty state | NN/g empty-states · Carbon empty-states · Userflow |

**Anti-patterns every agent flagged:**

- Wizard / blocking modal before any value is shown (Power BI's "connect a data source" wall)
- Configuration density on the first screen (Tableau's "so many options and configuration settings")
- Jargon-first labeling ("workspace" / "dataset" / "semantic model" / "Vendor" / "Connector")
- Linear's auth-wall is an anti-pattern for an open BI tool

### In-tree state — the gap quantified

24 `pulseplay:*` localStorage keys audited. Categorized:

| Category | Count | Example keys |
|---|---|---|
| Deployment-config (author-authored) | **1** | `pulseplay:default-landing-surface` |
| Author-default (Pulse legacy) | 1 | `pulseplay:visual-settings:genieSettings` |
| User-explicit | 10 | `bi-vendor`, `active-ai-profile`, `ui-mode`, `enabled-components`, `layout-mode`, `bi-tile-mode`, `pack-selection`, `bi-embed-config`, `bi-surface-mode`, `pbi-sso-config` |
| User-implicit (behavioral / ephemeral) | 8 | `active-surface`, `pinned-viewport-pane`, `wizard-dismissed`, `wizard-draft`, `wizard-force`, `last-persona`, `desktop-launch-token`, `desktop-recon-disclaimer-dismissed` |
| Dev / unclear (caches, migrations) | 4 | `enabled-components:legacy-both-migrated`, `databricks-capabilities:default`, `performance-levers`, `settings-last-group` |

**ALL 24 keys are GLOBAL — none user-scoped.** If Alice and Bob share a browser tab, they see each other's state. If Alice dismisses the wizard, Bob lands without the wizard too. The proxy DOES extract `req.user` from JWT for audit logging, but the frontend has no identity context — it can't distinguish Alice from Bob.

### Refined 60-second first-launch UX (synthesized from research)

| Time | What the user sees | Source of pattern |
|---|---|---|
| **t = 0s** | One hero card: a **finished sample insight** — KPI tile + chart + short narrative (e.g., "Northeast region revenue up 12% w/w, driven by SMB renewals"). No picker UI on screen. | Tableau Pulse · NN/g empty-state |
| **t = 5s** | AI sidebar slides in with **4 click-to-send starter prompts** scoped to the sample ("Why did SMB renewals jump?" / "Show at-risk accounts" / "Forecast next 4 weeks" / "Compare to last quarter") | Databricks Genie Common Questions · assistant-ui |
| **t = 10s** | Small top-right anchor: **"Try your own data"** + persistent **"Personalize layout →"** (the guided setup entry, drawer-style, non-blocking) | Stripe Connect re-entrant · Linear preferences · Vercel |
| **t = 20s** | If user clicks a starter prompt: AI sidebar streams response, cites the visible sample chart, status pill *"Verified — sample data"* | PulsePlay's 4-status accuracy contract (`feature_no_ungrounded_artifacts.md`) |
| **t = 30s** | Below the hero: horizontal strip of 3 thumbnails — Power BI / Tableau / Native canvas — one click swaps the canvas | Tableau Pulse + ThoughtSpot Liveboard pattern |
| **t = 45s** | If no interaction yet: tiny dismissable **"Take the 30-second tour"** chip appears | ThoughtSpot re-runnable onboarding |
| **t = 60s** | User has seen one finished insight, one AI response, three vendor previews, the "bring your own" path — **without any configuration form** | Convergent research verdict |

Footer microcopy: *"Working anonymously — this tab only. [Sign in to save across devices]"* (CodePen-honest persistence boundary; Logto-style upgrade path when identity becomes available).

### Refined storage namespace plan (Logto 3-phase merge)

**Phase 1 (v1 — ship without backend):**
```
pulseplay:anon:{renderId}:*          // anonymous session, namespaced by tab-id
pulseplay:user:{userIdHash}:*        // authenticated user (Databricks Apps auth)
pulseplay:behavior:{userIdHash}:*    // behavioral counters keyed by identity OR "anon"
pulseplay:deployment:*               // deployment-config (read-only, derived from proxy)
pulseplay:dev:*                      // dev toggles → migrate to sessionStorage
```

**Phase 2 (when identity present):**
- On Okta/AAD/Databricks SSO sign-in, run a one-shot client migration: re-key every `pulseplay:anon:{renderId}:*` to `pulseplay:user:{userIdHash}:*`
- Show one-time non-modal toast: *"Your previous session is saved to your account."*
- Optional server-side persistence under identity (`/api/user/preferences`) for cross-device sync

**Phase 3 (Phase 1 + Phase 2 enabled, end state):**
- Identity-aware per-user state in browser
- Server-side persistence as user-explicit opt-in ("Save across devices")
- Cross-device read on session start

### Refined implementation queue

| # | Item | Effort | Source pattern |
|---|---|---|---|
| 1 | **Identity-aware client context**: extract `req.user` claim → expose as `useAuthIdentity()` hook (returns `{ userIdHash, displayName, role, isAnonymous }`). Fall back to `"anon"` userIdHash for anonymous. | 3-4 hr | Logto 3-phase |
| 2 | **State namespace refactor**: every `pulseplay:*` write goes through a helper that prepends `user:{userIdHash}` or `anon:{renderId}`. Migration on first load preserves existing global keys. | 5-6 hr | Logto + namespaced localStorage |
| 3 | **Hero-first first-launch shell**: replace current Setup-page-first welcome with a single hero insight card + 4 starter prompts in AI sidebar + 3 vendor thumbnails strip. Hide pickers + embed forms unless user clicks "Try your own data." | 8-10 hr | Tableau Pulse + Genie + ThoughtSpot |
| 4 | **Pre-seeded "Common Questions" in AI sidebar** sourced from active profile's Genie Space configuration (or hardcoded fallback for anonymous). 4 starter prompts visible by default. | 3-4 hr | Databricks Genie Common Questions · assistant-ui Suggestions API |
| 5 | **"Personalize layout" drawer** (right-side, aria-modal="false", URL hash `#personalize`): 3 questions — starting surface / AI sidebar position / density. Writes to user-explicit zone. Header anchor persists post-completion. "Maybe later" not "Skip". | 4-5 hr | Stripe Connect drawer + Linear preferences |
| 6 | **Sample-data-ready hero** when no real data connected — sample dataset bundled with PulsePlay, dismissible per Userflow guidance ("Working with sample data · Dismiss") | 3-4 hr | NN/g + Userflow empty-state hybrid |
| 7 | **Behavioral counters** (lightweight): track surface opens per user. Adapt the landing surface after N=5 sessions. | 2-3 hr | App-learned adaptation |
| 8 | **Adaptation visibility layer**: inline annotations ("your usual"), "What we learned" panel, universal "Stop adapting" toggle | 5-6 hr | Trust principle (Spotify Wrapped + Netflix-style transparency) |
| 9 | **Honest-persistence footer chip**: *"Working anonymously — this tab only"* with *"Sign in to save across devices"* upsell | 1-2 hr | CodePen anti-pattern as guardrail |
| 10 | **Tests + cross-surface impact audit + docs** | 4-5 hr | `feedback_shared_helper_split.md` discipline |

**Total estimate: ~38-50 focused hours.** Phased shipping recommended — items 1-5 cover the demo-fix scope; items 6-10 are polish + scale.

### Source URLs (full list)

All 52 URL signatures appended to `EXTERNAL_REFERENCES.md` under topic *"Persona + First-Launch Architecture for PulsePlay"*. Grouped by agent track (non-blocking guided setup · anonymous-first SaaS · in-tree map · BI first-launch UX).

---

## References

- `memory/feedback_research_first.md` — 7-step process used
- `memory/feedback_shared_helper_split.md` — discipline rule from today's AI Insights regression
- `memory/feedback_chat_fidelity.md` — UX principle informing first-launch design
- `docs/SETTINGS_SPEC.md` — canonical Settings design contract
- `docs/inherited/SETTINGS_AUTHOR_VIEWER_UX_SCAN.md` — heritage doc that anticipated the 4-scope confusion months ago
- `docs/research/SETTINGS_IA_PROPOSAL_2026-05-22.md` — Settings IA companion proposal
- `docs/research/EXTERNAL_REFERENCES.md` — URL signatures will be appended once research returns
