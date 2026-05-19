# PulsePlay — Master Codex Review Prompt
# Full Day/Week Coverage · Complex + Highly Complex Scenarios
# HEAD: see below · 2026-05-19 (updated after Codex review of initial draft)

> **For Codex:** This is a standalone, self-contained prompt. You do not need prior
> session context. Read the "Read first" section, then execute every part.
> Report honestly — PASS / PARTIAL / FAIL / DEFERRED. Never mark PASS on
> something you did not verify. Never modify code in this pass.

---

## 0. Read first

Before anything else, read these files in full:

1. `CLAUDE.md` — tripwires, working style, what not to do
2. `docs/HANDOVER.md` — top 15 entries (scroll past the LIFO header)
3. `docs/AGENT_SYNC.md` — full current objective section
4. `docs/CLAUDE_PULSEPLAY_POTENTIAL_PERFORMANCE_GUIDE_2026-05-19.md` — acceptance bar
5. `docs/CODEX_VERIFY_RESULTS_2026-05-19_post-uat-1840.md` — last Codex verify (baseline)

**Git HEAD:** run `git log --oneline -1` to confirm current HEAD before starting.

**Full scope of commits (newest first):** run `git log --oneline d1c3320..HEAD` for the full list. Key commits:

| Hash | Commit |
|---|---|
| latest | feat: preload KPI snapshot on Ask Pulse tab entry (Option A) |
| `6840bce` | fix: remove Power BI / Databricks-hardcoded role subtitles in Ask Pulse welcome |
| `b20458f` | docs: master Codex review prompt |
| `ac2b1ba` | feat: animate SustainabilityIndicator with tier-matched breathing + human panel |
| `5e04f0d` | fix: remove zero-state snapshot fallback cards from Ask Pulse welcome |
| `243277d` | perf: stale-while-revalidate for AI Insights warm loads |
| `7c6d84e` | perf: AI Insights concurrency-2 with 8s stage-1 head-start |
| `eae37a1` | fix: glyph sweep + tooltip rollout + perf wiring (post-UAT-1840) |
| `b71270f` | fix: HelpTip portal + SQL affordance + duplicate-arrow + perf instrumentation |
| `d3c38be` | fix: final naming/glyph cleanup + HelpTip mutual exclusion + UAT handoff |
| `7562efd` | feat: IA restructure + tooltip + provenance + emoji-glyph fixes |
| `241502e` | fix: naming + a11y pass — friendly status chips + clean rail |
| `2e8a4cc` | feat: surface contract + clean switcher + BI Viz peer empty state + mobile dock clamp |
| `ed66cb7` | feat: resurface 4 Pulse settings sub-routes |
| `9da6cc5` | feat: sub-nav routing in Settings rail + AI Knowledge Base sub-route |
| `bb9d00a` | feat: rebuild Settings → Setup as inline Quick Setup canvas |
| `3c2af1f` | feat: comprehensive UI polish pass — design system v2 + Settings redesign |
| `d1c3320` | fix: rename UniBridge AI Proxy → PulsePlay Proxy |

---

## 1. Smoke (run before anything else)

```powershell
# Proxy health
curl http://127.0.0.1:8787/health

# Dev server — Vite may bind to 5173 OR 5174 if 5173 is occupied.
# Run both; whichever returns 200 is the active port. Use that port for all
# browser tests below.
curl http://127.0.0.1:5173/
curl http://127.0.0.1:5174/

# TypeScript lint
cd playground && npm run lint

# Focused tests — key changed components
npm run test -- --run "SustainabilityIndicator|HelpTip|AiGroup|viewportControls|SettingsShell|SetupGroup|FieldRow"

# Full test suite — must be 920/920
npm run test -- --run

# Build
npm run build
```

Record: lint status, test count (must = 920), build time, any warnings.

---

## 2. Static code review

### 2.1 HelpTip portal (`b71270f`)

File: `playground/src/settings/primitives/HelpTip.tsx`

- [ ] Bubble renders via `createPortal(bubble, document.body)` — NOT as an in-tree child
- [ ] Bubble uses `position: fixed` + viewport coordinates from `getBoundingClientRect()`
- [ ] `computePortalPosition` clamps left and right against `VIEWPORT_MARGIN = 12`
- [ ] `_activeClosers` is module-level `Set<() => void>` — opening one tip calls `_closeAllExcept`
- [ ] Document `pointerdown` listener installs only once (check `installed` flag)
- [ ] Trigger's `pointerdown` calls `e.stopPropagation()` so document listener doesn't immediately close a freshly-opened tip
- [ ] `aria-expanded` on the trigger reflects open state
- [ ] No `<a>` / `<button>` / `<input>` inside `role="tooltip"` (pointer-events: none enforced)
- [ ] Title + body slots render: `.pp-helptip__title` → short heading, `.pp-helptip__list` → bullets

### 2.2 FieldRow StructuredTip (`eae37a1`)

File: `playground/src/settings/primitives/FieldRow.tsx`

- [ ] `isStructuredTip()` correctly returns `true` for `{ title, body }` and `false` for JSX ReactNode and plain strings
- [ ] `renderTip(null)` / `renderTip(undefined)` / `renderTip(false)` → `null` (no empty HelpTip)
- [ ] Legacy `tip={<>...</>}` callers render through `HelpTip` children slot unchanged
- [ ] Structured callers `tip={{ title, body }}` render through `HelpTip` title + body props
- [ ] Both `FieldRow.tip` and `FieldCard.tip` use `renderTip()`
- [ ] Count structured callers: SetupGroup (5), BiGovernance (2), AiSupervisorFusion (3), PreferencesAppearance (3), SystemDeveloper (1) = 14 total

