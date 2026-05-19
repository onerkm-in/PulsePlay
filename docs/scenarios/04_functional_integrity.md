# PulsePlay — Functional Integrity Scenarios

> **File 4 of 4** in the extreme E2E catalog. Covers what the other files don't:
>
> 1. **Component contracts** — each primitive, each shell, each renderer behaves as advertised
> 2. **Cross-component integration** — components wire to stores, stores wire to UI, UI wires to network
> 3. **Design + behavior uniformity** — same patterns applied consistently across the surface
> 4. **End-to-end use cases** — multi-step user journeys that exercise full slices
>
> ~430 scenarios. Pair with `01_adversarial.md`, `02_complex_edge.md`, `03_routine_complex.md`.
>
> Severity: **Critical** (broken contract = ship blocker) · **High** (inconsistent UX) ·
> **Medium** (works but feels rough) · **Low** (polish gap).

---

## FUNC-PRIM · Primitives — per-component contract (90 scenarios)

### HelpTip (`primitives/HelpTip.tsx`)

| ID | Component contract | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-PRIM-001 | Trigger button renders inline | Render `<HelpTip text="hello" />` | Small round button with "i" appears next to its parent text | Critical |
| FUNC-PRIM-002 | Tooltip opens on hover | Hover ⓘ | Bubble appears above with `text` content | High |
| FUNC-PRIM-003 | Tooltip opens on focus | Tab to ⓘ | Bubble appears | High |
| FUNC-PRIM-004 | Tooltip opens on click | Click ⓘ | Toggles bubble | Medium |
| FUNC-PRIM-005 | Tooltip closes on mouseleave | Hover then leave | Bubble disappears | Medium |
| FUNC-PRIM-006 | Tooltip closes on blur | Focus then Tab away | Bubble disappears | Medium |
| FUNC-PRIM-007 | Rich `children` overrides plain `text` | Pass both | Children rendered | High |
| FUNC-PRIM-008 | `aria-describedby` set when open | Inspect when bubble visible | Trigger has `aria-describedby` linking to bubble id | Critical |
| FUNC-PRIM-009 | `aria-describedby` removed when closed | Inspect when bubble hidden | Attribute absent | Medium |
| FUNC-PRIM-010 | `role="tooltip"` on bubble | Inspect | Present | High |
| FUNC-PRIM-011 | `aria-label` on trigger respects `label` prop | Pass `label="More info about X"` | Aria label matches | High |
| FUNC-PRIM-012 | Default `label` is "More info" | No prop | Aria label = "More info" | Medium |
| FUNC-PRIM-013 | `width` prop controls bubble width | Pass `width={420}` | Bubble has 420px width | Low |
| FUNC-PRIM-014 | Default width 280px | No prop | Bubble 280px wide | Low |
| FUNC-PRIM-015 | `variant="info"` (default) — blue tone | Render | Blue trigger fill | Low |
| FUNC-PRIM-016 | `variant="warn"` — amber tone | Render | Amber trigger fill | Low |
| FUNC-PRIM-017 | `variant="tip"` — purple tone | Render | Purple trigger fill | Low |
| FUNC-PRIM-018 | Bubble has tail arrow pointing to trigger | Open | Triangle visible below bubble | Low |
| FUNC-PRIM-019 | Bubble z-index above siblings | Render in card | Bubble above adjacent content | Medium |
| FUNC-PRIM-020 | Click trigger again toggles closed | Click twice | First open, second closed | Medium |

### StatusBadge (`primitives/StatusBadge.tsx`)

| ID | Component contract | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-PRIM-021 | All 6 tones render distinct colors | Render each of ok/warn/missing/loading/info/neutral | Six visually distinct chips | High |
| FUNC-PRIM-022 | `compact` variant reduces padding + font | Compare normal vs compact | Compact visibly smaller | Low |
| FUNC-PRIM-023 | `label` text shown | `label="Configured"` | Text visible | Critical |
| FUNC-PRIM-024 | `detail` text shown when provided | `detail="2 profiles"` | Appears after label, dimmer | Medium |
| FUNC-PRIM-025 | `detail` omitted when not provided | No prop | No second span | Low |
| FUNC-PRIM-026 | Dot color matches tone | Render `tone="ok"` | Green dot | High |
| FUNC-PRIM-027 | Loading tone animates dot | Render `tone="loading"` | Dot pulses | Medium |
| FUNC-PRIM-028 | Static tones don't animate | Render `tone="ok"` | No animation on dot | Low |
| FUNC-PRIM-029 | Border color matches tone | Inspect | Border tinted with tone color | Low |
| FUNC-PRIM-030 | Background color matches tone soft variant | Inspect | Light tint of tone color | Low |

### TestButton (`primitives/TestButton.tsx`)

| ID | Component contract | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-PRIM-031 | Renders trigger with default "Test connection" label | No `label` prop | Default text shown | Medium |
| FUNC-PRIM-032 | Renders trigger with custom label | `label="Test proxy"` | Custom text shown | High |
| FUNC-PRIM-033 | Click fires `onTest` once | Click once | `onTest` called exactly 1 time | Critical |
| FUNC-PRIM-034 | Spinner appears during async run | Click | Spinner visible while promise pending | High |
| FUNC-PRIM-035 | Button label changes to busyLabel | Click | "Testing…" replaces label | Medium |
| FUNC-PRIM-036 | Button disabled while busy | Click | Button cannot be re-clicked | High |
| FUNC-PRIM-037 | Result chip renders after resolve | onTest resolves `{tone:"ok",label:"OK"}` | StatusBadge shows | Critical |
| FUNC-PRIM-038 | Error caught and rendered as missing | onTest throws | StatusBadge shows tone=missing with err msg | Critical |
| FUNC-PRIM-039 | Error msg truncated to 140 chars | Throw long error | Truncated in detail | Low |
| FUNC-PRIM-040 | `disabled` prop respected | Pass `disabled=true` | Button greyed; click no-op | High |
| FUNC-PRIM-041 | `disabledHint` shown on hover when disabled | Hover | Title attribute populated | Low |
| FUNC-PRIM-042 | `fullWidth` makes button stretch | Pass | `width:100%` applied | Low |
| FUNC-PRIM-043 | Re-clicking after a result clears the chip and runs again | Click → wait → click | New run; old chip replaced | Medium |
| FUNC-PRIM-044 | Async cancellation on unmount | Mount, click, unmount before resolve | No setState-on-unmounted warning | Medium |
| FUNC-PRIM-045 | Spinner spins (CSS animation present) | Click | Visual rotation | Low |

### FieldRow + FieldCard (`primitives/FieldRow.tsx`)

| ID | Component contract | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-PRIM-046 | FieldRow renders label + control + hint stacked | Render basic | All 3 visible in order | Critical |
| FUNC-PRIM-047 | `htmlFor` wires label to control id | Pass `htmlFor="x"`, control `id="x"` | Clicking label focuses control | High |
| FUNC-PRIM-048 | `required` adds red asterisk | Pass `required` | Asterisk visible after label | High |
| FUNC-PRIM-049 | `tip` renders HelpTip after label | Pass `tip="..."` | ⓘ button appears | High |
| FUNC-PRIM-050 | `status` renders StatusBadge after label | Pass `status` | Badge appears | Medium |
| FUNC-PRIM-051 | `error` rendered in red tone under hint | Pass `error="bad"` | Red text with ⚠ visible | High |
| FUNC-PRIM-052 | `success` rendered in green under hint | Pass `success="ok"` | Green text with ✓ visible | Medium |
| FUNC-PRIM-053 | Error and success can coexist (last-write-wins) | Pass both | Both render or last wins per contract | Low |
| FUNC-PRIM-054 | FieldCard renders header + body | Basic | Header above body with divider | Critical |
| FUNC-PRIM-055 | `step` renders gradient circle badge | Pass `step={1}` | Number in circle, indigo→violet gradient | Medium |
| FUNC-PRIM-056 | `step` accepts string | Pass `step="A"` | "A" in circle | Low |
| FUNC-PRIM-057 | `title` rendered as h3 | Pass | h3 element with text | High |
| FUNC-PRIM-058 | `subtitle` rendered under title | Pass | Smaller text under | Medium |
| FUNC-PRIM-059 | `tip` renders HelpTip after title | Pass | ⓘ after title text | Medium |
| FUNC-PRIM-060 | `status` renders StatusBadge in title row | Pass | Badge in row | Medium |
| FUNC-PRIM-061 | `actions` rendered right-aligned in header | Pass `<TestButton/>` | Test button on right | Medium |
| FUNC-PRIM-062 | Tone variant adds left border | `status={tone:"ok"}` | 4px green left border | Low |
| FUNC-PRIM-063 | Card hover raises shadow | Hover | Box-shadow grows | Low |
| FUNC-PRIM-064 | Body padding consistent with --pp-s5 | Inspect | 20px padding | Low |
| FUNC-PRIM-065 | First/last children get correct margin | Inspect first/last | Margin reset | Low |

### Toggle (`primitives/Toggle.tsx`)

