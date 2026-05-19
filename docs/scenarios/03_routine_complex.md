# PulsePlay — Routine-Complex E2E Scenarios

> **File 3 of 3** in the extreme E2E catalog. Covers complex but non-malicious flows:
> form validation extremes, accessibility, time/locale, recovery, multi-user, sub-route routing,
> compliance, and configuration drift. ~450 scenarios.
>
> Pair with [`01_adversarial.md`](01_adversarial.md) (security/injection) and
> [`02_complex_edge.md`](02_complex_edge.md) (browser/perf/i18n).
>
> Severity: **Critical** (release blocker) · **High** (data loss / wrong answer) ·
> **Medium** (UX broken) · **Low** (cosmetic / dev-only).

---

## CFG-DRIFT · Configuration drift (60 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| CFG-DRIFT-001 | Allowlist removes current vendor mid-session | proxy/config.json reloaded with biProviders=[] | Orphan banner appears within 10s health poll; current vendor flagged orphan but BI still embedded | High |
| CFG-DRIFT-002 | Allowlist removes current AI profile | Profile removed from allowlist | Orphan banner; chat keeps working until next conversation | High |
| CFG-DRIFT-003 | Allowlist removes current pack | Pack removed | Orphan banner; assistant falls back to generic vocab | Medium |
| CFG-DRIFT-004 | Allowlist enforcement changes strict → permissive | Hot reload | Existing orphans clear within next poll | Low |
| CFG-DRIFT-005 | Allowlist enforcement changes permissive → strict | Hot reload | All non-allowlisted picks become orphan banners | Medium |
| CFG-DRIFT-006 | Profile renamed in proxy/config.json (default → primary) | Rename + restart proxy | Old profile becomes orphan; user must re-pick | High |
| CFG-DRIFT-007 | Profile spaceId changed | Update + restart proxy | Next question hits new space transparently | Medium |
| CFG-DRIFT-008 | Profile type changed (direct → supervisor) | Hot reload | UI re-renders supervisor fan-out table | Medium |
| CFG-DRIFT-009 | Pack version bumped server-side | Pack file updated | Cache key changes; next insights request refetches | Low |
| CFG-DRIFT-010 | Settings schema migration v1 → v2 | New field added with default | Existing localStorage hydrates with default value | Medium |
| CFG-DRIFT-011 | Pulse genieSettings schema field removed | Field deleted from interface | Old localStorage value ignored; no crash | Medium |
| CFG-DRIFT-012 | localStorage has key from sibling project | `dwd-something` key present | Ignored; not surfaced as orphan | Low |
| CFG-DRIFT-013 | Two parallel proxy instances on different ports | Both running | UI talks to whichever is at the configured URL | Low |
| CFG-DRIFT-014 | Proxy version mismatch with frontend expectations | Old proxy, new UI | Graceful degradation; missing features hidden | Medium |
| CFG-DRIFT-015 | Frontend expects field /assistant/profiles[].type, proxy doesn't return it | Old proxy | UI falls back to "direct" assumption | Low |
| CFG-DRIFT-016 | License posture flips from Premium to non-Premium | License field changes | Power BI panel shows license warning | High |
| CFG-DRIFT-017 | License posture says Fabric available | Proxy reports Fabric flag | Fabric-only features become available; PulsePlay v1 doesn't depend on this | Low |
| CFG-DRIFT-018 | Allowlist embedOrigins gains new host | Add `app.powerbi.de` | Picker accepts the new origin without restart | Medium |
| CFG-DRIFT-019 | Allowlist embedOrigins removes current host | Drop `app.powerbi.com` | Currently-embedded report keeps working until user re-enters | High |
| CFG-DRIFT-020 | AAD tenant list changed | Tenant rotated in allowlist | Auth flow uses new tenant on next sign-in | High |
| CFG-DRIFT-021 | knowledgeSources list changes | KB index endpoint changed | UI re-pulls index | Medium |
| CFG-DRIFT-022 | Display config (biTileMode) changes | Allowlist hot-reload | Layout updates without page refresh | Low |
| CFG-DRIFT-023 | Multi-deployment drift: dev proxy v1.0, staging v1.1 | Two browsers | Each browser respects its own proxy's contract | Medium |
| CFG-DRIFT-024 | proxy/config.json invalid JSON on reload | Save with syntax error | Proxy keeps last good config; logs warning; UI unaffected | High |
| CFG-DRIFT-025 | proxy/config.json missing required `profiles` array | Save without it | Proxy refuses to load new config; sticks with last good | High |
| CFG-DRIFT-026 | Stale orphan from removed-then-re-added profile | Remove profile, re-add same name | Orphan clears on next allowlist poll | Low |
| CFG-DRIFT-027 | Allowlist API returns 304 Not Modified | Cached state | UI uses cached allowlist without re-render | Low |
| CFG-DRIFT-028 | Allowlist API returns 200 with empty body | Edge case | UI treats as empty allowlist, permissive mode | Low |
| CFG-DRIFT-029 | Settings opened with no allowlist yet (loading state) | Race | Pickers disabled with "Loading…" until fetch completes | Low |
| CFG-DRIFT-030 | Allowlist fetch times out at 30s | Slow network | Falls back to allow-all with banner | Medium |
| CFG-DRIFT-031 | Pulse PBI sibling writes to shared genieSettings key | Sibling running | Both surfaces see the change via storage event | Medium |
| CFG-DRIFT-032 | Settings page opened from sibling project's launchpad | Cross-project nav | Settings honors sibling's pulseplay:* keys | Low |
| CFG-DRIFT-033 | Backward compat: ancient key `pulseplay:embed-url-v1` | Legacy | Read as orphan; ignored | Low |
| CFG-DRIFT-034 | Forward compat: future key `pulseplay:experiment-x` | Unknown key | Ignored; not surfaced | Low |
| CFG-DRIFT-035 | Settings exported as JSON v1, imported in v2 | Round-trip | Missing v2 fields default; warning shown | Medium |
| CFG-DRIFT-036 | Settings exported in v2, imported in v1 | Backward import | Extra v2 fields dropped; no crash | Medium |
| CFG-DRIFT-037 | Token TTL config bumped from 14d to 30d | Server change | Browser keeps using existing token until natural refresh | Low |
| CFG-DRIFT-038 | Foundation Model serving endpoint URL changed | proxy/config.json | Hot reload picks new URL | Medium |
| CFG-DRIFT-039 | Supervisor agentName renamed | Rename | Existing conversations keep old name; new ones use new | Low |
| CFG-DRIFT-040 | Supervisor space deleted | Space removed from list | Probe matrix shows that row as "Not found" | High |
| CFG-DRIFT-041 | KB pack file becomes 404 | Server-side delete | UI surfaces "pack unavailable" without crash | Medium |
| CFG-DRIFT-042 | KB pack file becomes huge (10MB) | Bloated | Lazy-load skeleton; doesn't block app shell | Medium |
| CFG-DRIFT-043 | Settings group ID renamed | bi → reports | Old URLs 404 with fallback to /settings root | Low |
| CFG-DRIFT-044 | Subroute slug changed | knowledge-base → kb | Old URL falls through to AI group root | Low |
| CFG-DRIFT-045 | Visible-panels enum gains new value `kiosk` | Schema addition | Unknown value coerced to default | Medium |
| CFG-DRIFT-046 | Layout preset T6 added server-side | New preset in allowlist | Picker shows new option without code change | Medium |
| CFG-DRIFT-047 | Chart registry adds new chart type `streamgraph` | Renderable=true added | Quick Setup chart picker shows it after refresh | Low |
| CFG-DRIFT-048 | Chart registry removes a type | renderable=false on `gauge` | Existing messages still try to render; fall through to "not enough data" | Medium |
| CFG-DRIFT-049 | Proxy auth mode flipped none → basic | Config change | Existing browser session breaks until credentials supplied | High |
| CFG-DRIFT-050 | Proxy auth mode flipped basic → oauth | Config change | MSAL flow initiates on next /api call | High |
| CFG-DRIFT-051 | App resources block changes | databricksApp + appResources updated | UI re-reads from /health | Low |
| CFG-DRIFT-052 | Profile metadata description changed | Renamed | UI re-renders profile picker subtitle | Low |
| CFG-DRIFT-053 | Pack count goes from 1 to 50 | Mass allowlist | Picker scrolls; no truncation | Medium |
| CFG-DRIFT-054 | Pack count goes from 50 to 0 | Mass removal | Picker shows "(no packs allowed)" | Medium |
| CFG-DRIFT-055 | aiProfiles list ordered alphabetically vs ordered by priority | Order change | UI honors server order (priority-first) | Low |
| CFG-DRIFT-056 | Two profiles with same name (config bug) | Dup name | Proxy logs warning, uses first; UI sees one entry | Medium |
| CFG-DRIFT-057 | Profile dataDomain field becomes null | Field cleared | UI shows "(no domain)" | Low |
| CFG-DRIFT-058 | spaceId field truncated to first 8 chars | Server bug | UI shows truncated value; "Test profile" probe still passes | Low |
| CFG-DRIFT-059 | spaceId returns array instead of string | Type mismatch | UI guards against; shows "(invalid)" | High |
| CFG-DRIFT-060 | Health endpoint returns ok:true but profiles:undefined | Partial response | UI treats as zero profiles | High |