### 2.3 SQL affordance (`b71270f`)

File: `playground/src/pulse/visual.tsx` → `SectionSqlPanel` and surrounding render logic

- [ ] When section has own SQL → renders `SectionSqlPanel` with own queries
- [ ] When section has no own SQL → looks up `options?.stageSqlByTitle` for sibling SQL
- [ ] When sibling found → renders `SectionSqlPanel` with `reusedFromTitle` prop set
- [ ] When nothing traceable → shows honest fallback line ("No SQL available... narrative-only output")
- [ ] NEVER shows old dead message: "This section reuses data from an earlier query"
- [ ] `SectionSqlPanel` copy button → `<Icon name="copy" />` (SVG), NOT `📋` emoji
- [ ] `SectionSqlPanel` on copy flash → same SVG icon, no `✓ Copied!` text emoji

### 2.4 Duplicate-arrow fix (`b71270f`)

File: `playground/src/pulse/visual.tsx`

- [ ] `stripRedundantSignForPill()` function exists
- [ ] Regex: `^([+-])(?=[$€£₹¥]?\d)` — strips leading +/- only when followed immediately by a digit (with optional currency symbol)
- [ ] Applied at the 4 TrendPyramid call sites (match[1] G1, match[4] G3, match[5] G5, match[7] G7)
- [ ] `▲ +33.42%` → pill receives `33.42%` (sign stripped because TrendPyramid conveys direction)
- [ ] `▼ -$2.1M` → pill receives `$2.1M` (sign stripped, currency preserved)
- [ ] Color carrying business meaning is NOT touched

### 2.5 Glyph sweep (`eae37a1`, `d3c38be`)

Run these greps. Every hit outside comments is a failure **unless it is a listed known exception**.

```bash
# AI Insights footer — 📋 and ↻ as rendered button content.
# NOTE: do NOT grep for "</>" — that is valid React fragment syntax everywhere.
# Only look for 📋 and ↻ as string literals in JSX (not in comments).
grep -n "📋\|↻" playground/src/pulse/visual.tsx | grep -v "//\|/\*\|\*\|comment"

# Knowledge shell — no ⚙ in rendered JSX (button text)
grep -n "⚙" playground/src/knowledge/KnowledgeShell.tsx | grep -v "//\|/\*"

# SustainabilityIndicator — no ↻ text glyph (SVG replaced it)
grep -n "↻" playground/src/components/SustainabilityIndicator.tsx | grep -v "//\|/\*"

# Settings shell — no ⚙ ← ⚡ as button text
grep -n "⚡\|←\s*Back" playground/src/settings/SettingsShell.tsx | grep -v "//\|/\*"
# KNOWN EXCEPTION: SettingsShell.tsx line ~58 has GROUP_ICONS with
# advanced: "⚙" as part of a geometric rail icon set. This was
# intentionally deferred (the whole set ✦/⬡/◈/◉/⬢/⚙ must move together).
# grep for it separately and mark DEFERRED, not FAIL:
grep -n "GROUP_ICONS\|advanced.*⚙" playground/src/settings/SettingsShell.tsx

# TestButton — no ⚡ emoji in rendered text
grep -n "⚡" playground/src/settings/primitives/TestButton.tsx | grep -v "//\|/\*"

# AiGroup — "AI brain" must be gone from rendered copy
grep -rn "AI brain" playground/src/ | grep -v "//\|/\*\|test\|spec"

# UniBridge must be gone from user-facing strings
grep -rn "UniBridge" playground/src/ | grep -v "//\|/\*\|test\|spec"

# AI-generated source string (the old provenance copy)
grep -rn "AI-generated" playground/src/ | grep -v "//\|/\*\|test\|spec\|comment"

# Role subtitles — no "inside Power BI" or hardcoded "Databricks Genie assistant"
grep -n "inside Power BI\|Databricks Genie assistant" playground/src/pulse/visualHelpers.ts
```

**Known intentional exceptions (mark DEFERRED, not FAIL):**
- `SettingsShell.tsx` `GROUP_ICONS["advanced"] = "⚙"` — geometric rail set, intentionally deferred
- Comments/JSDoc mentioning old strings for reference — not rendered

Report every non-exception hit.

### 2.6 Stale-while-revalidate logic (`243277d`)

File: `playground/src/pulse/visual.tsx`

- [ ] `staleRefreshingMap` state exists near other per-space state (line ~961)
- [ ] `staleDisplayRef` ref exists — stores cached result while background refresh runs
- [ ] `runInsights` signature: `(overridePrompt?, overrideTitle?, backgroundRefresh?)`
- [ ] When `backgroundRefresh: true` — the `setSpaceInsightsResult(RUNNING, "")` block is SKIPPED
- [ ] When `backgroundRefresh: true` — per-stage `setSpaceInsightsResult` inside `runStage` is SKIPPED (search for `if (!backgroundRefresh)` guard)
- [ ] On success + `backgroundRefresh: true` — `setSpaceInsightsResult` fires ONCE with full COMPLETED content
- [ ] On stop + `backgroundRefresh: true` — banner clears, cached content preserved (no "Stopped by user" state written)
- [ ] On error + `backgroundRefresh: true` — banner clears, cached content preserved (no FAILED state written)
- [ ] **EDGE CASE to verify or falsify:** when `backgroundRefresh: true` and ALL stages return empty content (`contentParts.every(p => p === "")`), does the code still avoid writing a FAILED state to the display? Look for the `else if (backgroundRefresh)` path after the `if (lastResponse && contentParts.every(...))` block. If the empty-response FAILED path still fires during background refresh, report as P1 bug.
- [ ] Stale-refresh banner: `{staleRefreshingMap[activeSpaceKey] && (` renders a `role="status"` div with `aria-live="polite"`
- [ ] `backgroundRefresh: true` is ONLY passed from the cache-hit path — not from chip clicks, Adjust box, or auto-fire on config change

