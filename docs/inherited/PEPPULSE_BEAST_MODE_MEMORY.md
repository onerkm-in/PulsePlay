# BEAST_MODE_MEMORY.md — North Star for Anyone Picking Up This Codebase

> **Audience:** any LLM agent, human contributor, future self, or new collaborator landing fresh on this repo. Read this file FIRST after `README.md` to absorb the project's context, conventions, and active tripwires in 5 minutes.
>
> **Last updated:** 2026-05-07 (close of Session 64, cycle 14)
> **Latest commit:** see `git log -1` — both `main` and `feature/setup-advanced-fields` synced.
> **Latest GitHub Release:** `v2.0.0-forum-prep` with cycle-14 `.pbiviz` attached.

---

## 1 · Project in one sentence

PepPulse is a Power BI custom visual that embeds an AI-assisted analytics experience directly inside Power BI reports — backend-agnostic across Databricks Genie (Direct + Proxy), Azure OpenAI, AWS Bedrock, and Databricks AI Gateway preview.

## 2 · Where everything lives (post-cycle-13 consolidation)

```
PepPulse repo (the parent project)
├── README.md                         ← Front door (104 lines, navigator)
├── CLAUDE.md                         ← AI agent guide + canonical-doc list
├── DISCLAIMER.md                     ← Legal (product-positive framing)
├── CODE_OF_CONDUCT.md                ← GitHub convention
├── CONTRIBUTING.md                   ← GitHub convention
├── SECURITY.md                       ← GitHub convention
├── THIRD_PARTY_LICENSES.md           ← Legal
├── build.ps1                         ← Canonical build script
├── docs/
│   ├── INDEX.md                      ← Master navigator (audience-routed table)
│   ├── BEAST_MODE_MEMORY.md          ← THIS FILE — start here
│   ├── AUTHOR_GUIDE.md               ← 10 parts: feature walkthrough + worked examples + Section H + multi-space + AI prompts + vocabulary + live-test + Azure deploy
│   ├── ARCHITECTURE.md               ← System topology + analytics knowledge base (2 parts)
│   ├── ROADMAP.md                    ← Agenda + blueprint + Wave 32/35 specs + UX/narrative audits (7 parts)
│   ├── HANDOVER.md                   ← Chronological session log (LIFO; never edit older entries)
│   ├── RELEASE.md                    ← Release checklist + cumulative notes
│   ├── CONTINUITY.md                 ← Feedback tracker + stale-code log + memory discovery + Copilot bootstrap (5 parts)
│   ├── MASTER_GUIDE.md (+.docx)      ← Forum-facing executive narrative (snapshot — don't update)
│   ├── SECURITY_REVIEW.md            ← InfoSec audit (Waves 1-38 cumulative posture)
│   ├── QUALITY_METHODOLOGY.md        ← What we measure / don't / will (honest)
│   ├── ANALYTICS_DOMAIN_TAXONOMY.md  ← Research bibliography (18 domains, 14 sources)
│   ├── INSIGHTS_SECTION_TAXONOMY.md  ← Research bibliography (22 archetypes, 13 sources)
│   ├── AUDIT_REPORT_CYCLE_13.md      ← Wiring + integrity audit (14 waves, 0 critical breakages)
│   ├── PEPPULSE_VOCABULARY.md        ← Brand voice + tone guide
│   ├── PRESENTATION.pptx             ← 16-slide leadership deck
│   ├── COMPETITIVE_COMPARISON.csv/.xlsx ← vs 8 alternatives + caveats
│   ├── PepPulse_Overview.docx        ← User's executive narrative
│   ├── FEATURE_GUIDE.docx            ← Standalone Word version of Part 2
│   └── adr/                          ← Architecture Decision Records (immutable history)
├── genieChatVisual/                  ← The Power BI visual (React + TypeScript)
├── proxy/                            ← Express proxy (CORS bypass, auth, rate limit)
├── PBI/                              ← Demo PBIP sandbox (PulsePlay-PBI-demo.Report)
└── scripts/                          ← Onboard/wrapup + smoke tests
```

## 3 · 14 cycles of beast-mode work shipped (Sessions 62-64)