| ID | Component contract | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-PRIM-066 | Wraps native checkbox for a11y | Inspect | `<input type="checkbox">` present, visually hidden | Critical |
| FUNC-PRIM-067 | Track shows off state when unchecked | `checked=false` | Grey track, thumb left | High |
| FUNC-PRIM-068 | Track shows on state when checked | `checked=true` | Blue gradient track, thumb right | High |
| FUNC-PRIM-069 | `onChange` fires with new bool value | Click | Called with `true` then `false` | Critical |
| FUNC-PRIM-070 | `disabled` greys + blocks click | Pass | Visual disabled; click no-op | High |
| FUNC-PRIM-071 | Label rendered when provided | `label="X"` | Text after track | Medium |
| FUNC-PRIM-072 | `labelHidden` suppresses visible label | Pass | Label not in DOM (only sr) | Low |
| FUNC-PRIM-073 | Focus-visible shows outline | Tab to toggle | Blue outline appears | High |
| FUNC-PRIM-074 | Keyboard space toggles | Focus + Space | onChange fires | High |
| FUNC-PRIM-075 | Thumb animation smooth | Toggle | CSS transform transitions | Low |

### SettingsSaveBar (`SettingsSaveBar.tsx`)

| ID | Component contract | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-PRIM-076 | Renders null when not dirty and not justSaved | `isDirty=false, justSaved=false` | Returns null | Critical |
| FUNC-PRIM-077 | Renders dirty state when isDirty=true | `isDirty=true` | "Unsaved changes" + Save/Discard | Critical |
| FUNC-PRIM-078 | Renders saved state when justSaved=true and not dirty | `isDirty=false, justSaved=true` | "✓ Settings saved" with green tone | High |
| FUNC-PRIM-079 | Save button calls `draft.save` | Click Save | save() called | Critical |
| FUNC-PRIM-080 | Discard button calls `draft.discard` | Click Discard | discard() called | Critical |
| FUNC-PRIM-081 | role="status" + aria-live="polite" | Inspect | Both present | High |
| FUNC-PRIM-082 | Pulsing dot when dirty | Inspect | CSS animation present | Low |
| FUNC-PRIM-083 | Static check when saved | Inspect | No animation | Low |
| FUNC-PRIM-084 | Tone transition smooth on save | Click Save | bg + border transition | Low |
| FUNC-PRIM-085 | Discard only shown when dirty | `isDirty=false, justSaved=true` | No Discard button | Medium |

### useSettingsDraft (`useSettingsDraft.ts`)

| ID | Component contract | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-PRIM-086 | Snapshots all pulseplay:* keys on mount | First render | Internal snapshot has all current keys | Critical |
| FUNC-PRIM-087 | `isDirty` flips true when localStorage diverges | Write a key | Within poll interval, isDirty=true | Critical |
| FUNC-PRIM-088 | `isDirty` flips false after save | save() | Snapshot updated; isDirty=false | Critical |
| FUNC-PRIM-089 | `justSaved` clears after 3 s | save() then wait | Becomes false after 3s | Medium |
| FUNC-PRIM-090 | `discard` removes new keys + restores snapshot keys | Write key, discard | Key removed; old values restored; display-change event fires | Critical |

---

## FUNC-INT · Cross-component integration (90 scenarios)

### Quick Setup → Stores → App

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-001 | Vendor select in Setup → settingsStore.setBiVendor → localStorage `pulseplay:bi-vendor` | Pick Power BI | localStorage updated | Critical |
| FUNC-INT-002 | Vendor change broadcasts `pulseplay:display-change` | Pick vendor | Event fires on window | High |
| FUNC-INT-003 | Vendor change re-renders BIPanel adapter | Pick vendor → return to app | Correct adapter mounts | Critical |
| FUNC-INT-004 | Embed URL apply → embedConfigStore → localStorage `pulseplay:bi-embed-config` | Apply URL | Key saved with vendor + URL | Critical |
| FUNC-INT-005 | Embed config change re-mounts iframe | Apply → return to app | iframe src updates | High |
| FUNC-INT-006 | AI profile pick → settingsStore.setActiveAiProfile → localStorage `pulseplay:active-ai-profile` | Pick profile | Key saved | Critical |
| FUNC-INT-007 | AI profile pick also writes to genieSettings.assistantProfile | Pick | Both keys updated | High |
| FUNC-INT-008 | Pack pick → setPackSelection → localStorage | Pick | Key saved | High |
| FUNC-INT-009 | Test proxy button → GET /api/health → result chip | Click | Network call fires; chip renders | Critical |
| FUNC-INT-010 | Test profile button → GET /api/assistant/profiles → result chip | Click | Same | Critical |
| FUNC-INT-011 | Footer chip clicks → navigateToSettings → URL changes | Click "Layout & display" | URL becomes /settings/preferences | High |

### Sub-route routing

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-012 | URL → useSettingsRoute → SettingsShell.ActiveGroup dispatcher → sub-page | `/settings/ai/knowledge-base` | AiKnowledgeBase mounts | Critical |
| FUNC-INT-013 | Sub-page changes settings → genieSettingsBridge → localStorage | Toggle in KB | Key updated in `pulseplay:visual-settings:genieSettings` | Critical |
| FUNC-INT-014 | Sub-page write fires `pulseplay:visual-settings-change` event | Toggle | Event fires | High |
| FUNC-INT-015 | Other components reading the same key react to event | KB toggle change | Pulse visual sees new value | High |
| FUNC-INT-016 | useGenieSettingsSlice re-snapshots on event | Toggle from elsewhere | Sub-page re-renders | High |
| FUNC-INT-017 | Sub-route active state in rail reflects URL | Navigate to sub-page | Rail item highlighted | Medium |
| FUNC-INT-018 | Sub-page changes participate in save bar | Toggle | Save bar appears | High |
| FUNC-INT-019 | Discard reverts sub-page changes via genie bridge | Discard | Sub-page UI re-renders with old values | Critical |
| FUNC-INT-020 | URL → useSettingsRoute (popstate listener) updates state | Browser back | Hook re-fires | High |

### Settings shell ↔ App

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-021 | App readiness pill click → navigateToSettings("setup") | Click pill | URL changes; settings opens | High |
| FUNC-INT-022 | Settings "Back to app" → navigateToApp → URL `/` | Click Back | URL changes; app shell re-renders | High |
| FUNC-INT-023 | Settings Esc key → navigateToApp | Press Esc | Same | High |
| FUNC-INT-024 | App tab switcher (mix mode) hidden when AI floated | Float AI | UnifiedSurfaceTabs not rendered | Medium |
| FUNC-INT-025 | App layout preset change → re-renders SplitLayout | Change preset | Layout swaps | High |
| FUNC-INT-026 | App visible-panels change → BIPanel/AISidebar visibility | Toggle | Correct panels visible | High |
| FUNC-INT-027 | App PaneChrome controls → maximize/minimize state | Click maximize | Other pane hides | High |

### Proxy ↔ Frontend

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-028 | Vite dev proxy `/api/*` → `127.0.0.1:8787` | Any fetch | Proxied transparently | Critical |
| FUNC-INT-029 | Proxy /health → /api/health 200 round-trip | curl | Works | Critical |
| FUNC-INT-030 | Proxy /assistant/profiles → /api/assistant/profiles | curl | Works | Critical |
| FUNC-INT-031 | Proxy /assistant/allowlist → /api/assistant/allowlist | curl | Works | Critical |
| FUNC-INT-032 | Proxy /assistant/conversations/start → /api/assistant/conversations/start | POST | Works | Critical |
| FUNC-INT-033 | Proxy /foundation/conversations/start-stream → /api/foundation/conversations/start-stream | POST NDJSON | Works | High |
| FUNC-INT-034 | Proxy /assistant/embed-token/powerbi → /api/assistant/embed-token/powerbi | POST | Works | High |
| FUNC-INT-035 | Network error during fetch → Pulse banner | Stop proxy | Banner appears within 10s | High |

### Backend adapter system

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-036 | createBackend → returns correct adapter for connectionMode | "proxy" mode | GenieClient proxy backend | Critical |
| FUNC-INT-037 | createBackend → FoundationModelStreamBackend for "foundation-stream" | Mode | Stream backend | High |
| FUNC-INT-038 | createBackend → SupervisorBackend for "supervisor" | Mode | Supervisor backend | High |
| FUNC-INT-039 | createBackend → throws for unknown mode | Mode = "x" | Error | Medium |
| FUNC-INT-040 | Backend startConversation returns conversationId | POST | id returned | Critical |
| FUNC-INT-041 | Backend waitForMessageWithProgress emits status callbacks | Poll | Callback fires for each stage | High |
| FUNC-INT-042 | Backend with onContentChunk emits incremental content | Stream | Callback fires per token | High |
| FUNC-INT-043 | Backend resolves with completed message on done | Stream end | Promise resolves | Critical |
| FUNC-INT-044 | Backend rejects on stream error | Network break | Promise rejects | High |