### 2.7 Concurrency pipeline (`7c6d84e`)

File: `playground/src/pulse/visual.tsx` → `runInsights` IIFE

- [ ] `CONCURRENCY = 2`
- [ ] `FIRST_LOAD_STAGE_1_DELAY_MS = 8_000`
- [ ] All `prompts.length` stages go into the queue (stage 0 is NOT run separately first)
- [ ] Delay condition: `workerIndex > 0 && isFirstPick === true`
- [ ] `isFirstPick = false` immediately after the delay block
- [ ] Stop flag checked AFTER the `setTimeout` resolves — no ghost stage after user stops
- [ ] Comment explains WHY concurrency is 2 (backend rate limit + gentler load)

### 2.8 SustainabilityIndicator (`ac2b1ba`)

File: `playground/src/components/SustainabilityIndicator.tsx`

- [ ] `_styleInjected` module-level flag — keyframes injected exactly once via `document.head`
- [ ] `leafAnimation("ready")` returns `"none"` — no animation for idle
- [ ] `will-change` is conditional: only set when `anim !== "none"` (no unnecessary GPU layer)
- [ ] Click toggles `pinned` state
- [ ] `pointerdown` outside-click listener registered ONLY while `pinned === true`
- [ ] `onBlur` uses `relatedTarget` check — doesn't close when focus moves between internal elements
- [ ] Panel `pointerEvents: "none"` — cannot trap clicks
- [ ] Reset button has `e.stopPropagation()` — does not also trigger `pinned` toggle
- [ ] `tierHeadline()` returns human language (not "Lean", "Heavy" — those are `tierLabel()`)
- [ ] `tierExplanation()` returns human paragraph for each tier
- [ ] Token count in muted footer row of panel — NOT as the headline
- [ ] `"est."` marker when `hasEstimates && !hasRealData` — replaces old paragraph explanation

### 2.9 perfInstrumentation wiring (`b71270f`, `eae37a1`)

Files: `playground/src/components/AISidebar.tsx`, `playground/src/pulse/visual.tsx`

AISidebar:
- [ ] `resetRun` + `stageStart("total")` + `stageStart("submit")` called at start of `ask()`
- [ ] `stageEnd("submit")` called immediately after the POST `/conversations/start` returns
- [ ] `stageStart("polling")` called when polling kicks in
- [ ] `finalize()` calls `stageEnd("polling")`, `stageEnd("submit")`, `stageEnd("total")`, then `dumpRun()`

pulse/visual.tsx:
- [ ] `resetRun` + `stageStart("total")` called at start of `runInsights`
- [ ] `stageEnd("total")` + `dumpRun()` called in the `finally` block (covers success/stop/error)

### 2.10 Ask Pulse welcome cleanup (`5e04f0d`)

File: `playground/src/pulse/visualHelpers.ts` → `buildLocalHomeModel`

- [ ] The `if (snapshot.length === 0)` block no longer pushes "Scope / Guided filters / Measures" entries
- [ ] Old fallback entries preserved as comments for reference
- [ ] `mergeHomePayload` is unchanged — remote payload still overrides local when configured
- [ ] `Object.entries(context.measures)` path above is unchanged — real measures still show

### 2.11 Settings IA + sub-routes (`ed66cb7`, `9da6cc5`, `bb9d00a`, `3c2af1f`)

File: `playground/src/settings/SettingsShell.tsx` + group files

- [ ] Settings rail has 6 groups: Setup / BI / AI / Preferences / System / Advanced
- [ ] Sub-routes: `/settings/ai/supervisor`, `/settings/ai/appearance`, `/settings/ai/developer`, `/settings/ai/governance`, `/settings/ai/knowledge-pack`
- [ ] Back navigation works from every sub-route back to the parent group
- [ ] "Pulse AI" branding is consistent — no "UniBridge", no "AI brain"
- [ ] Save Changes / Discard bar appears when settings are dirty, disappears on save

### 2.12 Naming + branding audit

```bash
# Must all be zero hits in rendered copy
grep -rn "UniBridge\|AI brain\|AI for BI\|BI BI Viz" playground/src/ | grep -v "//\|/\*\|test\|spec"
grep -rn "AI-generated · Source: default" playground/src/ | grep -v "//\|/\*"
grep -rn "AI-generated | Source:" playground/src/ | grep -v "//\|/\*"
```

### 2.13 Credential audit

```bash
grep -rn "dapi[a-zA-Z0-9]" playground/src/ proxy/ docs/
grep -rn "eyJ[a-zA-Z0-9_-]\{20,\}" playground/src/ proxy/ docs/
grep -rn "access_token\s*=\s*['\"]" playground/src/ proxy/
```

Expected: zero. Report every hit.

---

## 3. Visible browser tests

**Environment:** `http://127.0.0.1:5173/` · proxy at `8787` · profile `default`