---

## A11Y · Accessibility (60 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| A11Y-001 | NVDA reads Quick Setup heading | Screen reader on | "Setup, level 2" announced | High |
| A11Y-002 | NVDA reads BI vendor picker label | SR on | "Provider, required, select, Power BI selected" | High |
| A11Y-003 | NVDA reads HelpTip on focus | Tab to ⓘ button | "More info, button" then on activation reads tooltip text | High |
| A11Y-004 | NVDA reads status badge tone | SR on | "Configured, status" not just "Configured" | Medium |
| A11Y-005 | JAWS announces save bar appearance | SR on | aria-live polite triggers "Unsaved changes" | High |
| A11Y-006 | VoiceOver iOS reads readiness chip | SR on | "Ready, BI plus AI, button" | High |
| A11Y-007 | TalkBack Android reads chart type select | SR on | "Chart type, KPI Tile, combo box" | Medium |
| A11Y-008 | Keyboard-only: full Quick Setup configuration | Tab + Enter only | All 3 cards configurable without mouse | Critical |
| A11Y-009 | Keyboard-only: send chat message | Tab to compose, type, Enter | Submits | Critical |
| A11Y-010 | Keyboard-only: switch chart views | Tab to view tabs, arrow keys | Active tab changes; aria-selected updates | High |
| A11Y-011 | Keyboard-only: open + close HelpTip | Tab to ⓘ, Enter to toggle | Tooltip toggles; Esc closes | Medium |
| A11Y-012 | Focus visible on every interactive element | Tab through page | Blue ring or equivalent visible | Critical |
| A11Y-013 | Focus trap inside floating panel | Drag panel open | Focus loops within panel; Esc closes | High |
| A11Y-014 | Focus restoration after modal close | Open + close save confirmation | Focus returns to Save button | High |
| A11Y-015 | Focus restoration after sub-route navigation | Click sub-leaf | Focus on h1 of new page | High |
| A11Y-016 | Skip-to-main-content link | First Tab on page | "Skip to main content" link visible and functional | High |
| A11Y-017 | Color contrast text vs background WCAG AA | Audit tool | All text ≥ 4.5:1 | Critical |
| A11Y-018 | Color contrast large text WCAG AA | Audit tool | Heading text ≥ 3:1 | High |
| A11Y-019 | Color contrast button bg vs label | Primary button | ≥ 4.5:1 | High |
| A11Y-020 | Color contrast accent on accent-soft bg | Hover states | Acceptable contrast | Medium |
| A11Y-021 | Color not sole carrier of meaning | Status badges | Have icon or text label in addition to color | High |
| A11Y-022 | Reduced motion respected | OS prefers-reduced-motion | Animations skip or shorten | High |
| A11Y-023 | Reduced motion: chart transitions | Chart switch | No fade/zoom animation | Medium |
| A11Y-024 | Reduced motion: save bar pulse | Save bar | Pulsing dot static | Low |
| A11Y-025 | High contrast mode (Windows) | OS toggle | Borders visible; text legible | High |
| A11Y-026 | Forced colors mode | OS toggle | CSS custom-properties honor system colors | High |
| A11Y-027 | Browser zoom 200% | Ctrl+= 4 times | Layout reflows; no horizontal scroll | High |
| A11Y-028 | Browser zoom 500% | Ctrl+= many | Layout still usable; text not cut off | Medium |
| A11Y-029 | Browser zoom 50% | Ctrl+- | Layout still usable | Low |
| A11Y-030 | OS text scaling 200% | OS setting | App text scales | High |
| A11Y-031 | aria-current on active rail item | Inspect element | aria-current="page" | High |
| A11Y-032 | aria-selected on active view tab | Inspect | aria-selected="true" | High |
| A11Y-033 | role="tablist" on view tab strip | Inspect | Present | High |
| A11Y-034 | role="tab" on each view button | Inspect | Present | High |
| A11Y-035 | aria-live="polite" on settings main pane | Inspect | Present | Medium |
| A11Y-036 | aria-describedby links HelpTip bubble to trigger | Inspect | id-matched | High |
| A11Y-037 | Form fields all have <label> | Inspect | Every input has associated label | Critical |
| A11Y-038 | Required fields marked with aria-required | Inspect | aria-required="true" | High |
| A11Y-039 | Errors associated with field via aria-describedby | Field error | id-matched | High |
| A11Y-040 | Loading state announced | Allowlist fetch | aria-busy="true" during fetch | Medium |
| A11Y-041 | Test button announces result via aria-live | Test proxy | Result chip announced after appearing | High |
| A11Y-042 | Long labels truncate without losing meaning | Long pack name | Truncated with title attribute for full text | Medium |
| A11Y-043 | Tooltip dismissable on Esc | Open tooltip, press Esc | Closes | Medium |
| A11Y-044 | Tooltip persists on hover and focus simultaneously | Hover + Tab away | Stays open while Tab focus is on trigger | Medium |
| A11Y-045 | Click target ≥ 24×24 px | Audit | All buttons meet WCAG 2.5.5 | High |
| A11Y-046 | Touch target ≥ 44×44 px on mobile viewport | Mobile | Meets mobile guidelines | High |
| A11Y-047 | Drag handle has keyboard alternative | Floating panel | Arrow keys move when focused | High |
| A11Y-048 | Color blindness simulator (protanopia) | Browser ext | Status badges distinguishable | High |
| A11Y-049 | Color blindness deuteranopia | Browser ext | Status badges distinguishable | High |
| A11Y-050 | Color blindness tritanopia | Browser ext | Status badges distinguishable | High |
| A11Y-051 | Heading hierarchy h1 → h2 → h3 not skipped | Audit | No level skipped | Medium |
| A11Y-052 | One h1 per page | Audit | Settings, Setup, sub-routes each have one h1 | Medium |
| A11Y-053 | Landmark regions: header, nav, main, complementary | Audit | All present | Medium |
| A11Y-054 | Skip link works on keyboard | Tab + Enter | Jumps to main | High |
| A11Y-055 | Language declared on <html> | Inspect | lang="en" | Medium |
| A11Y-056 | Page title updates on route change | /settings/ai | Browser tab title becomes "Settings · AI · PulsePlay" or similar | Medium |
| A11Y-057 | Document outline tool shows logical structure | Audit | Sections nest correctly | Low |
| A11Y-058 | Voice control: "click Save changes" | Dragon | Activates Save button | Medium |
| A11Y-059 | Voice control: "click PowerBI" | Voice | Activates vendor select option | Medium |
| A11Y-060 | Switch control device (single switch) | iOS Switch | Can traverse and activate all controls | Low |

