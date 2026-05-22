# PulsePlay — Complex & Edge-Case E2E Scenarios

> **Purpose:** This catalog complements [SMOKE_TEST_PLAN.md](../SMOKE_TEST_PLAN.md). Where the smoke plan covers the happy-path 25 categories (settings shell, vendor matrix, save-bar, etc.), this catalog drills into the hard stuff: internationalization quirks, performance under load, weird network conditions, browser diversity, privacy modes, time/timezone edges, form validation extremes, UI state corruption, and resource exhaustion.
>
> **What's NOT here:** security / injection (handled by a sibling catalog), and routine UI flows already covered in the smoke plan. No duplication.
>
> **Scope:** 575 scenarios across 9 categories. Each is uniquely testable — no catch-alls.
>
> **Last updated:** 2026-05-19
>
> ## How to use this file
>
> - Pick one category per session — they're independent.
> - Severity reflects user impact, not test difficulty.
> - Record PASS / FAIL / SKIPPED / N/A per scenario.
> - Issues filed only for FAIL.
> - Reference platform: Chrome 124+ stable, Edge 124+, Firefox 124+, Safari 17 unless otherwise noted.
>
> ## ID convention
>
> `EDGE-<CATEGORY>-NNN` — e.g., `EDGE-I18N-001` is internationalization scenario 1.
>
> ## Severity
>
> - **Critical** — corrupts data, blocks all use, or causes the app to crash.
> - **High** — blocks a key flow but workaround exists.
> - **Medium** — degrades quality of life; visible to users.
> - **Low** — cosmetic or rare-edge polish.

---

## EDGE-I18N — Internationalization (80 scenarios)

Covers RTL languages, CJK scripts, mixed-direction text, Unicode normalization, surrogate pairs, combining marks, BIDI control characters, locale-specific number/date formats, and script-aware rendering across PulsePlay's prompt input, custom metric direction rules, settings labels, KB titles, and chart axes.

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-I18N-001 | RTL | Arabic prompt with no LTR characters | Paste `ما هي أعلى منطقة مبيعات؟` into AI sidebar prompt and submit | Text renders RTL, caret on right edge, send button stays right-aligned, prompt is forwarded verbatim to proxy without re-ordering | High |
| EDGE-I18N-002 | RTL | Hebrew prompt with punctuation at end | Paste `מה הם האזורים המובילים?` and submit | RTL render preserves trailing `?`; proxy receives original codepoints | High |
| EDGE-I18N-003 | RTL | Urdu (RTL) with extended characters | Paste `سب سے زیادہ فروخت کا علاقہ کون سا ہے؟` | Renders RTL, no missing glyphs, request body byte-length matches expected UTF-8 length | Medium |
| EDGE-I18N-004 | RTL | Persian numerals mixed with Latin | Type `فروش در سال 2024` | Year `2024` renders as Latin digits, sentence flows RTL | Medium |
| EDGE-I18N-005 | RTL | Pure Arabic in custom metric direction rule label | Save metric `الإيرادات` with direction `higher-is-better` | Label persists, settings reload preserves codepoints, no `??` placeholders | High |
| EDGE-I18N-006 | RTL | Hebrew letter sequence in pack glossary key | Add glossary key `מפתח-1` | Key persists and round-trips through localStorage | Medium |
| EDGE-I18N-007 | RTL | RTL prompt while UI is LTR | Set UI to English then submit Arabic prompt | Prompt stays RTL inside its bubble; surrounding UI remains LTR | Medium |
| EDGE-I18N-008 | RTL | Backspace at LTR/RTL boundary | Type `Hello مرحبا` then press Backspace 5x | Each press deletes one codepoint; caret jumps correctly across boundary | Medium |
| EDGE-I18N-009 | RTL | Selection across LTR/RTL boundary | Shift+Arrow select across `Hello |مرحبا` | Selection grows logically (visual order may differ), copy yields the original character sequence | Low |
| EDGE-I18N-010 | RTL | Cursor home/end in RTL text | Press Home/End inside Arabic text | Home goes to logical start (right edge), End to logical end (left edge) | Low |
| EDGE-I18N-011 | CJK | Chinese (Simplified) prompt | Paste `今年最高销售地区是哪个？` | Renders correctly, full-width punctuation preserved, IME composition events do not double-submit | High |
| EDGE-I18N-012 | CJK | Chinese (Traditional) prompt | Paste `今年最高銷售地區是哪個？` | Renders correctly, no glyph substitution | High |
| EDGE-I18N-013 | CJK | Japanese (mixed Hiragana/Katakana/Kanji) | Paste `今月の売上トップ地域は？` | Renders correctly, ruby annotation if present preserved | High |
| EDGE-I18N-014 | CJK | Japanese half-width Katakana | Paste `ｱｲｳｴｵ` | Renders narrow Katakana, length-counted as 5 chars | Low |
| EDGE-I18N-015 | CJK | Korean Hangul syllables | Paste `이번 달 최고 매출 지역은?` | Renders correctly, syllable boundaries not broken at line wrap | High |
| EDGE-I18N-016 | CJK | Korean Jamo (decomposed) | Paste sequence of conjoining Jamo `각` | Composes to single syllable `각` visually; copy yields decomposed form (NFD) | Medium |
| EDGE-I18N-017 | CJK | CJK characters in metric direction rule | Add rule for metric `売上高` direction `higher-is-better` | Persists, no width truncation | High |
| EDGE-I18N-018 | CJK | Vertical-text Mongolian or vertical-CJK in label | Set chart label to long Chinese phrase | Horizontal default; vertical fallback only if `writing-mode` explicitly applied | Low |
| EDGE-I18N-019 | CJK | Chinese ellipsis in label | Use `……` (two horizontal ellipses) | Renders without overflow, copy preserves both | Low |
| EDGE-I18N-020 | CJK | IME composition with backspace mid-composition | Start typing `りんご` in Japanese IME, backspace before commit | Composition reverts, no partial commit to send-on-Enter | Medium |
| EDGE-I18N-021 | Mixed | LTR + RTL alternation (English + Arabic) | Submit `Show me مبيعات for region East` | Bidi rendering correct; word boundaries preserved; proxy receives unmodified UTF-8 | High |
| EDGE-I18N-022 | Mixed | RTL + LTR with embedded number | Submit `الإيرادات 1,234.56 USD` | Number stays LTR `1,234.56`, currency code rendered next to it correctly | Medium |
| EDGE-I18N-023 | Mixed | LTR English label with RTL value | Custom metric name `Revenue` value `إيرادات` | Both stored verbatim, display shows label in LTR, value in RTL | Medium |
| EDGE-I18N-024 | Mixed | Three-script chain (Latin + CJK + Cyrillic) | Submit `Sales 销售 Продажи` | All three render correctly side by side | Medium |
| EDGE-I18N-025 | Mixed | RTL inside parentheses | Submit `Top region (المنطقة العليا)` | Parentheses mirror correctly; closing paren on logical-left in RTL run | Medium |
| EDGE-I18N-026 | Mixed | Inline code span with RTL surrounding | Submit `Use \`SELECT *\` للاستعلام` | Code span monospace LTR; surrounding text RTL | Low |
| EDGE-I18N-027 | Surrogate | Single emoji `😀` (BMP astral) | Paste into prompt and submit | Length counted as 1 grapheme (not 2 UTF-16 code units), proxy receives U+1F600 | High |
| EDGE-I18N-028 | Surrogate | ZWJ family emoji `👨‍👩‍👧‍👦` | Paste and submit | Renders as single glyph, copy yields all 7 codepoints, no glyph fallback to separate figures | Medium |
| EDGE-I18N-029 | Surrogate | Skin-tone modifier `👍🏽` | Paste and submit | Renders as medium-skin thumbs-up, not split | Medium |
| EDGE-I18N-030 | Surrogate | Flag emoji `🇯🇵` (regional indicators) | Paste | Renders as Japan flag (not two letters) on systems with flag fonts; falls back to "JP" elsewhere | Low |
| EDGE-I18N-031 | Surrogate | High-only surrogate `\uD83D` injected via API | POST raw broken surrogate to `/assistant/conversations/start` | Proxy rejects with 400 OR coerces to U+FFFD; never crashes JSON parse | High |
| EDGE-I18N-032 | Surrogate | Low-only surrogate `\uDE00` injected via API | POST raw broken surrogate | Proxy rejects with 400 OR coerces; never throws unhandled | High |
| EDGE-I18N-033 | Surrogate | Paste 1000-emoji string into prompt | Paste long emoji sequence | Render does not freeze tab >1s; submit succeeds | Medium |
| EDGE-I18N-034 | Surrogate | Emoji in pack title | Pack metadata `title: "📊 CPG Pack"` | Pack picker shows emoji; pack file persists with codepoint intact | Low |
| EDGE-I18N-035 | Surrogate | Cursor navigation through ZWJ family emoji | Use Arrow keys across `👨‍👩‍👧‍👦` | Single arrow press moves past entire grapheme cluster (not into ZWJ) | Medium |
| EDGE-I18N-036 | Surrogate | Backspace on multi-codepoint emoji | Backspace after typing `🏳️‍🌈` | One press deletes the whole flag, not piecewise | Medium |
| EDGE-I18N-037 | Diacritics | Combining mark `e` + `◌́` rendered as `é` | Paste `café` | Renders as `café` glyph; copy preserves NFD form unless normalized | Medium |
| EDGE-I18N-038 | Diacritics | Stacked combining marks | Paste `é̂̃` | Renders with all three diacritics stacked or visually clipped; no crash | Low |
| EDGE-I18N-039 | Diacritics | 50 combining marks on single base (Zalgo) | Paste `h̍̎̄̅...` (long sequence) | Renders without taking down the layout; tooltip/textarea height does not explode | Medium |
| EDGE-I18N-040 | Diacritics | NFC vs NFD search match | Save glossary entry `café` in NFC, search with NFD query `café` | Match succeeds via Unicode-normalized comparison | Medium |
| EDGE-I18N-041 | Diacritics | NFC vs NFKC compatibility folding | Save `ℋ` (script H) and search with `H` | NFKC normalization should match; NFC normalization should not | Low |
| EDGE-I18N-042 | Diacritics | Vietnamese stacked tones | Paste `nghiên cứu` (NFD form) | Renders without baseline shift | Low |
| EDGE-I18N-043 | Diacritics | Thai vowels above consonants | Paste `สวัสดี` | Vowel marks position correctly above consonants | Medium |
| EDGE-I18N-044 | ZWJ | Zero-width joiner U+200D between Latin letters | Paste `Hel‍lo` | Visually identical to `Hello`; copy preserves the ZWJ | Low |
| EDGE-I18N-045 | ZWJ | Zero-width non-joiner U+200C | Paste in Persian text `می‌خواهم` | Renders with broken ligature as intended | Low |
| EDGE-I18N-046 | ZWJ | Zero-width space U+200B injected into prompt | Submit prompt with embedded U+200B | Submits without visible artefact; proxy treats as significant codepoint | Low |
| EDGE-I18N-047 | BIDI | RLO override U+202E `Hello‮World` | Paste and submit | UI may render reversed; proxy receives literal codepoints; logs include the override marker | High |
| EDGE-I18N-048 | BIDI | LRO override U+202D inside RTL run | Paste | LTR run forced inside Arabic; no proxy crash | Medium |
| EDGE-I18N-049 | BIDI | PDI (pop directional isolate) without matching FSI | Paste U+2069 alone | Renders as inert; no JS exception | Low |
| EDGE-I18N-050 | BIDI | Phishing attempt: filename with U+202E | Pack import file named `report‮gpj.exe` | Display sanitizes the override OR shows raw codepoint name; never silently reverses | Critical |
| EDGE-I18N-051 | UTF-16 | Character at exactly U+10000 boundary | Paste `𐀀` (Linear B syllable A) | Renders or shows tofu without crash; proxy preserves UTF-8 4-byte sequence | Medium |
| EDGE-I18N-052 | UTF-16 | Character at U+FFFF (last BMP) | Paste U+FFFE replacement | Treated as text, not as BOM marker | Low |
| EDGE-I18N-053 | UTF-16 | Plane 16 character U+10FFFD | Paste highest valid codepoint | No truncation; round-trip identical | Low |
| EDGE-I18N-054 | UTF-16 | UTF-8 BOM at start of pasted text | Paste `﻿ Hello` | BOM is preserved OR stripped consistently; never partially | Medium |
| EDGE-I18N-055 | Locale | Number `1,234.56` parsed in en-US | Type into numeric direction-threshold field | Stored as 1234.56 | Medium |
| EDGE-I18N-056 | Locale | Number `1.234,56` (de-DE) in same field | Type in browser set to de-DE | Either parsed correctly OR rejected with clear error showing expected format | High |
| EDGE-I18N-057 | Locale | French number `1 234,56` (space thousands) | Type in fr-FR locale | Same — parse or clear-error | Medium |
| EDGE-I18N-058 | Locale | Indian number `1,23,456.78` (lakh grouping) | Type in en-IN locale | Same — parse or clear-error | Medium |
| EDGE-I18N-059 | Locale | Arabic-Indic numerals `١٢٣` | Type into numeric field | Coerced to Western digits OR rejected; no NaN persisted | Medium |
| EDGE-I18N-060 | Locale | Negative number with trailing minus (accounting) | Type `100-` | Either parsed as -100 OR rejected; no silent zero | Low |
| EDGE-I18N-061 | Date | DD/MM/YYYY input `13/05/2026` (en-GB) | Type into date picker shown in en-US session | Either parsed correctly OR rejected with format hint; never silently swapped | High |
| EDGE-I18N-062 | Date | MM/DD/YYYY input `05/13/2026` (en-US) | Type in en-GB session | Same handling | High |
| EDGE-I18N-063 | Date | ISO 8601 `2026-05-19` | Type into date picker | Always accepted regardless of locale | Medium |
| EDGE-I18N-064 | Date | Two-digit year `13/05/26` | Type | Either rejected OR explicit confirmation of century | Medium |
| EDGE-I18N-065 | Date | Japanese era date `令和8年5月19日` | Paste | Coerced to Gregorian OR rejected with clear message | Low |
| EDGE-I18N-066 | Compound | German compound word `Donaudampfschifffahrtsgesellschaftskapitän` | Use as metric name | No layout break, wrap behavior intact | Medium |
| EDGE-I18N-067 | Compound | Finnish long word `epäjärjestelmällistyttämättömyydellänsäkään` | Use as metric name | Same | Low |
| EDGE-I18N-068 | Compound | Sanskrit/Pali compound 60 chars | Same | Same | Low |
| EDGE-I18N-069 | Compound | URL-shaped long word (no spaces) | `https://averyverylongdomainnameforedgetestingpurposes.example.com/path/that/is/even/longer/and/contains/many/segments/for/word-wrap-edge-cases` | Wrap at soft break or `break-word`, no horizontal scroll | Medium |
| EDGE-I18N-070 | RTL+Num | Arabic text with Latin number mid-sentence | `المبيعات 1234 درهم` | Number renders LTR, run-boundaries correct | Medium |
| EDGE-I18N-071 | RTL+Num | Arabic-Indic number mid-Latin sentence | `Total ١٢٣ items` | Number stays in its native script; runs separated | Medium |
| EDGE-I18N-072 | Norm | NFKC fold of full-width ASCII `Ｈｅｌｌｏ` | Search KB with `Hello` | NFKC match returns full-width entry | Low |
| EDGE-I18N-073 | Norm | NFKC fold of digit superscript `²` to `2` | Save metric `m²` and search `m2` | NFKC normalization should match if normalized; do not normalize silently if losing meaning | Low |
| EDGE-I18N-074 | Norm | NFC re-composition after paste | Paste NFD form of `é` and re-read | Re-read returns the same form that was input (no implicit normalization) | Medium |
| EDGE-I18N-075 | Overflow | Combining accent overflowing line-height | `H̱̄̏̕H̱̄̏̕` repeated | Layout does not break; row height auto-expands or clips gracefully | Low |
| EDGE-I18N-076 | Punct | Chinese full-width comma `，` vs Latin `,` | Mix in same prompt | Both preserved; no autocorrect | Low |
| EDGE-I18N-077 | Punct | Japanese ideographic full-stop `。` | Use as end of prompt | Submission works; no truncation | Low |
| EDGE-I18N-078 | Punct | Armenian punctuation `։` (full-stop) | Paste | Renders correctly | Low |
| EDGE-I18N-079 | Punct | Ethiopic word-separator `፡` | Paste | Renders correctly | Low |
| EDGE-I18N-080 | Punct | Hebrew gershayim `״` inside acronym | Paste `נב״ע` | Renders without quote-mark misidentification | Low |