Hard-refresh (Ctrl+Shift+R) before each numbered section.

---

### 3.1 Surface switcher and shell

Route: `/` (root)

- [ ] Three tabs visible: **AI Insights** · **Ask Pulse** · **BI Viz**
- [ ] Active tab is visually distinct (filled style, not just underline)
- [ ] Switching tabs does NOT reload the page or lose conversation history
- [ ] Viewport controls: maximize, minimize, float, pin all render as SVG icons (no text glyphs)
- [ ] "PulsePlay AI" header label — not "UniBridge", not "AI for BI"
- [ ] "Ready BI + AI" status chip in top right — green dot, clean label

Screenshot: `01-shell-surface-tabs.png`

---

### 3.2 Ask Pulse — welcome state

Route: `/` → **Ask Pulse** tab, no questions asked

- [ ] No "SCOPE / GUIDED FILTERS / MEASURES" stat cards (commit `5e04f0d`)
- [ ] Quick Start: Performance · Issue · Risk · Opportunity chips visible
- [ ] "Run [Area] View" button adapts to active area chip
- [ ] Try Asking: Rank key drivers · Summarize for leadership · Run what-if
- [ ] Input placeholder: "Ask a question about your data..."
- [ ] SustainabilityIndicator visible at bottom: `🌱 Ready · 0 tokens`
- [ ] NO animation on the leaf emoji in ready state

Screenshot: `02-ask-pulse-welcome.png`

---

### 3.3 Ask Pulse — simple question (basic scenario)

Question: **"What's the total revenue this year?"**

- [ ] Question appears in history immediately with "submitting" state
- [ ] Elapsed timer appears while polling
- [ ] Response renders: narrative text, then SQL tab (if applicable), then table tab (if applicable)
- [ ] Evidence drawer accessible via evidence icon
- [ ] "✦ Try asking" suggestion chips appear below the response
- [ ] After response completes: `🍃 Lean · ~Xk tokens` — leaf animation now playing (breathe)
- [ ] SustainabilityIndicator tier advanced from ready
- [ ] perfInstrumentation: open DevTools console → a `[pulseplay perf]` group should appear with `total`, `submit`, `polling` durations

Record: elapsed time, console perf table durations

Screenshot: `03-ask-pulse-simple-response.png`, `03-perf-console-simple.png`

---

### 3.4 Ask Pulse — follow-up conversation (complex scenario)

After question 3.3 completes:

**Follow-up 1:** "Break that down by region"
- [ ] Sends as a follow-up on the SAME conversation (check Network: should use existing `conversation_id`, NOT start a new one)
- [ ] Previous question still visible above
- [ ] Response arrives with regional breakdown
- [ ] SQL tab shows a different (region-grouped) query than the first response

**Follow-up 2:** "Which region is underperforming vs last year?"
- [ ] Genie uses conversation context — response should reference prior turn data
- [ ] Narrative mentions the specific underperforming region
- [ ] SQL tab shows comparison logic

**Follow-up 3:** "Why? What's driving it?"
- [ ] Context-aware — should NOT need to re-explain what "it" is
- [ ] Response should reference the specific region and metric from follow-up 2
- [ ] Suggestion chips appear (relevant to the thread, not generic)

**Follow-up 4:** "Summarize this entire analysis for an executive in 3 bullets"
- [ ] Synthesis response draws on all prior turns
- [ ] Shorter, narrative-only — no SQL (synthesis, not a query)

Record: conversation_id consistency (Network tab), context continuity quality

Screenshot: `04-multi-turn-conversation.png`

---

### 3.5 Ask Pulse — Quick Start chip (run from welcome)

Clear conversation (Reset or new session). Return to welcome.

Click **"Run Performance View"** chip:

- [ ] Sends a performance-analysis prompt automatically
- [ ] Response is structured: headline + KPI snapshot + analysis
- [ ] No blank loading state during the transition from welcome to conversation

Click **"Rank key drivers"** from Try Asking:

- [ ] Sends the preset prompt
- [ ] Response explains the key drivers behind the current result

Screenshot: `05-quick-start-chip.png`

---

### 3.6 Ask Pulse — stop mid-flight

Send a complex question: **"Show monthly sales for the last 12 months broken down by product category and region"**

While it is polling (before response):
- [ ] Click **Stop** button
- [ ] Entry updates to a "stopped by user" state, not an error
- [ ] Previous history entries remain intact
- [ ] SustainabilityIndicator does NOT crash or freeze

Screenshot: `06-stop-mid-flight.png`

---

### 3.7 Ask Pulse — error recovery

Trigger an error by sending a question while the proxy is unreachable (stop the proxy, send a question, restart proxy):

- [ ] Entry shows error state with a **Retry** button
- [ ] Clicking Retry re-populates the input and allows resend
- [ ] After retry succeeds, entry shows completed response
- [ ] SustainabilityIndicator recovers — does not show stale/frozen token count

---

### 3.8 Ask Pulse — chart rendering (ECharts)

Question: **"Show me monthly sales for the last 12 months as a chart"**

- [ ] Chart renders using ECharts (not Vega-Lite fallback)
- [ ] Chart is interactive: hover shows tooltip with values
- [ ] Table tab also available and shows the underlying data
- [ ] Row values in table match chart datapoints (reconcile at least 3 points)
- [ ] "Chart" tab is the default view when chart data is present
- [ ] No `0×0` jsdom warnings in browser console about ECharts