---

## TIME · Time and locale edge cases (50 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| TIME-001 | Browser timezone changes mid-session | System TZ change | Cache TTL respects new TZ; no double-expiry | Medium |
| TIME-002 | DST spring forward in cache window | Clock jumps 1h | TTL not over- or under-expired | Medium |
| TIME-003 | DST fall back duplicates an hour | Clock repeats | TTL doesn't double-count | Low |
| TIME-004 | Leap year Feb 29 in date input | Date selection | Accepted | Low |
| TIME-005 | Non-leap year Feb 29 rejected | Manual input | Validation error | Low |
| TIME-006 | Y2K38 problem date 2038-01-19T03:14:08Z | Future timestamp | App handles 53-bit safe integer | Low |
| TIME-007 | Negative epoch (pre-1970) | Backdated timestamp | Renders as expected (no underflow) | Low |
| TIME-008 | Year 9999 | Far future | Renders without overflow | Low |
| TIME-009 | Year 0001 | Far past | Renders | Low |
| TIME-010 | en-US locale | OS setting | Numbers 1,234.56; dates MM/DD/YYYY | Medium |
| TIME-011 | en-GB locale | OS setting | Numbers 1,234.56; dates DD/MM/YYYY | Medium |
| TIME-012 | de-DE locale | OS setting | Numbers 1.234,56; dates DD.MM.YYYY | Medium |
| TIME-013 | fr-FR locale | OS setting | Numbers 1 234,56 (NBSP); dates DD/MM/YYYY | Medium |
| TIME-014 | ja-JP locale | OS setting | CJK numerals option | Low |
| TIME-015 | ar-SA locale | OS setting | Arabic-Indic digits or Western (configurable) | Low |
| TIME-016 | hi-IN locale | OS setting | Indian numbering (1,23,456) | Low |
| TIME-017 | Calendar: Hijri | OS setting | Date input accepts Gregorian regardless | Low |
| TIME-018 | Calendar: Hebrew | OS setting | Same | Low |
| TIME-019 | Calendar: Buddhist (Thai) | OS setting | Same | Low |
| TIME-020 | "this year" relative date crosses Jan 1 | At midnight Jan 1 | Genie query "this year" refers to new year | High |
| TIME-021 | "last month" on Mar 31 | Date math | Returns Feb 28/29, not Feb 31 | Medium |
| TIME-022 | "Q1 2026" | Quarter math | Jan 1 – Mar 31 | Medium |
| TIME-023 | "fiscal year 2026" (assuming FY = calendar) | Term | Resolves with org default | Medium |
| TIME-024 | Custom FY (Jul–Jun) configured | Pack setting | Q1 = Jul–Sep | Medium |
| TIME-025 | "last 7 days" at midnight rollover | Edge | Honors timezone | Medium |
| TIME-026 | "next week" includes weekend | Default | Mon–Sun or Mon–Fri configurable | Low |
| TIME-027 | ISO 8601 date format `2026-05-19T07:30:00Z` | Direct input | Parsed | Medium |
| TIME-028 | ISO 8601 with timezone `2026-05-19T07:30:00-05:00` | Direct | Parsed; converted to local | Medium |
| TIME-029 | Date input without time | `2026-05-19` | Assumed start-of-day local | Medium |
| TIME-030 | Date with milliseconds | `2026-05-19T07:30:00.123Z` | Parsed | Low |
| TIME-031 | Cache TTL 0 | Set to 0 minutes | Cache disabled; every request re-runs | Medium |
| TIME-032 | Cache TTL 1440 (24h) | Set | Honored | Low |
| TIME-033 | Cache TTL negative | Coerce | Defaults to 30 | Low |
| TIME-034 | Cache TTL non-integer | "30.5" | Rounds to 31 | Low |
| TIME-035 | Cache TTL string "abc" | Bad input | Defaults to 30 | Low |
| TIME-036 | System clock skewed +5 minutes | Clock drift | Doesn't break poll timing | Low |
| TIME-037 | System clock set to past | Clock back | Cache hit even after TTL expires | Low |
| TIME-038 | Latency metric on a slow request | Round-trip > 30s | Reports correctly (not Infinity) | Low |
| TIME-039 | Latency metric on subsecond | 0.5ms | Reports 1ms (rounded up, not 0) | Low |
| TIME-040 | Relative time "just now" | < 5s | Shown | Low |
| TIME-041 | Relative time "1m ago" | 1 min | Shown | Low |
| TIME-042 | Relative time "yesterday" | 24h ago | Shown | Low |
| TIME-043 | Relative time "last week" | 7d ago | Shown | Low |
| TIME-044 | Date formatting in metric pills | Trend pill | "(+12% YoY)" computed for current year | Medium |
| TIME-045 | Date formatting in narrative | Insights | "in Q1 2026" not "in 2026-Q1" | Low |
| TIME-046 | Stale "last checked" timestamp ages correctly | Watch for 60s | Updates from "just now" to "1m ago" | Low |
| TIME-047 | Timezone abbreviation rendering | EDT vs EST | Honors current DST | Low |
| TIME-048 | UTC display | Use UTC option | Suffix "Z" present | Low |
| TIME-049 | Multi-timezone team viewing same answer | Two users different TZ | Same data, different local times | Medium |
| TIME-050 | Schedule expression "every Monday 9am" | Hypothetical cron | Honors viewer TZ | Low |

