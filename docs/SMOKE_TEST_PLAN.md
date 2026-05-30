# PulsePlay — End-to-End Smoke Test Plan

> **Scope:** 500+ scenarios across 25 categories. Every scenario has a unique ID, action, expected result, and a tag indicating whether it can be tested by an automation tool solo (`[AUTO]`), requires a live external service (`[LIVE]`), or needs human eyeballs (`[MANUAL]`).
>
> **Vendor focus:** Databricks (Genie + AI/BI) + Microsoft Power BI **Premium** (NOT Fabric). All Fabric-only features are out of scope; flag any test that mistakenly assumes them.
>
> **Last updated:** 2026-05-19

---

## How to use this file

- Run the test runner (Codex / human) section-by-section, not top-to-bottom — categories are independent.
- For each scenario, record one of: **PASS**, **FAIL** (with reason), **SKIPPED** (with reason), **N/A** (test prerequisites not met).
- File issues only for **FAIL** results — `SKIPPED` and `N/A` are expected.
- Report format at the bottom of this file.

## Environment prerequisites

| Item | How to verify |
|---|---|
| **Proxy running** | `curl http://127.0.0.1:8787/health` returns `{"ok":true,...}` |
| **Dev server running** | `curl http://127.0.0.1:5173` returns HTML |
| **At least one Databricks profile in proxy** | Health response `profiles` array is non-empty |
| **Power BI embed URL (Premium)** | Has shape `https://app.powerbi.com/reportEmbed?reportId=…&ctid=…` |
| **AAD session** | Active in same browser as dev server, same tenant as embed URL |
| **Clean state** | `localStorage.clear()` then refresh; smoke tests assume default state unless stated |

## Scenario ID convention

`<CATEGORY>-<SUBCATEGORY>-<NN>` — e.g., `SETUP-QS-01` = Quick Setup scenario 01.

---

## Category 1 · Settings Shell Core (SHELL-*)

### Navigation (SHELL-NAV)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SHELL-NAV-01 | Open `/settings` directly | Lands on Setup group with rail showing 6 groups | AUTO |
| SHELL-NAV-02 | Click "BI" in rail | URL becomes `/settings/bi`; BI page renders | AUTO |
| SHELL-NAV-03 | Click "AI" in rail | URL becomes `/settings/ai`; AI page renders | AUTO |
| SHELL-NAV-04 | Click "Preferences" in rail | URL becomes `/settings/preferences` | AUTO |
| SHELL-NAV-05 | Click "System" in rail | URL becomes `/settings/system` | AUTO |
| SHELL-NAV-06 | Click "Advanced" in rail | URL becomes `/settings/advanced` | AUTO |
| SHELL-NAV-07 | Click "Setup" after visiting another group | Returns to Quick Setup | AUTO |
| SHELL-NAV-08 | Press Esc on any settings page | Returns to `/` | AUTO |
| SHELL-NAV-09 | Browser back button on settings | Returns to previous settings URL | AUTO |
| SHELL-NAV-10 | Browser forward button | Returns to next settings URL | AUTO |
| SHELL-NAV-11 | Refresh page on `/settings/ai/knowledge-base` | Lands on KB sub-page | AUTO |
| SHELL-NAV-12 | Active group in rail has blue gradient fill | Visible distinction from inactive groups | MANUAL |
| SHELL-NAV-13 | Active sub-route in rail is highlighted | Blue text + tinted background | MANUAL |
| SHELL-NAV-14 | Hover an inactive group in rail | Background changes to subtle grey | MANUAL |
| SHELL-NAV-15 | Click "Back to app" button | Returns to `/` | AUTO |
| SHELL-NAV-16 | Back button hovers shift left 2px | Subtle slide animation | MANUAL |
| SHELL-NAV-17 | Active group expands to show sub-leaves | Indented items with thin border-left | AUTO |
| SHELL-NAV-18 | Inactive group does NOT show sub-leaves | Collapsed by default | AUTO |
| SHELL-NAV-19 | Switch groups → sub-leaves of new group appear | Old leaves collapse, new ones slide in | AUTO |
| SHELL-NAV-20 | Direct URL `/settings/bi/governance` | Renders BI Governance sub-page | AUTO |

### Header (SHELL-HEADER)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SHELL-HEADER-01 | Header shows "Settings" title | h1 with gradient icon badge | MANUAL |
| SHELL-HEADER-02 | Header subtitle renders | "Configure how PulsePlay looks..." | AUTO |
| SHELL-HEADER-03 | Icon badge gradient indigo→violet | Visual check | MANUAL |
| SHELL-HEADER-04 | Back button right-aligned | Visual check | MANUAL |
| SHELL-HEADER-05 | Header has bottom shadow | Subtle elevation | MANUAL |

### Search (SHELL-SEARCH)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SHELL-SEARCH-01 | Press Cmd/Ctrl+/ | Search input gains focus | AUTO |
| SHELL-SEARCH-02 | Type "tile" in search | Only Preferences group remains in rail | AUTO |
| SHELL-SEARCH-03 | Type "embed" in search | Only BI group remains | AUTO |
| SHELL-SEARCH-04 | Type "supervisor" in search | AI group surfaces (Supervisor Fusion leaf matches) | AUTO |
| SHELL-SEARCH-05 | Type "theme" in search | Preferences (Appearance leaf matches) | AUTO |
| SHELL-SEARCH-06 | Type "sql" in search | System (Developer Tools leaf matches) | AUTO |
| SHELL-SEARCH-07 | Type "governance" in search | BI group surfaces (new Governance sub-route) | AUTO |
| SHELL-SEARCH-08 | Type gibberish "xyzqq" | No groups match; shows "0 groups matched" | AUTO |
| SHELL-SEARCH-09 | Clear search | All 6 groups return | AUTO |
| SHELL-SEARCH-10 | Search results count visible | "N groups matched" appears | AUTO |
| SHELL-SEARCH-11 | kbd hint visible when search empty | "⌘ /" or "Ctrl /" pill on right | MANUAL |
| SHELL-SEARCH-12 | kbd hint fades when input focused | Visual check | MANUAL |
| SHELL-SEARCH-13 | Search input has focus ring | Blue 3px halo on focus | MANUAL |
| SHELL-SEARCH-14 | Search input is pill-shaped | rounded-corners visible | MANUAL |
| SHELL-SEARCH-15 | Search ignored when typing in form fields | Cmd+/ inside textarea doesn't focus search | AUTO |

### Status Strip (SHELL-STATUS)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SHELL-STATUS-01 | Status strip shows 6 chips | Setup · BI · AI · Pack · Proxy · Security | AUTO |
| SHELL-STATUS-02 | Click "Setup" chip | Navigates to `/settings/setup` | AUTO |
| SHELL-STATUS-03 | Click "BI" chip | Navigates to `/settings/bi` | AUTO |
| SHELL-STATUS-04 | Click "AI" chip | Navigates to `/settings/ai` | AUTO |
| SHELL-STATUS-05 | Click "Pack" chip | Navigates to `/settings/ai/knowledge-pack` | AUTO |
| SHELL-STATUS-06 | Click "Proxy" chip | Navigates to `/settings/system/proxy-status` | AUTO |
| SHELL-STATUS-07 | Click "Security" chip | Navigates to `/settings/system/security-posture` | AUTO |
| SHELL-STATUS-08 | Proxy chip shows "ok" when proxy reachable | Green dot | AUTO |
| SHELL-STATUS-09 | Proxy chip shows "warn" when 5xx | Yellow dot + error in detail | LIVE |
| SHELL-STATUS-10 | Proxy chip shows "loading" during initial fetch | Pulsing grey dot | AUTO |
| SHELL-STATUS-11 | Status chips have hover lift | translateY(-1px) on hover | MANUAL |
| SHELL-STATUS-12 | Status chip dots scale on hover | scale(1.2) animation | MANUAL |

---

## Category 2 · Quick Setup Canvas (SETUP-*)

### Page render (SETUP-RENDER)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SETUP-RENDER-01 | Open `/settings/setup` | Page renders with gradient title "Setup" | AUTO |
| SETUP-RENDER-02 | Subtitle "Three short steps to get PulsePlay running" visible | Text matches | AUTO |
| SETUP-RENDER-03 | Top-right readiness chip renders | Either "Ready" or "Setup needed" with detail | AUTO |
| SETUP-RENDER-04 | 3 FieldCards render (BI / AI / Knowledge pack) | All present, step numbers 1/2/3 | AUTO |
| SETUP-RENDER-05 | Footer with 3 quick-jump chips | "Layout & display" / "Proxy & diagnostics" / "Advanced / reset" | AUTO |
| SETUP-RENDER-06 | Step badge has indigo→violet gradient | Visual check | MANUAL |
| SETUP-RENDER-07 | FieldCard hover raises shadow | Subtle box-shadow grows | MANUAL |
| SETUP-RENDER-08 | No allowlist errors shown when proxy responds | No red alert banner | AUTO |
| SETUP-RENDER-09 | Orphan banner shown if orphans present | Yellow alert with "Review →" link | LIVE |
| SETUP-RENDER-10 | Each card has status badge in header | "Configured" / "Needs embed" / "Not picked" | AUTO |