---

## EDGE-PERF — Performance Under Load (80 scenarios)

Covers large result sets, deep nesting, rapid theme/connector switching, reflow storms, layout thrashing, memory baseline drift, multi-tab interference, virtualization triggers, and pathological filter combinations across Genie, charts, and the AI sidebar.

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-PERF-001 | Result-size | 10k row Genie result rendered as ECharts table | Submit query returning 10,000 rows | Table virtualizes OR paginates; initial paint <2s; scroll FPS >30 | High |
| EDGE-PERF-002 | Result-size | 100k row Genie result | Submit query returning 100,000 rows | Virtualization triggers OR app shows "result too large, narrow your query" with row count | High |
| EDGE-PERF-003 | Result-size | 1M row Genie result (theoretical) | Submit query returning 1,000,000 rows | Server-side cap rejects OR client streams in chunks without crashing the tab | Critical |
| EDGE-PERF-004 | Result-size | 500 columns wide result | Submit query with 500 columns | Table renders horizontally scrollable; no >5s freeze | Medium |
| EDGE-PERF-005 | Result-size | Single 10MB JSON cell | Genie result contains one giant cell | Cell truncates with "view full" link; no layout break | Medium |
| EDGE-PERF-006 | Result-size | Empty result with 0 rows | Submit query returning 0 rows | Empty-state UI with "no data matched" message; not blank | Low |
| EDGE-PERF-007 | Chart | 100k data-point scatter plot | Render scatter chart with 100,000 points | Canvas-based renderer OR WebGL OR downsampling kicks in; no >5s freeze | High |
| EDGE-PERF-008 | Chart | 5000-slice pie chart | Pass 5000 slices to pie chart | Auto-aggregates "other" OR rejects with chart-type-mismatch warning | Medium |
| EDGE-PERF-009 | Chart | 365 stacked-bar categories | Render daily stacked bar for 1 year | Renders smoothly; tooltip lookup <100ms | Medium |
| EDGE-PERF-010 | Chart | 50 chart type switches in 10 seconds | Programmatically switch chart type 50x | No memory leak; final chart renders correctly | Medium |
| EDGE-PERF-011 | Chart | 1000-px-wide axis label | Force chart with very long category label | Label rotates, truncates with ellipsis, OR wraps; no horizontal page scroll on chart container | Medium |
| EDGE-PERF-012 | Chart | Auto-pick logic with ambiguous data shape | Submit 2-column result that could be bar or line | Auto-pick logs reason; chosen chart explained in console.debug | Low |
| EDGE-PERF-013 | Pivot | 5-level nested pivot | Render pivot with 5 row dimensions | Renders within 2s; expand/collapse responsive | Medium |
| EDGE-PERF-014 | Pivot | 1000 leaf-cells in pivot | Render pivot with 1000 cells | No render block >1s | Medium |
| EDGE-PERF-015 | Filter | 50 simultaneous filter chips | Apply 50 filters via UI | Filter pill row scrolls horizontally OR wraps; no layout break | Medium |
| EDGE-PERF-016 | Filter | Pathological IN clause with 10k values | Apply filter `region IN (...10000 values...)` | Either succeeds OR rejects with clear "too many values" error | High |
| EDGE-PERF-017 | Filter | Rapid filter toggle 100x in 5s | Toggle a filter chip 100 times rapidly | Debounce/coalesce calls; ≤3 actual proxy requests fired | Medium |
| EDGE-PERF-018 | Theme | Switch theme light↔dark 20x in 5 seconds | Rapidly toggle theme | No reflow storm; no >500ms freeze; no flash of incorrect theme | Medium |
| EDGE-PERF-019 | Theme | Theme switch during chart render | Toggle theme while ECharts rebuilds | Chart picks up new colors on next render frame; no stale palette | Low |
| EDGE-PERF-020 | Theme | Theme switch with active SSE stream | Toggle theme mid-stream | Stream continues; styles update; no disconnection | Low |
| EDGE-PERF-021 | Layout | CSS containment failure (one missing `contain:`) | Force a wide tooltip in a flex row | No sibling reflow when tooltip opens; verified via DevTools Performance | Medium |
| EDGE-PERF-022 | Layout | Layout thrashing from synchronous read-write | Trigger 100 alternating offsetHeight reads + style writes | Frame budget remains <16ms; measured via PerformanceObserver | Medium |
| EDGE-PERF-023 | Layout | Reflow loop from CSS variable update | Update --color-primary 60 times per second | App throttles update OR uses requestAnimationFrame; FPS stays >30 | Medium |
| EDGE-PERF-024 | Memory | Memory baseline drift over 100 prompt cycles | Submit and reset 100 prompts | Heap returns to within +5MB of baseline after GC | High |
| EDGE-PERF-025 | Memory | DOM node count after 100 chat messages | Send 100 messages in chat | Either virtualized (DOM <500 nodes) OR app warns to clear history | Medium |
| EDGE-PERF-026 | Memory | Detached DOM nodes after closing modal | Open and close FirstRunWizard 20 times | DevTools detached node count returns to 0 | Medium |
| EDGE-PERF-027 | Memory | Event listener leak after BIPanel destroy | Mount and destroy adapter 50 times | Listener count stable; no growth in `getEventListeners(window).length` | High |
| EDGE-PERF-028 | Memory | Closure leak in long-lived AISidebar | Run for 1 hour with periodic submits | Heap snapshots show stable retained size | High |
| EDGE-PERF-029 | Memory | Web Worker spawned per prompt not terminated | Send 50 prompts that spawn workers | Worker count plateaus; old workers terminated | High |
| EDGE-PERF-030 | Memory | IndexedDB query history grows unbounded | Send 10000 prompts | Either rotated (oldest deleted) OR user warned at threshold | High |
| EDGE-PERF-031 | Multi-tab | 10 simultaneous tabs hitting same proxy | Open 10 tabs of `/` and submit prompts simultaneously | Proxy rate-limits gracefully (429 with Retry-After); UI shows pending state | Medium |
| EDGE-PERF-032 | Multi-tab | localStorage write race between tabs | Two tabs change settings simultaneously | Last-writer-wins with `storage` event reconciling other tab | Medium |
| EDGE-PERF-033 | Multi-tab | BroadcastChannel propagation lag | Tab A saves; Tab B reads within 100ms | Tab B sees new value; no stale read | Low |
| EDGE-PERF-034 | Multi-tab | Service worker cache shared across tabs | Update SW in one tab | Other tabs receive `controllerchange` and show reload prompt | Medium |
| EDGE-PERF-035 | Multi-tab | 50 tabs of PulsePlay on same machine | Stress test | Each tab still responsive; memory per tab <200MB | Low |
| EDGE-PERF-036 | Stream | 1000-token SSE stream | Submit a prompt yielding 1000 tokens | Stream renders incrementally with smooth scroll; no chunk overflow | Medium |
| EDGE-PERF-037 | Stream | SSE chunk arriving every 1ms | Backpressure test with mocked rapid stream | UI batches updates via rAF; FPS stays >30 | Medium |
| EDGE-PERF-038 | Stream | Stream timeout at 30s with no chunk | Mock stalled stream | UI shows "stream appears stalled" after configured timeout | High |
| EDGE-PERF-039 | Stream | Stream abort via AbortController | Click "Stop" mid-stream | Request aborts; partial response retained; no orphan EventSource | Medium |
| EDGE-PERF-040 | Stream | Two concurrent streams from same sidebar | User submits second prompt before first finishes | Second is queued OR first is aborted with clear UI signal | Medium |
| EDGE-PERF-041 | Reflow | 1000 chips in a flex container | Render 1000 status chips at once | Flex layout stable; no FOUC; horizontal scroll handled | Low |
| EDGE-PERF-042 | Reflow | Window resize during chart render | Drag window edge while ECharts rebuilds | Chart resizes responsively; no half-rendered state persists | Medium |
| EDGE-PERF-043 | Reflow | DevTools open/close mid-render | Toggle DevTools while chart is rendering | Viewport recalc completes; chart re-fits | Low |
| EDGE-PERF-044 | Reflow | Zoom 200% triggers chart re-render | Browser zoom in to 200% | Chart re-fits; no clipped axes | Medium |
| EDGE-PERF-045 | Reflow | CSS Grid template change at 60Hz | Toggle grid columns 60 times per second | rAF-throttled; layout stable | Low |
| EDGE-PERF-046 | CPU | 60Hz animation while submitting query | Run CSS animation while sidebar is busy | Animation does not stutter beyond 1 dropped frame | Low |
| EDGE-PERF-047 | CPU | Long task >50ms in main thread | Profile prompt submit | No long tasks blocking input >100ms | High |
| EDGE-PERF-048 | CPU | requestIdleCallback queue starvation | Submit 10 prompts back-to-back | Idle callbacks still fire; no permanent starvation | Medium |
| EDGE-PERF-049 | CPU | JSON.parse of 50MB Genie response | Pathological response | Either streamed parser OR fails gracefully with size error | High |
| EDGE-PERF-050 | CPU | Synchronous JSON.stringify of 1MB context | Save 1MB embedConfig to localStorage | Either chunked OR app prompts to reduce; never blocks >1s | Medium |
| EDGE-PERF-051 | Boot | Cold-load time on first visit | Open `/` with empty cache | <3s to interactive on modern desktop | High |
| EDGE-PERF-052 | Boot | Warm-load time on repeat visit | Reload with full cache | <1s to interactive | Medium |
| EDGE-PERF-053 | Boot | First Contentful Paint with no embed | Open `/` with default settings | FCP <1.5s on Lighthouse mobile profile | Medium |
| EDGE-PERF-054 | Boot | Time to interactive after wizard dismissed | Close FirstRunWizard | TTI <500ms after dismissal | Medium |
| EDGE-PERF-055 | Boot | Lazy-loaded adapter chunk fetch | Switch to Tableau | Chunk download <500ms on cable; UI shows loading | Medium |
| EDGE-PERF-056 | Boot | DuckDB-WASM lazy chunk on first KB join | Trigger KB join requiring DuckDB | Chunk loads within 2s; clear progress indicator | Medium |
| EDGE-PERF-057 | Boot | Service worker registration on first load | Fresh install | SW registered without blocking critical render path | Low |
| EDGE-PERF-058 | Boot | Vite HMR latency in dev mode | Edit a component | HMR reflects change <300ms | Low |
| EDGE-PERF-059 | Boot | Production bundle size budget | Run `vite build` | No single chunk >500KB gzipped; total <2MB initial | Medium |
| EDGE-PERF-060 | Boot | Critical CSS inlined for FCP | View source on `/` | Above-fold CSS inlined; rest deferred | Low |
| EDGE-PERF-061 | GC | Force GC after large operation | Render 100k-row table then close | Memory drops back near baseline within 5s | Medium |
| EDGE-PERF-062 | GC | Heap fragmentation after 1 hour | Run mixed workload for 1 hour | Heap fragmentation does not cause >100MB overhead | Low |
| EDGE-PERF-063 | Anim | Reduced-motion preference honored on chart transitions | Set OS reduce-motion | Charts skip animation; transitions instant | Medium |
| EDGE-PERF-064 | Anim | requestAnimationFrame respects tab visibility | Hide tab then show after 10s | rAF resumes correctly; no catch-up burst | Low |
| EDGE-PERF-065 | Network | Concurrent fetch limit on Chrome | Open 100 simultaneous fetches | Browser queues at 6 per origin; UI shows pending | Medium |
| EDGE-PERF-066 | Network | DNS cache miss on first proxy call | Cold DNS lookup | Boot still <3s | Low |
| EDGE-PERF-067 | Network | Keep-alive reuse across requests | Make 20 sequential proxy calls | Connection reused (no new TCP handshake), measured via DevTools | Medium |
| EDGE-PERF-068 | Network | HTTP/2 multiplexing in dev | Inspect HTTP/2 over local dev | Multiple `/api/*` requests share one stream | Low |
| EDGE-PERF-069 | Network | Prefetch hint impact on lazy adapter | Hover vendor card | `prefetch` hint warms the chunk; subsequent switch <100ms | Low |
| EDGE-PERF-070 | Render | Force-paint-on-scroll for chart | Scroll page with chart in viewport | No tile flickering; smooth scroll FPS >50 | Medium |
| EDGE-PERF-071 | Render | will-change CSS hint on heavy items | Inspect chart container | `will-change: transform` set during animation, cleared after | Low |
| EDGE-PERF-072 | Render | Compositor-only animation for chip pulse | Trigger pulsing dot | Composited (no main-thread paint); verified in DevTools | Low |
| EDGE-PERF-073 | Render | Blocking font load delays text | Cold-load with custom font | `font-display: swap` shows fallback; no FOIT >500ms | Medium |
| EDGE-PERF-074 | Render | Image loading with intrinsic-size | Embed image in KB | No CLS shift when image loads | Medium |
| EDGE-PERF-075 | Render | LCP element identification | Run Lighthouse | LCP is meaningful content (hero or main chart), not a logo | Medium |
| EDGE-PERF-076 | Render | CLS shift from late-loading status chip | Open `/settings` | CLS <0.1 | High |
| EDGE-PERF-077 | Render | INP after first interaction | Click any button | INP <200ms p75 | Medium |
| EDGE-PERF-078 | Render | TTFB from local proxy | Hit `/api/health` cold | <100ms p95 on localhost | Low |
| EDGE-PERF-079 | Render | Long-running React effect after submit | Submit and observe React profiler | No effect >50ms | Medium |
| EDGE-PERF-080 | Render | DevTools React Profiler "wasted renders" | Submit prompt | No more than 2 wasted re-renders per leaf | Low |