### Chart system

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-045 | Message with queryResult → MessageViewPicker shows Chart/Table | Render | Tabs appear | Critical |
| FUNC-INT-046 | Click Chart tab → GenieChart renders | Click | Chart visible | Critical |
| FUNC-INT-047 | GenieChart picks recommended from analyzeDataShape | Render | Recommended chart shows | High |
| FUNC-INT-048 | Chart type select → buildEChartsOption → EChartsRenderer.option update | Pick type | Chart re-renders | Critical |
| FUNC-INT-049 | buildEChartsOption returns null → "Not enough data" fallback | Incompatible data | Message shown | High |
| FUNC-INT-050 | EChartsRenderer.option change → setOption(option, {notMerge:true}) | Pick type | Chart updates without re-init | High |
| FUNC-INT-051 | EChartsRenderer mount → echarts.init on container | Mount | init called | Critical |
| FUNC-INT-052 | EChartsRenderer unmount → instance.dispose | Unmount | dispose called | High |
| FUNC-INT-053 | Window resize → instance.resize | Resize | Chart adjusts | Medium |
| FUNC-INT-054 | KPI tile path bypasses ECharts entirely | Chart type = "kpi" | DOM-only render | High |

### Settings persistence

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-055 | localStorage write fires storage event in other tabs | Tab A writes | Tab B sees | High |
| FUNC-INT-056 | Custom display-change event fires in same tab | Tab A writes | Tab A listeners fire | Critical |
| FUNC-INT-057 | All stores listen to display-change for cross-write sync | KB toggle | settingsStore updates if relevant | High |
| FUNC-INT-058 | Orphan detection on next allowlist fetch | Pick disallowed vendor, then enforce | Orphan banner appears | High |
| FUNC-INT-059 | Orphan banner clears when value moves back into allowlist | Re-add | Banner gone | Medium |
| FUNC-INT-060 | useSettings hook returns reactive state | Pick vendor | Hook re-fires | Critical |

### Embed configuration

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-061 | EmbedConfigForm dispatcher → correct vendor form mounts | Pick vendor | Form swaps | Critical |
| FUNC-INT-062 | PowerBIEmbedForm mode toggle → correct sub-form | Switch SSO → Backend | Sub-form swaps | High |
| FUNC-INT-063 | Apply → embedConfigStore.setEmbedConfig | Click Apply | Store updated | Critical |
| FUNC-INT-064 | Apply emits config-change for BIPanel | Apply | Event fires | High |
| FUNC-INT-065 | Apply validates against allowlist.embedOrigins | URL outside list | Rejected | High |
| FUNC-INT-066 | Apply validates against allowlist.powerbiWorkspaces | Out of list | Rejected | High |
| FUNC-INT-067 | Clear button removes config from store | Click Clear | Store empty | High |
| FUNC-INT-068 | BIPanel re-mounts when vendor changes | Vendor change | Adapter teardown + new mount | Critical |
| FUNC-INT-069 | BIPanel registry.loadAdapter lazy-loads correct file | Pick vendor | Vite chunk loaded | Medium |
| FUNC-INT-070 | BIPanel passes config to adapter.mount | Mount | Adapter receives correct config | Critical |

### AI assistant integration

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-071 | AISidebar reads activeAiProfile from settings | Profile change | Sidebar re-renders | Critical |
| FUNC-INT-072 | AISidebar reads connectionMode from genieSettings | Mode change | Backend swaps on next request | Critical |
| FUNC-INT-073 | AISidebar reads apiBaseUrl from genieSettings | URL change | Subsequent calls hit new URL | High |
| FUNC-INT-074 | AISidebar context includes current BI vendor | Send message | Question includes BI context | High |
| FUNC-INT-075 | AISidebar context includes current pack | Send | Pack name in context | Medium |
| FUNC-INT-076 | AISidebar feedback (thumbs) writes to backend | Click | POST /feedback | Medium |
| FUNC-INT-077 | AISidebar history writes to backend | Send | POST /history | Medium |
| FUNC-INT-078 | AISidebar suggested actions submit on click | Click pill | Re-submits as new question | High |

### Insights pipeline

| ID | Integration path | Action | Expected | Severity |
|---|---|---|---|---|
| FUNC-INT-079 | Insights trigger → discovery → schema fetch | Trigger | discoveryClient.getDiscoverySnapshot called | High |
| FUNC-INT-080 | Insights stage 0 runs first (HEADLINE) | Trigger | First stage starts | High |
| FUNC-INT-081 | Insights stages 1-N fan out in parallel with concurrency 3 | Trigger | Network shows 3 in-flight | High |
| FUNC-INT-082 | Insights cache key includes settings fingerprint | Change a setting | Cache miss on next run | Medium |
| FUNC-INT-083 | Insights cache TTL respected | Set TTL = 0 | No cache hits | Medium |
| FUNC-INT-084 | Insights validator emits 4 statuses (Verified/Grounded/Suggestion/Blocked) | Trigger | Each section has a status badge | High |
| FUNC-INT-085 | Insights provenance footer appears when toggle on | Toggle ON | Footer with source visible | Medium |
| FUNC-INT-086 | Insights research traces visible when toggle on AND traces present | Toggle ON + Agent Mode data | Trace section renders | Medium |
| FUNC-INT-087 | Insights stage override prompt used when filled | Set HEADLINE override | Custom prompt sent for HEADLINE stage | High |
| FUNC-INT-088 | Insights metric direction rules influence pill tones | Set rule | Pill colors change | High |
| FUNC-INT-089 | Insights cache invalidates on schema hash change | Schema changes | Cache miss | Medium |
| FUNC-INT-090 | Insights re-uses earlier stage results when reusedFromTitle set | Same question twice | Second uses memory | Medium |

---

## FUNC-UNI · Design + behavior uniformity (110 scenarios)

### Primitive usage uniformity