### Step 1 BI tool (SETUP-BI)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SETUP-BI-01 | Vendor select shows "— Pick a BI tool —" placeholder when empty | Default state | AUTO |
| SETUP-BI-02 | Select "Power BI" | Vendor persists; embed textarea appears | AUTO |
| SETUP-BI-03 | Select "Databricks Genie" | Vendor persists; embed textarea shows Genie placeholder | AUTO |
| SETUP-BI-04 | Select "Databricks AI/BI" | Vendor persists; embed textarea shows AI/BI placeholder | AUTO |
| SETUP-BI-05 | Select "Tableau" | Vendor persists | AUTO |
| SETUP-BI-06 | Select "Qlik Sense" | Vendor persists | AUTO |
| SETUP-BI-07 | Select "Looker" | Vendor persists | AUTO |
| SETUP-BI-08 | Select "Generic iframe" | Vendor persists | AUTO |
| SETUP-BI-09 | Paste Power BI URL `https://app.powerbi.com/reportEmbed?...` | Apply button enabled | AUTO |
| SETUP-BI-10 | Click "Apply embed" with valid URL | Success message appears in green | AUTO |
| SETUP-BI-11 | Click "Apply embed" with empty field | Error message shows | AUTO |
| SETUP-BI-12 | Click "Clear" after apply | Embed cleared; status badge returns to "Needs embed" | AUTO |
| SETUP-BI-13 | Vendor help tooltip opens on hover of ⓘ | Tooltip with vendor-specific text | MANUAL |
| SETUP-BI-14 | Title-level help tooltip explains 2-axis | Tooltip mentions "PulsePlay hosts the BI surface" | MANUAL |
| SETUP-BI-15 | Embed status badge updates after apply | "Configured" appears in card header | AUTO |
| SETUP-BI-16 | "Full embed form →" link navigates to BI/embed | Navigation works | AUTO |
| SETUP-BI-17 | Allowlist filters vendor options | Only allowlist'd vendors shown when allowlist configured | LIVE |
| SETUP-BI-18 | Vendor select disabled while allowlist loading | Greyed out | AUTO |
| SETUP-BI-19 | Refresh page after apply — embed persists | localStorage round-trip | AUTO |
| SETUP-BI-20 | Apply Genie iframe HTML (full `<iframe>...</iframe>`) | Parsed and stored | AUTO |

### Step 2 AI brain (SETUP-AI)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SETUP-AI-01 | Profile select shows allowlist'd profiles | Each option visible | AUTO |
| SETUP-AI-02 | Select a profile | Persists to localStorage | AUTO |
| SETUP-AI-03 | "Test proxy" button in card header | Clickable | AUTO |
| SETUP-AI-04 | Click "Test proxy" → ok | Green chip "Proxy online · N profiles · Xms" | LIVE |
| SETUP-AI-05 | Click "Test proxy" with proxy down | Red chip "Proxy offline" + error detail | LIVE |
| SETUP-AI-06 | Click "Test selected profile" with no profile | Yellow chip "No profile selected" | AUTO |
| SETUP-AI-07 | Click "Test selected profile" with valid profile | Green chip "Profile reachable" + type | LIVE |
| SETUP-AI-08 | Click "Test selected profile" with unknown profile | Yellow chip "Profile not registered" | LIVE |
| SETUP-AI-09 | Test button shows spinner while running | Animated spinner | MANUAL |
| SETUP-AI-10 | Test result persists until next click | Doesn't auto-dismiss | AUTO |
| SETUP-AI-11 | Profile select disabled when no profiles in allowlist | Greyed | AUTO |
| SETUP-AI-12 | Profile tooltip mentions proxy/config.json | Help text contains | MANUAL |
| SETUP-AI-13 | "Tune Insights behavior →" link navigates to AI/ai-insights | Navigation works | AUTO |
| SETUP-AI-14 | Status badge shows "Configured" once profile picked | Even without test pass | AUTO |
| SETUP-AI-15 | Status badge shows "Not picked" when profile empty | Red dot | AUTO |

### Step 3 Knowledge Pack (SETUP-PACK)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SETUP-PACK-01 | Pack select shows allowlist'd packs | Each option | AUTO |
| SETUP-PACK-02 | Select a pack | Persists | AUTO |
| SETUP-PACK-03 | Select "— No pack —" | Cleared | AUTO |
| SETUP-PACK-04 | Browse link appears after pack selected | Anchor with target="_blank" | AUTO |
| SETUP-PACK-05 | Browse link href is `/knowledge/<pack>` | URL correct | AUTO |
| SETUP-PACK-06 | Status badge "Optional" when no pack | Yellow | AUTO |
| SETUP-PACK-07 | Status badge "Selected" when pack picked | Green | AUTO |
| SETUP-PACK-08 | Pack select disabled when no allowlist'd packs | Greyed | AUTO |

### Save bar (SETUP-SAVE)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SETUP-SAVE-01 | Change a setting | Save bar appears at bottom | AUTO |
| SETUP-SAVE-02 | Save bar shows "Unsaved changes" with pulsing dot | Visual check | MANUAL |
| SETUP-SAVE-03 | Click "Save changes" | Bar turns green "✓ Settings saved" | AUTO |
| SETUP-SAVE-04 | "Settings saved" auto-dismisses after 3s | Bar disappears | AUTO |
| SETUP-SAVE-05 | Make change → click "Discard" | All changes reverted from snapshot | AUTO |
| SETUP-SAVE-06 | Make multiple changes → Save | All persisted at once | AUTO |
| SETUP-SAVE-07 | No save bar visible when nothing changed | Hidden state | AUTO |
| SETUP-SAVE-08 | Save bar persists across group changes | Still visible after navigating | AUTO |

---

## Category 3 · BI Group + Embed Forms (BI-*)

### Provider (BI-PROVIDER)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-PROVIDER-01 | Open `/settings/bi/provider` | Provider leaf scrolls into view | AUTO |
| BI-PROVIDER-02 | Current vendor visible | CurrentValue shows picked vendor | AUTO |
| BI-PROVIDER-03 | Allowlist enforcement shown | "strict" or "permissive" | AUTO |
| BI-PROVIDER-04 | Vendor picker in BI matches Setup | Same selection | AUTO |

### Power BI Embed — Secure mode (BI-PBI-SECURE)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-PBI-SECURE-01 | Pick PBI, switch to Secure mode | Textarea visible | AUTO |
| BI-PBI-SECURE-02 | Paste valid secure embed URL | Apply button enabled | AUTO |
| BI-PBI-SECURE-03 | Apply secure URL | reportId + groupId auto-extracted | AUTO |
| BI-PBI-SECURE-04 | Paste portal iframe HTML | URL extracted from src= | AUTO |
| BI-PBI-SECURE-05 | Apply invalid URL | Error message; not stored | AUTO |
| BI-PBI-SECURE-06 | URL host outside allowlist | Rejected with explanation | LIVE |
| BI-PBI-SECURE-07 | autoAuth=true preserved in URL | Round-trip intact | AUTO |
| BI-PBI-SECURE-08 | ctid (tenant) preserved | Round-trip intact | AUTO |
| BI-PBI-SECURE-09 | actionBarEnabled flag preserved | Round-trip intact | AUTO |
| BI-PBI-SECURE-10 | Embed iframe loads in canvas after apply | Visible report | LIVE |
| BI-PBI-SECURE-11 | AAD SSO flow completes via autoAuth | No additional credential prompt | LIVE |
| BI-PBI-SECURE-12 | X-Frame-Options not blocking | iframe content visible | LIVE |

### Power BI Embed — SSO (AAD) mode (BI-PBI-SSO)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-PBI-SSO-01 | Switch to SSO mode | Multi-field form appears | AUTO |
| BI-PBI-SSO-02 | Fill groupId, reportId, datasetId | Form validates | AUTO |
| BI-PBI-SSO-03 | Pick permissions = "View" | Persists | AUTO |
| BI-PBI-SSO-04 | Pick permissions = "Edit" | Persists | AUTO |
| BI-PBI-SSO-05 | AAD client ID required field | Empty shows error | AUTO |
| BI-PBI-SSO-06 | AAD tenant optional field | Empty allowed | AUTO |
| BI-PBI-SSO-07 | "Sign in & embed" button visible | After all fields valid | AUTO |
| BI-PBI-SSO-08 | Click "Sign in & embed" → MSAL redirect | Popup or redirect | LIVE |
| BI-PBI-SSO-09 | After sign-in, embed loads | Report visible | LIVE |
| BI-PBI-SSO-10 | "Sign Out" button after signed in | Visible | LIVE |
| BI-PBI-SSO-11 | Sign Out clears MSAL session | Subsequent reload prompts again | LIVE |
| BI-PBI-SSO-12 | groupId allowlist enforcement | Outside allowlist rejected | LIVE |
| BI-PBI-SSO-13 | reportId allowlist enforcement | Outside allowlist rejected | LIVE |