---

## FORM · Form validation extremes (60 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| FORM-001 | Empty required field | Try Save | Inline error appears under field | High |
| FORM-002 | Whitespace-only required field | Type "   " + Save | Treated as empty, error shown | High |
| FORM-003 | Trailing whitespace in URL | "https://example.com  " | Trimmed before validation | Medium |
| FORM-004 | Leading whitespace in URL | "  https://example.com" | Trimmed | Medium |
| FORM-005 | Tab character in single-line input | Paste with tab | Stripped or rejected | Low |
| FORM-006 | Newline in single-line input | Paste with \n | Stripped | Low |
| FORM-007 | Multiline textarea preserves newlines | Save + reload | Newlines round-trip | Medium |
| FORM-008 | Textarea with 10MB content | Mega-paste | Soft cap warning; doesn't freeze browser | High |
| FORM-009 | Textarea with 100MB content | Insane paste | Hard cap; truncation warning | Medium |
| FORM-010 | Numeric field accepts integer | "42" | Stored as number | High |
| FORM-011 | Numeric field accepts decimal | "42.5" | Stored or rounded per field rules | Medium |
| FORM-012 | Numeric field rejects letters | "abc" | Validation error | High |
| FORM-013 | Numeric field accepts scientific notation | "1e10" | Coerced to integer or rejected | Medium |
| FORM-014 | Numeric field accepts negative | "-1" | Stored if range allows | Medium |
| FORM-015 | Numeric field with min/max | TTL 0-1440 | Out-of-range clamped or rejected | Medium |
| FORM-016 | URL field accepts `http://` | "http://x" | Allowed in dev | Medium |
| FORM-017 | URL field accepts `https://` | "https://x" | Allowed | Medium |
| FORM-018 | URL field rejects `javascript:` | "javascript:alert(1)" | Rejected with security error | Critical |
| FORM-019 | URL field rejects `data:` | "data:text/html,..." | Rejected | High |
| FORM-020 | URL field rejects `file:` | "file:///etc/passwd" | Rejected | High |
| FORM-021 | URL field handles trailing slash | "https://x.com/" | Normalized | Low |
| FORM-022 | URL field handles query string | "?foo=bar" | Preserved | Medium |
| FORM-023 | URL field handles fragment | "#section" | Preserved | Low |
| FORM-024 | URL field handles port | "https://x.com:8080" | Preserved | Low |
| FORM-025 | URL field handles IPv6 | "https://[::1]/" | Accepted | Low |
| FORM-026 | URL field handles encoded chars | "%20" in path | Preserved | Low |
| FORM-027 | URL field with credentials in URL | "https://user:pass@x.com" | Rejected or warning | High |
| FORM-028 | Hex color field accepts #RGB | "#fff" | Expanded to #FFFFFF | Low |
| FORM-029 | Hex color field accepts #RRGGBB | "#2563eb" | Stored | Low |
| FORM-030 | Hex color field accepts #RRGGBBAA | "#2563ebff" | Stored or stripped | Low |
| FORM-031 | Hex color field rejects "blue" | Named color | Coerced or rejected | Low |
| FORM-032 | Hex color field rejects "rgb(...)" | Function | Rejected | Low |
| FORM-033 | Select dropdown with no options | Empty source | Picker disabled with hint | Medium |
| FORM-034 | Select with 1000 options | Mass list | Renders with virtualization or scroll | Medium |
| FORM-035 | Select picks invalid value | Hidden manipulation | Reverts to default | Medium |
| FORM-036 | Checkbox vs toggle a11y | Inspect | Toggle has role="switch" | Medium |
| FORM-037 | Radio group with no default | Initial state | First option focused on Tab | Low |
| FORM-038 | Form auto-fill triggers save bar | Browser autocomplete | Save bar shows (correctly) | Low |
| FORM-039 | Password manager fills auth field | LastPass etc. | No conflict with form state | Medium |
| FORM-040 | Browser translate rewrites labels | Chrome Translate | Settings still functional | Medium |
| FORM-041 | Browser translate rewrites button text | Chrome | Buttons still clickable | Medium |
| FORM-042 | Paste a screenshot into a textarea | Image paste | Inserted as base64 OR rejected gracefully | Medium |
| FORM-043 | Paste a file into a URL input | File drop | Rejected with hint | Low |
| FORM-044 | Form submit via Enter in text field | Enter in single-line | Submits form | Medium |
| FORM-045 | Form submit via Enter in textarea | Enter | Newline (does NOT submit) | Medium |
| FORM-046 | Form submit via Ctrl+Enter in textarea | Ctrl+Enter | Submits | Medium |
| FORM-047 | Form Reset button restores defaults | Reset | All fields default | Medium |
| FORM-048 | Form Reset doesn't reset saved values | Reset before save | Settings unchanged | High |
| FORM-049 | Two forms on same page don't interfere | Settings + compose | Independent state | Medium |
| FORM-050 | Field validation runs on blur | Focus out | Error appears (not on every keystroke) | Medium |
| FORM-051 | Field validation runs on submit | Submit | All fields validate | High |
| FORM-052 | Field validation cleared on valid input | Fix error | Error message disappears | Medium |
| FORM-053 | Inline error doesn't push layout | Error appears | No reflow above the error | Low |
| FORM-054 | Disabled field doesn't submit | Form submit | Value omitted | High |
| FORM-055 | Readonly field submits | Form submit | Value included | Medium |
| FORM-056 | Hidden field submits | Form submit | Value included | Medium |
| FORM-057 | Field max-length enforced | Type past limit | Input stops accepting | Medium |
| FORM-058 | Field min-length warning | Too short | Warning shown on blur | Low |
| FORM-059 | File input accepts only configured types | Wrong extension | Rejected | Medium |
| FORM-060 | Form a11y labels for required vs optional | Mixed fields | Visually + aria distinguished | Medium |