Screenshot: `07-echarts-monthly-sales.png`, `07-table-reconciliation.json` (3 datapoints verified)

---

### 3.9 Ask Pulse — forced chart type

Question: **"Show revenue by region as a bar chart"**

- [ ] Chart renders as bar (not whatever the auto-picker chose)
- [ ] Chart legend matches the SQL result column names
- [ ] Switching to Table tab and back to Chart preserves the bar type

---

### 3.10 AI Insights — cold run (complex pipeline)

Navigate to **AI Insights** tab (no cache for this scope):

- [ ] Status shows "Connecting to AI" immediately
- [ ] Stage placeholder skeletons appear BEFORE any stage completes
- [ ] Stage 0 (HEADLINE) fires first at `t=0`
- [ ] Stage 1 fires approximately 8 seconds later (open DevTools Network, look at timestamp gap)
- [ ] At most 2 Genie calls in-flight simultaneously (confirm in Network tab)
- [ ] Stages complete and paint sections progressively
- [ ] No content collapse or reordering as sections come in
- [ ] SQL buttons appear per-section after each stage completes
- [ ] Provenance footer on each card: "Generated by PulsePlay · Source: [profile] · Updated [time]" (not "AI-generated · Source: default · 19 min ago")
- [ ] After full run: `dumpRun` console.table appears with `total` stage duration

Record: total elapsed time, per-stage breakdown from console.table

Screenshot: `08-ai-insights-cold-run.png`, `08-network-concurrency-check.png`, `08-perf-console-insights.png`

---

### 3.11 AI Insights — warm run (stale-while-revalidate)

Immediately after 3.10 completes (same scope, valid cache):

Trigger a refresh (navigate away and back, or click Refresh):

- [ ] Cached briefing appears **immediately** — not a 3-minute wait
- [ ] A banner appears at the top: "Showing last completed briefing while PulsePlay refreshes."
- [ ] Spinner in the banner is animated (gn-progress-spin keyframe)
- [ ] Background pipeline runs — confirm Genie calls in Network tab
- [ ] Sections do NOT collapse to 1 and rebuild — fresh content arrives atomically
- [ ] After fresh run: banner disappears, new content replaces old in one swap
- [ ] Provenance footer timestamp updates to "just now" or new time

Measure: time from page load to first pixel of cached content (target: < 500 ms)

Screenshot: `09-stale-banner.png`, `09-fresh-swap.png`

---

### 3.12 AI Insights — stop during background refresh

After triggering a warm run with the stale banner visible:

Click **Stop** (if available) or navigate away mid-refresh:

- [ ] Stale banner disappears
- [ ] Cached content remains visible (not replaced with "Stopped" state)
- [ ] No error state shown
- [ ] SustainabilityIndicator is not broken

---

### 3.13 AI Insights — SQL affordance (complex)

After a full AI Insights run in 3.10:

Click `</>` on the **TRENDS** section:

- [ ] If TRENDS ran its own SQL: SQL panel shows the query. Copy button is SVG icon, not 📋.
- [ ] If TRENDS reused SQL from HEADLINE: panel shows "Reused from HEADLINE" or "Reused from AI INSIGHTS BRIEFING" with the actual SQL inline
- [ ] Neither case shows: "This section reuses data from an earlier query" (old dead panel)

Click `</>` on the **RECOMMENDED ACTIONS** section:

- [ ] If no SQL available: shows honest line ("No SQL available for this section. This stage produced a narrative-only output…")
- [ ] Does NOT show an empty SQL panel or spinner

Screenshot: `10-sql-reused-from.png`, `10-sql-honest-fallback.png`

---

### 3.14 AI Insights — retry single section

After a full run, click **↻ Retry** on a single section (if an incomplete-section banner is visible, or use a failed stage):

- [ ] Only that section re-runs — other sections stay as-is
- [ ] Progress indicator shows for just that section
- [ ] Section content updates when retry completes
- [ ] Conversation context (conversation_id) is reused — no new conversation started

---

### 3.15 AI Insights — Adjust / override prompt

Click **Adjust** toolbar button after a run:

- [ ] An input appears for custom instructions
- [ ] Type "Focus only on return rate trends" and click Apply
- [ ] Single-stage override run fires (not the full 5-stage pipeline)
- [ ] Result shows a focused return-rate analysis
- [ ] SQL from the override is traceable via `</>`

---

### 3.16 HelpTip portal — edge cases

Route: `/settings/setup`

**Narrow viewport (set browser to 400px wide):**

- [ ] Open a HelpTip near the LEFT edge — bubble does not clip off left
- [ ] Open a HelpTip near the RIGHT edge — bubble does not clip off right
- [ ] Arrow under bubble points at the trigger center in both cases
- [ ] Bubble stays inside the viewport in both cases

**Test DOM structure:**

Run in console:
```javascript
// Open any HelpTip, then:
const tt = document.querySelector('[role="tooltip"]');
console.log(tt?.parentElement?.tagName); // Expected: "BODY"
console.log(tt?.style.position);          // Expected: "fixed"
```

**Mutual exclusion:**

- [ ] Open HelpTip A, then open HelpTip B — HelpTip A closes automatically
- [ ] Only one `role="tooltip"` element in the DOM at a time

**Keyboard:**

- [ ] Tab to a HelpTip trigger → tooltip opens (focus handler)
- [ ] Tab away → tooltip closes
- [ ] Shift+Tab works the same