### Power BI Embed — Backend (Service Principal) mode (BI-PBI-BACKEND)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-PBI-BACKEND-01 | Switch to Backend mode | Multi-field form appears | AUTO |
| BI-PBI-BACKEND-02 | Fill groupId, reportId, datasetId | Apply button enables | AUTO |
| BI-PBI-BACKEND-03 | Apply → proxy calls `/api/assistant/embed-token/powerbi` | Network request fires | LIVE |
| BI-PBI-BACKEND-04 | Proxy returns embed token | Token used to embed | LIVE |
| BI-PBI-BACKEND-05 | Active assistant profile included in call | Header X-Assistant-Profile set | LIVE |
| BI-PBI-BACKEND-06 | Token expiration handled | Embed refreshes on expiry | LIVE |
| BI-PBI-BACKEND-07 | Service principal misconfigured → 401/403 | Error shown to author | LIVE |

### Power BI Embed — Manual (dev) mode (BI-PBI-MANUAL)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-PBI-MANUAL-01 | Switch to Manual mode | Two textareas (embedUrl, accessToken) | AUTO |
| BI-PBI-MANUAL-02 | Paste embed URL + token | Apply button enables | AUTO |
| BI-PBI-MANUAL-03 | Manual mode shows dev-only warning | Yellow notice | MANUAL |
| BI-PBI-MANUAL-04 | Apply with valid token | Embed loads | LIVE |
| BI-PBI-MANUAL-05 | Token never leaves browser | No network call to proxy for token | LIVE |

### Databricks AI/BI Embed (BI-AIBI)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-AIBI-01 | Pick "Databricks AI/BI" vendor | Mode toggle visible (Basic / SDK) | AUTO |
| BI-AIBI-02 | Basic mode — URL input | Single field | AUTO |
| BI-AIBI-03 | Basic mode — paste dashboard URL | Apply works | AUTO |
| BI-AIBI-04 | SDK mode — multi-field form | workspaceUrl, workspaceId, dashboardId, orgId visible | AUTO |
| BI-AIBI-05 | SDK mode — all required fields filled | Apply enables | AUTO |
| BI-AIBI-06 | SDK mode — calls `/api/assistant/embed-token/databricks-aibi` | Network call fires | LIVE |
| BI-AIBI-07 | SDK mode — external viewer ID for RLS | Optional field | AUTO |
| BI-AIBI-08 | SDK mode — external viewer value | Optional field | AUTO |
| BI-AIBI-09 | Embed iframe loads in canvas | Dashboard visible | LIVE |
| BI-AIBI-10 | Switch between Basic/SDK preserves URL | Both modes remember inputs | AUTO |

### Databricks Genie Embed (BI-GENIE)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-GENIE-01 | Pick "Databricks Genie" | Single textarea visible | AUTO |
| BI-GENIE-02 | Paste full `<iframe>...</iframe>` HTML | Apply works | AUTO |
| BI-GENIE-03 | Paste just iframe src URL | Apply works (auto-wraps) | AUTO |
| BI-GENIE-04 | Embed iframe loads Genie space | Genie chat visible | LIVE |
| BI-GENIE-05 | Sandbox attributes narrow to minimum | allow-scripts allow-same-origin | AUTO |

### Generic iframe (BI-GENERIC)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-GENERIC-01 | Pick "Generic iframe" | Single URL field | AUTO |
| BI-GENERIC-02 | Paste any URL | Apply works | AUTO |
| BI-GENERIC-03 | Iframe loads URL | Content visible | LIVE |
| BI-GENERIC-04 | X-Frame-Options blocks → blank iframe | Visible empty state | MANUAL |

### Tableau / Qlik / Looker (stub vendors) (BI-STUBS)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-STUBS-01 | Pick Tableau | URL field visible | AUTO |
| BI-STUBS-02 | Pick Qlik | URL field visible | AUTO |
| BI-STUBS-03 | Pick Looker | URL field visible | AUTO |
| BI-STUBS-04 | Apply URL — falls through generic iframe | Iframe loads | AUTO |
| BI-STUBS-05 | Stub vendor shows "needs config" hint | Yellow notice | AUTO |

### Governance sub-route (BI-GOV)

| ID | Action | Expected | Tag |
|---|---|---|---|
| BI-GOV-01 | Open `/settings/bi/governance` | Sub-page renders | AUTO |
| BI-GOV-02 | Auth mode select shows 2 options | sharedPat / oauthObo | AUTO |
| BI-GOV-03 | Select sharedPat | Persists; status updates | AUTO |
| BI-GOV-04 | Select oauthObo | Persists; status updates | AUTO |
| BI-GOV-05 | UC row filters toggle on | Status badge "Full enforcement" if other toggles on | AUTO |
| BI-GOV-06 | UC column masks toggle off | Status badge becomes "Partial" | AUTO |
| BI-GOV-07 | Read-only enforcement off | Status badge updates | AUTO |
| BI-GOV-08 | Type forbidden columns CSV | Persists | AUTO |
| BI-GOV-09 | Type forbidden tables CSV | Persists | AUTO |
| BI-GOV-10 | Type mandatory row filter with {{role}} | Persists with template intact | AUTO |
| BI-GOV-11 | RLS hint toggle on/off | Persists | AUTO |
| BI-GOV-12 | All 8 fields persist after page refresh | localStorage round-trip | AUTO |
| BI-GOV-13 | All HelpTip ⓘ buttons open tooltip | Visual check | MANUAL |
| BI-GOV-14 | Card status "Full enforcement" when all 3 UC toggles on | Visual check | AUTO |
| BI-GOV-15 | Forbidden columns hint mentions case-insensitive | Tooltip text | MANUAL |

---

## Category 4 · AI Group + Sub-Routes (AI-*)

### Provider (AI-PROVIDER)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-PROVIDER-01 | Open `/settings/ai/provider` | Provider leaf in view | AUTO |
| AI-PROVIDER-02 | Profile picker shows allowlist'd profiles | All listed | AUTO |
| AI-PROVIDER-03 | Pick a profile | Persists; mirrors to pulse genieSettings.assistantProfile | AUTO |
| AI-PROVIDER-04 | Profile validation against allowlist | Outside allowlist rejected | AUTO |

### Model / Agent (AI-MODEL)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-MODEL-01 | Open `/settings/ai/model-agent` | Leaf in view | AUTO |
| AI-MODEL-02 | Direct mode shows Genie space ID + data domain | Readout | LIVE |
| AI-MODEL-03 | Supervisor mode shows fan-out table | Per-space rows | LIVE |
| AI-MODEL-04 | Supervisor table shows allowlist status per space | OK / Not allowed | LIVE |

### Knowledge pack (AI-PACK)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-PACK-01 | Pack picker loads from `/api/assistant/knowledge/packs` | Network call | LIVE |
| AI-PACK-02 | Pack picker filtered by allowlist | Only allowed packs shown | AUTO |
| AI-PACK-03 | Pick pack | Persists | AUTO |
| AI-PACK-04 | "Browse library ↗" link works | Navigates to /knowledge/<pack> | AUTO |

### Knowledge Base sub-route (AI-KB)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-KB-01 | Open `/settings/ai/knowledge-base` | Sub-page renders | AUTO |
| AI-KB-02 | Master switch "KB enabled" toggle on/off | Persists | AUTO |
| AI-KB-03 | Master switch off → children disabled visually | Greyed | AUTO |
| AI-KB-04 | Chart rules toggle | Persists when KB enabled | AUTO |
| AI-KB-05 | Stats rules toggle | Persists | AUTO |
| AI-KB-06 | Reporting rules toggle | Persists | AUTO |
| AI-KB-07 | All toggles round-trip across refresh | localStorage | AUTO |
| AI-KB-08 | Card status badge updates with master switch | "Enabled" / "Disabled" | AUTO |
| AI-KB-09 | All HelpTip tooltips open | Visual check | MANUAL |
| AI-KB-10 | Master tooltip mentions debugging KB interference | Tooltip text | MANUAL |
| AI-KB-11 | Chart tooltip mentions chartRegistry | Tooltip text | MANUAL |
| AI-KB-12 | Stats tooltip mentions confidence intervals | Tooltip text | MANUAL |
| AI-KB-13 | Reporting tooltip mentions leadership audience | Tooltip text | MANUAL |
| AI-KB-14 | Toggle gradient on when checked | Visual check | MANUAL |
| AI-KB-15 | Toggle thumb animates on change | Smooth transform | MANUAL |