---

## RECOV · Recovery and resilience (60 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| RECOV-001 | Browser crash during chat send | Force-quit | On reopen, conversation rehydrates from localStorage | High |
| RECOV-002 | Tab close during chat send | Close tab | Message not lost; reappears on next open | High |
| RECOV-003 | Browser back during chat send | Nav away mid-flight | XHR aborted; no orphan request on proxy | Medium |
| RECOV-004 | Network drop during chat send | Wi-Fi off | Error after timeout; can retry | High |
| RECOV-005 | Network drop during chart render | Wi-Fi off | Render completes with cached data; no crash | Medium |
| RECOV-006 | Network reconnects after long offline | Wi-Fi back | Next request succeeds | High |
| RECOV-007 | Proxy restart during session | Service cycle | Banner shows; clears after restart | High |
| RECOV-008 | Proxy restart during streaming response | Mid-NDJSON | Stream terminates gracefully; user sees partial + retry | High |
| RECOV-009 | Proxy upgrade with config schema change | New version | Graceful degradation; warns user | Medium |
| RECOV-010 | Dev server hot reload mid-session | Code change | App reloads; settings preserved | Medium |
| RECOV-011 | Dev server crash | Restart needed | Page shows static error; refresh works | Low |
| RECOV-012 | Browser sleeps for hours | Laptop closed | On wake, app re-fetches state | Medium |
| RECOV-013 | Browser sleeps during chat send | Laptop closed mid-poll | On wake, poll resumes or fails gracefully | High |
| RECOV-014 | Service worker stale cache | Old assets cached | Hard refresh updates | Medium |
| RECOV-015 | Cache invalidation on settings change | Save TTL change | Cached results re-fetched | Medium |
| RECOV-016 | localStorage write fails (quota) | Disk full | Soft warning; in-memory fallback | High |
| RECOV-017 | localStorage write fails (permission) | Disabled | App still functional; settings not persisted | Medium |
| RECOV-018 | sessionStorage write fails | Disabled | App functional | Low |
| RECOV-019 | IndexedDB open fails | Permission | Falls back to localStorage | Low |
| RECOV-020 | Cookie write fails | Third-party blocked | AAD flow degrades to popup or redirect | Medium |
| RECOV-021 | Form data recovery after crash | Browser restore | Compose field restores | Medium |
| RECOV-022 | Tab restoration on reopen | History | Last URL restores | Low |
| RECOV-023 | Multiple windows, same session | Two browser windows | Both stay in sync via storage event | Medium |
| RECOV-024 | One window crashes, other unaffected | Force quit one | Other window still works | Medium |
| RECOV-025 | OS suspend/resume | Laptop hibernate | App resumes correctly | Medium |
| RECOV-026 | OS hard reboot | Power loss | On boot, app loads; settings persisted | Medium |
| RECOV-027 | Database failover (Genie warehouse) | Cluster restart | Next query waits and succeeds | Medium |
| RECOV-028 | Genie space migration | Space ID changes mid-session | Old conv fails; new conv works | Medium |
| RECOV-029 | Token rotation mid-session | PAT rotated | Backend re-issues; user unaware | High |
| RECOV-030 | AAD token refresh fails | Refresh expired | User prompted to re-auth | High |
| RECOV-031 | Service principal expired | Cert expired | Backend errors clearly; user told to refresh server-side | High |
| RECOV-032 | DNS resolution fails for proxy | dns | Banner says proxy unreachable | Medium |
| RECOV-033 | DNS resolution fails for Databricks | dns | Genie query errors; chat still works | Medium |
| RECOV-034 | SSL cert expired on proxy | Cert | Browser blocks; user sees clear error | High |
| RECOV-035 | SSL cert chain incomplete | Bad cert | Browser warning; configurable to ignore in dev | Medium |
| RECOV-036 | CA not trusted | Self-signed | Dev warning; doc points to NODE_EXTRA_CA_CERTS | Low |
| RECOV-037 | Time skew detected (clock off > 5min) | NTP issue | Auth fails; clear "check your clock" message | Medium |
| RECOV-038 | Geographic failover Databricks region | Region down | Falls back to secondary or errors gracefully | Low |
| RECOV-039 | App auto-update during use | New version pushed | Banner suggests reload | Medium |
| RECOV-040 | Old version cached in some tab | Mixed versions | Old tab still works; messages don't cross | Medium |
| RECOV-041 | Save bar mid-typing when crash | Force-quit | On reopen, save bar shows (dirty state) | Medium |
| RECOV-042 | Discard while another change comes in via storage event | Race | Last-write-wins; user warned | Medium |
| RECOV-043 | Two tabs both edit same key | Concurrent | Last-saved wins; storage event syncs | Medium |
| RECOV-044 | Chat history grows past localStorage budget | 1000+ messages | Old messages evicted with banner | Medium |
| RECOV-045 | localStorage full of foreign keys | Other apps using same domain | Pulse keys still readable | Low |
| RECOV-046 | localStorage quota suddenly reduced (browser bug) | Quota change | Graceful handling | Low |
| RECOV-047 | New tab inherits stale settings | Open new tab | Reads fresh from localStorage | High |
| RECOV-048 | New tab while save in progress | Race | Reads either old or new state, never half | Medium |
| RECOV-049 | Discard mid-save | Click during save | Save completes; Discard ignored or reverts after | Medium |
| RECOV-050 | Reload during save | Refresh | Save aborts; user has to re-do | Medium |
| RECOV-051 | App update available banner | New service worker | Banner with reload action | Low |
| RECOV-052 | Skipped waiting service worker | Old SW active | Force-update on next reload | Low |
| RECOV-053 | Proxy clock skewed | Server time off | Timestamps still relative; no auth break | Low |
| RECOV-054 | Browser unsupported feature (no fetch) | Old browser | Compatibility shim or clear error | Low |
| RECOV-055 | Browser unsupported feature (no WebSocket) | Old | SSE fallback for streaming | Low |
| RECOV-056 | Browser without ResizeObserver | Old | Layout still works (less responsive) | Low |
| RECOV-057 | Browser without IntersectionObserver | Old | Eager-load fallback | Low |
| RECOV-058 | localStorage encrypted by browser policy | Enterprise | Read/write still work | Low |
| RECOV-059 | Browser parental controls block iframe | Restriction | Embed shows clear error | Low |
| RECOV-060 | Browser ad-blocker blocks proxy call | Ad block rules | Proxy returns request; UI explains | Medium |

---