---

## EDGE-NET — Network Conditions (80 scenarios)

Covers throttled connections, packet loss, latency, captive portals, proxies/VPNs, IPv6, HTTP versions, service worker offline scenarios, CDN routing, CORS edges, and encoding negotiation.

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-NET-001 | Throttle | 3G throttle (400 KB/s, 1500ms RTT) | Set DevTools 3G profile and load `/` | App loads within 10s; skeleton states visible | High |
| EDGE-NET-002 | Throttle | Slow-3G (50 KB/s) | Set Slow-3G profile | App still functional; skeleton/spinner durations sane | Medium |
| EDGE-NET-003 | Throttle | 4G throttle | Set 4G profile | <5s to interactive | Medium |
| EDGE-NET-004 | Throttle | Offline mode then back online | DevTools offline → online | App shows offline banner; auto-reconnects without reload | High |
| EDGE-NET-005 | Throttle | Adaptive: change throttle mid-stream | Switch from Fast-3G to offline during SSE | Stream pauses; on reconnect shows "stream interrupted" | Medium |
| EDGE-NET-006 | Latency | 1000ms RTT to proxy | Inject 1s latency | UI shows loading spinner; no timeout warning <2.5s | Medium |
| EDGE-NET-007 | Latency | 5000ms RTT to proxy | Inject 5s latency | Timeout warning appears with "retry" option | Medium |
| EDGE-NET-008 | Latency | 10000ms RTT (edge case) | Inject 10s latency | Request times out cleanly; no zombie pending state | High |
| EDGE-NET-009 | Latency | Variable jitter ±500ms | Random latency 200-700ms | UI does not flicker between loading states | Low |
| EDGE-NET-010 | Loss | 5% packet loss | Inject via network conditioner | Requests retry; final result correct | High |
| EDGE-NET-011 | Loss | 20% packet loss | Same | Some prompts fail with retry CTA; no silent loss | Medium |
| EDGE-NET-012 | Loss | 50% packet loss | Same | App degrades visibly; status chip shows network-degraded | Medium |
| EDGE-NET-013 | Loss | 100% loss for 5s then recover | Inject brief outage | Pending request recovers OR fails with clean retry | Medium |
| EDGE-NET-014 | Captive | Captive portal redirects /api/health | Mock 302 to captive portal | App detects portal (non-JSON response); shows "connect to network" guidance | High |
| EDGE-NET-015 | Captive | Captive portal mid-session after success | Mock portal triggered mid-use | First failed call surfaces actionable message | High |
| EDGE-NET-016 | Captive | Captive portal sends HTML for JSON request | Same | JSON.parse fails handled, not unhandled exception | Medium |
| EDGE-NET-017 | Proxy | Corporate proxy with TLS inspection | Test with proxy intercepting TLS | NODE_EXTRA_CA_CERTS guidance shown if cert chain fails | High |
| EDGE-NET-018 | Proxy | Proxy auto-config script (PAC) | Use PAC file routing /api/* differently | Requests still reach proxy | Medium |
| EDGE-NET-019 | Proxy | Authenticated proxy requiring NTLM | Test behind NTLM proxy | Browser handles auth; app does not hang | Medium |
| EDGE-NET-020 | Proxy | Proxy stripping certain headers | Strip `X-Profile-Name` | Backend returns clear error about missing profile; UI surfaces it | High |
| EDGE-NET-021 | VPN | VPN switch mid-query | Disconnect+reconnect VPN during pending query | Query times out; on reconnect retry succeeds | Medium |
| EDGE-NET-022 | VPN | Split-tunnel VPN routing /api differently | Configure split tunnel | App still reaches proxy; no CORS error from routing change | Medium |
| EDGE-NET-023 | VPN | VPN MTU 1300 causing fragmentation | Test with low MTU | Large payloads still transferred; no silent truncation | Medium |
| EDGE-NET-024 | IPv6 | IPv6-only environment | Run in IPv6-only network | App reaches `127.0.0.1` (loopback works); cloud proxy reachable via AAAA record | Medium |
| EDGE-NET-025 | IPv6 | Happy-eyeballs IPv4/v6 race | Both available | App connects via fastest; no double-connect attempt visible to user | Low |
| EDGE-NET-026 | IPv6 | IPv6 link-local for local dev | Use `[::1]:5173` | App loads correctly | Low |
| EDGE-NET-027 | HTTP | HTTP/1.1 fallback when HTTP/2 unavailable | Force HTTP/1.1 on proxy | App still works; multiplexing absent but functional | Low |
| EDGE-NET-028 | HTTP | HTTP/2 server push | Verify server pushes critical CSS | If implemented, manifest accurate; if not, no error | Low |
| EDGE-NET-029 | HTTP | HTTP/3 (QUIC) if proxy supports | Test against HTTP/3 endpoint | App reaches proxy; performance metrics improved | Low |
| EDGE-NET-030 | HTTP | Connection reuse after server shutdown | Send request after proxy restarts | Request fails cleanly; new connection established on retry | Medium |
| EDGE-NET-031 | SW | Service worker offline cache stale | Load with stale cached assets | SKIP_WAITING flow updates SW; user sees update prompt | Medium |
| EDGE-NET-032 | SW | Service worker bypassed on Shift+Reload | Shift+Refresh | Network requests bypass SW; latest assets fetched | Low |
| EDGE-NET-033 | SW | Service worker unregistered mid-session | Manually unregister via DevTools | Subsequent requests fall through to network; no error | Low |
| EDGE-NET-034 | SW | Service worker quota exceeded | Fill cache to quota | SW evicts oldest; functional cache maintained | Medium |
| EDGE-NET-035 | SW | Service worker installation failure | Inject install error | App still loads via network; no infinite loop | Medium |
| EDGE-NET-036 | CDN | CDN edge cache hit vs miss | Compare cold and warm asset fetches | TTFB difference observable; cache headers respected | Low |
| EDGE-NET-037 | CDN | CDN edge node selection (geo) | Test from different geos | Latency adjusts; no broken assets | Low |
| EDGE-NET-038 | CDN | CDN serves stale-while-revalidate | Force stale | App receives stale immediately, fresh in background | Low |
| EDGE-NET-039 | CDN | CDN error 502 on asset | Inject 502 for one JS chunk | App shows "failed to load module" with retry | Medium |
| EDGE-NET-040 | CDN | CDN cache key includes Vary headers | Test with different Accept-Encoding | Correct variant served; no cross-pollution | Low |
| EDGE-NET-041 | CORS | OPTIONS preflight returns 4xx | Mock 405 on OPTIONS to /api/* | Browser console logs; UI shows "configuration error" | High |
| EDGE-NET-042 | CORS | OPTIONS unanswered (timeout) | Mock long-stall on OPTIONS | Request times out; UI shows clear error | High |
| EDGE-NET-043 | CORS | Allowed-Origin mismatch | Proxy returns wrong Allow-Origin | Browser blocks; UI surfaces "CORS misconfiguration" | High |
| EDGE-NET-044 | CORS | Allow-Headers missing X-Profile-Name | Strip header from CORS response | Request blocked; UI hints at proxy CORS config | High |
| EDGE-NET-045 | CORS | Allow-Credentials with wildcard origin | Misconfigured proxy | Browser blocks; tooltip in console explains | Medium |
| EDGE-NET-046 | CORS | Cross-origin frame postMessage with restrictive origin | BIPanel postMessage to wrong origin | Adapter logs and drops; no event delivered | Medium |
| EDGE-NET-047 | CORS | Cross-origin iframe blocked by COOP/COEP | Set strict COOP/COEP on host | Embed adapters still work or fail with clear message | Medium |
| EDGE-NET-048 | Encoding | gzip vs br negotiation | Test with Accept-Encoding `br,gzip` | Server picks br; decompression succeeds | Low |
| EDGE-NET-049 | Encoding | Identity encoding when others rejected | Accept-Encoding `identity` | Server responds uncompressed; payload larger but parsable | Low |
| EDGE-NET-050 | Encoding | Server sends Content-Encoding: br but body is gzip | Mock corrupt encoding | Decompression error logged; UI shows "response corrupted" | High |
| EDGE-NET-051 | Encoding | Chunked transfer encoding edge | Stream chunked /assistant/stream | All chunks assembled; no early termination | Medium |
| EDGE-NET-052 | Encoding | Final empty chunk missing | Mock stream without terminator | Detected as broken; UI shows error | Medium |
| EDGE-NET-053 | Encoding | trailer headers in chunked response | Include `Trailer: X-Foo` | Parsed without breaking response | Low |
| EDGE-NET-054 | Encoding | Mismatched Content-Length on non-chunked | Server lies about length | Browser closes connection; UI handles error | Medium |
| EDGE-NET-055 | TLS | Self-signed cert on proxy | Visit https proxy with self-signed cert | Browser warning; UI degrades gracefully | Medium |
| EDGE-NET-056 | TLS | Expired cert on proxy | Mock expired cert | Browser blocks; UI shows "cannot reach proxy" | High |
| EDGE-NET-057 | TLS | Wrong cert CN | Cert CN mismatch | Browser blocks; UI surfaces error | High |
| EDGE-NET-058 | TLS | Mixed-content block (HTTP image in HTTPS page) | Embed HTTP image | Browser blocks; image shows fallback alt | Medium |
| EDGE-NET-059 | TLS | TLS 1.0 forced by server | Proxy only supports TLS 1.0 | Modern browser refuses; UI shows clear error | Medium |
| EDGE-NET-060 | TLS | HSTS preload behavior | Hit HTTP URL after HTTPS visit | Browser auto-upgrades; no broken redirect loop | Low |
| EDGE-NET-061 | DNS | DNS resolution failure | DNS lookup fails for proxy | UI shows "cannot resolve host"; retry option | High |
| EDGE-NET-062 | DNS | DNS-over-HTTPS impacting resolution | Enable DoH in browser | App reaches proxy; no breakage | Low |
| EDGE-NET-063 | DNS | Stale DNS cache (TTL expired) | After DNS change, before TTL | Fallback to retry; no perpetual failure | Low |
| EDGE-NET-064 | DNS | Multiple A records, first unreachable | Round-robin DNS | Client retries next IP; UI does not show error | Medium |
| EDGE-NET-065 | Time | NTP skew >5 minutes on client | Set system clock 10 min off | Embed token issuance handles skew OR fails with clear message | High |
| EDGE-NET-066 | Time | Server's `Date` header in future | Mock Date header +1 day | Request still succeeds; no signature failure | Medium |
| EDGE-NET-067 | Time | Clock skew between proxy and Databricks | Inject skew | Request still passes (within acceptable window) | Medium |
| EDGE-NET-068 | Headers | Server returns no Content-Type | Strip Content-Type | Client treats as text/plain OR octet-stream; no crash | Low |
| EDGE-NET-069 | Headers | Server returns Content-Type with no charset | `application/json` only | Defaults to UTF-8; correct parse | Low |
| EDGE-NET-070 | Headers | Server returns Content-Type with bogus charset | `application/json; charset=invalid` | Defaults to UTF-8 fallback | Low |
| EDGE-NET-071 | Headers | Response with conflicting Cache-Control | `no-store, max-age=3600` | Browser respects no-store (stricter); does not cache | Low |
| EDGE-NET-072 | Headers | Response with Cache-Control: private vs public | Tests private not shared by CDN | Verified via test CDN | Low |
| EDGE-NET-073 | Headers | Vary: * — no caching | Verify Vary handling | Browser does not reuse cache | Low |
| EDGE-NET-074 | Headers | X-Frame-Options: DENY on embed URL | Try to embed denied URL | Browser blocks; UI shows fallback | High |
| EDGE-NET-075 | Headers | CSP frame-src wildcard mismatch | Misconfigure CSP | Embed blocked; UI shows "embed blocked by CSP" | High |
| EDGE-NET-076 | Headers | Permissions-Policy: clipboard restricted | Disable clipboard | Copy-to-clipboard button shows fallback | Medium |
| EDGE-NET-077 | Network | Browser back during in-flight request | Click back while request pending | Request cancels cleanly; no orphan handler | Medium |
| EDGE-NET-078 | Network | Service worker intercepts /api but offline | SW offline-cache for /api response | Stale cached response served with "offline" badge | Medium |
| EDGE-NET-079 | Network | Long-poll request timing out at 60s | Mock long-poll | Reconnects automatically | Medium |
| EDGE-NET-080 | Network | WebSocket fallback when HTTP/2 push fails | Future feature | If implemented, fallback works; if not, no error | Low |

---

## EDGE-BROWSER — Browser Diversity (80 scenarios)

Each row tests one specific browser+version+viewport combination. The action is "open /, set up Power BI + Genie, send a prompt, check chart renders" unless stated. Severity reflects PulsePlay's stated browser-support tier.

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-BROWSER-001 | Chrome | Chrome Stable latest on Windows | Run full setup + prompt | All flows work | High |
| EDGE-BROWSER-002 | Chrome | Chrome Beta on Windows | Same | All flows work; flag any new console warnings | Medium |
| EDGE-BROWSER-003 | Chrome | Chrome Canary on Windows | Same | Flag flag-gated features; core works | Low |
| EDGE-BROWSER-004 | Chrome | Chrome Stable on macOS | Same | All flows work | High |
| EDGE-BROWSER-005 | Chrome | Chrome Stable on Linux | Same | All flows work | High |
| EDGE-BROWSER-006 | Chrome | Chrome Stable on ChromeOS | Same | All flows work | Medium |
| EDGE-BROWSER-007 | Chrome | Chrome with 3rd-party cookies fully blocked | Same | OAuth flows that need 3p cookies use workaround OR clearly require allowlist | High |
| EDGE-BROWSER-008 | Chrome | Chrome with Memory Saver enabled | Same; leave tab idle 30 min | Tab discards; reload restores state | Medium |
| EDGE-BROWSER-009 | Chrome | Chrome Incognito | Same | localStorage scoped per-session; no leak across windows | High |
| EDGE-BROWSER-010 | Chrome | Chrome Guest profile | Same | App works; no profile pollution | Medium |
| EDGE-BROWSER-011 | Chrome | Chrome with "Block 3rd-party cookies" partial | Same | App works; PBI cookies allowed via explicit allowlist | Medium |
| EDGE-BROWSER-012 | Edge | Edge Stable on Windows | Full flow | All works | High |
| EDGE-BROWSER-013 | Edge | Edge Stable on macOS | Same | All works | Medium |
| EDGE-BROWSER-014 | Edge | Edge with Tracking Prevention "Strict" | Same | App works; tracker-shaped subresources may be blocked | High |
| EDGE-BROWSER-015 | Edge | Edge with SmartScreen high | Same | No false-positive block on dev server | Low |
| EDGE-BROWSER-016 | Edge | Edge IE Mode | Open `/` in IE mode | App refuses to render (legacy) OR shows clear "modern browser required" | Medium |
| EDGE-BROWSER-017 | Firefox | Firefox Stable on Windows | Full flow | All works | High |
| EDGE-BROWSER-018 | Firefox | Firefox Stable on macOS | Same | All works | Medium |
| EDGE-BROWSER-019 | Firefox | Firefox Stable on Linux | Same | All works | High |
| EDGE-BROWSER-020 | Firefox | Firefox ESR (older release) | Same | Core works; modern APIs degrade gracefully | Medium |
| EDGE-BROWSER-021 | Firefox | Firefox Nightly | Same | Core works | Low |
| EDGE-BROWSER-022 | Firefox | Firefox with Enhanced Tracking Protection "Strict" | Same | App works; flag any blocked subresources | High |
| EDGE-BROWSER-023 | Firefox | Firefox Private Window | Same | localStorage scoped; no leak | High |
| EDGE-BROWSER-024 | Firefox | Firefox with `resistFingerprinting` enabled | Same | App works; timezone+screen dimensions may be spoofed | Medium |
| EDGE-BROWSER-025 | Firefox | Firefox with `dom.storage.next_gen` enabled | Same | LocalStorage round-trip works | Low |
| EDGE-BROWSER-026 | Firefox | Firefox containerized tabs | Open in different containers | Each container isolated; settings do not leak across | Medium |
| EDGE-BROWSER-027 | Safari | Safari 17 on macOS Sonoma | Full flow | All works | High |
| EDGE-BROWSER-028 | Safari | Safari 16 on macOS Ventura | Same | Core works; CSS `:has()` falls back if not supported | High |
| EDGE-BROWSER-029 | Safari | Safari 15 on macOS Monterey | Same | Core works; document degradations | Medium |
| EDGE-BROWSER-030 | Safari | Safari TP (Technology Preview) | Same | Core works | Low |
| EDGE-BROWSER-031 | Safari | Safari with ITP (Intelligent Tracking Prevention) | Same | App works; PBI 3rd-party cookies handled via popup OAuth | High |
| EDGE-BROWSER-032 | Safari | Safari Private Browsing | Same | localStorage scoped; quota smaller (5MB) | High |
| EDGE-BROWSER-033 | Safari | Safari on iPadOS 17 | Same | Touch interactions work; mobile layout if applicable | High |
| EDGE-BROWSER-034 | Safari | Safari on iPhone 14 (iOS 17) | Same | Mobile layout; touch targets ≥44pt | High |
| EDGE-BROWSER-035 | Safari | Safari iOS Lockdown Mode | Same | Core works; some JIT-dependent code slower | Medium |
| EDGE-BROWSER-036 | Brave | Brave with Shields Up (Standard) | Same | App works; no tracker subresources blocked | Medium |
| EDGE-BROWSER-037 | Brave | Brave with Shields Aggressive | Same | App works; flag any blocked CDN URL | Medium |
| EDGE-BROWSER-038 | Brave | Brave with WebRTC fingerprinting disabled | Same | App works; future WebRTC features degrade clearly | Low |
| EDGE-BROWSER-039 | Vivaldi | Vivaldi latest stable | Same | All works (Chromium-based) | Low |
| EDGE-BROWSER-040 | Opera | Opera latest stable | Same | All works | Low |
| EDGE-BROWSER-041 | DuckDuckGo | DuckDuckGo browser desktop | Same | App works; tracker blocking benign | Low |
| EDGE-BROWSER-042 | Tor | Tor Browser (Firefox-based) | Same | App works at Standard security; degrades at Safest (no JS) | Low |
| EDGE-BROWSER-043 | CEF | Chromium Embedded Framework host | Embed PulsePlay in CEF wrapper | App loads; flag any required permissions | Low |
| EDGE-BROWSER-044 | Electron | Inside Electron app | Embed PulsePlay | App loads; nodeIntegration off respected | Low |
| EDGE-BROWSER-045 | Viewport | 375x667 (iPhone SE) | Full flow | Mobile layout; readable; no horizontal scroll | High |
| EDGE-BROWSER-046 | Viewport | 414x896 (iPhone XR) | Same | Same | High |
| EDGE-BROWSER-047 | Viewport | 360x640 (Android small) | Same | Same | High |
| EDGE-BROWSER-048 | Viewport | 768x1024 (iPad portrait) | Same | Tablet layout | High |
| EDGE-BROWSER-049 | Viewport | 1024x768 (iPad landscape) | Same | Tablet layout | Medium |
| EDGE-BROWSER-050 | Viewport | 1280x800 (small laptop) | Same | Desktop layout | High |
| EDGE-BROWSER-051 | Viewport | 1920x1080 (full HD) | Same | Desktop layout | High |
| EDGE-BROWSER-052 | Viewport | 2560x1440 (1440p) | Same | Desktop layout; no over-stretch | Medium |
| EDGE-BROWSER-053 | Viewport | 3840x2160 (4K) | Same | Layout uses max-width; no whitespace explosion | Low |
| EDGE-BROWSER-054 | Viewport | 1366x768 (legacy laptop) | Same | Desktop layout fits | High |
| EDGE-BROWSER-055 | Viewport | Foldable Galaxy Z Fold open (768x884) | Same | Layout adapts; no broken split | Low |
| EDGE-BROWSER-056 | Viewport | Foldable Galaxy Z Fold closed (374x884) | Same | Mobile layout | Low |
| EDGE-BROWSER-057 | Viewport | Surface Duo dual-screen | Open across two screens | App stays single-pane OR uses CSS spanning if implemented | Low |
| EDGE-BROWSER-058 | Touch | Chromebook in tablet mode | Touch interactions | Tap, swipe, pinch-zoom work | Medium |
| EDGE-BROWSER-059 | Touch | Surface Pro touch + pen | Pen input | Pen works as mouse; hover preserved | Medium |
| EDGE-BROWSER-060 | Touch | iPad with Apple Pencil | Pen input | Same | Low |
| EDGE-BROWSER-061 | DPI | Windows 100% DPI | Same | Sharp rendering | High |
| EDGE-BROWSER-062 | DPI | Windows 125% DPI | Same | Layout intact; no clipped text | High |
| EDGE-BROWSER-063 | DPI | Windows 150% DPI | Same | Layout intact | High |
| EDGE-BROWSER-064 | DPI | Windows 175% DPI | Same | Layout intact | Medium |
| EDGE-BROWSER-065 | DPI | Windows 200% DPI | Same | Layout intact | Medium |
| EDGE-BROWSER-066 | DPI | Windows 250% DPI | Same | Layout intact | Low |
| EDGE-BROWSER-067 | DPI | macOS Retina @2x | Same | Sharp text and SVG | High |
| EDGE-BROWSER-068 | DPI | macOS Retina @3x (XDR) | Same | Sharp text and SVG | Medium |
| EDGE-BROWSER-069 | DPI | Linux X11 with HiDPI scaling | Same | Layout intact | Medium |
| EDGE-BROWSER-070 | DPI | Linux Wayland with fractional scaling 1.5x | Same | Layout intact | Low |
| EDGE-BROWSER-071 | OS | Windows 10 latest | Full flow | All works | High |
| EDGE-BROWSER-072 | OS | Windows 11 24H2 | Same | All works | High |
| EDGE-BROWSER-073 | OS | macOS Sonoma | Same | All works | High |
| EDGE-BROWSER-074 | OS | macOS Ventura | Same | All works | Medium |
| EDGE-BROWSER-075 | OS | Ubuntu 24.04 LTS | Same | All works | Medium |
| EDGE-BROWSER-076 | OS | Fedora 40 | Same | All works | Low |
| EDGE-BROWSER-077 | OS | ChromeOS Flex on older hardware | Same | App loads; perf may be lower | Low |
| EDGE-BROWSER-078 | Mobile | Android 14 Chrome | Same | Mobile layout | High |
| EDGE-BROWSER-079 | Mobile | Android 13 Samsung Internet | Same | Mobile layout | Medium |
| EDGE-BROWSER-080 | Mobile | iOS 17 Safari with reduced motion enabled | Same | Animations disabled | Medium |

---

## EDGE-PRIVACY — Privacy Mode + Storage Partitioning (50 scenarios)

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-PRIVACY-001 | Incognito | Chrome Incognito first load | Open `/` in Incognito | FirstRunWizard shows; localStorage works for session | High |
| EDGE-PRIVACY-002 | Incognito | Chrome Incognito close+reopen | Set up then close all Incognito windows | All localStorage cleared; wizard re-shows on next open | High |
| EDGE-PRIVACY-003 | Incognito | Firefox Private Window same | Same as 001 | Same behavior | High |
| EDGE-PRIVACY-004 | Incognito | Safari Private Browsing same | Same | Same; quota smaller | High |
| EDGE-PRIVACY-005 | Incognito | Edge InPrivate same | Same | Same | Medium |
| EDGE-PRIVACY-006 | Incognito | Cross-tab in same Incognito window | Tab A and Tab B share session | localStorage shared between tabs; closed both = data gone | Medium |
| EDGE-PRIVACY-007 | Incognito | Two separate Incognito windows | Window 1 vs Window 2 | Isolated; no shared storage | Medium |
| EDGE-PRIVACY-008 | Storage | localStorage in Private — quota exceeded | Try to write >5MB | Save fails; UI surfaces "storage quota exceeded" | High |
| EDGE-PRIVACY-009 | Storage | localStorage disabled (DOMException) | Block via DevTools | App degrades to memory-only; settings reset on reload, no crash | High |
| EDGE-PRIVACY-010 | Storage | sessionStorage disabled | Same | App still works; wizard state may be partially lost gracefully | Medium |
| EDGE-PRIVACY-011 | Storage | IndexedDB disabled | Block via DevTools | KB join falls back OR shows "feature requires IndexedDB" | High |
| EDGE-PRIVACY-012 | Storage | Cookies blocked entirely | Block all cookies | Cookie-dependent flows (OAuth) show clear "enable cookies" guidance | High |
| EDGE-PRIVACY-013 | Storage | First-party cookies allowed, 3rd-party blocked | Standard modern default | App works; OAuth popups use first-party storage | High |
| EDGE-PRIVACY-014 | Storage | Cookie partitioning (CHIPS) | Test with partitioned cookies | App works in partition; no cross-site leak | Medium |
| EDGE-PRIVACY-015 | Storage | Storage Access API prompt | OAuth flow triggers SAA | Prompt appears once; subsequent visits silent | Medium |
| EDGE-PRIVACY-016 | Storage | Storage partitioned by top-frame origin | Embedded iframe same origin different top frame | Storage isolated per top-frame; no leak | Medium |
| EDGE-PRIVACY-017 | Storage | Storage cleared by browser at session end | Set "Clear on exit" in browser | All settings gone on restart; wizard re-shows | Medium |
| EDGE-PRIVACY-018 | Storage | Quota exceeded mid-write | Fill quota then save | Partial-write detected; rollback to prior snapshot; UI warns | High |
| EDGE-PRIVACY-019 | Cache | Disable browser cache via DevTools | Reload | App re-downloads assets; no broken state | Medium |
| EDGE-PRIVACY-020 | Cache | Cache disabled + offline | DevTools cache disabled + offline | Clear "you appear offline" with retry | Medium |
| EDGE-PRIVACY-021 | SW | Service Worker disabled in Private mode | Test in Private | App functional without SW; perf lower | Medium |
| EDGE-PRIVACY-022 | SW | Service Worker registration blocked | Block via flag | App falls back to non-SW flow | Medium |
| EDGE-PRIVACY-023 | 3PC | Third-party cookies blocked (Chrome 2024+) | Default Chrome behavior | App works; PBI OAuth handled via redirect (not popup) | High |
| EDGE-PRIVACY-024 | 3PC | Third-party cookies allowed | Same | App works | Medium |
| EDGE-PRIVACY-025 | 3PC | 3rd-party cookies allowed but iframe sandbox blocks Storage | Test sandbox combo | App works; flag clear in console | Medium |
| EDGE-PRIVACY-026 | Tracking | "Do Not Track" header sent | Enable DNT in browser | App respects (no analytics) OR logs decision in console | Medium |
| EDGE-PRIVACY-027 | Tracking | Global Privacy Control header sent | Enable GPC | App respects (no analytics) | Medium |
| EDGE-PRIVACY-028 | Tracking | Tracking-protection blocks analytics URL | Block analytics endpoint | App functional; no console error | Medium |
| EDGE-PRIVACY-029 | Tracking | Tracking-protection blocks GeoIP service | Block geo lookup | App functional with default locale | Low |
| EDGE-PRIVACY-030 | Tracking | uBlock Origin blocks ads/trackers | With uBlock active | App functional | Medium |
| EDGE-PRIVACY-031 | Tracking | Ghostery enabled | With Ghostery | App functional | Low |
| EDGE-PRIVACY-032 | Tracking | Privacy Badger learning mode | With PB | App functional; PB doesn't break critical assets | Low |
| EDGE-PRIVACY-033 | Tracking | DuckDuckGo Privacy Essentials | With DDG ext | App functional | Low |
| EDGE-PRIVACY-034 | Tracking | NoScript blocking JS | With NoScript | App requires JS; clear noscript fallback message | Medium |
| EDGE-PRIVACY-035 | Floc | FLoC opt-out via Permissions-Policy | Set `Permissions-Policy: interest-cohort=()` | Response includes header; verified via DevTools | Low |
| EDGE-PRIVACY-036 | Topics | Topics API opt-out | Same via header | Verified | Low |
| EDGE-PRIVACY-037 | Topics | User opts out of Topics API | Browser setting | App not affected | Low |
| EDGE-PRIVACY-038 | Storage | Clear-Site-Data header response | Mock Clear-Site-Data response from proxy | Browser clears localStorage; wizard re-shows | Medium |
| EDGE-PRIVACY-039 | Storage | Persistent storage permission request | Request via `navigator.storage.persist()` | Browser prompts; on grant, eviction-resistant | Low |
| EDGE-PRIVACY-040 | Storage | Storage Pressure event triggered | Fill near quota | UI listens for pressure event; cleans old query history | Medium |
| EDGE-PRIVACY-041 | Storage | OPFS (Origin Private File System) unavailable | Block OPFS | DuckDB falls back to in-memory; warning shown | Medium |
| EDGE-PRIVACY-042 | Storage | LocalStorage in private mode with smaller quota | Quota 5MB instead of 10MB | App detects quota; warns user before save | Medium |
| EDGE-PRIVACY-043 | Privacy | Brave's farbling (canvas fingerprint randomization) | With Brave Aggressive | Charts (canvas) still readable; SVG fallback if used | Low |
| EDGE-PRIVACY-044 | Privacy | WebRTC IP leak prevention | With Brave/Firefox protection | No leak; voice features (if any) still work | Low |
| EDGE-PRIVACY-045 | Privacy | Battery API blocked in private mode | Test battery-aware features | Feature falls back gracefully (no UI break) | Low |
| EDGE-PRIVACY-046 | Privacy | Permissions API for clipboard blocked | Deny clipboard | Copy buttons show "permission required" | Medium |
| EDGE-PRIVACY-047 | Privacy | Geolocation permission denied | Deny geo | App doesn't request unless feature explicitly needs it | Low |
| EDGE-PRIVACY-048 | Privacy | Notification permission denied | Deny | No nag; opt-in only | Low |
| EDGE-PRIVACY-049 | Privacy | Camera/mic permission denied | Deny | Voice features (if any) show "enable mic" CTA | Low |
| EDGE-PRIVACY-050 | Privacy | Document.referrer stripped by browser | strict-origin-when-cross-origin policy | App doesn't rely on referrer; auth works | Low |

---

## EDGE-TIME — Time + Locale (60 scenarios)

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-TIME-001 | TZ | Browser timezone America/Los_Angeles | Submit time-aware prompt | Times shown in PT; proxy receives ISO 8601 UTC | High |
| EDGE-TIME-002 | TZ | Browser timezone Asia/Tokyo | Same | Times shown in JST | High |
| EDGE-TIME-003 | TZ | Browser timezone Asia/Kolkata (UTC+5:30) | Same | Half-hour offset handled | High |
| EDGE-TIME-004 | TZ | Browser timezone Asia/Kathmandu (UTC+5:45) | Same | Quarter-hour offset handled | Medium |
| EDGE-TIME-005 | TZ | Browser timezone Pacific/Chatham (UTC+12:45) | Same | Handled | Low |
| EDGE-TIME-006 | TZ | UTC timezone | Same | No conversion; ISO 8601 displayed | Medium |
| EDGE-TIME-007 | TZ | UTC-12 (Baker Island) | Same | Negative offset handled | Low |
| EDGE-TIME-008 | TZ | UTC+14 (Kiribati) | Same | Max positive offset handled | Low |
| EDGE-TIME-009 | TZ | Timezone changed mid-session | Change OS timezone, wait, then submit | App updates display OR shows "timezone change detected, reload" | Medium |
| EDGE-TIME-010 | TZ | Time zone with deprecated abbreviation (EST vs America/New_York) | Use ambiguous string | App uses IANA name; no ambiguous abbreviation rendering | Medium |
| EDGE-TIME-011 | DST | DST spring forward (March, US) | Set clock to 02:00 → 03:00 jump | Times around 02:00-03:00 don't show ghost values | High |
| EDGE-TIME-012 | DST | DST fall back (November, US) | Set clock 02:00 → 01:00 repeat | Duplicate hour shown with disambiguation OR via UTC | High |
| EDGE-TIME-013 | DST | DST transitions in Southern Hemisphere | AU/NZ DST | Reversed transitions handled correctly | Medium |
| EDGE-TIME-014 | DST | Permanent DST (Arizona, Saskatchewan) | No DST | No phantom switches | Medium |
| EDGE-TIME-015 | DST | Historical DST data | Date 1995 in Europe | Old DST rules applied correctly via Intl | Low |
| EDGE-TIME-016 | Leap | Feb 29 in leap year (2024) | Submit query for "this day last year" on Feb 29, 2024 | Returns Feb 28, 2023 (no crash) | High |
| EDGE-TIME-017 | Leap | Feb 29 on non-leap year input | User picks Feb 29, 2025 (invalid) | Rejected with clear error | Medium |
| EDGE-TIME-018 | Leap | Feb 29 calculation across year boundaries | Date arithmetic spanning leap year | Correct count of days | Medium |
| EDGE-TIME-019 | Leap | Year 2100 (not a leap year despite divisibility) | Test calendar | Correctly NOT a leap year | Low |
| EDGE-TIME-020 | Leap | Year 2000 (was a leap year) | Test | Correctly IS a leap year | Low |
| EDGE-TIME-021 | Leap | Leap second (rare) | Mock leap second insertion | App does not crash | Low |
| EDGE-TIME-022 | Y2K38 | Date past 2038-01-19 03:14:07 UTC | Use date 2039-01-01 | App handles (JS Date is 64-bit, but watch backend SQL int) | High |
| EDGE-TIME-023 | Y2K38 | SQL TIMESTAMP overflow | Query with date 2039 | Genie returns proper timestamp; no truncation | High |
| EDGE-TIME-024 | Y2K38 | Backend uses signed 32-bit somewhere | Audit code path | If any usage, flagged; otherwise N/A | Critical |
| EDGE-TIME-025 | Epoch | Negative epoch (date < 1970) | Submit 1969-12-31 | App accepts; SQL handles | Medium |
| EDGE-TIME-026 | Epoch | Date BC (year -100) | Try in date field | Either rejected with clear message OR handled | Low |
| EDGE-TIME-027 | Epoch | Date year 9999 | Submit | Handled; no overflow | Low |
| EDGE-TIME-028 | Epoch | Date year 10000+ | Submit | Either rejected (out of range) OR handled | Low |
| EDGE-TIME-029 | Epoch | Date year 0 (no year zero exists) | Submit | Rejected with clear error | Low |
| EDGE-TIME-030 | Locale | Date parsing in en-US (MM/DD/YYYY) | Type `05/13/2026` | Parsed as May 13 | High |
| EDGE-TIME-031 | Locale | Date parsing in en-GB (DD/MM/YYYY) | Type `13/05/2026` | Parsed as May 13 | High |
| EDGE-TIME-032 | Locale | Date parsing in de-DE (DD.MM.YYYY) | Type `13.05.2026` | Parsed correctly OR rejected with format hint | Medium |
| EDGE-TIME-033 | Locale | Date parsing in ja-JP (YYYY/MM/DD) | Type `2026/05/13` | Parsed correctly | Medium |
| EDGE-TIME-034 | Locale | Date parsing in fa-IR (Persian calendar) | Type `1405/02/30` | Either converted to Gregorian OR rejected | Low |
| EDGE-TIME-035 | Calendar | Hijri calendar input | Type `1447/10/24` (Hijri) | Either converted OR rejected with clear message | Low |
| EDGE-TIME-036 | Calendar | Hebrew calendar input | Type `5786/02/30` | Same | Low |
| EDGE-TIME-037 | Calendar | Buddhist calendar input (Thai) | Type `2569/05/19` | Same | Low |
| EDGE-TIME-038 | Calendar | Japanese era (Reiwa 8) | Type `R08/05/19` | Either converted OR rejected | Low |
| EDGE-TIME-039 | Weekday | Business hours edge (Friday 17:00 in PT) | Submit "yesterday vs today" Saturday morning | Correctly identifies Friday as yesterday | Medium |
| EDGE-TIME-040 | Weekday | Weekend rolling for business metrics | Run on Saturday | "Last business day" returns Friday | Medium |
| EDGE-TIME-041 | Weekday | Week start in en-US (Sunday) vs ISO (Monday) | Submit "this week" | UI clearly indicates which week start used | Medium |
| EDGE-TIME-042 | Weekday | Week start in ar-SA (Saturday) | Same | Localized correctly | Low |
| EDGE-TIME-043 | UTC | UTC display vs local toggle | User toggles | Both render correct value; no drift | Medium |
| EDGE-TIME-044 | UTC | Server returns UTC, client displays local | Default flow | Client converts via Intl.DateTimeFormat | High |
| EDGE-TIME-045 | UTC | Round-trip UTC→local→UTC | Set value, save, reload | Same UTC value in storage | High |
| EDGE-TIME-046 | ISO | ISO 8601 with milliseconds | `2026-05-19T12:34:56.789Z` | Parsed correctly | Medium |
| EDGE-TIME-047 | ISO | ISO 8601 with microseconds | `2026-05-19T12:34:56.789012Z` | Either parsed (truncate to ms) OR rejected | Low |
| EDGE-TIME-048 | ISO | ISO 8601 with nanoseconds | `2026-05-19T12:34:56.789012345Z` | Same | Low |
| EDGE-TIME-049 | ISO | ISO 8601 with offset `+05:30` | `2026-05-19T12:34:56+05:30` | Parsed correctly | Medium |
| EDGE-TIME-050 | ISO | ISO 8601 with offset `-12:00` | Same | Same | Low |
| EDGE-TIME-051 | ISO | ISO 8601 without `T` separator | `2026-05-19 12:34:56` | Either parsed OR rejected | Low |
| EDGE-TIME-052 | ISO | ISO 8601 with `Z` instead of `+00:00` | `2026-05-19T12:34:56Z` | Parsed correctly | Medium |
| EDGE-TIME-053 | ISO | Just date (no time) | `2026-05-19` | Treated as midnight local OR midnight UTC consistently | Medium |
| EDGE-TIME-054 | Rel | "30 days ago" computation across DST | Submit | Correct (uses days, not 24-hour periods) | Medium |
| EDGE-TIME-055 | Rel | "1 month ago" from March 31 | Submit | Either Feb 28/29 OR clear convention; consistent | Medium |
| EDGE-TIME-056 | Rel | "1 year ago" from Feb 29 | Submit on leap day | Returns Feb 28 of previous year | Medium |
| EDGE-TIME-057 | Rel | "Next business day" across holiday | Calendar with holidays | Skips configured holidays | Low |
| EDGE-TIME-058 | Format | 12-hour vs 24-hour preference | Toggle in OS/browser | UI respects | Low |
| EDGE-TIME-059 | Format | First day of week preference | Toggle in OS | Calendar reflects | Low |
| EDGE-TIME-060 | Format | Date format short/medium/long | Use Intl.DateTimeFormat | All variations render correctly | Low |

---

## EDGE-FORM — Form Validation Extremes (70 scenarios)

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-FORM-001 | Paste | 10MB plaintext into prompt textarea | Paste 10MB string | App truncates with warning OR rejects clearly; tab does not freeze >2s | High |
| EDGE-FORM-002 | Paste | 100MB paste attempt | Same | Rejected before render; clear message | High |
| EDGE-FORM-003 | Paste | Paste HTML-formatted text from Word | Copy Word doc, paste | Either stripped to plaintext (preferred) OR sanitized | High |
| EDGE-FORM-004 | Paste | Paste rich text with images | From document with image | Images discarded; text preserved | Medium |
| EDGE-FORM-005 | Paste | Paste from clipboard with mixed-encoding | Paste from terminal with mixed encodings | Coerced to valid UTF-8; no `?` characters | Medium |
| EDGE-FORM-006 | Paste | Paste of 50 newlines | Paste many `\n\n\n` | Preserved if multi-line; coerced to single line if single-line input | Low |
| EDGE-FORM-007 | Paste | Paste with non-printable control characters | Paste includes U+0007 (bell), U+001B (esc) | Stripped or shown as visible glyph; no terminal escape interpretation | Medium |
| EDGE-FORM-008 | Paste | Paste includes null byte U+0000 | Paste `Hello World` | Either stripped OR rejected; never silently truncates string | High |
| EDGE-FORM-009 | Paste | Paste binary data accidentally | Paste from binary file copy | Either rejected OR shows mojibake without crash | Medium |
| EDGE-FORM-010 | Paste | Paste markdown into prompt | Paste Markdown blob | Submitted verbatim (no auto-render in prompt input) | Low |
| EDGE-FORM-011 | Control | Ctrl+A in prompt field | Focus field, Ctrl+A | Selects all field text (not page) | Medium |
| EDGE-FORM-012 | Control | Ctrl+C in prompt field | Select + Ctrl+C | Copies to clipboard | Medium |
| EDGE-FORM-013 | Control | Ctrl+V (paste plain) | Paste with Ctrl+V | Plain paste | Medium |
| EDGE-FORM-014 | Control | Ctrl+Shift+V (paste with formatting) | Same | Plain paste (PulsePlay defaults to plain) | Low |
| EDGE-FORM-015 | Control | Ctrl+Z undo in prompt | Type, undo | Undo restores prior text | Medium |
| EDGE-FORM-016 | Control | Ctrl+Y redo | Undo, redo | Redo restores | Low |
| EDGE-FORM-017 | Control | Ctrl+End / Ctrl+Home | In prompt | Jump to end/start | Low |
| EDGE-FORM-018 | Control | Ctrl+Backspace deletes word | In prompt | Deletes one word at a time | Low |
| EDGE-FORM-019 | Special | Tab + newline in single-line input | Paste `\t\n` into single-line field | Coerced to spaces OR rejected; never injects newline | Medium |
| EDGE-FORM-020 | Special | Embedded BOM at start of text input | Paste `﻿Hello` | Either stripped OR preserved consistently | Low |
| EDGE-FORM-021 | Special | Right-to-left override in URL field | Paste URL with U+202E | Either stripped OR shown raw; never silently reverses | High |
| EDGE-FORM-022 | Autofill | Password manager fills wrong field | Trigger PM autofill on prompt input | Detects + ignores OR shows clear "this is a prompt, not password" | Medium |
| EDGE-FORM-023 | Autofill | Browser autofill on email field | Wizard email field | Suggestion appears; values preserved on submit | Low |
| EDGE-FORM-024 | Autofill | Address book autofill into Embed URL | Browser tries to fill | Either rejected OR processed (since URL is free-form) | Low |
| EDGE-FORM-025 | Autofill | Autofill triggers `change` event | Verify React state updates | State updated via React onChange handler | Medium |
| EDGE-FORM-026 | Translate | Browser auto-translate rewrites button labels | Chrome offers translate Russian → English | Labels translated; clicks still work; underlying values unchanged | High |
| EDGE-FORM-027 | Translate | Auto-translate rewrites placeholders | Same | Placeholder visible only; doesn't pollute value | Medium |
| EDGE-FORM-028 | Translate | Auto-translate breaks React reconciliation | Translate then state update | App not stuck OR error visible | High |
| EDGE-FORM-029 | Translate | Set `translate="no"` on critical leaves | Verify code spans, brand names | Not translated | Medium |
| EDGE-FORM-030 | Numeric | Numeric field accepts `1e308` | Type | Either parsed as 1×10^308 OR rejected with "too large" | Medium |
| EDGE-FORM-031 | Numeric | Numeric field accepts `Infinity` | Type | Rejected | Medium |
| EDGE-FORM-032 | Numeric | Numeric field accepts `NaN` | Type | Rejected | Medium |
| EDGE-FORM-033 | Numeric | Numeric field accepts negative zero `-0` | Type | Stored as 0 OR -0 consistently | Low |
| EDGE-FORM-034 | Numeric | Numeric field accepts `1e-323` (subnormal) | Type | Handled OR rejected as too small | Low |
| EDGE-FORM-035 | Numeric | Numeric field with leading zeros `0001` | Type | Stored as 1 OR preserved as string consistently | Low |
| EDGE-FORM-036 | Numeric | Numeric field with `+1` prefix | Type | Accepted | Low |
| EDGE-FORM-037 | Numeric | Numeric field with hex `0x1F` | Type | Rejected (decimal expected) | Low |
| EDGE-FORM-038 | Numeric | Numeric field with binary `0b101` | Type | Rejected | Low |
| EDGE-FORM-039 | Numeric | Numeric field with thousand separators `1,234` | Type | Stripped to 1234 OR rejected with clear format | Medium |
| EDGE-FORM-040 | Numeric | Numeric field paste of "1234abc" | Paste | Either accepts 1234 OR rejects the whole | Low |
| EDGE-FORM-041 | Date | Date input `0000-01-01` | Type | Rejected (year 0 invalid) | Low |
| EDGE-FORM-042 | Date | Date input `9999-12-31` | Type | Accepted as max | Low |
| EDGE-FORM-043 | Date | Date input with time component | Type | Either accepted OR rejected based on field type | Low |
| EDGE-FORM-044 | Date | Date input invalid `2026-02-30` | Type | Rejected with clear error | Medium |
| EDGE-FORM-045 | Date | Date input `2026-13-01` (month 13) | Type | Rejected | Medium |
| EDGE-FORM-046 | URL | URL field with `javascript:void(0)` | Paste | Rejected with "javascript: scheme not allowed" | Critical |
| EDGE-FORM-047 | URL | URL field with `data:text/html,<script>` | Paste | Rejected | Critical |
| EDGE-FORM-048 | URL | URL field with `file:///etc/passwd` | Paste | Rejected | Critical |
| EDGE-FORM-049 | URL | URL with credentials `https://user:pass@example.com` | Paste | Either accepted (stripped of creds) OR rejected; never embedded as-is | High |
| EDGE-FORM-050 | URL | URL with IDN `xn--n3h.example.com` (☃) | Paste | Accepted; rendered as Punycode OR Unicode consistently | Medium |
| EDGE-FORM-051 | URL | URL with mixed-script (Cyrillic ‘а’ vs Latin ‘a’) | Paste lookalike | Either rejected as homoglyph OR shown clearly in Punycode | High |
| EDGE-FORM-052 | URL | URL with 64-char username (max?) | Paste | Accepted | Low |
| EDGE-FORM-053 | URL | URL with port 0 | Paste | Rejected | Low |
| EDGE-FORM-054 | URL | URL with port 65536 | Paste | Rejected | Low |
| EDGE-FORM-055 | URL | URL with massive query string (10KB) | Paste | Accepted; no truncation; warn if too large | Medium |
| EDGE-FORM-056 | URL | URL with hash fragment only `#section` | Paste in embed field | Rejected (not a full URL) | Medium |
| EDGE-FORM-057 | URL | URL with empty host `https:///path` | Paste | Rejected | Medium |
| EDGE-FORM-058 | URL | URL with no scheme | Paste `example.com/path` | Either accepted with https:// prepended OR rejected | Medium |
| EDGE-FORM-059 | Length | Single-line field with 10k chars | Paste | Accepted OR clearly truncated; no crash | Medium |
| EDGE-FORM-060 | Length | Select option with 1000-char label | Render | Truncates with ellipsis OR wraps; no break | Low |
| EDGE-FORM-061 | Length | Label that exceeds container width | Render | Wraps or truncates | Low |
| EDGE-FORM-062 | File | File picker accepts .json but user picks .exe | Use force-select | Rejected client-side; clear error | Medium |
| EDGE-FORM-063 | File | File picker with no file selected | Cancel picker | No-op; state unchanged | Low |
| EDGE-FORM-064 | File | File >10MB upload attempt | Pick large file | Either accepted OR rejected with clear size limit | Medium |
| EDGE-FORM-065 | File | File with no extension | Pick | Either accepted (sniff content-type) OR rejected | Medium |
| EDGE-FORM-066 | File | File with double extension `report.json.exe` | Pick | Detected via real content-type; clear handling | High |
| EDGE-FORM-067 | Validation | Form submit while field still validating async | Quick submit | Submit deferred until validation completes | Medium |
| EDGE-FORM-068 | Validation | Server validation contradicts client | Server returns 400 with field error | Field highlighted; error visible | High |
| EDGE-FORM-069 | Validation | Client-side validation regex catastrophic backtracking | Pathological input on regex field | Validation completes <100ms OR worker-based with timeout | High |
| EDGE-FORM-070 | Validation | Required field cleared just before submit | Clear then Enter | Submit blocked; error shown | Medium |

---

## EDGE-UI-STATE — UI State Corruption (80 scenarios)

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-UI-STATE-001 | Modal | Browser back button while FirstRunWizard open | Press back | Modal closes cleanly; URL updates; no orphan focus trap | Medium |
| EDGE-UI-STATE-002 | Modal | Browser forward after closing modal | Press forward | URL restored; modal does NOT re-open (one-way) | Low |
| EDGE-UI-STATE-003 | Modal | Refresh while modal open | F5 | Modal re-opens to step 1 OR draft step restored | Medium |
| EDGE-UI-STATE-004 | Modal | Open modal, navigate via deep-link in URL bar | Type new URL while modal open | Modal closes; nav succeeds | Low |
| EDGE-UI-STATE-005 | Modal | Esc closes modal | Press Esc inside wizard | Closes; focus returns to trigger element | Medium |
| EDGE-UI-STATE-006 | Modal | Two modals open via race | Programmatically open two | One renders or both stacked correctly; focus trap not broken | Medium |
| EDGE-UI-STATE-007 | Resize | Window resize during chart render | Drag edge mid-render | Chart re-fits final size; no stuck partial render | Medium |
| EDGE-UI-STATE-008 | Resize | Window resize during transition animation | Resize during page transition | Animation completes OR snaps to final; no half-state | Low |
| EDGE-UI-STATE-009 | Resize | Window resize across breakpoint | Drag from 1200→700px | Layout switches at breakpoint; no flash | Medium |
| EDGE-UI-STATE-010 | Resize | Window resize triggers content reflow | Same | Sidebar collapses/expands appropriately | Medium |
| EDGE-UI-STATE-011 | Resize | Browser zoom while typing | Cmd+= mid-type | Caret stays in correct position; no lost characters | Medium |
| EDGE-UI-STATE-012 | Tab | Tab switch during SSE stream | Switch tabs mid-stream | Stream pauses (background throttle) OR continues; resumes on focus | Medium |
| EDGE-UI-STATE-013 | Tab | Tab switch during fetch | Same | Fetch continues in background | Low |
| EDGE-UI-STATE-014 | Tab | Tab switch during chart animation | Same | Animation pauses; resumes on focus | Low |
| EDGE-UI-STATE-015 | Tab | Tab discard by Chrome Memory Saver | Discard manually | Reload restores state from sessionStorage | Medium |
| EDGE-UI-STATE-016 | Print | Print dialog during query | Cmd+P mid-query | Query continues; print preview shows current state | Low |
| EDGE-UI-STATE-017 | Print | Print page CSS | Print preview | Print stylesheet hides sidebar/chrome; charts render | Medium |
| EDGE-UI-STATE-018 | Print | Save as PDF via Print | Print → Save as PDF | PDF readable; layout sensible | Low |
| EDGE-UI-STATE-019 | DnD | Drag chart out of viewport (if draggable) | Drag chart | Drop handled OR cancelled gracefully | Low |
| EDGE-UI-STATE-020 | DnD | Drag-and-drop interrupted by Esc | Start drag, Esc | Drag cancels; original position restored | Low |
| EDGE-UI-STATE-021 | DnD | Drag-and-drop with browser back gesture | Trackpad swipe during drag | Back gesture prevented during active drag OR drag cancels first | Low |
| EDGE-UI-STATE-022 | DnD | File drop on non-drop area | Drop random file | No-op; no navigation to file | Medium |
| EDGE-UI-STATE-023 | DnD | File drop while modal blocking | Drop file with modal open | Either accepted by modal-aware target OR refused with feedback | Low |
| EDGE-UI-STATE-024 | Screen | Win+Shift+S snipping during input | Trigger Snip mid-type | App input not blocked; tool overlay above app | Low |
| EDGE-UI-STATE-025 | Screen | Print Screen capture | Take screenshot | App captured normally | Low |
| EDGE-UI-STATE-026 | Screen | Screen recording with cursor | Record screen | App renders normally; no overlays interfere | Low |
| EDGE-UI-STATE-027 | Ext | Browser extension injects content into prompt | Test with Grammarly | Prompt input still works; submit reads our state, not extension's | Medium |
| EDGE-UI-STATE-028 | Ext | LastPass autofill on URL field | Trigger | Handled per autofill rules | Low |
| EDGE-UI-STATE-029 | Ext | Extension rewrites DOM | React reconciler tolerates external mutation | Either gracefully recovers OR clear error | Medium |
| EDGE-UI-STATE-030 | Ext | Dark Reader extension active | Enable Dark Reader | Charts and text legible; PulsePlay's own dark theme not double-applied | Medium |
| EDGE-UI-STATE-031 | Ext | uBlock blocks an API call | Block specific endpoint | App degrades gracefully with clear message | Medium |
| EDGE-UI-STATE-032 | Zoom | Browser zoom 25% | Set zoom | Layout intact; readable | Low |
| EDGE-UI-STATE-033 | Zoom | Browser zoom 50% | Set zoom | Layout intact | Medium |
| EDGE-UI-STATE-034 | Zoom | Browser zoom 100% (default) | Default | Layout perfect | High |
| EDGE-UI-STATE-035 | Zoom | Browser zoom 150% | Set zoom | Layout intact; no clipped text | High |
| EDGE-UI-STATE-036 | Zoom | Browser zoom 200% | Set zoom | Layout intact | Medium |
| EDGE-UI-STATE-037 | Zoom | Browser zoom 400% | Set zoom | Layout still navigable (WCAG requires 400% support) | Medium |
| EDGE-UI-STATE-038 | Zoom | Browser zoom 500% | Set zoom | Some clipping acceptable; no functional break | Low |
| EDGE-UI-STATE-039 | Zoom | Text-only zoom (without page zoom) | Firefox text-only zoom | Layout intact | Medium |
| EDGE-UI-STATE-040 | FS | Full-screen mode mid-flow | F11 mid-query | Layout adapts; query continues | Low |
| EDGE-UI-STATE-041 | FS | Exit full-screen via Esc | Esc out of FS | Layout returns | Low |
| EDGE-UI-STATE-042 | FS | Programmatic full-screen on chart | Click "Fullscreen" on chart | Chart fills viewport; Esc exits | Medium |
| EDGE-UI-STATE-043 | Orient | Tablet orientation change (portrait → landscape) | Rotate iPad | Layout adapts; state preserved | Medium |
| EDGE-UI-STATE-044 | Orient | Phone orientation change mid-query | Rotate during query | Query continues; layout adapts | Medium |
| EDGE-UI-STATE-045 | PIP | Picture-in-Picture video over canvas | Open YouTube PIP, then use PulsePlay | App input continues to work | Low |
| EDGE-UI-STATE-046 | PIP | PIP closed mid-session | Close PIP | App reclaims attention; no relayout glitch | Low |
| EDGE-UI-STATE-047 | A11y | Reduced motion preferred | Enable in OS | Animations disabled OR shortened (≤200ms); transitions instant | Medium |
| EDGE-UI-STATE-048 | A11y | High contrast mode (Windows) | Enable | All text legible; focus rings visible | High |
| EDGE-UI-STATE-049 | A11y | Forced-colors mode | Enable | App uses system colors via forced-colors CSS media | High |
| EDGE-UI-STATE-050 | A11y | Increase contrast (macOS) | Enable | Text/borders darker; legible | Medium |
| EDGE-UI-STATE-051 | A11y | Larger text in OS settings | iOS bump font size | App respects rem-based font sizing | Medium |
| EDGE-UI-STATE-052 | A11y | Inverted colors at OS level | Enable | App still navigable; no double-invert | Low |
| EDGE-UI-STATE-053 | A11y | Screen reader announces SSE stream | NVDA + stream | New tokens announced via aria-live polite | Medium |
| EDGE-UI-STATE-054 | A11y | Focus retained after modal close | Close modal | Focus returns to opener | High |
| EDGE-UI-STATE-055 | A11y | Focus visible when keyboard-navigating | Tab through | Visible focus ring | High |
| EDGE-UI-STATE-056 | A11y | Focus hidden when mouse-navigating | Click around | No focus ring on mouse-only flow (per focus-visible) | Low |
| EDGE-UI-STATE-057 | Storage | localStorage `storage` event from other tab | Tab A saves, Tab B receives | Tab B reflects new value via storage listener | Medium |
| EDGE-UI-STATE-058 | Storage | localStorage value corrupted JSON | Manually set bad JSON, reload | App handles parse error; falls back to default | High |
| EDGE-UI-STATE-059 | Storage | localStorage value truncated mid-save | Quota race | Reload detects truncation; falls back | Medium |
| EDGE-UI-STATE-060 | Storage | localStorage cleared mid-session | DevTools clear | App detects via storage event OR next read; recovers | Medium |
| EDGE-UI-STATE-061 | Hist | history.back during animation | Push state, animate, back | Animation cancels gracefully | Low |
| EDGE-UI-STATE-062 | Hist | history.replaceState during input | Replace mid-type | Caret preserved | Low |
| EDGE-UI-STATE-063 | Hist | history pushState 1000x | Stress | Browser handles; no crash | Low |
| EDGE-UI-STATE-064 | Focus | Focus moves during async load | Programmatic focus race | Final focus deterministic | Medium |
| EDGE-UI-STATE-065 | Focus | Focus restored after toast notification | Toast appears + disappears | Focus returns to prior element | Low |
| EDGE-UI-STATE-066 | Focus | Focus trapped inside modal | Tab cycles within modal | Tab + Shift+Tab cycles correctly | High |
| EDGE-UI-STATE-067 | Focus | Focus trapped via `inert` attribute | Background marked inert | Background not focusable | High |
| EDGE-UI-STATE-068 | Focus | Auto-focus on input on page load | Page load | Focus on prompt OR first error field, never random | Medium |
| EDGE-UI-STATE-069 | Focus | Focus skip-links visible on Tab | Press Tab from start | "Skip to main content" link visible | Medium |
| EDGE-UI-STATE-070 | Pointer | Stuck `mouseover` after Alt+Tab | Hover, Alt+Tab, return | Hover state cleared OR refreshed; no stuck tooltip | Low |
| EDGE-UI-STATE-071 | Pointer | Mouse leaves window during drag | Drag out of window | Drag cancels OR continues when re-enter | Low |
| EDGE-UI-STATE-072 | Pointer | Right-click context menu over chart | Right-click chart | Browser context menu OR custom; not both | Low |
| EDGE-UI-STATE-073 | Anim | View Transitions API across nav | Navigate between settings groups | Smooth transition; no flash if supported | Low |
| EDGE-UI-STATE-074 | Anim | CSS animation with display:none parent | Hide animating element | Animation pauses; no errors | Low |
| EDGE-UI-STATE-075 | Theme | OS theme change (light/dark) mid-session | Toggle macOS theme | App respects `prefers-color-scheme` if set to auto | Medium |
| EDGE-UI-STATE-076 | Theme | Custom CSS injected via DevTools | Inject overrides | App tolerates; reset on reload | Low |
| EDGE-UI-STATE-077 | Crash | Renderer process crash (Chrome's Aw Snap) | Trigger via DevTools | Reload restores prior state from localStorage | Medium |
| EDGE-UI-STATE-078 | Crash | Tab crash recovery | Restore tab | State restored | Medium |
| EDGE-UI-STATE-079 | Crash | Browser crash recovery on relaunch | Force kill browser, relaunch | Session restore offered | Low |
| EDGE-UI-STATE-080 | Crash | OOM in render thread | Trigger near OOM | Tab killed cleanly; user can re-open | Medium |

---

## EDGE-RESOURCE — Resource Exhaustion (80 scenarios)

| ID | Category | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|---|
| EDGE-RESOURCE-001 | LS | 100MB localStorage attempt | Try to write 100MB blob | QuotaExceededError caught; rollback to prior snapshot; user warned | High |
| EDGE-RESOURCE-002 | LS | localStorage key with 1MB name | Try save | Either accepted OR rejected with clear error | Low |
| EDGE-RESOURCE-003 | LS | 1000 localStorage keys created | Stress | All readable; no slow degradation | Medium |
| EDGE-RESOURCE-004 | LS | Single key value 5MB (browser limit) | Try save | Either accepted OR rejected near quota; UI surfaces | Medium |
| EDGE-RESOURCE-005 | LS | localStorage quota detection at startup | Use storage estimate API | App logs available quota; warns near full | Low |
| EDGE-RESOURCE-006 | Chat | 10000 chat messages in single conversation | Stress | App virtualizes OR caps with "older messages archived" | High |
| EDGE-RESOURCE-007 | Chat | 100000 chat messages in IndexedDB | Stress | App still responsive; query latency <100ms | Medium |
| EDGE-RESOURCE-008 | Chat | Single chat message with 1MB content | Send | Rendered with collapse/expand; no freeze | Medium |
| EDGE-RESOURCE-009 | Chat | Chat message with 100k tokens (LLM extreme) | Send response | Streaming displays incrementally; no monolithic render | High |
| EDGE-RESOURCE-010 | Chat | 100 simultaneous in-flight requests | Stress | Browser caps at 6 per origin; UI shows queued | Medium |
| EDGE-RESOURCE-011 | Chart | 100k data points in single chart | Render | WebGL/canvas renderer OR downsampling; <2s render | High |
| EDGE-RESOURCE-012 | Chart | 1M data points (pathological) | Render | Either explicit rejection OR very long render with warning | Medium |
| EDGE-RESOURCE-013 | Chart | 50 charts on one page | Render dashboard | All render; perf budget respected | Medium |
| EDGE-RESOURCE-014 | Chart | Chart with 10k legend entries | Render | Either virtualized OR aggregated | Medium |
| EDGE-RESOURCE-015 | Chart | Chart with deeply nested SVG (10k nodes) | Render | Renders; perf is the constraint, not correctness | Low |
| EDGE-RESOURCE-016 | EmbedConfig | Embed config 5MB JSON | Save | Either persisted (compressed?) OR clear size limit | Medium |
| EDGE-RESOURCE-017 | EmbedConfig | Embed URL 100KB (extreme) | Type/paste | Either accepted OR clear length limit | Low |
| EDGE-RESOURCE-018 | Fetch | 1000 simultaneous fetch calls | Stress | Browser queues; backend not overloaded | High |
| EDGE-RESOURCE-019 | Fetch | Fetch with 100MB response body | Stream | Streamed processing; no full-body load in memory | High |
| EDGE-RESOURCE-020 | Fetch | Fetch with no Content-Length and infinite stream | Mock infinite stream | App caps after threshold; user warned | High |
| EDGE-RESOURCE-021 | Regex | Catastrophic backtracking via input `aaaaaaaaaaa!` against `(a+)+$` | Test on validation field | Either pre-compiled safe regex OR fallback timeout | Critical |
| EDGE-RESOURCE-022 | Regex | RE2-style timeout for user-supplied regex | Test on search field | Worker-bounded; UI shows "search took too long" | High |
| EDGE-RESOURCE-023 | Regex | Regex matching 1MB input | Stress | <100ms via efficient engine | Medium |
| EDGE-RESOURCE-024 | Memory | Memory leak via repeated mount/unmount of AISidebar | Stress 100x | Heap returns to baseline after GC | High |
| EDGE-RESOURCE-025 | Memory | Memory leak via closures in event handlers | Stress | Handlers properly removed on unmount | High |
| EDGE-RESOURCE-026 | Memory | Memory baseline after 1 hour idle | Idle | Heap drifts <10MB | Medium |
| EDGE-RESOURCE-027 | Memory | Detached DOM nodes after navigation | Navigate around | Detached count returns to 0 | Medium |
| EDGE-RESOURCE-028 | Memory | Memory pressure event triggers cleanup | Force memory pressure | App listens and clears caches | Low |
| EDGE-RESOURCE-029 | Timer | setInterval not cleared on unmount | Mount + unmount | No leftover timers (verified via DevTools) | High |
| EDGE-RESOURCE-030 | Timer | setTimeout chained at 60Hz | Stress | Auto-throttled; no death by timer flood | Medium |
| EDGE-RESOURCE-031 | Timer | requestAnimationFrame leak (not cancelled) | Mount + unmount | rAF callbacks cancelled | Medium |
| EDGE-RESOURCE-032 | DOM | DOM node count >50k | Render large dashboard | App still responsive; consider virtualization warning | Medium |
| EDGE-RESOURCE-033 | DOM | DOM node count >100k | Pathological | Renders but FPS degrades; warning logged | Medium |
| EDGE-RESOURCE-034 | DOM | Deeply nested DOM (50 levels) | Render | No stack overflow; CSS selectors still match | Low |
| EDGE-RESOURCE-035 | DOM | Single text node with 1MB string | Render | Browser handles; selection performance acceptable | Low |
| EDGE-RESOURCE-036 | CSS | CSS animation count >1000 | Stress | Compositor handles; FPS >30 | Medium |
| EDGE-RESOURCE-037 | CSS | 10k CSS rules in stylesheet | Static | Initial paint <1s | Low |
| EDGE-RESOURCE-038 | CSS | CSS variable updated 10000 times | Stress | rAF-throttled; no jank | Low |
| EDGE-RESOURCE-039 | CSS | CSS selectors with high complexity | Test on large DOM | Selector matching <16ms | Low |
| EDGE-RESOURCE-040 | Worker | Web Worker spawn limit (browser-specific) | Spawn 100 workers | Cap reached; clear error; cleanup on exhaustion | High |
| EDGE-RESOURCE-041 | Worker | Worker termination on tab close | Close tab | All workers terminate | Medium |
| EDGE-RESOURCE-042 | Worker | Worker not terminated on parent navigation | Navigate within SPA | Workers cleaned up by app code | High |
| EDGE-RESOURCE-043 | Worker | Worker message queue overflow | Send 10000 messages rapidly | Messages batched OR backpressure applied | Medium |
| EDGE-RESOURCE-044 | Worker | Worker with infinite loop | Pathological worker | UI remains responsive (worker isolated) | High |
| EDGE-RESOURCE-045 | IDB | IndexedDB version conflict | Two tabs open different versions | Older tab gets `versionchange`; either upgrades OR shows reload prompt | High |
| EDGE-RESOURCE-046 | IDB | IndexedDB blocked event | New version blocked by old | App handles `blocked` event; prompts to close other tabs | High |
| EDGE-RESOURCE-047 | IDB | IndexedDB transaction aborted | Trigger abort | App retries OR shows error; no inconsistent state | Medium |
| EDGE-RESOURCE-048 | IDB | IndexedDB quota exceeded mid-write | Fill | App detects; rolls back; warns user | High |
| EDGE-RESOURCE-049 | IDB | IndexedDB index corruption | Inject corrupt index (simulated) | App detects; offers rebuild | Medium |
| EDGE-RESOURCE-050 | IDB | IndexedDB DB deleted by user (DevTools) | Delete | App detects on next op; re-creates schema | Medium |
| EDGE-RESOURCE-051 | IDB | IndexedDB DB with 1M records | Stress | Query <1s with proper index | Medium |
| EDGE-RESOURCE-052 | IDB | IndexedDB cursor 100k iterations | Stress | Completes; no UI block | Medium |
| EDGE-RESOURCE-053 | OPFS | OPFS quota check | navigator.storage.estimate() | App logs available | Low |
| EDGE-RESOURCE-054 | OPFS | OPFS write 1GB blob | Stress | Either succeeds OR fails with quota error | Medium |
| EDGE-RESOURCE-055 | OPFS | OPFS not available (private mode) | Test in private | Feature degrades gracefully; warning | Medium |
| EDGE-RESOURCE-056 | Cache | Cache API quota | Fill Cache | Eviction works | Medium |
| EDGE-RESOURCE-057 | Cache | Cache API entry 100MB | Try | Either succeeds OR quota error | Low |
| EDGE-RESOURCE-058 | Cache | Cache API stale-while-revalidate | Stale request | Stale returned; fresh fetched in background | Low |
| EDGE-RESOURCE-059 | Cache | Service Worker cache versioning | Update SW with new cache name | Old cache deleted; new active | Medium |
| EDGE-RESOURCE-060 | Sessions | Session storage quota check | Fill | Quota error caught | Low |
| EDGE-RESOURCE-061 | Sessions | sessionStorage clear on tab close | Close tab | All session data gone | Medium |
| EDGE-RESOURCE-062 | Sessions | sessionStorage NOT shared across tabs | Open 2nd tab | Isolated | Medium |
| EDGE-RESOURCE-063 | CPU | CPU spike from JSON.parse of 100MB | Try | Streamed parse OR explicit error | High |
| EDGE-RESOURCE-064 | CPU | CPU spike from synchronous render of 10k items | Render | Virtualized; no block | High |
| EDGE-RESOURCE-065 | CPU | CPU throttled to 6x slowdown | DevTools 6x throttle | App still usable; perf budgets honored | Medium |
| EDGE-RESOURCE-066 | CPU | CPU throttled to 20x slowdown | Extreme | Functional; clear "low-end mode" indicator | Low |
| EDGE-RESOURCE-067 | GPU | WebGL context lost | Trigger via DevTools | App restores context OR shows fallback | Medium |
| EDGE-RESOURCE-068 | GPU | WebGL not available (blocklist) | Disable GPU | Charts fall back to SVG/canvas-2D | Medium |
| EDGE-RESOURCE-069 | GPU | WebGPU not available | Block | Feature using WebGPU degrades; clear message | Low |
| EDGE-RESOURCE-070 | GPU | Multiple canvases sharing GPU memory | Stress | Browser handles; no crash | Low |
| EDGE-RESOURCE-071 | Net | Concurrent connection limit per origin | 100 fetches | Browser queues; app shows pending | Medium |
| EDGE-RESOURCE-072 | Net | Connection pool exhaustion (proxy side) | Stress proxy | Proxy rate-limits; UI shows 429 with retry-after | High |
| EDGE-RESOURCE-073 | Anim | 1000 simultaneous animations | Stress | Compositor handles; no FPS death | Medium |
| EDGE-RESOURCE-074 | Anim | Animation on offscreen element | Off-screen anim | Browser may skip; verify intersection observer pause | Low |
| EDGE-RESOURCE-075 | Window | window.open spam | Trigger many popups | Browser blocks after one without user gesture | Medium |
| EDGE-RESOURCE-076 | Window | window.open with crafted target | `target="_blank"` | `rel="noopener noreferrer"` enforced | High |
| EDGE-RESOURCE-077 | Cookies | Cookie storage limit (50 per origin) | Stress | Old cookies evicted; functional ones kept | Low |
| EDGE-RESOURCE-078 | Cookies | Cookie size limit (4KB) | Try large | Truncated OR rejected | Medium |
| EDGE-RESOURCE-079 | Files | File System Access quota | Write large file | OS-level quota; clear error | Low |
| EDGE-RESOURCE-080 | Files | File System Access permission revoked mid-write | Revoke during write | Write fails cleanly; state recovered | Medium |

---

## Reporting template

Per scenario record:

| Field | Value |
|---|---|
| ID | `EDGE-<CATEGORY>-NNN` |
| Result | PASS / FAIL / SKIPPED / N/A |
| Environment | Browser + OS + viewport + network condition |
| Notes | Free text; required for FAIL |
| Logs / screenshots | Attach if FAIL |

File an issue only for FAIL. Roll up category-level pass rates per session and add to `docs/HANDOVER.md`.