### Vector Search KB (AI-VSEARCH)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-VSEARCH-01 | Open `/settings/ai/vector-search-kb` | Leaf visible | AUTO |
| AI-VSEARCH-02 | Input catalog.schema.index_name format | Validates | AUTO |
| AI-VSEARCH-03 | Test query button (if present) | Calls `/assistant/vector-search/query` | LIVE |
| AI-VSEARCH-04 | Empty input shows hint | Tooltip | MANUAL |
| AI-VSEARCH-05 | Persists to genieSettings.kbVectorSearchIndex | localStorage round-trip | AUTO |

### Connection test (AI-PROBE)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-PROBE-01 | Genie profile — single probe button | Visible | AUTO |
| AI-PROBE-02 | Click probe → success | Green check + latency | LIVE |
| AI-PROBE-03 | Click probe → failure | Red error + reason | LIVE |
| AI-PROBE-04 | Supervisor profile — per-space probes | Matrix renders | LIVE |
| AI-PROBE-05 | Supervisor probes stagger 2000ms | ADR-0003 timing | LIVE |
| AI-PROBE-06 | Supervisor aggregate summary | "N/M spaces reachable" | LIVE |

### AI Insights (AI-INSIGHTS)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-INSIGHTS-01 | enabledFeatures select (both/insightsOnly/chatOnly) | Persists | AUTO |
| AI-INSIGHTS-02 | Authoring mode select (preset/ai-assisted/manual) | Persists | AUTO |
| AI-INSIGHTS-03 | Domain text input | Persists | AUTO |
| AI-INSIGHTS-04 | Custom prompt textarea | Persists | AUTO |
| AI-INSIGHTS-05 | Domain guidance textarea | Persists | AUTO |
| AI-INSIGHTS-06 | Custom sections textarea | Persists | AUTO |
| AI-INSIGHTS-07 | HEADLINE visibility toggle | Persists | AUTO |
| AI-INSIGHTS-08 | TRENDS visibility toggle | Persists | AUTO |
| AI-INSIGHTS-09 | RISKS visibility toggle | Persists | AUTO |
| AI-INSIGHTS-10 | ACTIONS visibility toggle | Persists | AUTO |
| AI-INSIGHTS-11 | HEADLINE override textarea | Persists | AUTO |
| AI-INSIGHTS-12 | TRENDS override textarea | Persists | AUTO |
| AI-INSIGHTS-13 | RISKS override textarea | Persists | AUTO |
| AI-INSIGHTS-14 | ACTIONS override textarea | Persists | AUTO |
| AI-INSIGHTS-15 | Metric direction rules textarea | Persists | AUTO |
| AI-INSIGHTS-16 | Metric direction map JSON textarea | Persists; validates JSON | AUTO |
| AI-INSIGHTS-17 | Cache TTL select (5/15/30/60 min) | Persists | AUTO |
| AI-INSIGHTS-18 | Provenance footer toggle | Persists | AUTO |
| AI-INSIGHTS-19 | Research traces toggle | Persists | AUTO |

### Supervisor Fusion sub-route (AI-SUP)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-SUP-01 | Open `/settings/ai/supervisor-fusion` | Sub-page renders | AUTO |
| AI-SUP-02 | Auto-fusion toggle on/off | Persists | AUTO |
| AI-SUP-03 | Status badge "Synthesised" when on | Visual check | AUTO |
| AI-SUP-04 | Status badge "Raw fan-out" when off | Visual check | AUTO |
| AI-SUP-05 | Synthesis profile input | Persists | AUTO |
| AI-SUP-06 | Custom synthesis prompt textarea | Persists | AUTO |
| AI-SUP-07 | Synthesis prompt placeholder shows default | Visual | MANUAL |
| AI-SUP-08 | Agent name input | Persists | AUTO |
| AI-SUP-09 | Endpoint input | Persists | AUTO |
| AI-SUP-10 | Override card status "Overridden" when filled | Status updates | AUTO |
| AI-SUP-11 | Override card status "Defaults" when empty | Status updates | AUTO |
| AI-SUP-12 | All HelpTip tooltips open | Visual check | MANUAL |
| AI-SUP-13 | All 5 fields persist across refresh | localStorage | AUTO |

### UC Metric View (AI-UC)

| ID | Action | Expected | Tag |
|---|---|---|---|
| AI-UC-01 | Discovery form (catalog/schema inputs) | Renders | AUTO |
| AI-UC-02 | "Discover" button calls list-metric-views | Network call | LIVE |
| AI-UC-03 | Metric view picker after discovery | Options listed | LIVE |
| AI-UC-04 | Pick a metric view | Persists | AUTO |

---

## Category 5 · Preferences (PREF-*)

### Core preferences (PREF-CORE)

| ID | Action | Expected | Tag |
|---|---|---|---|
| PREF-CORE-01 | UI mode picker (Pulse / v0) | Persists | AUTO |
| PREF-CORE-02 | Layout preset T1 | Persists; layout switches | AUTO |
| PREF-CORE-03 | Layout preset T2 | Persists | AUTO |
| PREF-CORE-04 | Layout preset T3 | Persists | AUTO |
| PREF-CORE-05 | Layout preset T4 | Persists | AUTO |
| PREF-CORE-06 | Layout preset T5 | Persists | AUTO |
| PREF-CORE-07 | Custom layout label shown when hand-tuned | "Custom" appears | AUTO |
| PREF-CORE-08 | Visible panels — aiOnly | BI hidden in app | AUTO |
| PREF-CORE-09 | Visible panels — biOnly | AI hidden in app | AUTO |
| PREF-CORE-10 | Visible panels — both | Both visible | AUTO |
| PREF-CORE-11 | Visible panels — mix | Mix composition row appears | AUTO |
| PREF-CORE-12 | AI position — Left | AI on left | AUTO |
| PREF-CORE-13 | AI position — Right | AI on right | AUTO |
| PREF-CORE-14 | AI position — Top | AI on top | AUTO |
| PREF-CORE-15 | AI position — Bottom | AI on bottom | AUTO |
| PREF-CORE-16 | Mix — AI surfaces both | AI Insights + Ask Pulse tabs | AUTO |
| PREF-CORE-17 | Mix — AI surfaces insightsOnly | Only Insights tab | AUTO |
| PREF-CORE-18 | Mix — AI surfaces chatOnly | Only Ask Pulse tab | AUTO |
| PREF-CORE-19 | Research traces toggle | Persists | AUTO |
| PREF-CORE-20 | BI composition — full canvas | Persists | AUTO |
| PREF-CORE-21 | Canvas tiles select (1/2/4) | Persists | AUTO |

### Appearance sub-route (PREF-APP)

| ID | Action | Expected | Tag |
|---|---|---|---|
| PREF-APP-01 | Open `/settings/preferences/appearance` | Sub-page renders | AUTO |
| PREF-APP-02 | Theme card "Default light" selectable | Active state | AUTO |
| PREF-APP-03 | Theme card "Corporate Blue" selectable | Active state | AUTO |
| PREF-APP-04 | Theme card "Forest (ESG)" selectable | Active state | AUTO |
| PREF-APP-05 | Theme card "Slate Dark" selectable | Active state | AUTO |
| PREF-APP-06 | Theme card "High Contrast" selectable | Active state | AUTO |
| PREF-APP-07 | Theme card "Custom" selectable | Active state; enables color pickers | AUTO |
| PREF-APP-08 | Theme swatch shows gradient | Visual | MANUAL |
| PREF-APP-09 | Active theme card has blue ring + accent fill | Visual | MANUAL |
| PREF-APP-10 | Dark mode toggle | Persists | AUTO |
| PREF-APP-11 | Use report theme toggle | Persists | AUTO |
| PREF-APP-12 | Brand accent color picker disabled when not Custom | Greyed | AUTO |
| PREF-APP-13 | Brand text color picker disabled when not Custom | Greyed | AUTO |
| PREF-APP-14 | Brand bg color picker disabled when not Custom | Greyed | AUTO |
| PREF-APP-15 | Pick Custom theme → color pickers enable | All 3 active | AUTO |
| PREF-APP-16 | Color swatch picker opens native dialog | OS color picker | MANUAL |
| PREF-APP-17 | Hex input synced with swatch | Both update together | AUTO |
| PREF-APP-18 | Hex input rejects invalid hex | Stays at last valid | MANUAL |
| PREF-APP-19 | All 6 themes round-trip across refresh | localStorage | AUTO |
| PREF-APP-20 | Card status "Active"/"Inactive" reflects Custom selection | Visual | AUTO |

---

## Category 6 · System (SYS-*)