| Cycle | Commit | Headline |
|---|---|---|
| 1 | `1fbc241` | Wave 30 — Show/Hide Visual Header toggle |
| 2 | `c3ad469` | Provenance footer fix + SECTION_H docs |
| 3 | `f2dac6f` | Header Icon picker — 6 SVG presets |
| 4 | `c73d45b` | Direct-mode error UX + multi-line bubble + Wave 22-30 doc tripwires |
| 5 | `6702d12` | 14 addition-only fixes from 4-agent audit (Setup/Insights/Proxy/A11y) |
| 6 | `f5e6ee0` | 8 forum-prep quick wins (Gateway preview tag + Scope pill + cold-start banner + ghost domains) |
| 7 | `eb88638` | Wave 31 v0.1 + 32 P1 + 33 + 35 P1 — 4 parallel agents |
| 8 | `1467b86` | Wave 35 P2+P3 + IDEA-044 P2 + Tier B Days 2-4 |
| 9 | `7ceea22` | Wave 32 P2 + IDEA-040 P2 + save-reminder toast + HANDOVER 63 |
| 10 | `08e93ef` | Wave 36 + 37 + 38 (config layering / viewer section picker / setup access allowlist) |
| 11 | `47d4775` | Wave 32.5 + 40 + 41 prep + 42 (parameterized presets / KB form / AI plumbing / USERPRINCIPALNAME bug) |
| 12 | `9260b52` | Wave 41 UI + product-tone audit |
| 13 | `b16ca6d` | **Doc consolidation 39→19** + Wave 43 + Wave 44 + integrity audit + duplicate-toggle patch + 16 cross-refs repaired |
| 14 | `385d1ec` | Section collapse-bubbling regression fix |

**Cumulative:** vitest 874→1109 (+235) · jest 152→295 (+143) · build 239.6→270.8 KB (under 350 KB cap) · 14 commits + 14 .pbiviz uploads to Release · both branches always synced.

## 4 · Active tripwires (LOAD-BEARING — re-read before changing)

### Pre-existing (still all valid)
- **Operational setup belongs in the in-visual Setup tab**, not the Power BI format pane.
- **Node 18-22 supported; Node 24+ crashes pbiviz** at `WebPackWrap.configureAPIVersion`. Project pin: Node 20.19.1. `build.ps1` refuses Node 23+.
- **Use `127.0.0.1`, not `localhost`**, for proxy URLs (Windows IPv6 fallback penalty).
- **XHR only in `genie.ts`** — never `fetch`. PBI Desktop sandbox blocks fetch.
- **Security badge ≠ enforcement.** UC enforces actual RLS.
- **LESS must be imported in TypeScript** (`import "../style/visual.less"` in `visual.tsx`). Setting `pbiviz.json.style` alone produces a build with no `content.css`.
- **Before accepting external-LLM commits, run `git diff HEAD`** and read EVERY logic diff.
- **External LLMs may rewrite review docs in place** — restoration possible only if caught before commit.

### Waves 22-30 (Sessions 56-62)
- **Wave 22 — sanitization is the prompt-injection moat.** `sanitizeInstructionText` / `sanitizeIdentifierList` / `sanitizeTemplateValue` in `genie.ts`. Don't relax.
- **Wave 25 — `tsconfig.module=esnext` for dynamic-import lazy loading.** Compare-mode + sql-formatter + IDEA-044 PNG/Excel chunks all depend on this.
- **Wave 27 — cache-prefix bumped v5→v6 in cycle 8** for sqlHash. Bumping again requires noting in `insightsCache.ts` header comments.
- **Wave 28 — X-Request-Id correlation** across visual → proxy → Databricks logs. CORS Allow-Headers must include `X-Request-Id`.
- **Wave 30 cycle 4 — token redaction** in `genie.ts mapDirectStatusToMessage`. No raw DBR error bodies in chat bubble.