Screenshot: `11-helptip-left-edge.png`, `11-helptip-right-edge.png`, `11-helptip-one-open.png`

---

### 3.17 Settings — Setup Quick Canvas

Route: `/settings/setup`

**Step 1 — BI surface:**

- [ ] FieldCard tip for "BI surface": opens with title "PulsePlay hosts the BI surface" + bullet lines (NOT dense paragraph)
- [ ] Provider dropdown populates with available vendors
- [ ] Embed URL field: tip opens with title "Use the full form for complex flows" + bullets

**Step 2 — AI assistant:**

- [ ] FieldCard tip for "AI assistant": title "PulsePlay orchestrates AI" + bullets
- [ ] Profile dropdown: tip title "A profile is a named backend" + bullets
- [ ] Approved profiles listed if allowlist configured

**Step 3 — Domain knowledge:**

- [ ] Pack tip: title "A pack is your industry's vocabulary" + bullets
- [ ] Pack dropdown shows available packs

**Regression:**

- [ ] "Open full embed settings" button link (not "Full embed form →")
- [ ] "Tune Insights behavior" link (not "Tune Insights behavior →")
- [ ] No trailing → arrows anywhere in Setup

Screenshot: `12-setup-tips-structured.png`, `12-setup-no-arrow-glyphs.png`

---

### 3.18 Settings — AI sub-routes

Route: `/settings/ai`

- [ ] Rail shows: Assistant · Shared context · Response behavior · Surface-specific behavior sections
- [ ] Sub-nav: Supervisor · Appearance · Developer · Governance · Knowledge Base links visible
- [ ] Click **Supervisor** → navigates to `/settings/ai/supervisor`
- [ ] Supervisor tips: structured title + bullets (not dense paragraphs)
- [ ] Back navigation: browser back returns to `/settings/ai` correctly

Route: `/settings/ai/developer`

- [ ] Developer settings show diagnostic surfaces and pipeline behavior groups
- [ ] "Diagnostic surfaces" card tip: "On for diagnosis, off for shipping" title + bullets
- [ ] Show SQL / Show Trace toggles functional

Route: `/settings/ai/governance`

- [ ] Authentication model tip: "Shared PAT vs OAuth on-behalf-of" title + bullets (not dense paragraph)
- [ ] Unity Catalog enforcement tip: "Prompt construction only" title + bullets

Screenshot: `13-settings-ai-subroutes.png`, `13-governance-structured-tip.png`

---

### 3.19 Knowledge Base route

Route: `/knowledge`

- [ ] Knowledge Base index renders
- [ ] Active pack settings button: SVG cog icon + "settings" label text (not "⚙ [pack] settings")
- [ ] Back to playground button: SVG arrow + "Back to app" (not "← Back to app" text)

Screenshot: `14-knowledge-svg-cog.png`

---

### 3.20 SustainabilityIndicator — full lifecycle

**Before any question (ready):**

- [ ] `🌱🙂 Ready · 0 tokens` — no animation
- [ ] Hover → panel opens: "Ready when you are" headline
- [ ] Click → pins panel open; outside-click closes it
- [ ] "Click the indicator to pin or dismiss this panel." hint visible in panel

**After 1-2 questions (lean/green):**

- [ ] Leaf breathes (slow scale oscillation, ~3-4 s period) — observable
- [ ] Panel: "Thriving — very efficient" or "Healthy — good efficiency" headline
- [ ] Panel body: human explanation (not token jargon as the lead)
- [ ] Token count visible in small muted footer row of panel

**After 10+ questions or large context (heavy):**

- [ ] `🍂😕 Heavy` — jittery animation observable (faster, slightly rotates)
- [ ] Panel: "Getting heavy — consider a fresh start" headline
- [ ] Reset button (↻ SVG icon) visible since `showReset` is true
- [ ] Clicking Reset: tier drops back to ready, animation stops, panel closes

**Very-heavy (simulate by checking animation name in DevTools):**

- Run in console:
```javascript
const leaf = document.querySelector('.pp-sustainability span[aria-hidden]');
getComputedStyle(leaf).animationName;
// For very-heavy: should contain "si-stress"
// For lean: should contain "si-breathe-lean"
// For ready: should be "none"
```

Screenshot: `15-sustainability-ready.png`, `15-sustainability-lean-breathe.png`, `15-sustainability-heavy-jitter.png`, `15-sustainability-panel-human.png`

---

### 3.21 BI Viz surface

Route: `/` → **BI Viz** tab

No BI tool configured:

- [ ] BI Viz tab shows an appropriate empty/placeholder state
- [ ] No "BI BI Viz" text anywhere (regression from earlier fix)
- [ ] No blank white pane appearing before the placeholder
- [ ] Surface switcher tab label reads "BI Viz" (not "BI BI Viz")

Screenshot: `16-bi-viz-empty.png`

---

### 3.22 Viewport controls

- [ ] **Maximize (⤢):** AI pane expands to full panel, BI pane hidden. Restore (⤡) returns to split.
- [ ] **Minimize (—):** AI pane collapses. "Show both" button appears.
- [ ] **Float (↗):** AI pane opens as floating window. Dragging repositions it. Closing returns to embedded.
- [ ] **Pin:** pin button toggles. Pinned state persists across tab switches.
- [ ] No text glyphs on any viewport control button — all SVG icons

Screenshot: `17-viewport-float.png`, `17-viewport-maximize.png`

---

### 3.23 First-run wizard

Route: fresh session (clear `pulseplay:wizard-dismissed` from localStorage)