### Proxy status (SYS-PROXY)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SYS-PROXY-01 | Open `/settings/system/proxy-status` | Leaf renders | AUTO |
| SYS-PROXY-02 | Status dot green when proxy up | Visual | AUTO |
| SYS-PROXY-03 | Status dot red when proxy 5xx | Visual | LIVE |
| SYS-PROXY-04 | Latency badge under 100ms | Numeric | AUTO |
| SYS-PROXY-05 | Re-run button triggers fresh probe | Updates timestamp | AUTO |
| SYS-PROXY-06 | Profile count shown | Matches /health response | AUTO |
| SYS-PROXY-07 | Config source shown | "config.json" or env | AUTO |
| SYS-PROXY-08 | Auth mode shown | "none"/"basic"/"oauth" | AUTO |
| SYS-PROXY-09 | Bound port shown | 8787 | AUTO |
| SYS-PROXY-10 | App name shown if Databricks App | Field renders | LIVE |
| SYS-PROXY-11 | Last-checked timestamp updates | Relative time | AUTO |
| SYS-PROXY-12 | Auto-poll every 10s | Network tab shows | AUTO |

### Other system leaves (SYS-OTHER)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SYS-OTHER-01 | Network and auth leaf | Renders auth/dbApp/configSource | AUTO |
| SYS-OTHER-02 | Security posture leaf | Renders allowlist + enforcement | AUTO |
| SYS-OTHER-03 | License posture leaf — PBI Premium NOT Fabric | Fabric warning if missing | AUTO |
| SYS-OTHER-04 | Profile inventory leaf | Lists profiles from /health | AUTO |
| SYS-OTHER-05 | Diagnostics events table | Shows recent BI events | AUTO |
| SYS-OTHER-06 | Diagnostics last errors list | Shows recent errors | AUTO |
| SYS-OTHER-07 | Setup wizard button → re-runs wizard | Returns to / + wizard | AUTO |
| SYS-OTHER-08 | Export support bundle downloads JSON | Browser save dialog | AUTO |
| SYS-OTHER-09 | Bundle redacts tokens | No raw PAT/secret in JSON | AUTO |
| SYS-OTHER-10 | Bundle includes localStorage keys | All pulseplay:* present | AUTO |

### Developer Tools sub-route (SYS-DEV)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SYS-DEV-01 | Open `/settings/system/developer-tools` | Sub-page renders | AUTO |
| SYS-DEV-02 | Dev mode toggle | Persists | AUTO |
| SYS-DEV-03 | Show SQL toggle | Persists | AUTO |
| SYS-DEV-04 | Show Trace toggle | Persists | AUTO |
| SYS-DEV-05 | Compatibility warnings toggle | Persists | AUTO |
| SYS-DEV-06 | Guided filters toggle | Persists | AUTO |
| SYS-DEV-07 | Allow report actions toggle | Persists | AUTO |
| SYS-DEV-08 | Validation retry select 0 | Persists | AUTO |
| SYS-DEV-09 | Validation retry select 1 | Persists | AUTO |
| SYS-DEV-10 | Validation retry select 2 | Persists | AUTO |
| SYS-DEV-11 | Validation retry select 3 | Persists | AUTO |
| SYS-DEV-12 | Card status reflects dev posture | Visual | AUTO |
| SYS-DEV-13 | All 7 fields round-trip across refresh | localStorage | AUTO |
| SYS-DEV-14 | All HelpTip tooltips open | Visual check | MANUAL |
| SYS-DEV-15 | Dev mode tooltip mentions verbose logging | Text matches | MANUAL |

---

## Category 7 · Advanced (ADV-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| ADV-01 | Open `/settings/advanced/local-storage-inspector` | Bucketed table renders | AUTO |
| ADV-02 | All pulseplay:* keys grouped (wizard/BI/AI/layout/nav/other) | Categorised | AUTO |
| ADV-03 | Reset section dropdown lists bi/ai/preferences | All 3 | AUTO |
| ADV-04 | Pick "bi" → shows keys to clear | List visible | AUTO |
| ADV-05 | Type-to-confirm gate active | Button disabled until typed | AUTO |
| ADV-06 | Type matching string → button enables | "Clear BI" enables | AUTO |
| ADV-07 | Click clear → keys removed | localStorage validated | AUTO |
| ADV-08 | Reset all requires typing "Reset all" | Type-to-confirm | AUTO |
| ADV-09 | Reset all clears all pulseplay:* keys | All removed | AUTO |
| ADV-10 | Sign out Power BI clears MSAL sessionStorage | sessionStorage validated | LIVE |
| ADV-11 | Danger zone "Clear Pulse settings" type-to-confirm | "Clear Pulse settings" string | AUTO |
| ADV-12 | Pulse settings cleared (pulseplay:visual-settings:*) | Validated | AUTO |

---

## Category 8 · Ask Pulse Chat (CHAT-*)

### Send + receive (CHAT-FLOW)

| ID | Action | Expected | Tag |
|---|---|---|---|
| CHAT-FLOW-01 | Open Ask Pulse | Compose input visible at bottom | AUTO |
| CHAT-FLOW-02 | Type question + press Enter | Question appears as user bubble | AUTO |
| CHAT-FLOW-03 | Click send button | Question submits | AUTO |
| CHAT-FLOW-04 | Progress indicator appears | "Getting started → Reading data → ..." | LIVE |
| CHAT-FLOW-05 | Stage 5 of 5 visible | "Pulling the data" | LIVE |
| CHAT-FLOW-06 | Elapsed timer ticks | "Stage X of Y · MM:SS" | LIVE |
| CHAT-FLOW-07 | Response card appears with content | Markdown rendered | LIVE |
| CHAT-FLOW-08 | View tabs appear if SQL result attached | Chart / Table / SQL / Narrative | LIVE |
| CHAT-FLOW-09 | Pure narrative response (no SQL) shows no tabs | Only narrative visible | LIVE |
| CHAT-FLOW-10 | Helpful? buttons appear after completion | Thumbs up/down | AUTO |
| CHAT-FLOW-11 | Copy answer button | Copies markdown to clipboard | AUTO |
| CHAT-FLOW-12 | Send disabled while busy | Greyed button | AUTO |
| CHAT-FLOW-13 | Send re-enables after response | Button active | AUTO |
| CHAT-FLOW-14 | Empty compose disables send | Greyed | AUTO |
| CHAT-FLOW-15 | Multi-line input via Shift+Enter | Newline in input | AUTO |
| CHAT-FLOW-16 | Compose expands vertically | textarea grows | AUTO |
| CHAT-FLOW-17 | Compose caps at max-height | Then scrolls inside | AUTO |
| CHAT-FLOW-18 | Send button has gradient | blue→deeper blue | MANUAL |
| CHAT-FLOW-19 | Send button scale on hover | scale(1.06) | MANUAL |

### View tabs (CHAT-VIEWS)

| ID | Action | Expected | Tag |
|---|---|---|---|
| CHAT-VIEWS-01 | Click "Chart" tab | Chart container renders | LIVE |
| CHAT-VIEWS-02 | Click "Table" tab | Table renders | LIVE |
| CHAT-VIEWS-03 | Click "SQL" tab (when showSql on) | SQL displayed | LIVE |
| CHAT-VIEWS-04 | Click "Trace" tab (when showTrace on) | Stage traces visible | LIVE |
| CHAT-VIEWS-05 | Narrative tab always visible | Text answer | LIVE |
| CHAT-VIEWS-06 | View tab buttons styled as pills | Visual | MANUAL |
| CHAT-VIEWS-07 | Active tab has accent fill | Visual | MANUAL |

### Chart picker (CHAT-CHARTS)

| ID | Action | Expected | Tag |
|---|---|---|---|
| CHAT-CHARTS-01 | Chart picker shows grouped optgroups | Core / Advanced / Shaped | AUTO |
| CHAT-CHARTS-02 | Recommended type has ★ | Visible marker | AUTO |
| CHAT-CHARTS-03 | KPI Tile renders | Large value + label | LIVE |
| CHAT-CHARTS-04 | Column chart renders | Vertical bars | LIVE |
| CHAT-CHARTS-05 | Bar chart renders | Horizontal bars | LIVE |
| CHAT-CHARTS-06 | Clustered Bar renders | Grouped bars | LIVE |
| CHAT-CHARTS-07 | Line renders | Line with axis | LIVE |
| CHAT-CHARTS-08 | Area renders | Filled area | LIVE |
| CHAT-CHARTS-09 | Pie renders | Slices | LIVE |
| CHAT-CHARTS-10 | Donut renders | Hollow pie | LIVE |
| CHAT-CHARTS-11 | Scatter renders | Points | LIVE |
| CHAT-CHARTS-12 | Bubble renders | Sized points | LIVE |
| CHAT-CHARTS-13 | Heat Map renders | Grid with color scale | LIVE |
| CHAT-CHARTS-14 | Tree Map renders | Nested rectangles | LIVE |
| CHAT-CHARTS-15 | Funnel renders | Tapered shape | LIVE |
| CHAT-CHARTS-16 | Waterfall renders | Bars with delta colors | LIVE |
| CHAT-CHARTS-17 | Pareto renders | Bars + cumulative line | LIVE |
| CHAT-CHARTS-18 | Lollipop renders | Sticks with dots | LIVE |
| CHAT-CHARTS-19 | Sparkline renders | Mini-line | LIVE |
| CHAT-CHARTS-20 | Sankey Flow renders | Nodes + links | LIVE |
| CHAT-CHARTS-21 | Radar / Spider renders | Polygon | LIVE |
| CHAT-CHARTS-22 | Gauge renders | Half-circle | LIVE |
| CHAT-CHARTS-23 | Sunburst renders | Concentric arcs | LIVE |
| CHAT-CHARTS-24 | Chart container height capped at 420px | Visual | AUTO |
| CHAT-CHARTS-25 | "Not enough data" message for incompatible chart | Visible fallback | LIVE |