## SUBROUTE · Sub-route routing edge cases (50 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| SUBROUTE-001 | Direct URL `/settings/ai/knowledge-base` | Paste in address bar | Renders KB sub-page | High |
| SUBROUTE-002 | Direct URL `/settings/ai/supervisor-fusion` | Paste | Renders Sup sub-page | High |
| SUBROUTE-003 | Direct URL `/settings/preferences/appearance` | Paste | Renders Appearance | High |
| SUBROUTE-004 | Direct URL `/settings/system/developer-tools` | Paste | Renders Dev Tools | High |
| SUBROUTE-005 | Direct URL `/settings/bi/governance` | Paste | Renders Governance | High |
| SUBROUTE-006 | Trailing slash `/settings/ai/knowledge-base/` | Paste | Same as without — normalized | Low |
| SUBROUTE-007 | Double slash `/settings//ai//knowledge-base` | Paste | Normalized or 404-fallback to group root | Low |
| SUBROUTE-008 | Mixed case `/Settings/AI/Knowledge-Base` | Paste | Either redirect to lowercase OR 404 | Low |
| SUBROUTE-009 | Typo in sub-route `/settings/ai/knowlede-base` | Paste | Falls through to AI group root | Medium |
| SUBROUTE-010 | Unknown sub-route `/settings/ai/xyz` | Paste | Falls through to group root, no 404 | Medium |
| SUBROUTE-011 | Unknown group `/settings/foo` | Paste | Redirects to Setup with last-good fallback | Low |
| SUBROUTE-012 | URL with encoded chars `/settings/ai/knowledge%2dbase` | Paste | Decoded and works | Low |
| SUBROUTE-013 | URL with query params `/settings/ai/knowledge-base?foo=bar` | Paste | Query params ignored; sub-page renders | Low |
| SUBROUTE-014 | URL with hash `/settings/ai/knowledge-base#kb-enabled` | Paste | Sub-page renders; hash potentially scrolls | Low |
| SUBROUTE-015 | URL longer than 2KB | Massive URL | Browser may truncate; app handles or rejects | Low |
| SUBROUTE-016 | Browser back from sub-route to app | History | Returns to / | Medium |
| SUBROUTE-017 | Browser forward to sub-route | History | Re-renders sub-route | Medium |
| SUBROUTE-018 | Hard refresh on sub-route URL | F5 | Vite SPA fallback works | High |
| SUBROUTE-019 | Open sub-route in new tab | Cmd+click rail item | New tab loads sub-route directly | Medium |
| SUBROUTE-020 | Open sub-route in incognito | Right-click new private | Loads (settings empty until configured) | Medium |
| SUBROUTE-021 | Bookmark a sub-route | Star | Bookmark works; same URL loads | Low |
| SUBROUTE-022 | Share sub-route URL with colleague | Send link | They land on same sub-route (no auth assumed) | Low |
| SUBROUTE-023 | Navigate sub-route → sub-route within same group | Click rail | URL updates; same group active | Medium |
| SUBROUTE-024 | Navigate sub-route → different group | Click rail | URL updates; new group + first leaf | Medium |
| SUBROUTE-025 | Save changes on sub-route | Edit + save | Persists to global state | High |
| SUBROUTE-026 | Save bar visible across sub-route changes | Edit on sub-route, nav | Save bar persists | Medium |
| SUBROUTE-027 | Discard on sub-route | Edit + Discard | Reverts global state | High |
| SUBROUTE-028 | Status chip on sub-route header reflects state | Toggle changes | Chip updates live | Medium |
| SUBROUTE-029 | Sub-route in search | Type "kb" or "knowledge" | Sub-route surfaces | Medium |
| SUBROUTE-030 | Sub-route in rail when search narrows | Filter | Sub-route shown if parent group matches | Medium |
| SUBROUTE-031 | Two browsers, one on sub-route, other on different | Storage event | Both stay in sync on shared state | Medium |
| SUBROUTE-032 | Sub-route mounted while another tab edits same state | Live update | Reactive | Medium |
| SUBROUTE-033 | Sub-route unmount + remount preserves field state | Nav away + back | Inputs read fresh from store | Medium |
| SUBROUTE-034 | Sub-route never registered (typo in dispatcher) | Direct URL | Falls through to parent group | Medium |
| SUBROUTE-035 | popstate fires custom event | Browser back | useSettingsRoute hook re-renders | High |
| SUBROUTE-036 | navigateToSettings without leaf | Click "AI" in rail | URL is /settings/ai (no leaf) | Medium |
| SUBROUTE-037 | navigateToSettings with leaf | Click sub-leaf | URL is /settings/ai/<leaf> | Medium |
| SUBROUTE-038 | navigateToApp from sub-route | Click "Back to app" | URL is / | Medium |
| SUBROUTE-039 | parseSettingsRoute handles empty pathname | Edge | Defaults to Setup | Low |
| SUBROUTE-040 | parseSettingsRoute handles just "/settings" | URL | Lands on last-visited group | Medium |
| SUBROUTE-041 | parseSettingsRoute handles "/" | URL | isSettingsRoute === false | High |
| SUBROUTE-042 | Sub-route deep link from external doc | Slack link | Loads correctly | Low |
| SUBROUTE-043 | Sub-route after deploy with renamed slug | Old URL | Falls through with no crash | Low |
| SUBROUTE-044 | Sub-route as deferred-load lazy chunk | Lazy import | First visit downloads chunk; cached after | Low |
| SUBROUTE-045 | Sub-route during ALL of {portrait, landscape, mobile, tablet} | Rotate | Layout adapts | Medium |
| SUBROUTE-046 | Sub-route active dot in rail | Nav | Blue dot on sub-route item | Low |
| SUBROUTE-047 | Sub-route active background highlight | Nav | Tinted accent bg | Low |
| SUBROUTE-048 | Sub-route slide-in animation | Nav | 200ms cubic-bezier | Low |
| SUBROUTE-049 | Rapid sub-route switching | Click 5 times quickly | Final state wins; no flicker | Medium |
| SUBROUTE-050 | Sub-route URL with anchor scroll | URL#section | Scrolls if anchor exists | Low |

---