### Waves 31-44 (Sessions 62-64)
- **Wave 31 cycle 7 — inline credentials path.** Proxy `resolveProfile` checks inline headers per Wave 36 mode flag.
- **Wave 32 cycle 7+9 — wizard gating predicate** lives in `visual.tsx` render-gate, NOT in SetupPanel (re-renders would lose state).
- **Wave 35 cycle 8 — SQL section dispatcher cache** is in-memory Map, 4h TTL. No localStorage persistence (cross-page-switch loses results).
- **Wave 36 cycle 10 — `useReportTheme` is the SINGLE source of truth** for theme inheritance (covers BOTH colors AND fonts as of cycle 13). Don't add another toggle for the same intent.
- **Wave 36 cycle 10 — layered precedence:** server config WINS over inline visual headers when `PROXY_INLINE_CREDENTIALS_MODE=off` (auto-default on Azure). This is INVERTED from Wave 31 v0.1.
- **Wave 38 cycle 10 — setup-access allowlist is a UX gate, NOT an authorization gate.** PBI tenant RBAC remains the load-bearing fence.
- **Wave 41 cycle 11 — AI metric-rule plumbing** wired through `genie.ts.fetchSuggestedMetricRules` → `proxy/server.js POST /insights/suggest-metric-rules` → `proxy/lib/llmOrchestrator.js suggestMetricRules` → heuristic fallback.
- **Wave 42 cycle 11 — `resolveUserMode` precedence chain:** bound `dataUserId` (USERPRINCIPALNAME() measure) WINS over manual `roleMode` selector.
- **Wave 43 cycle 13 — bullet bold + heading-demote** in markdown renderer. FORMAT RULES injected into HEADLINE/KPI/TRENDS/RISKS/RECOMMENDED ACTIONS prompts.
- **Wave 44 cycle 13 — `themeInheritance.ts` plan-then-apply pattern.** `planThemeWrites` returns `{set, remove}` lists; `applyThemeWrites` executes. Critical for OFF-mode toggle correctness — without explicit `removeProperty`, previously-injected vars stay on the element.
- **Cycle 13 — typography pin:** `visual.less` has a universal pin block forcing `font-family: inherit !important` on all child elements inside `.gn-shell`, `.gn-bubble`, `.gn-insights-content`, etc. (excluding code/pre/kbd/samp). Defeats browser UA stylesheets that apply different family/size to `<strong>`, `<h1>-<h6>`.
- **Cycle 14 — section `<details>` toggle handlers** must use `e.currentTarget`, not `e.target`. Nested `<details>` (Wave 40 metric rules, multi-space slots) bubble onToggle to parent — `e.target` reads the WRONG element. Defensive guard: `if (e.target !== e.currentTarget) return;`

## 5 · Architectural decisions (the why, not just the what)

| Decision | Made when | Why |
|---|---|---|
| **Typography "defined BY US"** (CSS custom properties with fallbacks; no theme-font auto-inherit) | Cycle 13 user call | Power BI doesn't reliably inject typography into custom-visual iframes; theme support is color-focused. We use `var(--gn-font, ...)` so PBI can override IF it ever does, but we don't depend on it. |
| **`useReportTheme` covers BOTH colors + fonts** (single toggle, not two) | Cycle 13 user assessment-first call | Avoids the half-themed/half-brand state when authors flip one but not the other. |
| **Server config WINS over visual headers** (Wave 36 inversion of Wave 31) | Cycle 10 user feedback | Anyone with the .pbix can otherwise override prod creds. Production deployments lock down by default via `PROXY_INLINE_CREDENTIALS_MODE=off` auto-detected on Azure. |
| **Per-section `kind: "ai" \| "sql"`, NOT a 4th Authoring Mode** | Cycle 8 design call | Mixed mode (some AI + some SQL in one Insights output) is strictly more flexible than all-or-nothing. UX surfacing as 4th Authoring Mode option is parked as Wave 45. |
| **Doc consolidation 39→19 with a single INDEX.md navigator** | Cycle 13 user call | Clutter-free experience for anyone landing on the repo. Five combined guides (AUTHOR_GUIDE / ARCHITECTURE / ROADMAP / RELEASE / CONTINUITY) cover all operational needs. |
| **Memory packaging in this file** | Session 64 user call | "Make sure my hero buddy ships continuity to GitHub" — this file IS that continuity. |

## 6 · Collaboration patterns (how this maintainer likes to work)