### Suggestions (CHAT-SUGGEST)

| ID | Action | Expected | Tag |
|---|---|---|---|
| CHAT-SUGGEST-01 | "✦ Try asking" section appears after first message | Visible | LIVE |
| CHAT-SUGGEST-02 | Suggestion pills clickable | Resubmit as new query | LIVE |
| CHAT-SUGGEST-03 | Featured pill (insights-derived) has gradient | Visual | MANUAL |
| CHAT-SUGGEST-04 | Featured pill has ✨ marker | Visible | LIVE |
| CHAT-SUGGEST-05 | Pill lift on hover | translateY(-1px) | MANUAL |
| CHAT-SUGGEST-06 | Max 6 pills displayed | Capped | AUTO |
| CHAT-SUGGEST-07 | Featured pills come first | Order check | LIVE |

### Error states (CHAT-ERR)

| ID | Action | Expected | Tag |
|---|---|---|---|
| CHAT-ERR-01 | Proxy offline → "Proxy Offline" banner | Renders | LIVE |
| CHAT-ERR-02 | Banner text says "PulsePlay Proxy" (not UniBridge) | Text matches | AUTO |
| CHAT-ERR-03 | Genie timeout → error message | Visible | LIVE |
| CHAT-ERR-04 | Foundation Model stream error → message | Visible | LIVE |
| CHAT-ERR-05 | Empty response → graceful fallback | Visible | LIVE |
| CHAT-ERR-06 | Retry button on transient failures | Visible | LIVE |

---

## Category 9 · AI Insights Pipeline (INS-*)

### Render (INS-RENDER)

| ID | Action | Expected | Tag |
|---|---|---|---|
| INS-RENDER-01 | Trigger Insights from app | Stages 1-5 fire | LIVE |
| INS-RENDER-02 | HEADLINE section renders first | Visible | LIVE |
| INS-RENDER-03 | TRENDS section renders | Visible | LIVE |
| INS-RENDER-04 | RISKS section renders | Visible | LIVE |
| INS-RENDER-05 | RECOMMENDED ACTIONS section renders | Visible | LIVE |
| INS-RENDER-06 | Status pills colored correctly | Green/amber/red per metric | LIVE |
| INS-RENDER-07 | Lower-is-better metrics use amber for increases | e.g. Return Rate | LIVE |
| INS-RENDER-08 | Card border color derived from pill tone | Visual | MANUAL |
| INS-RENDER-09 | "What changed" cards visible | Visible | LIVE |
| INS-RENDER-10 | "What needs attention" cards visible | Visible | LIVE |

### Streaming (INS-STREAM)

| ID | Action | Expected | Tag |
|---|---|---|---|
| INS-STREAM-01 | Foundation Model profile streams sections | First section in ~5s | LIVE |
| INS-STREAM-02 | Genie profile batches | Wait until full result | LIVE |
| INS-STREAM-03 | Stream error mid-flight handled | Graceful error | LIVE |
| INS-STREAM-04 | Client disconnect tears down upstream | No leaked request | LIVE |

### Cache (INS-CACHE)

| ID | Action | Expected | Tag |
|---|---|---|---|
| INS-CACHE-01 | Cache hit on second identical run | < 1s | LIVE |
| INS-CACHE-02 | Cache TTL respected | Expires after N min | LIVE |
| INS-CACHE-03 | Cache key includes settings fingerprint | Different settings → cache miss | LIVE |

### Stage controls (INS-STAGES)

| ID | Action | Expected | Tag |
|---|---|---|---|
| INS-STAGES-01 | Hide HEADLINE → not rendered | Visible toggle | LIVE |
| INS-STAGES-02 | Hide TRENDS → not rendered | Visible toggle | LIVE |
| INS-STAGES-03 | Hide RISKS → not rendered | Visible toggle | LIVE |
| INS-STAGES-04 | Hide ACTIONS → not rendered | Visible toggle | LIVE |
| INS-STAGES-05 | Stage override populates that section | Custom prompt used | LIVE |

---

## Category 10 · Vendor Matrix (MTX-*)

### Databricks-only — Genie BI + Foundation Model AI (MTX-DBX)

| ID | Action | Expected | Tag |
|---|---|---|---|
| MTX-DBX-01 | Configure Genie BI + Foundation AI | Both axes ready | LIVE |
| MTX-DBX-02 | Ask question → Foundation stream renders | First content < 5s | LIVE |
| MTX-DBX-03 | Insights runs end-to-end | All 4 stages visible | LIVE |
| MTX-DBX-04 | Switch Genie space → reconfig | Embed updates | LIVE |
| MTX-DBX-05 | Both panels visible in mix mode | AI + BI side by side | AUTO |
| MTX-DBX-06 | Floating panel works | Drag/dock | AUTO |
| MTX-DBX-07 | Maximize AI pane | BI hidden | AUTO |
| MTX-DBX-08 | Maximize BI pane | AI hidden | AUTO |
| MTX-DBX-09 | Question references BI context | LLM aware of report | LIVE |
| MTX-DBX-10 | Discovery loop pre-fetch fires | Schema + KPI loaded | LIVE |

### Databricks dual-product — AI/BI + Genie AI (MTX-DBX2)

| ID | Action | Expected | Tag |
|---|---|---|---|
| MTX-DBX2-01 | Configure AI/BI dashboard + Genie profile | Ready | LIVE |
| MTX-DBX2-02 | AI/BI basic mode loads | iframe visible | LIVE |
| MTX-DBX2-03 | AI/BI SDK mode loads | token-flow embed | LIVE |
| MTX-DBX2-04 | Genie question completes | Response visible | LIVE |
| MTX-DBX2-05 | Insights references dashboard data | Aware of context | LIVE |
| MTX-DBX2-06 | RLS via external viewer ID | Per-user filtering | LIVE |
| MTX-DBX2-07 | Switch BI vendor mid-session | Embed re-mounts | AUTO |

### Cross-vendor — Power BI Premium + Databricks Genie AI (MTX-CROSS)

| ID | Action | Expected | Tag |
|---|---|---|---|
| MTX-CROSS-01 | PBI secure-embed + Genie profile | Ready | LIVE |
| MTX-CROSS-02 | PBI iframe loads via autoAuth | AAD SSO completes | LIVE |
| MTX-CROSS-03 | Genie answers with PBI report context | LLM sees report shape | LIVE |
| MTX-CROSS-04 | Switch to PBI SSO mode | Re-auth via MSAL | LIVE |
| MTX-CROSS-05 | Switch to PBI Backend mode | Service principal flow | LIVE |
| MTX-CROSS-06 | Both panels visible | Mix mode | AUTO |
| MTX-CROSS-07 | Foundation Model AI also works with PBI | Cross-profile | LIVE |
| MTX-CROSS-08 | Supervisor AI also works with PBI | Cross-profile | LIVE |
| MTX-CROSS-09 | Power BI Premium NOT Fabric | No Fabric-only flow | LIVE |
| MTX-CROSS-10 | License posture shows Premium | System group readout | LIVE |

### AI-only (MTX-AIONLY)

| ID | Action | Expected | Tag |
|---|---|---|---|
| MTX-AIONLY-01 | No BI, AI profile picked | aiOnly mode auto-suggested | AUTO |
| MTX-AIONLY-02 | Ask Pulse works without BI context | LLM responds | LIVE |
| MTX-AIONLY-03 | Insights pipeline runs without BI | Generic context | LIVE |
| MTX-AIONLY-04 | BI panel hidden | Visible only AI | AUTO |
| MTX-AIONLY-05 | Empty-state shown when both hidden | "Both panels hidden" | AUTO |

### BI-only — Power BI Premium (MTX-BIONLY)