- [ ] Wizard appears on first load
- [ ] Step 1 — Persona picker: "Analyst" / "Executive" / "Developer" / "Designer"
- [ ] "Continue" button (not "Continue →" with text arrow)
- [ ] Step 2 — BI source configuration
- [ ] Step 3 — AI connector configuration
- [ ] "Done & ask" submits a suggested question to Ask Pulse
- [ ] Wizard dismissal persists across reloads
- [ ] Re-run wizard: Settings → System → Re-run setup wizard

---

### 3.24 Mobile / narrow viewport (390 × 844)

Resize browser to 390 × 844. Test each:

- [ ] Surface switcher: all 3 tabs visible and tappable without horizontal scroll
- [ ] Ask Pulse input: full-width, send button reachable
- [ ] SustainabilityIndicator: bar not cut off, label readable
- [ ] HelpTip: opens above trigger, stays in viewport (not clipped left or right)
- [ ] AI Insights: sections readable, no horizontal overflow
- [ ] Stale-refresh banner: fits within 390px without wrapping awkwardly
- [ ] Floating panel (if triggered): positioned correctly, not off-screen
- [ ] Settings: rail readable, no overlap

Screenshot: `18-mobile-390-ask-pulse.png`, `18-mobile-390-settings.png`, `18-mobile-390-insights.png`

---

## 4. Complex integration scenarios

### 4A. Full end-to-end: Insights → Ask Pulse follow-up

**This is a HYPOTHESIS TO VERIFY, not an expected PASS.** The BUG-017 fix in
`pulse/visual.tsx` is intended to re-seed `conversationMap` from the AI
Insights stage-1 conversation when a ✨ chip is clicked, but this may not be
fully wired end-to-end. Mark the result PASS / PARTIAL / FAIL based on what
you actually observe.

1. Run AI Insights cold (from 3.10)
2. Wait for full completion
3. Switch to Ask Pulse tab
4. Look for ✨-marked clarifier chips at the bottom of the chat area (distinct from the plain Quick Start chips)
5. Click one ✨ chip
6. In DevTools Network: does the resulting Genie call use the SAME `conversation_id` from the AI Insights run, or does it start a new conversation?
   - PASS: same conversation_id → context continuity
   - PARTIAL: different conversation_id but response still references Insights context
   - FAIL: different conversation_id, cold-start response with no context
7. Does the response build on what the Insights briefing established?

Record: conversation_id from AI Insights run AND from the ✨ chip turn.

Screenshot: `19-insights-to-chat-handoff.png`, `19-conversation-id-match.json`

If no ✨ chips appear (clarifier chips require Insights to have surfaced follow-up questions), mark section DEFERRED and describe what was visible instead.

---

### 4B. KPI preload on Ask Pulse tab entry (Option A)

**New feature — verify the full flow:**

1. Hard-refresh the app. Navigate to Ask Pulse tab (first visit this session).
2. Immediately after the tab loads (no question asked):
   - [ ] A subtle "Analyzing your data..." loading indicator appears under the Quick Start chips.
   - [ ] Within the normal Genie response time, 3-4 KPI cards appear in the welcome area.
   - [ ] Quick Start and Try Asking chips remain visible below the KPI cards.
   - [ ] No user question bubble appears in the chat history — the preload is silent.
3. Check DevTools Network: ONE `/conversations/start` call should have fired automatically.
   Record its `conversation_id`.
4. Now type and submit your own question: "Tell me more about the top metric"
   - [ ] The question goes as a FOLLOW-UP on the same `conversation_id` (check Network — should NOT be a new `/conversations/start`).
   - [ ] Response builds on the preload context.
5. Check the cache: navigate away, hard-refresh, come back to Ask Pulse tab.
   - [ ] KPI cards appear immediately (from cache, no network call).
   - [ ] Preload conversation does NOT re-fire within the 30-min TTL.
6. Change a setting that affects the prompt scope (e.g. domain guidance), return to Ask Pulse.
   - [ ] Cache is invalidated, fresh preload fires.

Screenshot: `20-kpi-preload-cards.png`, `20-preload-conv-id-reuse.json`

### 4C. Cache invalidation

1. Run AI Insights cold. Note the scope (no filters active).
2. Wait for completion. Cache should be written.
3. Trigger a scope change (apply a filter if BI is connected, or change a setting that affects the insights prompt).
4. Navigate away and back to AI Insights.
5. Confirm: cache is NOT served (scope changed = cache miss). Fresh pipeline runs.
6. Revert the scope change.
7. Navigate away and back again.
8. Confirm: cache IS served (scope matches again = cache hit + stale-while-revalidate).

---

### 4C. Supervisor mode stress test (if supervisor profile available)

Configure a supervisor profile with 2+ spaces.

1. Run AI Insights in supervisor mode.
2. Observe: "Asking supervisor for HEADLINE" status in progress indicator.
3. Confirm: each stage fans out to all configured spaces.
4. Check Network: multiple Genie calls per stage (one per space).
5. Synthesis: a single merged response per section.
6. SQL: which space contributed which SQL is traceable.
7. Run Ask Pulse in supervisor mode → "Sync all spaces" toggle visible.
8. Enable sync → send question → all-spaces fan-out → per-space responses displayed.
9. "Copy fusion" button appears → click → copies merged answer (SVG icon, not 📋).

---

### 4D. Ask Pulse — context carryover stress test

Send these questions in sequence WITHOUT clearing conversation:

1. "What's the top-selling product category?"
2. "Drill into that category — show weekly trend for the last 8 weeks"
3. "Compare it to the same period last year"
4. "What's the year-over-year change in percentage terms?"
5. "Which week had the biggest drop? Why might that be?"
6. "Summarize this for a weekly leadership meeting in exactly 5 bullet points"

After each response:
- [ ] The response references the prior context correctly (no "What product category?" or cold-start behavior)
- [ ] SQL per response is progressively filtered/scoped based on prior turns
- [ ] Conversation_id stays consistent across all 6 turns (Network tab)

---

### 4E. perfInstrumentation — capture real numbers

After running both AI Insights (cold) and Ask Pulse (simple + complex), collect:

Open DevTools Console and expand all `[pulseplay perf]` groups. Record:

| Pipeline | Stage | Duration (ms) | Notes |
|---|---|---|---|
| AI Insights cold | total | | |
| Ask Pulse "total revenue" | total | | |
| Ask Pulse "total revenue" | submit | | |
| Ask Pulse "total revenue" | polling | | |
| Ask Pulse "monthly sales" | total | | |
| AI Insights warm | (no stages — background) | N/A | Banner visible? |

Compare against guide targets:
- Ask Pulse simple: ≤ 10 s total
- AI Insights cold total: ≤ 90 s
- AI Insights warm first paint: ≤ 500 ms

---

## 5. Reconciliation questions

Answer each: **PASS / PARTIAL / FAIL** with a one-line note.

### 5.1 Intent vs implementation

1. Does the stale-while-revalidate pattern actually prevent "collapsing sections" during a warm refresh? (Verify by watching the Insights pane during a warm run.)
2. Does the concurrency-2 pipeline with 8 s delay result in stage 0 always painting before stage 1? (Did you observe a case where stage 1 finished first?)
3. Does the HelpTip arrow correctly track the trigger center when the bubble is horizontally clamped?
4. Are the 14 structured HelpTip tips (title + bullets) actually easier to read than the old dense paragraphs? Give an honest opinion.
5. Does the SustainabilityIndicator animation feel meaningful, or does it feel distracting? Does the environmental metaphor (leaf → autumn leaf → stressed) land without explanation?

### 5.2 Performance against the guide

Reference: `docs/CLAUDE_PULSEPLAY_POTENTIAL_PERFORMANCE_GUIDE_2026-05-19.md`

| Criterion | Target | Measured | PASS/PARTIAL/FAIL |
|---|---|---|---|
| First visible acknowledgement | < 500 ms | | |
| First useful partial insight | ≤ 5 s | | |
| AI Insights first section (warm) | ≤ 10 s | | |
| AI Insights full cold | ≤ 90 s | | |
| Ask Pulse simple KPI | ≤ 10 s | | |
| Ask Pulse complex multi-row | ≤ 20 s | | |

### 5.3 UX quality

6. Does the Ask Pulse welcome look clean after removing the 0/0 stat cards? Or is it too sparse?
7. Does the multi-turn conversation feel natural? Does Genie maintain context across turns 3-6?
8. Is the panel in SustainabilityIndicator immediately understandable to a non-technical user?

### 5.4 Regressions

9. Is "AI Insights" still shown correctly in the surface switcher (not "AI Insights Chat" or similar)?
10. Is "Ask Pulse" still the correct label for the chat tab (not "Ask Pulse Chat" or "Genie")?
11. Does the "Ready BI + AI" status chip still appear in the header (not broken by any recent change)?
12. Does stopping an AI Insights run still show "Stopped by user" in normal (non-background) mode?

---

## 6. Evidence and result file

### Evidence folder

`docs/evidence/codex-master-review-2026-05-19-<HHMM>/`

Name each file as listed in the test steps above (e.g. `01-shell-surface-tabs.png`).

For JSON evidence files:
```json
{
  "check": "what you were checking",
  "observed": "what you actually saw",
  "result": "PASS|PARTIAL|FAIL",
  "screenshot": "filename.png"
}
```

### Result file

`docs/CODEX_MASTER_REVIEW_RESULTS_2026-05-19.md`

```markdown
# Codex Master Review Results — 2026-05-19 HH:MM IST

**HEAD:** ac2b1ba
**Viewport:** WW × HH px
**Proxy profile:** default
**AI backend:** <profile type>

## Headline verdict
<3 sentences: what passed, what didn't, top 1-3 blockers>

## Section 1 — Smoke
<table: command → result>

## Section 2 — Static review
<table: check → PASS/FAIL>

## Section 3 — Browser
<table: scenario → PASS/PARTIAL/FAIL + screenshot ref>

## Section 4 — Complex scenarios
<table: scenario → PASS/PARTIAL/FAIL/DEFERRED>

## Section 5 — Reconciliation
<numbered answers>

## Timing table (from perfInstrumentation)
<captured durations>

## Top follow-ups
P0: <if any>
P1: <list>
P2: <list>

## Evidence manifest
<filenames>
```

---

## 7. Tripwires — absolute limits

- Do NOT modify any code in this pass. Review and report only.
- Do NOT mark PASS on something you did not actually verify.
- Do NOT use `--no-verify` on any git command.
- Do NOT widen the Genie iframe sandbox.
- Do NOT claim performance targets are met unless you measured them.
- Do NOT skip the credential audit.
- Mark any test DEFERRED if you lacked a live backend — do not guess.
- If you find something broken, report it clearly. Do not soften it.