## MULTI-USER · Multi-user and collaboration (40 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| MULTI-001 | Same user, two browsers | Open both | Both see same settings (server-side sync via proxy) — locally divergent allowed | Low |
| MULTI-002 | Same user, two tabs same browser | Open both | localStorage events sync them | Medium |
| MULTI-003 | Same user, Chrome + Firefox | Open both | Local-only state diverges; backend agnostic | Low |
| MULTI-004 | Same user, two devices | Phone + laptop | Local state diverges; embed config diverges | Low |
| MULTI-005 | Two users, same Power BI workspace | Both embed same report | Each sees own AAD identity | Medium |
| MULTI-006 | Two users, same Genie space | Both ask different questions | Two independent conversations | Medium |
| MULTI-007 | Two users, supervisor profile | Concurrent fan-out | Each gets own response | Medium |
| MULTI-008 | Two users, one admin one viewer | Same dashboard | Both see own RLS-filtered data | High |
| MULTI-009 | Same user across tenants | Switch AAD account | New session; old cached PBI may show stale until refresh | Medium |
| MULTI-010 | Concurrent settings edits, two tabs | Change different keys | Both persist via storage events | Medium |
| MULTI-011 | Concurrent settings edits, two tabs, same key | Conflict | Last-write-wins | Medium |
| MULTI-012 | Concurrent Save bar in two tabs | Click in both | Each saves independently; result eventually consistent | Medium |
| MULTI-013 | Concurrent Discard in two tabs | Click in both | Each reverts independently | Low |
| MULTI-014 | Two users, one deletes a pack server-side | Mid-session | Other user sees pack become orphan within next allowlist poll | Medium |
| MULTI-015 | Audit trail captures who saved when | Server-side | Audit log entries with user identity | High |
| MULTI-016 | Audit trail captures who configured embed | Server-side | Logged | High |
| MULTI-017 | Sensitive data in chat redacted by user | Manual | User can edit own messages? (depends on contract) | Low |
| MULTI-018 | Two users see different AI Insights for same data | RLS at warehouse | Each sees own filtered insights | High |
| MULTI-019 | Two users see same trend, different recommendations | Persona | Pack guidance personalised | Medium |
| MULTI-020 | Permission delegation: admin grants viewer access | Server-side | Viewer can read but not edit | High |
| MULTI-021 | Permission revoke mid-session | Admin revokes | Viewer's next query fails 403 | High |
| MULTI-022 | Workspace admin removes a member | Server-side | Member's session continues until token expiry | Medium |
| MULTI-023 | Lock contention on settings edit | Two users edit same key | Optimistic concurrency; one wins, other sees stale-write warning | Medium |
| MULTI-024 | Session attribution in proxy logs | Each request | Tagged with user identity (when OAuth) | High |
| MULTI-025 | Same email different tenants | Same address, two AAD | Sessions isolated | High |
| MULTI-026 | Service principal acts on behalf of all users | Shared PAT mode | All requests attributed to SP, not user | Medium |
| MULTI-027 | OAuth obo mode | Per-user requests | Each request as user identity | High |
| MULTI-028 | User signs out PBI but stays in PulsePlay | Sign out from PBI iframe | PBI iframe blanks; PulsePlay shell still works | Medium |
| MULTI-029 | User signs out of AAD globally | OS sign-out | All MSAL flows fail; chat still works | Medium |
| MULTI-030 | User session expires (14d PAT) | Token TTL hit | Next backend request errors; user told to refresh server token | Medium |
| MULTI-031 | Multi-user demo with one shared screen | Single browser many viewers | Audit shows single user | Low |
| MULTI-032 | Demo mode: all queries to fake data source | Toggle | Switches to mock backend | Low |
| MULTI-033 | Recording mode: capture for replay | Toggle | Stores network in HAR file | Low |
| MULTI-034 | User invites colleague via share link | URL share | Colleague lands on same page (if auth allows) | Low |
| MULTI-035 | Embed config shared via export bundle | Author A exports, Author B imports | B has A's config | Medium |
| MULTI-036 | Differential settings: A custom theme, B default | Same workspace, two users | Each sees own theme | Medium |
| MULTI-037 | Globally-set vs per-user settings | Distinction | Pack is global; theme is per-user | Medium |
| MULTI-038 | Author publishes settings to org default | Hypothetical "publish" action | Becomes new default for new users | Low |
| MULTI-039 | New user signs in for first time | First-run wizard | Wizard runs once | Medium |
| MULTI-040 | User onboarding link from email | Magic link | Lands on Setup with pre-filled vendor | Low |

---

## COMPLIANCE · Compliance and audit (40 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| COMPLIANCE-001 | GDPR data export request | "Export my data" feature | Returns all stored data in JSON | High |
| COMPLIANCE-002 | GDPR right to erasure | "Delete my data" | Clears localStorage + sessionStorage; server-side requires admin | High |
| COMPLIANCE-003 | Audit log captures all settings changes | Audit log | Entry per change with user + timestamp | High |
| COMPLIANCE-004 | Audit log captures all queries | Audit | Each Genie call logged | High |
| COMPLIANCE-005 | Audit log retention 1 year | Server-side policy | Old entries pruned | Medium |
| COMPLIANCE-006 | Sensitive data in audit log redacted | PII | Tokens, PATs masked | Critical |
| COMPLIANCE-007 | Cross-border data transfer compliance | EU user, US backend | Transfer disclosed in privacy policy | High |
| COMPLIANCE-008 | Data residency: EU-only deployment | Configured | Proxy enforces EU-region Databricks only | High |
| COMPLIANCE-009 | Data residency: US-only | Configured | Same | High |
| COMPLIANCE-010 | Access review: who has access to what | Admin tool | Lists users per workspace | High |
| COMPLIANCE-011 | Quarterly access review | Process | Admin reviews and revokes stale users | Medium |
| COMPLIANCE-012 | Incident response: data breach notification | Severity | 72h notification per GDPR | Critical |
| COMPLIANCE-013 | Incident response: log inspection | Audit | Admin can correlate logs across services | High |
| COMPLIANCE-014 | Penetration test scope document | Annual | App + proxy + dependencies | Medium |
| COMPLIANCE-015 | SOC 2 Type II evidence | Annual | Logs + change management captured | Medium |
| COMPLIANCE-016 | ISO 27001 control evidence | Annual | Access controls + monitoring | Medium |
| COMPLIANCE-017 | HIPAA PHI handling (if applicable) | PHI in data | BA agreement with Databricks; PulsePlay doesn't store PHI | Critical |
| COMPLIANCE-018 | EU AI Act risk classification | Self-assessment | PulsePlay is "limited risk" (transparency) | Medium |
| COMPLIANCE-019 | AI transparency: users informed of AI use | UI disclosure | Banner or footer states AI assistance | Medium |
| COMPLIANCE-020 | AI provenance: every answer cites source | Provenance footer | Insights show data source | High |
| COMPLIANCE-021 | AI explainability: SQL view available | Show SQL toggle | User can audit query | Medium |
| COMPLIANCE-022 | AI human oversight: user can override | Manual mode | User can edit recommendations | Medium |
| COMPLIANCE-023 | Cookie consent: necessary only | Strict | No tracking cookies | High |
| COMPLIANCE-024 | Cookie consent: analytics opt-in | Banner | Default opt-out | High |
| COMPLIANCE-025 | Third-party trackers | Audit | None present | Critical |
| COMPLIANCE-026 | First-party telemetry | Internal | Disclosed in privacy notice | Medium |
| COMPLIANCE-027 | Telemetry can be disabled | Setting | Per-user opt-out | Medium |
| COMPLIANCE-028 | Privacy notice link in footer | Link | Present | Medium |
| COMPLIANCE-029 | Terms of service link in footer | Link | Present | Medium |
| COMPLIANCE-030 | License notice link in footer | Link | Present (when public OSS) | Low |
| COMPLIANCE-031 | Open-source dependencies audited | SBOM | Generated and reviewed | Medium |
| COMPLIANCE-032 | Vulnerability scan on dependencies | npm audit | Run in CI | Medium |
| COMPLIANCE-033 | Dependency upgrades: security patches | Process | Within 7d for Critical | High |
| COMPLIANCE-034 | Dependency upgrades: routine | Process | Monthly | Low |
| COMPLIANCE-035 | Right to access: user requests data copy | Self-service | Settings → Export | Medium |
| COMPLIANCE-036 | Right to rectification | Manual | User can edit settings | Low |
| COMPLIANCE-037 | Right to restrict processing | Account-level | User can pause AI | Low |
| COMPLIANCE-038 | Right to data portability | Export JSON | Standard format | Medium |
| COMPLIANCE-039 | Privacy by design: minimal data collection | Audit | Only what's needed for the feature | High |
| COMPLIANCE-040 | Privacy by default: settings start with most-private | Defaults | Telemetry opt-in, not opt-out | High |