| ID | Action | Expected | Tag |
|---|---|---|---|
| MTX-BIONLY-01 | PBI embed only, no AI profile | biOnly mode | AUTO |
| MTX-BIONLY-02 | PBI iframe loads | Visible | LIVE |
| MTX-BIONLY-03 | AI panel hidden | Not rendered | AUTO |
| MTX-BIONLY-04 | Setup readiness shows AI missing | Warn badge | AUTO |
| MTX-BIONLY-05 | Switch to mix mode → AI panel shows empty state | Visible | AUTO |

### Stub vendors (MTX-STUBS)

| ID | Action | Expected | Tag |
|---|---|---|---|
| MTX-STUBS-01 | Tableau + Genie | iframe loads if URL valid | LIVE |
| MTX-STUBS-02 | Qlik + Genie | iframe loads | LIVE |
| MTX-STUBS-03 | Looker + Genie | iframe loads | LIVE |
| MTX-STUBS-04 | Generic iframe + any AI | Works | LIVE |

---

## Category 11 · Floating Panel (FLOAT-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| FLOAT-01 | Click float button on AI pane | Floats above canvas | AUTO |
| FLOAT-02 | Drag floating panel | Position updates | MANUAL |
| FLOAT-03 | Drag past viewport edge → clamped | Stays within bounds | MANUAL |
| FLOAT-04 | Dock button returns to layout | Re-anchored | AUTO |
| FLOAT-05 | BI canvas visible behind floated AI | Both showing | AUTO |
| FLOAT-06 | Floating panel has shadow | Visual | MANUAL |
| FLOAT-07 | Closing floating panel restores both panels | No "Both panels hidden" | AUTO |
| FLOAT-08 | Surface tabs suppressed in float mode | No duplicate nav | AUTO |

---

## Category 12 · Settings Persistence + Recovery (PERSIST-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| PERSIST-01 | Change setting → refresh → still set | localStorage round-trip | AUTO |
| PERSIST-02 | New tab same origin → same settings | Cross-tab sync via storage event | AUTO |
| PERSIST-03 | Storage event from another tab → re-renders | Reactive sync | AUTO |
| PERSIST-04 | Corrupt localStorage value → fallback default | No crash | AUTO |
| PERSIST-05 | Missing key → default | No crash | AUTO |
| PERSIST-06 | Type mismatch (string in bool field) → coerced or defaulted | No crash | AUTO |
| PERSIST-07 | localStorage quota exceeded → silent fail | No crash | MANUAL |
| PERSIST-08 | Orphan detection on allowlist update | OrphanBanner appears | LIVE |
| PERSIST-09 | Clear all pulseplay:* keys → reverts to defaults | Verified | AUTO |
| PERSIST-10 | Settings export → JSON valid | Importable round-trip | AUTO |

---

## Category 13 · Allowlist + Governance (GOV-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| GOV-01 | Pick BI vendor outside allowlist → rejected | Orphan banner | LIVE |
| GOV-02 | Pick AI profile outside allowlist → rejected | Orphan banner | LIVE |
| GOV-03 | Pick pack outside allowlist → rejected | Orphan banner | LIVE |
| GOV-04 | Embed origin outside allowlist → rejected | Error in form | LIVE |
| GOV-05 | Workspace ID outside allowlist (PBI) → rejected | Error | LIVE |
| GOV-06 | Report ID outside allowlist (PBI) → rejected | Error | LIVE |
| GOV-07 | Genie space outside allowlist → rejected | Error | LIVE |
| GOV-08 | Strict enforcement label visible | "strict" or "permissive" | AUTO |
| GOV-09 | Allowlist /api/assistant/allowlist GET | Returns shape | LIVE |
| GOV-10 | Allowlist 500 → fallback (no allowlist) | Still functional | LIVE |
| GOV-11 | Embed token issuance proxy-side only | No secret in browser | AUTO |

---

## Category 14 · Error Handling (ERR-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| ERR-01 | Proxy down on settings load | Proxy chip "warn" | LIVE |
| ERR-02 | /api/health returns 500 | Graceful error | LIVE |
| ERR-03 | /api/health returns malformed JSON | Caught + retry | LIVE |
| ERR-04 | /api/assistant/profiles 500 | Test button shows failure | LIVE |
| ERR-05 | /api/assistant/profiles timeout | Spinner stops; error visible | LIVE |
| ERR-06 | /api/assistant/allowlist 500 | Setup alert visible | LIVE |
| ERR-07 | Invalid embed URL | Error in apply | AUTO |
| ERR-08 | AAD popup blocked | Visible message | LIVE |
| ERR-09 | AAD consent denied | Returned to settings | LIVE |
| ERR-10 | Backend token 401 → re-issue | Retry happens | LIVE |
| ERR-11 | Backend token 403 → permissions error | Visible | LIVE |
| ERR-12 | Genie space 404 → "Space not found" | Visible | LIVE |
| ERR-13 | Genie space 403 → "Access denied" | Visible | LIVE |
| ERR-14 | Foundation stream interrupted → resume option | Visible | LIVE |
| ERR-15 | Supervisor partial failure (3 of 5 spaces) | Aggregate shown | LIVE |
| ERR-16 | Browser offline → app shell still renders | No white screen | AUTO |
| ERR-17 | localStorage disabled → fallback in-memory | No crash | MANUAL |
| ERR-18 | TypeError in render → ErrorBoundary catches | Visible recovery UI | AUTO |
| ERR-19 | Long-running query → cancel button | Visible | LIVE |
| ERR-20 | Cancel mid-flight → upstream torn down | Verified in proxy log | LIVE |

---

## Category 15 · Tooltips + Help (HELP-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| HELP-01 | Every FieldRow has ⓘ button | Visible on each field with tip | AUTO |
| HELP-02 | Hover ⓘ → tooltip appears | Visual | MANUAL |
| HELP-03 | Focus ⓘ via Tab → tooltip appears | Keyboard accessible | AUTO |
| HELP-04 | Click ⓘ → toggle tooltip | Open/close | MANUAL |
| HELP-05 | Tooltip wraps long text | Readable | MANUAL |
| HELP-06 | Tooltip has arrow pointer | Visual | MANUAL |
| HELP-07 | Tooltip max width 280px | Visual | MANUAL |
| HELP-08 | Tooltip animates in (140ms fade) | Smooth | MANUAL |
| HELP-09 | Code snippets in tooltip styled | <code> visible | MANUAL |
| HELP-10 | Links in tooltip clickable | Open in new tab | MANUAL |
| HELP-11 | Warn variant ⓘ has orange color | Visual | MANUAL |
| HELP-12 | Tip variant ⓘ has sparkle ✨ | Visual | MANUAL |
| HELP-13 | aria-describedby links bubble to trigger | A11y | AUTO |

---

## Category 16 · Keyboard + Accessibility (A11Y-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| A11Y-01 | Tab through Quick Setup form | All controls reachable | AUTO |
| A11Y-02 | Tab through Settings rail | All groups reachable | AUTO |
| A11Y-03 | Enter activates focused button | Action fires | AUTO |
| A11Y-04 | Esc closes settings page | Returns to / | AUTO |
| A11Y-05 | Arrow keys in select dropdowns | Native behavior | AUTO |
| A11Y-06 | Focus indicators visible | Blue ring | MANUAL |
| A11Y-07 | All form controls have <label> | A11y inspector | AUTO |
| A11Y-08 | Status badges have aria-label | Screen reader text | AUTO |
| A11Y-09 | role="tablist" on view tab strip | Verified | AUTO |
| A11Y-10 | role="tab" on each view button | Verified | AUTO |
| A11Y-11 | aria-selected on active tab | Verified | AUTO |
| A11Y-12 | aria-current="page" on active rail item | Verified | AUTO |
| A11Y-13 | aria-live="polite" on settings main pane | Verified | AUTO |
| A11Y-14 | aria-label on Test buttons describes action | Verified | AUTO |
| A11Y-15 | Color contrast WCAG AA on text vs bg | Audit tool | MANUAL |

---

## Category 17 · Responsive Layout (RESP-*)

| ID | Viewport | Expected | Tag |
|---|---|---|---|
| RESP-01 | 1920×1080 | All layouts intact | MANUAL |
| RESP-02 | 1440×900 | All layouts intact | MANUAL |
| RESP-03 | 1280×800 | Settings rail still 220px wide | MANUAL |
| RESP-04 | 1024×768 | Settings still usable | MANUAL |
| RESP-05 | 900×600 | Settings rail narrows to 180px | MANUAL |
| RESP-06 | 768×1024 (portrait) | Settings usable | MANUAL |
| RESP-07 | 640×960 | Settings rail hides | MANUAL |
| RESP-08 | Chart container caps at 420px height | Verified | AUTO |
| RESP-09 | FieldCard 2-col grid collapses to 1-col at 720px | Verified | AUTO |
| RESP-10 | Status strip wraps on narrow viewport | Verified | MANUAL |