1. **Every cycle commits + pushes both branches + updates Release.** No work sits half-shipped.
2. **"Beast mode" = 3-4 parallel sub-agents** scoped to non-overlapping file regions with strict "DO NOT touch" lists.
3. **Brutal honesty in audits** — verdict per claim (✅ delivered / ⚠ partial / ❌ overclaimed) with file:line evidence. No softening.
4. **Demo-stakes prioritization** — close audit demo risks first. Forum/leadership demo is real.
5. **Design-first, then ship.** Write a written response covering: is this the right pattern? what's adjacent? effort? sequencing? THEN code.
6. **Assessment-first rule.** Before any new setting/field/component, grep the codebase for related names. If found, the agent's brief MUST reference the existing identifier. (Burned by `inheritPowerBITheme` ↔ `useReportTheme` duplication in cycle 13.)
7. **External-LLM (ChatGPT/Gemini) parallelism welcome** for research / data generation. Draft ready-to-paste prompts.
8. **Memory packaging IS load-bearing.** Update `project_state.md` + add new feature memories at session end.
9. **Phased shipping under demo pressure** — Wave 32 P1 (scaffold) before P2 (full validate); Wave 35 P1 (types) before P2+P3 (UI + executor). Each phase = one cycle.

## 7 · Open backlog (cycle 15+)

### From cycle 13 audit (LOW-MED severity)
- `darkMode` × `useReportTheme` interaction matrix docs
- `brandFontFamily` ↔ Wave-44 FontControls overlap docs
- `tsconfig.module=esnext` assertion test (Wave 25 tripwire)
- `multiSpaceCount` interface-vs-storage type lie fix
- Brand color/font format-pane fields not in Setup tab (expose or retire)
- Wave 37 viewer section picker direct test coverage

### Planned waves
- **Wave 45**: Custom SQL as 4th Authoring Mode dropdown option (UX surfacing — capability already exists at section level since cycle 8)
- **Wave 39**: Context-aware preset recalibration (`inferFrom` rules + stale-flag UI when bound fields change)
- **Tier B Day 5+**: Full mTLS / request signing for high-trust deployments
- **IDEA-040 Phase 3**: SigV4 cut-over for legacy Bedrock RAG path

### Action items (require human)
- **Live testing** in PBI Desktop via `docs/AUTHOR_GUIDE.md` Part 8 (Live Test Checklist — 24 numbered tests, 60-90 min)
- **Azure App Service deployment** via `docs/AUTHOR_GUIDE.md` Part 9 (15-20 min in Cloud Shell — providers already registered Session 62)
- **Logo design** (parked Session 63 — image-gen prompts are in chat history)

## 8 · For LLMs / agents picking up this codebase

**Run this first:**
```bash
python scripts/llm_onboard.py --terse
```

It prints crash recovery context, the 14 canonical docs, the full auto-memory directory, last 40 lines of proxy logs, and the last 20 git commits.

**Auto-memory directory** (per-project, persists across sessions):
`C:\Users\rajes\.claude\projects\d--Working-Folder-Projects-Sister-Pulse-Project\memory\`

Files of interest:
- `MEMORY.md` — index
- `project_overview.md` — purpose, architecture, tech stack
- `project_state.md` — git state, build state, current cycle
- `feedback_collaboration.md` + `feedback_collaboration_session_63.md` — 7 patterns
- `feedback_assessment_first.md` — the cycle-13 lesson
- `feature_forum_prep_package.md` — 12-doc package + Release pointer
- `feature_wave_30_42_burst.md` — Sessions 62-63-64 cycle history
- 8 other feature/feedback memories

**Pre-flight rule:** before introducing any new setting/field/component, grep settings.ts + capabilities.json + visual.less for related names. Pre-bind agents to existing identifiers.

**Exit ritual:**
```bash
python scripts/llm_wrapup.py --note "one-line summary"
```

## 9 · The North Star

> *"PepPulse — the pulse of your data."*
>
> A Power BI custom visual that brings AI-assisted analytics inside reports, on a backend-agnostic foundation. Every cycle compounds value. Every shipment preserves the ability to ship the next.

---

*This file is the project's continuity contract. Update it at the close of every major cycle so the next contributor — human or AI — picks up exactly where the last left off. Last writer: Claude Opus 4.7 (1M context), 2026-05-07.*