| ID | Pattern | Verification | Expected | Severity |
|---|---|---|---|---|
| FUNC-UNI-001 | All sub-route pages use SubPageHeader for top header | grep imports in `groups/sub/*.tsx` | All 5 sub-pages import SubPageHeader | High |
| FUNC-UNI-002 | All sub-pages use FieldCard, not raw `<section>` | Inspect DOM | Every section is `.pp-card` | High |
| FUNC-UNI-003 | All sub-pages use FieldRow for fields | Inspect | Every field row is `.pp-field` | High |
| FUNC-UNI-004 | All toggle controls use Toggle primitive | grep `<input type="checkbox"` outside Toggle.tsx | Zero matches in groups/sub/* | High |
| FUNC-UNI-005 | All async test buttons use TestButton | grep for inline button + fetch patterns | All async tests use TestButton | Medium |
| FUNC-UNI-006 | All inline status pills use StatusBadge | grep for inline `.pp-badge` markup | All use StatusBadge component | Medium |
| FUNC-UNI-007 | All help affordances use HelpTip | grep for ad-hoc `title=` tooltips on inputs | Replaced with HelpTip where possible | Low |
| FUNC-UNI-008 | All persistence via genieSettingsBridge or settingsStore | grep direct `localStorage.setItem` in sub/* | Only the bridge writes directly | High |
| FUNC-UNI-009 | All sub-routes register a dispatcher entry in SettingsShell.ActiveGroup | Inspect dispatcher | Every sub-leaf has a route entry | Critical |
| FUNC-UNI-010 | All sub-routes appear in GROUP_LEAF_LABELS for search | Inspect dict | Every sub-route surfaced in search | High |
| FUNC-UNI-011 | All sub-routes also in SUB_ROUTE_LABELS in drift test | Inspect test | Drift test passes | High |
| FUNC-UNI-012 | Every sub-route has at least one HelpTip per FieldRow | Audit each sub-page | True | Medium |

### Visual consistency

| ID | Pattern | Verification | Expected | Severity |
|---|---|---|---|---|
| FUNC-UNI-013 | All buttons use `--pp-radius-sm` border-radius | Inspect | 6px or 8px consistent | Low |
| FUNC-UNI-014 | All cards use `--pp-radius-lg` (14px) | Inspect | Consistent | Low |
| FUNC-UNI-015 | All inputs use `--pp-radius-sm` | Inspect | Consistent | Low |
| FUNC-UNI-016 | All accents use `--pp-accent` (#2563eb) | Inspect | Same blue across surface | High |
| FUNC-UNI-017 | All hover states use `--pp-t-base` (160ms) | Inspect | Consistent timing | Low |
| FUNC-UNI-018 | All animations use `--pp-ease` cubic-bezier | Inspect | Consistent feel | Low |
| FUNC-UNI-019 | All shadows from `--pp-shadow-*` scale | Inspect | No ad-hoc box-shadow | Low |
| FUNC-UNI-020 | All spacing from `--pp-s*` scale | Inspect | No magic numbers | Low |
| FUNC-UNI-021 | All text from `--pp-text-*` size scale | Inspect | Consistent | Low |
| FUNC-UNI-022 | All font family from `--pp-font` | Inspect | Consistent | Low |
| FUNC-UNI-023 | Save bar consistent across all sub-routes | Edit in each | Same bar appears | Medium |
| FUNC-UNI-024 | Status badge tones consistent across surface | Compare KB sub-page tone vs Setup card tone | Same ok/warn/missing/info colors | Medium |
| FUNC-UNI-025 | HelpTip variant usage consistent | info default everywhere | warn / tip only when intentional | Low |
| FUNC-UNI-026 | All sub-pages have gradient title text (SubPageHeader) | Visual | Same indigo→violet | Low |
| FUNC-UNI-027 | All sub-page subtitles 13px line-height 1.55 | Inspect | Same metrics | Low |
| FUNC-UNI-028 | All quick-jump chips look the same | Compare | Same chip style | Low |
| FUNC-UNI-029 | All "Back to app" buttons consistent | Compare | Same style | Low |
| FUNC-UNI-030 | All status chips in header strip consistent | Compare | Same chip family | Low |
| FUNC-UNI-031 | All sub-route active-rail items use same active style | Nav each | Same blue tinted bg | Low |
| FUNC-UNI-032 | All test buttons spinner is the same | Compare | Same animation | Low |
| FUNC-UNI-033 | All field hints under inputs same size | Inspect | Same | Low |
| FUNC-UNI-034 | All errors same red tone | Compare | Same | Low |
| FUNC-UNI-035 | All successes same green tone | Compare | Same | Low |

### Behavior uniformity

| ID | Pattern | Verification | Expected | Severity |
|---|---|---|---|---|
| FUNC-UNI-036 | All async ops wrapped in try/catch | grep `fetch(` in src | Every fetch has catch | High |
| FUNC-UNI-037 | All catch blocks render a user-friendly message | Inspect | No silent failures | High |
| FUNC-UNI-038 | All errors include actionable guidance | Inspect messages | "Try X" or "Click Retry" | Medium |
| FUNC-UNI-039 | All form fields validate on blur | Test each | Consistent timing | Medium |
| FUNC-UNI-040 | All toggles persist immediately on change | Test each | localStorage updated synchronously | High |
| FUNC-UNI-041 | All inputs persist on blur, not on every keystroke | Test | Storage write rate sane | Medium |
| FUNC-UNI-042 | All multi-line inputs use textarea, never contenteditable | Inspect | Consistent | Medium |
| FUNC-UNI-043 | All boolean settings use Toggle, never checkbox | Inspect | Consistent | Medium |
| FUNC-UNI-044 | All enum settings use select OR radio group, not arbitrary buttons | Inspect | Consistent | Low |
| FUNC-UNI-045 | All free-text settings use input or textarea, never contenteditable div | Inspect | Consistent | Low |
| FUNC-UNI-046 | All save flows go through save bar (no inline Save button) | Sub-pages | Save bar is sole commit | High |
| FUNC-UNI-047 | All discard flows go through save bar (no inline Reset) | Sub-pages | Discard via save bar | High |
| FUNC-UNI-048 | All test buttons return same shape `{tone, label, detail}` | Inspect | Consistent | Medium |
| FUNC-UNI-049 | All navigation through navigateToSettings/navigateToApp helpers | grep `pushState` | All via helpers | Medium |
| FUNC-UNI-050 | All sub-route paths follow kebab-case | URL audit | All lowercase + dashes | Low |
| FUNC-UNI-051 | All field IDs follow kebab-case | Inspect | Consistent | Low |
| FUNC-UNI-052 | All className strings follow BEM-ish (`pp-{block}__{element}--{modifier}`) | Inspect | Consistent | Low |
| FUNC-UNI-053 | All a11y labels start with action verb | Audit | "Open settings…" not "Settings open" | Low |
| FUNC-UNI-054 | All tooltip content uses sentence case | Audit | Not Title Case | Low |
| FUNC-UNI-055 | All required fields show red asterisk | Audit | Consistent | High |
| FUNC-UNI-056 | All optional fields don't show asterisk | Audit | Consistent | Low |
| FUNC-UNI-057 | All disabled fields explain why (title or hint) | Audit | "Pick a profile first" etc. | Medium |
| FUNC-UNI-058 | All "Coming next cycle" features disabled with hint | Audit | Consistent | Low |

### Voice + copy uniformity

| ID | Pattern | Verification | Expected | Severity |
|---|---|---|---|---|
| FUNC-UNI-059 | All hints end with period | Audit | Consistent | Low |
| FUNC-UNI-060 | All field labels sentence case | Audit | "Synthesis prompt" not "Synthesis Prompt" | Low |
| FUNC-UNI-061 | All button labels Title Case for primary, sentence for secondary | Audit | Consistent | Low |
| FUNC-UNI-062 | All tooltips factual, not promotional | Audit | "Adds X to system prompt" not "Better answers!" | Low |
| FUNC-UNI-063 | All errors specify what went wrong AND what to try | Audit | "Proxy unreachable. Check it's running on 8787." | Medium |
| FUNC-UNI-064 | All names use "PulsePlay" not "Pulse Play" | Audit | Consistent | Low |
| FUNC-UNI-065 | All API names: "PulsePlay Proxy" not "UniBridge Proxy" | Audit | Consistent (post 2026-05-19 rename) | Critical |
| FUNC-UNI-066 | All vendor names match Databricks/Microsoft official capitalization | Audit | "Power BI" not "PowerBI"; "Databricks" not "Data Bricks" | Low |
| FUNC-UNI-067 | All connector names: Genie, Foundation Model, Supervisor | Audit | Consistent | Low |
| FUNC-UNI-068 | All Pulse code paths called "Pulse" not "Pulseplay" or "Pulse Play" | Audit | Consistent | Low |
| FUNC-UNI-069 | All technical terms hyperlinked first occurrence per page | Audit | Consistent linking | Low |
| FUNC-UNI-070 | All "click X" replaced with neutral "open X" (mouse-only verb avoided) | Audit | Consistent | Low |

### Architectural uniformity

| ID | Pattern | Verification | Expected | Severity |
|---|---|---|---|---|
| FUNC-UNI-071 | All localStorage keys use `pulseplay:` prefix | grep | No legacy keys | High |
| FUNC-UNI-072 | All proxy endpoints under `/assistant` or `/foundation` namespace | Inspect routes | No bare endpoints | High |
| FUNC-UNI-073 | All settings React state through context (no prop drilling) | Inspect | Consistent | Medium |
| FUNC-UNI-074 | All tests in `__tests__/*.test.tsx` next to source | grep | Consistent | Low |
| FUNC-UNI-075 | All async backend calls go through createBackend, not direct fetch | Inspect Pulse code | Consistent | High |
| FUNC-UNI-076 | All component file names PascalCase | Inspect | Consistent | Low |
| FUNC-UNI-077 | All hook file names camelCase starting with "use" | Inspect | Consistent | Low |
| FUNC-UNI-078 | All TypeScript types co-located OR in shared types/ | Inspect | Consistent | Low |
| FUNC-UNI-079 | All barrel exports via index.ts in primitives/, components/ | Inspect | Consistent | Low |
| FUNC-UNI-080 | All CSS classes prefixed pp- or gn- | grep | No unscoped CSS | High |
| FUNC-UNI-081 | All Vite chunks named meaningfully (not vendor-XXX hashes only) | Build output | Reasonable names | Low |
| FUNC-UNI-082 | All lazy-loaded routes use React.lazy + Suspense | Inspect | Consistent | Medium |
| FUNC-UNI-083 | All event listeners cleaned up in useEffect return | Audit | Consistent | High |
| FUNC-UNI-084 | All timers cleared in useEffect return | Audit | Consistent | High |
| FUNC-UNI-085 | All AbortControllers used for cancelable fetches | Audit | Consistent | Medium |

### Documentation uniformity

| ID | Pattern | Verification | Expected | Severity |
|---|---|---|---|---|
| FUNC-UNI-086 | All sub-route components have a top-of-file comment explaining purpose | Audit | Consistent | Low |
| FUNC-UNI-087 | All primitives have a usage example in comment | Audit | Consistent | Low |
| FUNC-UNI-088 | All complex functions have a docstring | Audit | Consistent | Low |
| FUNC-UNI-089 | All public APIs typed (no `any` unless justified) | tsc strict | Consistent | Medium |
| FUNC-UNI-090 | All TODO/FIXME comments dated with author | grep | Consistent | Low |
| FUNC-UNI-091 | All HANDOVER entries newest-on-top | Audit | Consistent | Medium |
| FUNC-UNI-092 | All ADRs follow MADR template | Audit | Consistent | Low |
| FUNC-UNI-093 | All feature docs in docs/ with consistent header | Audit | Consistent | Low |
| FUNC-UNI-094 | All code references in docs use `[file.ts:42](path:42)` | Audit | Consistent | Low |
| FUNC-UNI-095 | All test files have a header comment explaining what's tested | Audit | Consistent | Low |
| FUNC-UNI-096 | All commit messages follow conventional commits | git log | Consistent (feat/fix/docs/refactor) | Low |
| FUNC-UNI-097 | All co-authored commits cite Claude | git log | Consistent | Low |
| FUNC-UNI-098 | All branches follow naming `feature/x` or `fix/x` | git branch | Consistent | Low |
| FUNC-UNI-099 | All PR descriptions follow template | gh pr list | Consistent | Low |
| FUNC-UNI-100 | All issues have severity label | gh issue list | Consistent | Low |

### Cross-vendor + cross-AI uniformity

| ID | Pattern | Verification | Expected | Severity |
|---|---|---|---|---|
| FUNC-UNI-101 | All BI vendor adapters implement BIAdapter interface fully | Inspect | mount/on/send/destroy all present | Critical |
| FUNC-UNI-102 | All vendor adapters honor sandbox attribute customization | Inspect | All accept narrow sandbox | High |
| FUNC-UNI-103 | All vendor adapters emit consistent event shape | Inspect | Same event types across vendors | High |
| FUNC-UNI-104 | All connector backends implement SingleSpaceBackend or SupervisorBackend | Inspect | Consistent | High |
| FUNC-UNI-105 | All connector backends emit consistent status callbacks | Inspect | Same status enum used | High |
| FUNC-UNI-106 | All connector backends handle cancellation | Inspect | AbortController honored | High |
| FUNC-UNI-107 | All embed token endpoints follow `/api/assistant/embed-token/<vendor>` pattern | Audit | Consistent | Medium |
| FUNC-UNI-108 | All probe endpoints return ConnectorProbeResult shape | Audit | Consistent | Medium |
| FUNC-UNI-109 | All vendor configs use vendor-specific shape under common envelope | Audit | Consistent | Medium |
| FUNC-UNI-110 | All vendor docs follow same structure | Audit | Consistent | Low |

---

## FUNC-UC · End-to-end use cases (140 scenarios)

### First-run author journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-001 | New author opens PulsePlay for the first time | Open `/` with empty localStorage | First-run wizard appears OR Quick Setup pill shows "Setup needed" | High |
| FUNC-UC-002 | New author configures Power BI in under 2 min | Wizard or Setup → paste PBI URL → Apply → ✓ | Setup ready, embed visible | Critical |
| FUNC-UC-003 | New author configures Databricks Genie in under 2 min | Pick Genie → paste iframe → Apply → ✓ | Same | Critical |
| FUNC-UC-004 | New author picks AI profile | Setup → pick `default` → Test profile → ✓ | Profile registered | Critical |
| FUNC-UC-005 | New author asks first question | Ask Pulse → fixture question | Response within 30-90s | Critical |
| FUNC-UC-006 | New author sees suggested followups | After first response | "Try asking" pills | High |
| FUNC-UC-007 | New author clicks a followup | Click pill | New conversation continues | High |
| FUNC-UC-008 | New author exports support bundle | System → Export | JSON downloads with redacted tokens | Medium |
| FUNC-UC-009 | New author signs out | Advanced → Sign Out Power BI | MSAL cleared; embed re-prompts | High |
| FUNC-UC-010 | New author resets all settings | Advanced → Reset all → type "Reset all" → Reset | All `pulseplay:*` cleared | High |

### Power-user journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-011 | Power user navigates via URL bar to specific sub-route | Type `/settings/ai/knowledge-base` | Sub-page renders | High |
| FUNC-UC-012 | Power user uses Cmd+/ to find "validation retry" | Cmd+/ → type → Enter | System group surfaces | Medium |
| FUNC-UC-013 | Power user toggles 5 settings then saves | Multiple toggles → Save | All persist | High |
| FUNC-UC-014 | Power user toggles 5 then discards | Multiple → Discard | All reverted | High |
| FUNC-UC-015 | Power user opens 3 tabs, edits different settings | 3 tabs | Each tab persists own changes; cross-syncs via storage events | Medium |
| FUNC-UC-016 | Power user uses keyboard-only navigation through Settings | Tab + Enter | All settings reachable | High |
| FUNC-UC-017 | Power user copies a sub-route link to share | Right-click on rail item → Copy link | URL copied to clipboard | Low |
| FUNC-UC-018 | Power user bookmarks Settings → Appearance | Bookmark | Returns to same sub-page | Low |
| FUNC-UC-019 | Power user uses high-contrast mode | OS toggle | App still usable | High |
| FUNC-UC-020 | Power user uses 200% browser zoom | Ctrl+= | Layout reflows; no horizontal scroll | High |

### Multi-tab scenarios

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-021 | Tab A picks vendor X, Tab B sees vendor X immediately | Pick in A | B updates via storage event | High |
| FUNC-UC-022 | Tab A saves, Tab B's save bar reflects new baseline | Save in A | B's snapshot updated | Medium |
| FUNC-UC-023 | Tab A discards, Tab B sees reverted state | Discard in A | B updates | Medium |
| FUNC-UC-024 | Tab A asks question, Tab B has independent history | Send in A | B unaffected | Medium |
| FUNC-UC-025 | Tab A closes, Tab B unaffected | Close A | B continues | Low |

### Settings author journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-026 | Author configures Insights stages | AI → AI Insights → toggle HEADLINE off | HEADLINE not in next Insights run | High |
| FUNC-UC-027 | Author writes custom prompt | Custom prompt textarea | Prompt influences Insights | High |
| FUNC-UC-028 | Author writes domain guidance | Domain guidance | Guidance in system prompt | Medium |
| FUNC-UC-029 | Author defines custom sections | Custom sections | New sections appear in Insights | Medium |
| FUNC-UC-030 | Author defines metric direction rules | Metric direction rules | Pill colors reflect | High |
| FUNC-UC-031 | Author tunes cache TTL | Cache TTL select | TTL honored | Medium |
| FUNC-UC-032 | Author toggles provenance footer | Toggle | Footer visible/hidden | Medium |
| FUNC-UC-033 | Author toggles research traces | Toggle | Traces visible when present | Medium |
| FUNC-UC-034 | Author writes HEADLINE override | Override textarea | Override used | Medium |
| FUNC-UC-035 | Author writes TRENDS override | Override | Used | Medium |
| FUNC-UC-036 | Author writes RISKS override | Override | Used | Medium |
| FUNC-UC-037 | Author writes ACTIONS override | Override | Used | Medium |
| FUNC-UC-038 | Author saves all Insights customizations | Save | All persist | High |

### Chat author journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-039 | Author asks 3 questions in same session | Send 3 | Each conversation continues context | High |
| FUNC-UC-040 | Author switches chart type 5 times | Type select | Each renders correctly | Medium |
| FUNC-UC-041 | Author switches to Table view | Click Table | Tabular data | High |
| FUNC-UC-042 | Author switches to SQL view (with Dev Tools → Show SQL on) | Click SQL | SQL displayed | Medium |
| FUNC-UC-043 | Author copies SQL | Copy button | Clipboard | Medium |
| FUNC-UC-044 | Author exports CSV | Export | CSV download | Medium |
| FUNC-UC-045 | Author marks answer helpful | 👍 | Feedback POST | Medium |
| FUNC-UC-046 | Author marks answer unhelpful + comment | 👎 + text | Feedback POST with comment | Medium |
| FUNC-UC-047 | Author copies answer | Copy answer | Markdown to clipboard | Medium |
| FUNC-UC-048 | Author starts new conversation | Clear / new convo | Old context cleared | Medium |
| FUNC-UC-049 | Author scrolls through long history | 50 messages | Virtualization works | Medium |
| FUNC-UC-050 | Author sees featured suggestion pill | After Insights | Gradient pill visible | Low |

### Power BI specific journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-051 | Author uses Secure embed mode | Paste secure link → Apply | Embed loads via autoAuth | Critical |
| FUNC-UC-052 | Author uses SSO mode | Fill fields → Sign in & embed | MSAL → embed | High |
| FUNC-UC-053 | Author uses Backend mode | Fill fields → Apply | Proxy issues token → embed | High |
| FUNC-UC-054 | Author uses Manual mode | Paste URL + token → Apply | Embed loads | Medium |
| FUNC-UC-055 | Author switches mode mid-session | Change mode | Form swaps; old fields preserved or cleared per contract | Medium |
| FUNC-UC-056 | Author signs out of Power BI | Sign Out | MSAL cleared | High |
| FUNC-UC-057 | Author embeds report from different workspace | Apply | Switches if allowed; rejected if not | High |
| FUNC-UC-058 | Author embeds dashboard (not report) | Dashboard URL | Loads with dashboard chrome | Medium |
| FUNC-UC-059 | Author embeds paginated report | Paginated URL | Loads | Low |
| FUNC-UC-060 | Author embeds Q&A visual | Q&A URL | Loads | Low |

### Databricks Genie specific journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-061 | Author embeds Genie space iframe | Paste iframe HTML → Apply | Embed loads | Critical |
| FUNC-UC-062 | Author asks Genie a question | Send | Genie processes; result with SQL | Critical |
| FUNC-UC-063 | Author sees Genie warehouse spin-up | First question | Progress through stages | High |
| FUNC-UC-064 | Author sees Genie answer with chart-able data | Send | Chart tab available | High |
| FUNC-UC-065 | Author sees Genie narrative response (no SQL) | Some questions | Only narrative tab — by design | Medium |
| FUNC-UC-066 | Author switches Genie space | Re-paste different iframe | New space loads | High |
| FUNC-UC-067 | Author asks question, Genie returns empty result | Edge | "No results" message | Medium |
| FUNC-UC-068 | Author asks question, Genie returns error | Edge | Error message visible | High |
| FUNC-UC-069 | Author asks question, Genie times out | Slow warehouse | Timeout message + retry | High |
| FUNC-UC-070 | Author asks 100k row question | Large result | Result virtualized or truncated | Medium |

### Cross-vendor journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-071 | Author runs PBI + Genie in mix mode | Configure both | Both panels visible | High |
| FUNC-UC-072 | Author runs PBI + Foundation Model AI | Configure | Both work | Medium |
| FUNC-UC-073 | Author runs PBI + Supervisor AI | Configure | Both work | Medium |
| FUNC-UC-074 | Author runs Genie + Genie AI | Configure | Works | Critical |
| FUNC-UC-075 | Author switches BI vendor mid-session | PBI → Genie | Old embed unmounts; new mounts | High |
| FUNC-UC-076 | Author switches AI profile mid-session | default → supervisor | Next question uses new profile | High |
| FUNC-UC-077 | Author switches pack mid-session | Pick new pack | Next Insights uses new pack | Medium |
| FUNC-UC-078 | Author maximizes AI pane | Max | BI hides | High |
| FUNC-UC-079 | Author maximizes BI pane | Max | AI hides | High |
| FUNC-UC-080 | Author restores both panes | Restore | Both visible | High |

### Layout author journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-081 | Author picks each layout preset T1-T5 | Cycle through | Each renders distinct layout | High |
| FUNC-UC-082 | Author customizes layout (hand-tune) | Tune | "Custom" label appears | Medium |
| FUNC-UC-083 | Author hides BI panel | Visible panels → AI only | BI hidden | High |
| FUNC-UC-084 | Author hides AI panel | Visible panels → BI only | AI hidden | High |
| FUNC-UC-085 | Author uses mix mode | Mix | Surface tabs appear | High |
| FUNC-UC-086 | Author repositions AI panel | Left → Right | Layout flips | Medium |
| FUNC-UC-087 | Author repositions AI panel top/bottom | Top → Bottom | Vertical layout | Medium |
| FUNC-UC-088 | Author resizes split | Drag resizer | Sizes adjust | Medium |
| FUNC-UC-089 | Author floats AI panel | Float button | Draggable overlay | High |
| FUNC-UC-090 | Author docks floating panel | Dock button | Returns to layout | High |

### Recovery journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-091 | Author closes browser mid-edit | Force quit | On reopen, save bar shows (state preserved) | High |
| FUNC-UC-092 | Author loses network mid-query | Wi-Fi off | Error after timeout; retry available | High |
| FUNC-UC-093 | Author's proxy crashes mid-session | Stop proxy | Banner appears; recovers when restarted | High |
| FUNC-UC-094 | Author's AAD token expires | Wait 14d | Re-auth prompt; chat continues with degraded mode | High |
| FUNC-UC-095 | Author's pack file becomes 404 | Server-side | Pack falls back to default; warning visible | Medium |
| FUNC-UC-096 | Author's profile renamed server-side | Server-side | Orphan banner; user re-picks | Medium |
| FUNC-UC-097 | Author's embed URL becomes invalid | URL expires | Embed shows clear error; user re-pastes | Medium |
| FUNC-UC-098 | Author's localStorage hits quota | Disk full | Soft warning; settings still work in-memory | Medium |
| FUNC-UC-099 | Author closes settings without saving | Esc with dirty state | Confirm prompt OR state preserved silently | Medium |
| FUNC-UC-100 | Author refreshes with dirty state | F5 | Snapshot re-baselines; changes preserved as new state | Medium |

### Sub-route configuration journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-101 | Author enables/disables 4 KB rules independently | KB sub-route | Each persists | Medium |
| FUNC-UC-102 | Author turns off KB master | Master off | Children disabled but values preserved | Medium |
| FUNC-UC-103 | Author re-enables KB master | Master on | Children take previous values | Medium |
| FUNC-UC-104 | Author writes synthesis prompt | Supervisor sub-route | Prompt used by synthesiser | Medium |
| FUNC-UC-105 | Author picks Slate Dark theme | Appearance | App turns dark | Medium |
| FUNC-UC-106 | Author picks Custom theme + color | Appearance | Custom palette applied | Medium |
| FUNC-UC-107 | Author toggles dark mode | Appearance | Dark mode regardless of theme | High |
| FUNC-UC-108 | Author enables dev mode | Developer Tools | SQL + Trace tabs visible | High |
| FUNC-UC-109 | Author increases retry count | Dev Tools | Retries on validation failures | Medium |
| FUNC-UC-110 | Author defines forbidden columns | BI Governance | Assistant avoids in next query | High |
| FUNC-UC-111 | Author defines mandatory row filter | BI Governance | Filter included in generated SQL | High |
| FUNC-UC-112 | Author switches auth mode shared → OAuth | BI Governance | Future requests use new mode | High |

### Long-running journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-113 | Author has 8-hour session | All day usage | App stays responsive; no memory leak | Medium |
| FUNC-UC-114 | Author leaves browser idle 1 hour | Idle | Wake refreshes proxy state | Medium |
| FUNC-UC-115 | Author runs 100 queries in a row | Repeat | All work; history scrollable | Medium |
| FUNC-UC-116 | Author opens 10 tabs over an hour | Many tabs | Each independent; storage sync works | Medium |
| FUNC-UC-117 | Author works during proxy upgrade | Restart proxy | Banner shows during downtime; recovers | High |
| FUNC-UC-118 | Author works during dev server hot reload | Code change | App reloads; settings preserved | Medium |
| FUNC-UC-119 | Author works during Databricks workspace maintenance | Maintenance | Genie errors; chat shows clear msg | Medium |
| FUNC-UC-120 | Author works during AAD outage | AAD down | PBI embed errors; PulsePlay shell still works | Medium |

### Demo / presentation journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-121 | Demoer presents to executives, sub-1-minute setup | Pre-staged config | Embed + AI ready instantly | High |
| FUNC-UC-122 | Demoer asks question, audience watches stream | Foundation Model | Sections stream visibly | High |
| FUNC-UC-123 | Demoer switches charts live | Audience watches | Smooth transitions | Medium |
| FUNC-UC-124 | Demoer maximizes AI pane for emphasis | Max | Clean maximize | Medium |
| FUNC-UC-125 | Demoer uses presentation mode (if exists) | Toggle | Distractions hidden | Low |
| FUNC-UC-126 | Demoer screenshots an answer for slide | Screenshot tool | Clean visual | Medium |
| FUNC-UC-127 | Demoer prints to PDF | Print | Layout prints cleanly | Low |
| FUNC-UC-128 | Demoer shares screen with team | Screen share | Animations don't choke encoder | Medium |
| FUNC-UC-129 | Demoer records a video walkthrough | Record | Audio + visual smooth | Low |
| FUNC-UC-130 | Demoer hands keyboard to attendee | Hand off | Other person can interact without breaking demo | Medium |

### Cross-environment journeys

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-UC-131 | Same user, dev workspace at home, prod workspace at office | Two envs | Both work with their own proxies | Medium |
| FUNC-UC-132 | Same user, different Databricks workspaces in one day | Switch | Each session isolated | Medium |
| FUNC-UC-133 | Same user, different Power BI tenants in one day | Switch AAD | Each session isolated | Medium |
| FUNC-UC-134 | Author commutes (laptop sleep/wake repeatedly) | Open/close lid | Resumes cleanly each time | Medium |
| FUNC-UC-135 | Author tethered to phone hotspot | High latency | App still usable | Medium |
| FUNC-UC-136 | Author on corporate VPN | VPN | Proxy reachable; embeds work | Medium |
| FUNC-UC-137 | Author at airport Wi-Fi (captive portal) | Captive | Graceful error; works after login | Medium |
| FUNC-UC-138 | Author on plane Wi-Fi (slow) | 1 Mbps | Patient progress indicators | Low |
| FUNC-UC-139 | Author on 5G hotspot | Fast | Snappy | Low |
| FUNC-UC-140 | Author over corporate proxy MITM | Proxy with cert inspection | Either works with NODE_EXTRA_CA_CERTS or shows clear error | Medium |

---

## FUNC-AUTH · Author journeys (140 scenarios)

> **Author ≠ end user.** End users open the app, ask questions, see answers.
> Authors *configure* PulsePlay for their org: pick vendors, write knowledge packs, manage allowlists, tune governance, set themes, hand off to colleagues, troubleshoot when things break.
>
> Winning the author's mind means: every setting is **findable**, every change is **reversible**, every save is **observable**, every error is **diagnosable**, every config is **portable**.

### First-time-setup author (the "Org IT admin")

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-001 | Admin opens PulsePlay for first time after install | Fresh clone + first launch | Lands on Quick Setup OR first-run wizard | High |
| FUNC-AUTH-002 | Admin understands "what is PulsePlay" in 10 seconds | Read Setup subtitle + tooltips | Comprehension without external docs | High |
| FUNC-AUTH-003 | Admin sees readiness chip telling them what's missing | Top-right | Clear "BI + AI needed" guidance | Critical |
| FUNC-AUTH-004 | Admin configures BI vendor without docs | Quick Setup Step 1 | Vendor select + paste URL works intuitively | Critical |
| FUNC-AUTH-005 | Admin configures AI profile without docs | Quick Setup Step 2 | Profile select + Test buttons clarify what's needed | Critical |
| FUNC-AUTH-006 | Admin can finish setup in under 5 minutes | Stopwatch | Pass | Critical |
| FUNC-AUTH-007 | Admin understands what a "Knowledge pack" is via tooltip | Hover ⓘ on Step 3 | Tooltip explains domain vocabulary concept | High |
| FUNC-AUTH-008 | Admin sees clear status feedback at each step | Configure each | Status badge updates "Not picked" → "Configured" | High |
| FUNC-AUTH-009 | Admin tests proxy connection in one click | Click Test proxy | Immediate green/red feedback | Critical |
| FUNC-AUTH-010 | Admin tests AI profile in one click | Click Test profile | Same | Critical |
| FUNC-AUTH-011 | Admin doesn't need to read proxy/config.json to understand profiles | UI alone | Profile metadata (type, data domain, space) shown in UI | High |
| FUNC-AUTH-012 | Admin can save settings explicitly via save bar | Edit + Save | Save bar appears + commits | Critical |
| FUNC-AUTH-013 | Admin gets confirmation that save succeeded | Click Save | Green "✓ Settings saved" appears | High |
| FUNC-AUTH-014 | Admin's first save persists across browser restart | Save + close + reopen | Settings preserved | Critical |
| FUNC-AUTH-015 | Admin sees the system status in System group | System → Proxy status | All proxy details visible at a glance | High |
| FUNC-AUTH-016 | Admin understands the allowlist behavior from UI alone | Read Settings → System → Security posture | Clear "strict / permissive" + meaning | Medium |
| FUNC-AUTH-017 | Admin knows where to ask for help | Has WORKING_WITH_CLAUDE.md or HELP page | Findable | Low |
| FUNC-AUTH-018 | Admin onboards a colleague in 5 minutes (handoff doc) | Read onboarding doc | Done | Medium |
| FUNC-AUTH-019 | Admin's setup doesn't break when proxy restarts | Restart mid-config | Settings preserved | High |
| FUNC-AUTH-020 | Admin can return to mid-setup state after interruption | Close + reopen during config | Resume from where they were | Medium |

### Updating author (regular maintenance)

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-021 | Author updates AI profile after server-side rename | Pick new profile from select | Updated; old becomes orphan with banner | High |
| FUNC-AUTH-022 | Author adds a new knowledge pack | Server-side add → UI re-renders | Pack appears in picker within 10s | Medium |
| FUNC-AUTH-023 | Author removes a knowledge pack | Server-side remove → UI re-renders | Pack disappears; if active, orphan banner | Medium |
| FUNC-AUTH-024 | Author bumps Insights cache TTL from 30 to 60 minutes | Sub-route → set → Save | Persists; next cache check honors new TTL | Medium |
| FUNC-AUTH-025 | Author toggles a Knowledge Base rule | KB sub-route | Persists; reflected in next Insights run | High |
| FUNC-AUTH-026 | Author switches theme | Appearance | Live preview if available; persists | Medium |
| FUNC-AUTH-027 | Author tunes a metric direction rule | AI Insights | New rule applied; pill tones update | High |
| FUNC-AUTH-028 | Author hides a Insights stage | AI Insights | Stage skipped in next run | High |
| FUNC-AUTH-029 | Author updates governance forbidden columns | BI Governance | New list applied to next query | High |
| FUNC-AUTH-030 | Author updates mandatory row filter | BI Governance | Filter in next query SQL | High |
| FUNC-AUTH-031 | Author switches auth mode shared PAT → OAuth on-behalf-of | BI Governance | Future requests use new flow | High |
| FUNC-AUTH-032 | Author enables dev mode for diagnosis | Dev Tools | SQL + Trace tabs appear in chat | High |
| FUNC-AUTH-033 | Author disables dev mode for demo | Dev Tools | Tabs hidden | Medium |
| FUNC-AUTH-034 | Author bumps validation retry count | Dev Tools | Retries happen on next failure | Medium |
| FUNC-AUTH-035 | Author updates a Insights stage override | AI Insights | New prompt used | High |
| FUNC-AUTH-036 | Author confirms updates by re-running query | Test | New behavior visible | High |
| FUNC-AUTH-037 | Author rolls back a bad update via Discard | Edit + Discard | Reverts to snapshot | Critical |
| FUNC-AUTH-038 | Author rolls back via Reset section | Advanced → Reset section | Section-specific keys cleared | High |
| FUNC-AUTH-039 | Author rolls back via Reset all | Advanced → Reset all | Type-to-confirm; all `pulseplay:*` cleared | Critical |
| FUNC-AUTH-040 | Author confirms reset didn't touch other users' state | Multi-user check | Reset is local-only | Critical |

### Migration author (switching vendors)

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-041 | Author migrates from Power BI to Tableau (BI swap) | Change vendor → Apply | Old embed unmounts; new mounts | High |
| FUNC-AUTH-042 | Author migrates from Tableau to Power BI | Same | Same | High |
| FUNC-AUTH-043 | Author migrates from Genie to Databricks AI/BI | Same | Same | High |
| FUNC-AUTH-044 | Author migrates from Databricks AI/BI to Genie | Same | Same | High |
| FUNC-AUTH-045 | Author migrates AI from Genie to Foundation Model | Profile change | Next request uses FM streaming | High |
| FUNC-AUTH-046 | Author migrates AI from Genie to Supervisor | Profile change | Fan-out matrix appears | High |
| FUNC-AUTH-047 | Author migrates AI from Foundation Model to Genie | Profile change | Reverts to poll-based | Medium |
| FUNC-AUTH-048 | Author keeps embed config when changing AI only | AI swap, BI unchanged | BI embed preserved | High |
| FUNC-AUTH-049 | Author keeps AI when changing BI only | BI swap, AI unchanged | AI profile preserved | High |
| FUNC-AUTH-050 | Author migrates pack when domain changes (e.g. CPG → Retail) | Pack swap | New vocab applies; old guidance discarded | Medium |
| FUNC-AUTH-051 | Author validates migration via test buttons | After swap | All Test buttons green | High |
| FUNC-AUTH-052 | Author validates migration via test question | Send fixture question | Answer comes from new source | High |
| FUNC-AUTH-053 | Author rolls back migration if it fails | Discard before save | Returns to prior vendor + config | Critical |
| FUNC-AUTH-054 | Author keeps a backup config before migrating | Export support bundle pre-migration | Has JSON snapshot | Medium |
| FUNC-AUTH-055 | Author re-imports backup config if migration fails | Import path (if exists) | Restores | Medium |

### Multi-environment author (dev / staging / prod)

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-056 | Author maintains separate dev / prod proxy configs | Two proxy/config.json | Each environment isolated | High |
| FUNC-AUTH-057 | Author maintains separate allowlists per env | Two allowlists | Each environment honors its own | High |
| FUNC-AUTH-058 | Author tests in dev before promoting to prod | Test in dev | Passes; same config promoted to prod | High |
| FUNC-AUTH-059 | Author detects env-specific settings drift | Compare dev vs prod | Tool surfaces differences | Medium |
| FUNC-AUTH-060 | Author exports config from dev as JSON | Support bundle | JSON includes all settings | Medium |
| FUNC-AUTH-061 | Author imports config to prod via paste | Import flow (if exists) | Settings applied | Medium |
| FUNC-AUTH-062 | Author detects accidental cross-env localStorage bleed | Local-only state | Each tab respects its own env URL | Medium |
| FUNC-AUTH-063 | Author rotates secret in proxy/config.json without breaking users | Hot reload | Next request uses new secret | High |
| FUNC-AUTH-064 | Author switches Databricks workspace mid-config (dev → prod workspace) | Edit profile spaceId | Reflected in next probe | High |
| FUNC-AUTH-065 | Author tests staging endpoint via custom URL | Override apiBaseUrl | Connects to staging | Medium |
| FUNC-AUTH-066 | Author runs dev + prod side-by-side in two tabs | Two tabs different URLs | Each works independently | Medium |
| FUNC-AUTH-067 | Author detects misconfigured env (e.g. dev pointing to prod proxy) | Health check | URL visible; can verify env-correctness | High |
| FUNC-AUTH-068 | Author documents env-specific config in README | Authoring | Done | Low |
| FUNC-AUTH-069 | Author labels each env with display name | Env name field (if exists) | Visible in header | Low |
| FUNC-AUTH-070 | Author confirms prod doesn't have dev-mode toggles enabled | Audit | All dev toggles off in prod | High |

### Governance / Compliance author

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-071 | Compliance author audits all governance settings in 1 page | BI Governance | All toggles + fields on one screen | High |
| FUNC-AUTH-072 | Compliance author exports settings for audit log | Support bundle | JSON with redacted tokens | Critical |
| FUNC-AUTH-073 | Compliance author verifies allowlist strict mode | System → Security posture | "strict" confirmed | High |
| FUNC-AUTH-074 | Compliance author verifies no Fabric assumptions (PBI Premium only) | Setup confirms | License posture shows Premium not Fabric | Critical |
| FUNC-AUTH-075 | Compliance author confirms UC row filter enforced | BI Governance toggle | Status shows full enforcement | High |
| FUNC-AUTH-076 | Compliance author confirms read-only enforcement | BI Governance | Toggle on | Critical |
| FUNC-AUTH-077 | Compliance author confirms forbidden columns list | BI Governance | List visible + complete | High |
| FUNC-AUTH-078 | Compliance author confirms mandatory row filter | BI Governance | Filter visible | High |
| FUNC-AUTH-079 | Compliance author confirms auth mode | BI Governance | OAuth on-behalf-of for per-user attribution | High |
| FUNC-AUTH-080 | Compliance author confirms audit log captures changes | Test by toggling | Server-side log entry created | High |
| FUNC-AUTH-081 | Compliance author confirms PII redaction in export | Bundle | No PATs / tokens in JSON | Critical |
| FUNC-AUTH-082 | Compliance author confirms cookie consent | UI | Banner appears + works | High |
| FUNC-AUTH-083 | Compliance author confirms no third-party trackers | DevTools network | None | Critical |
| FUNC-AUTH-084 | Compliance author confirms data residency | Proxy config | EU-only or US-only enforced server-side | High |
| FUNC-AUTH-085 | Compliance author confirms incident response is documented | docs/SECURITY.md | Process documented | Medium |
| FUNC-AUTH-086 | Compliance author runs quarterly access review | Admin tooling | Lists users + permissions | High |
| FUNC-AUTH-087 | Compliance author rotates AAD client secret | Server-side | Frontend unaware; next session uses new | Medium |
| FUNC-AUTH-088 | Compliance author exports settings for SOC 2 evidence | Bundle | Acceptable evidence format | Medium |
| FUNC-AUTH-089 | Compliance author confirms AI transparency disclosure | UI footer | "AI assistance" disclosure visible | High |
| FUNC-AUTH-090 | Compliance author confirms human override available | Manual mode | Author can edit Insights output | Medium |

### Handoff / collaboration author

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-091 | Author hands off config to colleague via Slack | Copy support bundle JSON → paste | Colleague restores | Medium |
| FUNC-AUTH-092 | Author shares a sub-route URL for "look at this setting" | Copy URL → DM | Colleague lands on same sub-route | Medium |
| FUNC-AUTH-093 | Author documents the setup in a wiki | Write doc | Doc references CLAUDE.md + Settings | Low |
| FUNC-AUTH-094 | Author records a video walkthrough of the setup | Record | Audio + visual smooth | Low |
| FUNC-AUTH-095 | Author shares the EXTREME_E2E_PLAN.md with QA team | Send link | QA can execute | Medium |
| FUNC-AUTH-096 | Author hands off proxy/config.json to ops team | Git PR | Ops merges; restarts proxy | High |
| FUNC-AUTH-097 | Author documents what each AI profile does | proxy/config.json comments | Comments explain spaceId source | Medium |
| FUNC-AUTH-098 | Author shares a saved query for sales team | Send URL or query text | Sales team runs it | Low |
| FUNC-AUTH-099 | Author publishes a knowledge pack for org default | Server-side publish | Pack appears in all users' allowlist | Medium |
| FUNC-AUTH-100 | Author hands off a theme for org branding | Send brand color hex codes | Other authors apply via Appearance | Medium |
| FUNC-AUTH-101 | Author trains a colleague to author | Walk-through | Colleague configures own org in 30 min | Medium |
| FUNC-AUTH-102 | Author hands off to a new admin when leaving role | Knowledge transfer | New admin reproduces configuration | Critical |
| FUNC-AUTH-103 | Author leaves a comment / note in the system | Hypothetical notes field | Persists; visible to colleagues | Low |
| FUNC-AUTH-104 | Author tags a setting "do not change without ops review" | Hypothetical tag | Visible warning | Low |
| FUNC-AUTH-105 | Author publishes settings for new starter onboarding | Default org config | New starter inherits | Low |

### Troubleshooting author (diagnostic mindset)

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-106 | Author diagnoses "why is my Insights stage empty?" | Enable dev mode → Trace tab | Stage trace visible | Critical |
| FUNC-AUTH-107 | Author diagnoses "why is the chart not rendering?" | Switch to Table view | Data visible; chart spec inspectable | High |
| FUNC-AUTH-108 | Author diagnoses "why does proxy show offline?" | System → Proxy status | Detail explains; suggests fix | Critical |
| FUNC-AUTH-109 | Author diagnoses "why is AAD failing?" | Power BI panel error | Clear error msg + suggested action | High |
| FUNC-AUTH-110 | Author diagnoses "why is Genie answer wrong?" | Show SQL toggle on | SQL visible; compare to expected | High |
| FUNC-AUTH-111 | Author diagnoses "why is metric pill the wrong color?" | Check direction rules | Inspect + edit | High |
| FUNC-AUTH-112 | Author diagnoses "why is allowlist rejecting my embed?" | Console error | Origin mismatch visible | High |
| FUNC-AUTH-113 | Author diagnoses "why is settings not saving?" | Check storage quota | DevTools shows quota | Medium |
| FUNC-AUTH-114 | Author diagnoses "why are charts slow?" | Performance tab | LCP / TBT visible | Medium |
| FUNC-AUTH-115 | Author diagnoses "why is the page white?" | ErrorBoundary | Error message + reload | Critical |
| FUNC-AUTH-116 | Author diagnoses "why am I getting 401 from proxy?" | Network tab | Token state clear | High |
| FUNC-AUTH-117 | Author diagnoses "why is supervisor only returning 1 space?" | Probe matrix | Per-space status clear | High |
| FUNC-AUTH-118 | Author diagnoses "why is theme not applying?" | Inspect localStorage genieSettings.themeName | Visible | Medium |
| FUNC-AUTH-119 | Author diagnoses "why is dev mode showing in prod?" | Check toggle | Visible; togglable | Medium |
| FUNC-AUTH-120 | Author diagnoses "why is my custom prompt being ignored?" | Check authoring mode | Mode might be "preset" overriding manual | Medium |
| FUNC-AUTH-121 | Author finds answer in HANDOVER.md by date | Read | Recent entries help | Medium |
| FUNC-AUTH-122 | Author finds answer in WORKING_WITH_CLAUDE.md | Read | Sets expectations | Low |
| FUNC-AUTH-123 | Author runs npm test to verify their changes didn't break baseline | Run | 918/918 PASS | High |
| FUNC-AUTH-124 | Author runs npm lint to verify their changes don't break style | Run | Clean | Medium |
| FUNC-AUTH-125 | Author files a bug report with reproducer steps | Issue template | Has all info | Medium |

### Pack / Theme / Brand author

| ID | Use case | Steps | Expected outcome | Severity |
|---|---|---|---|---|
| FUNC-AUTH-126 | Pack author creates a new knowledge pack file | Server-side create | Appears in allowlist + picker | Medium |
| FUNC-AUTH-127 | Pack author edits domain guidance in pack | Server-side edit | Reflected in next Insights | Medium |
| FUNC-AUTH-128 | Pack author tests pack via Browse library link | Click | Pack content viewable | Medium |
| FUNC-AUTH-129 | Pack author tunes per-pack metric direction rules | Pack file edit | Pulled into UI | Medium |
| FUNC-AUTH-130 | Pack author rolls out pack to specific allowlist | Allowlist update | Only allowed users see pack | High |
| FUNC-AUTH-131 | Theme author defines brand colors via Appearance | Pick Custom + set 3 colors | Applied | Medium |
| FUNC-AUTH-132 | Theme author tests theme against multiple sub-routes | Navigate each | Theme consistent | Medium |
| FUNC-AUTH-133 | Theme author tests theme in light + dark mode | Toggle dark | Both palettes acceptable | Medium |
| FUNC-AUTH-134 | Theme author respects WCAG contrast | Audit | Pass AA | High |
| FUNC-AUTH-135 | Brand author replaces favicon for org | Server config | Favicon updates | Low |
| FUNC-AUTH-136 | Brand author replaces product name in header | Hypothetical config | Header updates | Low |
| FUNC-AUTH-137 | Brand author adds custom footer text | Hypothetical | Footer renders | Low |
| FUNC-AUTH-138 | Brand author adds custom support URL | Hypothetical | Link in footer | Low |
| FUNC-AUTH-139 | Brand author confirms theme survives upgrade | Update PulsePlay | Theme persists | Medium |
| FUNC-AUTH-140 | Brand author shares theme JSON with sister org | Export | Other org imports | Low |

---

## How to use this file

- **Each row is independently verifiable.** Pick any ID, set up the prerequisite, run the action, check the expected behavior.
- **Many FUNC-UNI-* scenarios are code-review style** (grep + inspect) — they're cheap to run in CI as lint rules.
- **FUNC-PRIM-*** scenarios should ideally have a Vitest test per primitive — most do already; gaps are tracked separately.
- **FUNC-INT-*** scenarios cross multiple files; integration tests + manual verification cover them.
- **FUNC-UC-*** scenarios are scripted as Playwright or Cypress flows OR manual demo scripts.

## Report bucket

When run as part of the extreme E2E sweep, summarize as:

```
| FUNC-PRIM | <total> | <pass> | <fail> | <skipped> | <na> |
| FUNC-INT  | <total> | <pass> | <fail> | <skipped> | <na> |
| FUNC-UNI  | <total> | <pass> | <fail> | <skipped> | <na> |
| FUNC-UC   | <total> | <pass> | <fail> | <skipped> | <na> |
```

A failure here is more serious than a smoke-test failure — these are contract violations, not surface bugs. Treat Critical FUNC-* failures as ship blockers regardless of test category.

---

**File 4 total:** ~570 scenarios across 5 categories (90 primitives + 90 integration + 110 uniformity + 140 end-user use cases + 140 author journeys).

> **Why the author section matters:** End users open PulsePlay to ask questions. Authors *configure* PulsePlay so end users can ask. Both must be delighted — and the author's journey is longer, lonelier, and easier to break. A great app wins both minds; a mediocre app wins one.