---

## Category 18 · Auto-Save Bar Behavior (SAVEBAR-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SAVEBAR-01 | Change toggle on KB sub-route → bar appears | Visible | AUTO |
| SAVEBAR-02 | Change theme on Appearance → bar appears | Visible | AUTO |
| SAVEBAR-03 | Change text input on Governance → bar appears | Visible | AUTO |
| SAVEBAR-04 | Save bar shows pulsing dot | Animation | MANUAL |
| SAVEBAR-05 | Save bar text "Unsaved changes" | Verified | AUTO |
| SAVEBAR-06 | Click Save → text becomes "Settings saved" | Verified | AUTO |
| SAVEBAR-07 | Saved confirmation green | Visual | MANUAL |
| SAVEBAR-08 | Auto-dismisses after 3 s | Timer | AUTO |
| SAVEBAR-09 | Click Discard → all changes reverted | Verified | AUTO |
| SAVEBAR-10 | Discard restores snapshot keys | localStorage diff | AUTO |
| SAVEBAR-11 | Discard fires display-change event | Pulse listeners re-sync | AUTO |
| SAVEBAR-12 | Multiple changes batched in one save | One commit | AUTO |
| SAVEBAR-13 | Navigate away with unsaved changes → bar stays | Persists across nav | AUTO |
| SAVEBAR-14 | Refresh page with unsaved changes → bar resets | Snapshot re-baselines | AUTO |

---

## Category 19 · Sub-Navigation Routing (SUBNAV-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| SUBNAV-01 | `/settings/ai/knowledge-base` direct URL | AiKnowledgeBase renders | AUTO |
| SUBNAV-02 | `/settings/ai/supervisor-fusion` direct URL | AiSupervisorFusion renders | AUTO |
| SUBNAV-03 | `/settings/preferences/appearance` direct URL | PreferencesAppearance renders | AUTO |
| SUBNAV-04 | `/settings/system/developer-tools` direct URL | SystemDeveloper renders | AUTO |
| SUBNAV-05 | `/settings/bi/governance` direct URL | BiGovernance renders | AUTO |
| SUBNAV-06 | Refresh on sub-route URL → SPA fallback works | Same page renders | AUTO |
| SUBNAV-07 | Unknown sub-route falls through to group page | No 404 | AUTO |
| SUBNAV-08 | Sub-route highlighted in rail when active | Blue text + bg | AUTO |
| SUBNAV-09 | Browser back from sub-route → previous URL | Works | AUTO |
| SUBNAV-10 | Click rail group while on sub-route → returns to group root | URL changes | AUTO |

---

## Category 20 · App Shell + Layout (APP-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| APP-01 | Open `/` | App shell renders | AUTO |
| APP-02 | Vendor picker visible in sidebar | Renders | AUTO |
| APP-03 | Embed config form visible | Renders | AUTO |
| APP-04 | AI sidebar (v0 fallback) at bottom of left rail | Visible when Pulse off | AUTO |
| APP-05 | Brand title "PulsePlay" with gradient text | Visual | MANUAL |
| APP-06 | Switch UI mode → Pulse vs v0 | Layout swaps | AUTO |
| APP-07 | Maximize AI pane | BI hidden | AUTO |
| APP-08 | Maximize BI pane | AI hidden | AUTO |
| APP-09 | Restore both panes | Layout returns | AUTO |
| APP-10 | "Open in separate page" → new window | Opens in tab | AUTO |
| APP-11 | Pin AI pane | Stays maximized | AUTO |
| APP-12 | Setup readiness pill in top-right | Shows status | AUTO |
| APP-13 | Click readiness pill → opens Settings → Setup | Navigation | AUTO |
| APP-14 | Surface tabs (AI Insights / Ask Pulse / BI Viz) when mix mode | Visible | AUTO |
| APP-15 | Active tab pill has blue gradient | Visual | MANUAL |

---

## Category 21 · Knowledge Base Content (KBROOT-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| KBROOT-01 | Navigate to `/knowledge/<pack>` | Knowledge Base shell renders | AUTO |
| KBROOT-02 | Browse pack sections | Listed | AUTO |
| KBROOT-03 | Open a pack file | Markdown rendered | AUTO |
| KBROOT-04 | Back to settings preserves pack selection | Persists | AUTO |

---

## Category 22 · Workbench Modes (WB-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| WB-01 | Workbench tab in Ask Pulse | Available | LIVE |
| WB-02 | Native Embed mode | Genie iframe inside | LIVE |
| WB-03 | Verified mode | Validator output visible | LIVE |
| WB-04 | Hybrid mode | Both surfaces | LIVE |
| WB-05 | Mode picker switches without reload | Hot swap | AUTO |
| WB-06 | Composer input in workbench | Sends to active mode | LIVE |

---

## Category 23 · Performance + Health (PERF-*)

| ID | Metric | Expected | Tag |
|---|---|---|---|
| PERF-01 | Cold dev-server load | < 5 s | AUTO |
| PERF-02 | Settings page load | < 1 s | AUTO |
| PERF-03 | Foundation Model first content | < 5 s | LIVE |
| PERF-04 | Genie SQL execution (warm warehouse) | < 30 s | LIVE |
| PERF-05 | Genie SQL execution (cold warehouse) | < 90 s | LIVE |
| PERF-06 | Bundle size under cap | Vite build report | AUTO |
| PERF-07 | No console errors on idle | DevTools clean | AUTO |
| PERF-08 | No memory leak after 100 nav cycles | Heap stable | MANUAL |

---

## Category 24 · Security Posture (SEC-*)

| ID | Check | Expected | Tag |
|---|---|---|---|
| SEC-01 | No PAT in browser bundle | grep dist/ for 'dapi' | AUTO |
| SEC-02 | No proxy key in browser | grep dist/ for proxyKey | AUTO |
| SEC-03 | iframe sandbox attributes narrow | Inspect element | AUTO |
| SEC-04 | CSP frame-ancestors restrictive | Inspect headers | AUTO |
| SEC-05 | X-Frame-Options on proxy responses | DENY | AUTO |
| SEC-06 | XSS in metric direction rules → escaped | Inspect render | AUTO |
| SEC-07 | XSS in custom prompt → escaped | Inspect render | AUTO |
| SEC-08 | XSS in embed URL → not executed | Inspect | AUTO |
| SEC-09 | Support bundle export redacts tokens | Inspect JSON | AUTO |
| SEC-10 | localStorage cleared on Reset all | Verified | AUTO |
| SEC-11 | SessionStorage cleared on Sign Out PBI | Verified | LIVE |

---

## Category 25 · Documentation + Discovery (DOC-*)

| ID | Action | Expected | Tag |
|---|---|---|---|
| DOC-01 | README mentions PulsePlay branding | Verified | AUTO |
| DOC-02 | CLAUDE.md tripwires up to date | Verified | AUTO |
| DOC-03 | ARCHITECTURE.md reflects current state | Verified | AUTO |
| DOC-04 | HANDOVER.md has latest entry | Verified | AUTO |
| DOC-05 | WORKING_WITH_CLAUDE.md present | Verified | AUTO |
| DOC-06 | SMOKE_TEST_PLAN.md (this file) present | Verified | AUTO |
| DOC-07 | docs/ROADMAP.md up to date | Verified | AUTO |
| DOC-08 | docs/AGENDA.md tracks open work | Verified | AUTO |

---

## Tally

> **2026-05-19 reconciliation:** Codex parser counted **647 scenario rows** end-to-end; my original estimate of "~520" undercounted. Authoritative count below (verified via row-shape grep against the table syntax).

- **Total scenarios:** ~647 (target was 500+ — well over)
- **AUTO** (automated browser / unit / integration): ~400
- **LIVE** (needs real Databricks workspace + AAD session): ~169
- **MANUAL** (visual or human judgement): ~78

> An automation tool can attack the ~400 AUTO scenarios solo. The ~169 LIVE scenarios need credentials and a live workspace — pair with a human or pre-stage fixtures. The ~78 MANUAL scenarios should be reviewed by a designer / human reviewer.

---

## Report format

For each scenario, emit:

```
[CATEGORY-SUBCATEGORY-NN] PASS | FAIL | SKIPPED | N/A
  Notes: <one-liner if FAIL/SKIPPED>
  Evidence: <URL of screenshot / console log / commit hash>
```

At the end of the run, emit a summary:

```
Total: 520
  PASS:    XXX (NN%)
  FAIL:    XXX (with list)
  SKIPPED: XXX (with reason buckets)
  N/A:     XXX (with reason buckets)
Duration: HH:MM:SS
Environment: <browser> · <viewport> · <proxy version> · <Databricks workspace>
```

File one issue per FAIL group (cluster related failures), with the scenario IDs in the title.