---

## DEPLOY · Deployment + ops (50 scenarios)

| ID | Edge condition | Action | Expected | Severity |
|---|---|---|---|---|
| DEPLOY-001 | npm install on fresh clone | First-time setup | Completes without errors | High |
| DEPLOY-002 | npm install with outdated package-lock | Stale lock | Reproducible install | High |
| DEPLOY-003 | npm install on different Node major | Node 16 vs 20 | Either works or clear error | Medium |
| DEPLOY-004 | Vite dev server starts | npm run dev | Listens on 5173 | High |
| DEPLOY-005 | Vite dev server starts when 5173 occupied | Auto-bump | Listens on 5174 | Medium |
| DEPLOY-006 | Vite build succeeds | npm run build | Generates dist/ | High |
| DEPLOY-007 | Vite build with errors | Syntax error | Build fails clearly | High |
| DEPLOY-008 | Vite build with warnings | Unused import | Build succeeds with warning | Medium |
| DEPLOY-009 | npm run lint clean | All clear | Exit 0 | High |
| DEPLOY-010 | npm run lint with errors | Bad code | Exit 1 with line numbers | High |
| DEPLOY-011 | npm test passes on Linux | CI | All tests pass | High |
| DEPLOY-012 | npm test passes on macOS | CI | All tests pass | High |
| DEPLOY-013 | npm test passes on Windows | CI | All tests pass | High |
| DEPLOY-014 | npm test parallel jobs | Vitest workers | No flaky tests | Medium |
| DEPLOY-015 | Proxy starts with default config | node server.js | Listens on 8787 | High |
| DEPLOY-016 | Proxy starts with NODE_EXTRA_CA_CERTS | Custom CA | Reads cert chain | Low |
| DEPLOY-017 | Proxy starts on different port | PORT=9000 | Listens on 9000 | Low |
| DEPLOY-018 | Proxy graceful shutdown | SIGTERM | Drains in-flight requests | Medium |
| DEPLOY-019 | Proxy hot reload of config.json | File change | Re-reads on next request | Low |
| DEPLOY-020 | Proxy logs to stdout | Run | INFO/WARN/ERROR levels | Medium |
| DEPLOY-021 | Proxy logs to file | Configurable | Rotates daily | Low |
| DEPLOY-022 | Proxy audit logs separately | Audit | Separate stream | Medium |
| DEPLOY-023 | Proxy bound to 127.0.0.1 (dev) | Default | Not reachable from network | Critical |
| DEPLOY-024 | Proxy bound to 0.0.0.0 (Databricks App) | Production | Reachable from cluster | High |
| DEPLOY-025 | Health endpoint reachable | /health | 200 OK | High |
| DEPLOY-026 | Allowlist endpoint reachable | /assistant/allowlist | 200 with payload | High |
| DEPLOY-027 | Profiles endpoint reachable | /assistant/profiles | 200 with list | High |
| DEPLOY-028 | Embed token endpoint reachable | /assistant/embed-token/* | 200 with token | High |
| DEPLOY-029 | Foundation streaming reachable | /foundation/conversations/start-stream | 200 NDJSON | High |
| DEPLOY-030 | Profile picker works with 1 profile | Single | Renders one option | Medium |
| DEPLOY-031 | Profile picker works with 50 profiles | Many | Scrollable | Medium |
| DEPLOY-032 | Allowlist supports 1000 entries | Mass | Loads under 1s | Medium |
| DEPLOY-033 | Embed token issued in under 200ms | SLA | Met | Medium |
| DEPLOY-034 | Health poll cadence 10s | Default | No tighter no looser | Low |
| DEPLOY-035 | Health poll backoff on failure | Repeated 5xx | Exponential backoff | Medium |
| DEPLOY-036 | Proxy error rate < 0.1% | Production SLA | Monitor | Medium |
| DEPLOY-037 | App p95 latency < 200ms (excluding Genie) | Performance | Met | Medium |
| DEPLOY-038 | Genie p95 latency < 30s (warm) | Performance | Met | Medium |
| DEPLOY-039 | Foundation p95 first token < 5s | Performance | Met | High |
| DEPLOY-040 | Database failover transparent | Cluster restart | App keeps working | Medium |
| DEPLOY-041 | DNS failover transparent | Region down | Fallback IP | Low |
| DEPLOY-042 | Browser cache hit on assets | Repeat visit | Cache-Control honored | Low |
| DEPLOY-043 | Asset versioning via content hash | Build output | Hashed file names | Medium |
| DEPLOY-044 | Sourcemap not exposed in production | Build | Sourcemaps stripped or auth-gated | Medium |
| DEPLOY-045 | Bundle size monitored | CI | Alert if > target | Medium |
| DEPLOY-046 | Lighthouse score Performance > 80 | Build | Check | Medium |
| DEPLOY-047 | Lighthouse score A11y > 90 | Build | Check | High |
| DEPLOY-048 | Lighthouse score Best Practices > 90 | Build | Check | Medium |
| DEPLOY-049 | Lighthouse score SEO > 80 | Build | Check (less critical for internal) | Low |
| DEPLOY-050 | Web Vitals (LCP, FID, CLS) within budget | Real users | Met | Medium |

---

**Routine-complex file total:** ~410 scenarios across 8 categories. Sister files `01_adversarial.md` (~900) and `02_complex_edge.md` (~640) bring the catalog to ~1,950.
