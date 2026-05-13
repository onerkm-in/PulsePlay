# PulsePlay Settings Spec

> **Single source of truth** for the `/settings` surface. Combines information architecture, layout, microcopy, state model, interaction rules, enterprise guardrails, security setup, maintenance, administration, and a loophole audit.
>
> **Companion docs:** [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md), [PROXY_REFERENCE.md](PROXY_REFERENCE.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PACKS.md](PACKS.md).
>
> **Last audit:** 2026-05-13. Anchored at HEAD `8fde791`.
>
> **Status:** v0.2 design lock. Phases 0, 1, 2, 3, 4, 5, 6 (HIGH + MEDIUM), 7 **shipped 2026-05-13** — MVP 0.2 functional + security core complete. **All 8 HIGH closed or mitigated. All MEDIUM closed or ACCEPTED with risk log.** Remaining gates: live credentialed PBI + Genie/Supervisor smoke, post-MVP-0.2 KB UI (Phase 8). See § 16 for the live phase tracker.

---

## 0. MVP 0.2 scope (locked 2026-05-13)

This spec describes the full 2-axis abstraction (any BI × any AI). **MVP 0.2 ships exactly one cell of that matrix:**

| Axis | MVP 0.2 |
|---|---|
| **AI** | Databricks Genie, in two flavors — **direct Genie connector** (one space per profile) and **Supervisor Agent connector** (one Supervisor fans across multiple Genie spaces, admin-configured) |
| **BI** | Power BI, normally in **Premium workspaces**, governed by the org's admin/governance team. **No Fabric access** in MVP 0.2 (deferred). |

The 2-axis architecture stays intact — the spec, the adapter contracts, the allowlist machinery, the Settings IA are all written so adding Tableau / Qlik / Looker / Azure OpenAI / Bedrock / Foundation Model is a configuration-driven expansion, not a re-architecture. But MVP 0.2 explicitly:

- **Defaults the allowlist** to PBI + Genie + Supervisor only. Other vendors and connectors are deferred until v0.3+.
- **Hides** the Tableau/Qlik/Looker BI providers and the OpenAI/Bedrock/Foundation AI providers in Settings UI rendering (filtered by allowlist; see § 11.4).
- **Treats Premium workspace + license posture as a first-class status surface** (System group). Authors must see what's licensed, what's not, and what's blocked by governance — without having to ask the admin.
- **Treats Fabric as explicitly NOT available.** Settings copy and capability readouts call this out so authors don't expect Direct Lake / Dataflow Gen2 / etc.
- **Treats the org admin/governance team as the authoritative source** for workspace allowlist, capacity allocation, license assignments, AAD app registration, SP secrets, and Genie space access. The Settings page shows status; it does not re-implement those controls.

### MVP 0.2 deferral list

The following spec items remain documented but their UI affordances are gated off until post-MVP-0.2:

- Tableau / Qlik / Looker provider options in BI › Provider picker
- Azure OpenAI / AWS Bedrock / Foundation Model options in AI › Provider picker
- Knowledge plane Phase 3+ retrieval provider interface (PulsePack content is the only knowledge today; Unity Catalog / SharePoint / S3 source adapters wait)
- Generic-iframe BI provider in production (still available behind admin opt-in for dev/lab use)
- Multi-tenant scoping (single-tenant per deployment)
- Fabric-specific Power BI features (Direct Lake datasets, Dataflow Gen2, semantic-link APIs)

### MVP 0.2 success criteria

1. An author with `app.pulseplay.users` group membership opens `/settings`, sees only Power BI and Genie/Supervisor available, configures both in under 10 minutes, and asks the AI a question grounded in their CPG/FMCG pack.
2. The admin team can publish a `proxy/config.json.allowlist` that locks the deployment to specific PBI Premium workspaces, the org's AAD tenant, and the org's Genie spaces, with zero client-side bypass.
3. License posture (Premium tier, embed-token availability, Fabric absence) is visible in System without requiring an admin ticket.
4. Supervisor fan-out across multiple Genie spaces is visible per-space, with partial-failure handled gracefully.
5. All 8 HIGH loopholes (L1-L8) from § 15 are closed.
6. Audit log captures every BI mount, AI query, allowlist rejection, and license-tier event with `X-Request-Id` correlation.

---

## 1. Purpose

PulsePlay's settings today are scattered across seven surfaces (top-bar VendorPicker, EmbedConfigForm, ConnectorPicker, TestConnectionPanel, PackPicker, floating gear, Pulse Cycle H Display tab) and seven `pulseplay:*` localStorage keys. The defining product architecture is two-axis independence — BI vendor (Y) × AI connector (X) — plus a Knowledge plane that grounds answers and composes with both. For a managed-organization deployment, every user-provided value must be filtered through an organization-controlled allowlist with no client-side bypass paths.

This spec consolidates the IA, the UX rules, the state model, and the enterprise guardrails into one canonical artifact. Until this lands, settings cleanup work has no agreed target; once it lands, every PR touching the settings surface cites this doc.

---

## 2. Information architecture

### 2.1 Canonical tree

```
Settings  (full-page route, left rail, shallow nesting)
├── BI                          what you're looking at
│   ├─ Provider                 Power BI / Tableau / Qlik / Looker / Generic iframe
│   ├─ Embed                    vendor-aware (PBI: secure-link / SSO / SP / manual; others: URL)
│   ├─ Authentication           SSO config (when applicable), tenant pin, sign-in/out
│   ├─ Canvas                   tile mode (1 / 2 / 4) + sandbox readout
│   └─ Status                   live mount state, last load, recent events count
│
├── AI                          what's thinking, and what it knows
│   ├─ Provider                 Genie / Azure OpenAI / Bedrock / Foundation Model / Supervisor
│   ├─ Model / Agent            sub-selection inside the provider (when applicable)
│   ├─ Connection test          probe status + inference trace inline + Re-run
│   ├─ Knowledge pack           active pack + sub-vertical (allowlisted + author-confirmed)
│   ├─ AI Insights setup ↗      deep-link to Pulse Setup tab
│   └─ Browse library ↗         deep-link to Knowledge Base UI surface
│
├── Preferences                 how the playground is laid out
│   ├─ Layout                   pane orientation
│   ├─ Panels                   AI only / BI only / Both
│   ├─ Position                 AI Left / Right / Top / Bottom
│   └─ Density                  Comfortable / Compact (admin default — author override)
│
├── System                      is it safe, and is anything broken
│   ├─ Proxy status             live /healthz + version + reachable backends
│   ├─ Security                 read-only: IdP, CORS, CSP, rate-limits, allowlist contents
│   ├─ Diagnostics              session, BI events, last errors, copy-to-clipboard
│   └─ Export bundle            JSON snapshot for support (redacted)
│
└── Advanced                    destructive + maintenance — gated behind a disclosure
    ├─ Local storage            inspect/clear individual `pulseplay:*` keys
    ├─ Reset section            scoped reset (per group above)
    ├─ Reset all                full localStorage purge for the origin
    └─ Danger zone              sign out + clear cached MSAL session + clear embed-token cache
```

**Five top-level groups.** Knowledge Pack folded under AI (per [§ 17 trigger conditions](#17-trigger-conditions-for-ia-change), promotion to top-level happens when Phase 3 retrieval provider interface lands or when ≥2 knowledge-source-adapter types ship).

### 2.2 Why this shape

This is the **lifecycle-of-intent** pattern from GitHub repo settings. The five groups answer five different user questions:

| Group | Question it answers |
|---|---|
| BI | "What am I looking at?" |
| AI | "What's thinking about it, and what does it know?" |
| Preferences | "How is the playground laid out?" |
| System | "Is it safe, and is anything broken?" |
| Advanced | "How do I reset / inspect raw state?" |

A user opens the group whose question matches their intent. Most products that scale settings well (Stripe, Linear, Vercel, GitHub repo) use this pattern — names answer user intent, not codebase axes.

### 2.3 Names — what they say and don't say

- **`BI` and `AI`**, not "BI Runtime" / "AI Runtime". The `Runtime` suffix is enterprise-architect jargon and collides with the architectural concept (which is the *thing*, not its settings).
- **`Provider`** on both axes, not "Vendor" on one and "Connector" on the other. The 2-axis intuition reads cleaner with parallel naming.
- **`AI Insights setup ↗`** instead of "Pulse Setup". "Pulse" is an internal product name and means nothing to a first-time author. The leaf describes what it does.
- **`Preferences`**, not "Workspace". PulsePlay has no User-vs-Workspace scope in v1; calling it Workspace would imply a multi-user scope that doesn't exist.
- **`System`**, not "System & Health". The `& ` glue word reveals indecision. Status lives inside System without needing to be advertised.
- **`Advanced`** for destructive/maintenance actions (Chrome / Vercel / Firefox pattern). Reset is not a top-level group; danger lives at the bottom.

---

## 3. Layout & navigation

### 3.1 Page shell

```
┌── PulsePlay [logo]                                    Back to app ─ ✕ ──┐
├── [ Search settings… (Cmd+/) ]   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ┤
├── [Status strip — five chips: BI · AI · Pack · Proxy · Security]        │
├──────────────────┬──────────────────────────────────────────────────────┤
│ ◆ BI             │  ## Group title                                      │
│ ◆ AI             │                                                      │
│ ◆ Preferences    │  Leaf label                                          │
│ ◆ System         │  helper text — one line, plain language              │
│ ◆ Advanced       │  [ control ]   [ Modified · Apply ]                  │
│                  │                                                      │
│                  │  ...                                                 │
└──────────────────┴──────────────────────────────────────────────────────┘
```

- **Left rail:** 5 group entries. Width ~220 px desktop. Active group highlighted; inactive groups dim.
- **Header strip:** PulsePlay brand on left, `Back to app` button on right (also `Esc`).
- **Search box:** Below the header. Filters leaf labels + helper text + synonym table (§ 9).
- **Status strip:** 5 colored chips above the content pane — `BI ok` / `AI ok` / `Pack: cpg-fmcg` / `Proxy ok` / `Security pinned`. Click a chip to scroll to its leaf. Red on any failure.
- **Content pane:** One group at a time. Sections within a group separated by a thin divider, never a card.

### 3.2 Where Settings lives

- **Full-page route** at `/settings`. Browser back/forward works. Deep linkable: `/settings/ai/provider`, `/settings/system/security`.
- **Not a modal.** Too many leaves for a modal; modals hide context.
- **Not a side drawer.** Drawer breaks the "Settings is the control room" mental model.
- **Not anchored scroll.** The left-rail-per-group pattern is what Stripe, GitHub, Linear, Vercel use; anchored scroll buries deep sections.

### 3.3 Entry points

1. **Gear icon** in the top bar (right side, next to connection pill) — universal.
2. **Connection pill** (when Pulse is mounted) — routes to `/settings/ai/connection-test`.
3. **Keyboard shortcut** `Ctrl+,` (Linux/Windows) / `Cmd+,` (macOS) — opens at last-visited group.
4. **URL deep link** — `/settings`, `/settings/<group>`, or `/settings/<group>/<leaf>`.
5. **In-canvas shortcuts** (vendor picker, tile toolbar) — these stay as visible quick-switches; they DO read/write the same canonical store, they DO trigger preview, they DO NOT bypass the allowlist (§ 11).

### 3.4 Back to app

- **`Back to app`** button top-right (visible, always).
- **Browser back** works (URL route).
- **`Esc`** closes Settings and returns to the previous app state.
- The app state under `/settings` is fully preserved — closing Settings never resets the BI canvas or AI sidebar conversation.

### 3.5 Narrow viewport

- Below 720 px wide: left rail collapses into a top tab strip. Status chips wrap to a second row.
- Below 480 px wide: status chips collapse to dots; tap to expand.

### 3.6 Default landing

- **First-ever open:** `/settings/bi/provider`. Picking a BI provider is the entry decision; status chips at top reveal "AI not configured" / "Pack not selected" so the user knows what's next.
- **Returning open:** Last-visited group (persisted to `pulseplay:settings-last-group` localStorage).
- **Error-state open** (e.g., gear clicked while proxy unreachable): `/settings/system/proxy-status`.

### 3.7 Deep links

- `/settings` → default landing rules above.
- `/settings/<group>` → group anchor at top.
- `/settings/<group>/<leaf>` → leaf scrolled into view + focused.
- Search results display the breadcrumb path (`AI › Provider`) and route on click.

---

## 4. State model & ownership

### 4.1 Canonical state surface

The Settings page **owns every `pulseplay:*` localStorage key** except those under the `pulseplay:visual-settings:*` prefix (those are Pulse's `persistProperties` contract; see [PulseHostStub.ts:35](../playground/src/pulse/_adapter/PulseHostStub.ts#L35) and [§ 4.4 out of scope](#44-out-of-scope-for-the-settings-store)).

A new module — `playground/src/settings/settingsStore.ts` — is the single read/write path. In-canvas shortcuts (gear, vendor picker, connection pill, tile toolbar) call into this store; they never read or write localStorage directly. The existing `pulseplay:display-change` window event survives during migration and is dispatched by the store on every write so legacy listeners keep working.

### 4.2 Storage key ownership

| Key | Owning leaf | Read by (today) | Notes |
|---|---|---|---|
| `pulseplay:bi-vendor` | BI › Provider | App.tsx, biPanel/registry | Filtered by allowlist on read (§ 11) |
| `pulseplay:pbi-sso-config` | BI › Authentication | EmbedConfigForm | `aadTenantId` validated against tenant allowlist before persistence |
| `pulseplay:pack-selection` | AI › Knowledge pack | App.tsx, pulse/genie.ts | `pack` + `subVertical` re-validated on read against allowlist |
| `pulseplay:ui-mode` | Preferences › (folded — see § 17) | App.tsx, Cycle H Display | Persists if `uiModeOverrideAllowed` |
| `pulseplay:enabled-components` | Preferences › Panels | App.tsx | |
| `pulseplay:layout-mode` | Preferences › Position | App.tsx | |
| `pulseplay:bi-tile-mode` | BI › Canvas | App.tsx | |
| `pulseplay:split:<orientation>` | Preferences › Layout | react-resizable-panels | Autosave from PanelGroup |
| `pulseplay:settings-last-group` | Settings shell (new) | SettingsShell | For "returning open" default landing |
| `pulseplay:visual-settings:*` | **Pulse-owned** — out of scope | Pulse visual.tsx | NOT touched by SettingsStore |

### 4.3 Shortcut policy

| Shortcut | What it does | State path | Allowlist enforcement |
|---|---|---|---|
| Gear icon (top bar) | Opens Settings page at last-visited group | Read-only | n/a (open only) |
| Connection pill | Routes to AI › Connection test | Read-only | n/a (open only) |
| Vendor picker (top bar inline, when present) | Reads + writes `pulseplay:bi-vendor` via store | Read+write through `settingsStore.setBiVendor` | Filtered by allowlist; out-of-allowlist values rejected with toast |
| Canvas tile toolbar | Reads + writes `pulseplay:bi-tile-mode` via store | Read+write through `settingsStore.setBiTileMode` | n/a (no allowlist on tile mode) |
| Cycle H Display tab (Pulse Developer Tools) | DEPRECATED in Phase 2 — replaced by a "Open Settings" button | n/a | n/a |

**Rule:** A shortcut MUST NOT be a parallel state owner. The shortcut is a thin view onto the SettingsStore. If a shortcut needs to write, it calls a setter that goes through the same validation + allowlist enforcement as the Settings page itself.

### 4.4 Out of scope for the Settings store

- **Pulse `pulseplay:visual-settings:*` keys** — Pulse owns its own IA via the Setup tab. Settings deep-links to Pulse Setup; it does not surface these keys.
- **Proxy `config.json`** — admin-controlled; the Settings page READS allowlist contents (System › Security, read-only) but never writes them.
- **Environment variables** (`PROXY_CORS_ORIGIN`, `PROXY_IDP_*`, `PROXY_INLINE_CREDENTIALS_MODE`, etc.) — set by the deployer at proxy startup. System › Security shows their values read-only.
- **Vault-managed secrets** (SP secrets, embed-token issuance keys) — never surface in the UI; only their derived health (e.g., "AAD SP healthy") appears in System › Proxy status.

---

## 5. Interaction rules

Three behaviour classes apply across all leaves:

### 5.1 Auto-save (default)

Auto-save the moment a control loses focus, with a brief "Saved" toast (2 s). Used for:

- Preferences (Layout / Panels / Position / Density)
- BI › Canvas (tile mode)
- AI › Provider switch (when allowlist passes)
- Knowledge pack switch (when allowlist passes)

Auto-save defaults match what works today (every existing `pulseplay:*` key auto-saves). Don't change this — it's familiar and forgiving.

### 5.2 Apply required (with confirm)

Show an "Apply" button when the change reshapes downstream state non-trivially. The user reviews diff before commit. Used for:

- BI › Provider switch (drops current embed config — confirm with "Switch BI provider? Current embed config will be cleared.")
- BI › Authentication mode switch (SSO ↔ SP ↔ Manual paste — confirm)
- AI › Provider switch (invalidates probe + pack inference — confirm)

The Apply button shows a `Modified` badge until clicked.

### 5.3 Destructive (with type-to-confirm)

For irreversible actions in Advanced. Pattern: input box where the user types the leaf name (e.g., `Reset all`) before the action button enables.

- Advanced › Reset all → type `Reset all` → button enables → confirm
- Advanced › Danger zone → Sign out / Clear MSAL / Clear embed-token cache — each requires the same gesture

### 5.4 Read-only with linked admin action

Some leaves can't be edited in the UI by an author. Show the current value (or its status), and link to the admin action.

- System › Security shows the CORS allowlist with a "Configured via `PROXY_CORS_ORIGIN`. See [PROXY_REFERENCE.md](PROXY_REFERENCE.md#cors)."
- System › Security shows the IdP status with "Configured via `PROXY_IDP_*`. See [SECURITY_ARCHITECTURE.md § 1](SECURITY_ARCHITECTURE.md)."

---

## 6. Microcopy

### 6.1 Per-leaf labels + helper text

**BI** (MVP 0.2: Power BI only, Premium-workspace constraint, no Fabric)

| Leaf | Label | Helper text |
|---|---|---|
| Provider | BI provider | The BI tool PulsePlay embeds. **MVP 0.2: Power BI only.** Tableau / Qlik / Looker / generic iframe are deferred to v0.3+. |
| Embed | Embed configuration | How PulsePlay obtains the Power BI embed. Four modes: **Secure-embed link** (works everywhere, preview-only), **AAD SSO** (requires Premium or PPU on the report's workspace; user's RLS applies), **Service principal** (requires Premium capacity + Embedded SKU consumed; SP identity applies), **Manual token** (dev/lab only — dev mode requires `PROXY_INLINE_CREDENTIALS_MODE` ≠ `off`). |
| Authentication | Authentication & tenant | AAD tenant ID for SSO mode. **Locked to your organization's tenant via allowlist** — manual entry is disabled when the tenant allowlist contains one or more entries. AAD app client ID is also admin-published. |
| Canvas | Canvas tiles | How many Power BI frames render side-by-side (1 / 2 / 4). All tiles share the same embed config in MVP 0.2. |
| Status | Mount status & license posture | Live state of the embed: provider, mount mode, last load, recent events. **License posture readout:** Premium tier (P1 / P2 / P3 / PPU), embed-token availability (yes / requires SP secret / no), Fabric capability (**explicitly NO in MVP 0.2**), and the workspace ID that hosted the embed. |

### 6.1.2 Power BI Premium / license / governance specifics

PulsePlay deploys into orgs where Power BI access is heavily governed. The Settings page treats this as a first-class concern, not an afterthought.

**Workspace allowlist (admin-controlled, defense in depth):**

- `proxy/config.json.allowlist.powerbiWorkspaces` — array of allowed workspace GUIDs. The PBI service principal is granted access to exactly this set.
- `BI › Embed` validates `groupId` against the allowlist before requesting an embed token.
- Proxy `requireAllowed('powerbiWorkspace', req.user)` middleware double-checks at issuance time.
- Banner on `BI › Embed`: "Allowed workspaces: 3 (see admin). Type a workspace GUID — autocomplete filtered to allowed set."

**License posture (read-only readout on `BI › Status`):**

| Field | Source | Example values |
|---|---|---|
| Workspace capacity tier | PBI REST `/admin/capacities/{id}` | `Premium P1`, `Premium per User`, `Shared` |
| Embed-for-customers SKU | proxy config + PBI capacity probe | `EM1` / `EM2` / `EM3` / `A1-A6` / `not-purchased` |
| User license | AAD claim + PBI service principal probe | `Pro`, `PPU`, `Free`, `none` |
| Fabric capability | proxy config — locked to `false` in MVP 0.2 | `not available in MVP 0.2` |
| Available capabilities | derived | "Embed-token: yes · RLS: per-user (SSO) or per-SP · Q&A: yes · Fabric Direct Lake: NO · Dataflow Gen2: NO" |

**Governance affordances:**

- Every embed-token mint logs `workspace`, `report`, `user`, `licenseTier`, `capacityUtilizationHint` to the audit log.
- License-tier change events (e.g., Premium expires, PPU revoked, capacity throttled) surface in `System › Diagnostics` with the IT-team email link.
- Capacity throttling errors from PBI surface as a System banner: "Power BI Premium capacity throttled. Some embed requests delayed. Contact your admin if persistent."
- Reports requiring features not licensed (e.g., a report using Direct Lake) fail to mount with a copy-paste-ready diagnostic: "Report `<name>` requires Fabric Direct Lake, which is not available in this deployment. Contact your admin or use a non-Fabric report."

**No-Fabric constraint:**

- `BI › Provider` MVP 0.2 footer: "Power BI without Fabric. Direct Lake datasets, Dataflow Gen2, and semantic-link APIs are not available."
- `BI › Status` capability matrix shows Fabric features struck through.
- `proxy/lib/featureGate.js` (new in Phase 3) returns `fabric: false` to all callers; Settings reads this and renders accordingly.

**AI** (MVP 0.2: Genie + Supervisor only)

| Leaf | Label | Helper text |
|---|---|---|
| Provider | AI provider | The AI brain that answers your questions. **MVP 0.2: Databricks Genie (direct) or Supervisor Agent (fans across multiple Genie spaces).** Other providers (Azure OpenAI, Bedrock, Foundation Model) are configured but not yet available in this deployment. |
| Model / Agent | Genie space / Supervisor profile | **For Genie:** the single Genie space this profile is bound to. **For Supervisor:** the multi-space fan-out is admin-configured and shown read-only with the list of constituent spaces. Authors can't add or remove spaces from a Supervisor — request changes via the platform team. |
| Connection test | Connection test | Live probe against the proxy. **For Genie:** single-space probe with schema hints and pack inference. **For Supervisor:** per-space probe with a summary row + drill-down per space; partial failures are surfaced ("3 of 4 spaces reachable; `hr-genie` returned 503 — using degraded routing"). |
| Knowledge pack | Knowledge pack | Vertical domain bundle the AI uses for vocabulary, KPIs, and starter questions. **MVP 0.2: only `cpg-fmcg` is installed.** New packs require admin installation. |
| AI Insights setup ↗ | AI Insights setup | Open Pulse Setup for detailed prompt, KPI rule, and validator configuration. |
| Browse library ↗ | Browse Knowledge Base | Open the Knowledge Base content browser (deferred to v0.3 — link shows "Coming soon" placeholder in MVP 0.2). |

### 6.1.1 Supervisor-specific affordances

Supervisor profiles need distinct UI treatment because one profile name fans across N Genie spaces. The Settings page renders:

- **`Model / Agent` leaf** for a Supervisor profile shows a read-only fan-out table:
  ```
  Supervisor: org-supervisor-v1
  Routing strategy: round-robin with sticky-session
  Spaces (4):
    ◆ sales-genie       reachable   p95 1.2s   last 24h: 142 queries
    ◆ marketing-genie   reachable   p95 0.9s   last 24h: 87 queries
    ◆ supply-genie      reachable   p95 1.4s   last 24h: 23 queries
    ◆ hr-genie          ⚠ 503       p95 n/a    last 24h: 0 queries  [admin]
  Configured: 2026-04-12 (per proxy/config.json) — see [admin] for changes
  ```
- **`Connection test` for Supervisor** runs the probe across every constituent space in parallel (with the 2000 ms stagger from [ADR-0003](adr/0003-supervisor-stagger.md)) and reports per-space + aggregate status. The pack inference uses the highest-scoring inference across spaces.
- **Allowlist enforcement for Supervisor** — the Supervisor profile name AND each constituent space name must be allowlisted. If admin removes a space from the fan-out, the Settings page surfaces a banner: "Supervisor `org-supervisor-v1` was reconfigured. New space list: [...]. Last seen: [...]."

**Preferences**

| Leaf | Label | Helper text |
|---|---|---|
| Layout | Layout | Pane arrangement. The divider remembers your drag position. |
| Panels | Visible panels | Show AI, BI, or both. |
| Position | AI position | Where the AI panel sits relative to the BI canvas. |
| Density | Density | Visual density — Comfortable for most authors, Compact for dense dashboards. |

**System**

| Leaf | Label | Helper text |
|---|---|---|
| Proxy status | Proxy status | Live `/healthz` from the PulsePlay proxy. |
| Security | Security posture | Read-only view of CORS, CSP, IdP, rate limits, and the organization allowlists. Configured via proxy environment. |
| Diagnostics | Diagnostics | Session info, recent BI events, last errors. For sharing with support. |
| Export bundle | Export support bundle | Download a redacted JSON snapshot of state for support tickets. |

**Advanced**

| Leaf | Label | Helper text |
|---|---|---|
| Local storage | Local storage inspector | Read and clear individual settings keys. Use sparingly. |
| Reset section | Reset a section | Restore one settings group to defaults. |
| Reset all | Reset all settings | Clear every PulsePlay setting on this origin. The app's BI and AI selections are gone. |
| Danger zone | Danger zone | Sign out, clear cached MSAL session, clear embed-token cache. |

### 6.2 Tone

- One sentence per helper text. No marketing-speak.
- Active voice. "PulsePlay embeds" not "is embedded by."
- Name what's restricted ("Restricted to providers your organization allows") so the user understands when a picker shows fewer options than they expected.
- No emoji in helper text (matches existing codebase discipline).

---

## 7. Empty states

| Condition | Where it shows | Copy + CTA |
|---|---|---|
| No BI provider configured | BI › Provider (status chip red) | "Pick a BI provider to embed a report." → opens the picker filtered by allowlist |
| No AI provider configured | AI › Provider (status chip red) | "Pick an AI provider to enable the assistant." |
| No pack selected | AI › Knowledge pack | "No pack selected. Without a pack, the AI uses generic vocabulary. Pick a pack from your organization's allowlist." |
| Proxy unreachable | System › Proxy status | "Cannot reach the PulsePlay proxy at `<url>`. Check `npm run proxy` is running, or contact your administrator." + "Retry" button |
| No diagnostics yet | System › Diagnostics | "No events captured yet. Diagnostics appear after you load a BI report and run an AI question." |
| Allowlist empty (admin misconfig) | BI › Provider / AI › Provider / Knowledge pack | "No providers configured in your organization's allowlist. This is a deployment configuration issue. Contact your administrator." (link to `PROXY_REFERENCE.md § Allowlists`) |
| Allowlist fetched but allows zero items for this user | Same | "Your role doesn't grant access to any providers. Contact your administrator to request access." |
| `pulseplay:visual-settings:genieSettings` exists with a profile not in the allowlist | AI › Provider (warning banner) | "Your previously selected AI provider `<name>` is not in your organization's current allowlist. Pick a different one." |

---

## 8. State indicators

| Indicator | Where | Meaning |
|---|---|---|
| Green dot | Status chip / leaf label | Configured and healthy |
| Yellow dot | Status chip / leaf label | Configured but degraded (e.g., probe stale) |
| Red dot | Status chip / leaf label | Not configured, or failed |
| `Modified` badge | Leaf label | Local change pending Apply (only for Apply-required leaves) |
| `Setup needed` badge | Group entry in left rail | The group has at least one leaf with red dot |
| `Locked` icon | Read-only leaf | Configured via env / admin; show "Configured via …" helper |
| `Restricted` badge | Picker shown with allowlist | Visible options are filtered to the org allowlist |
| `Stale` text + timestamp | Connection test | Last probe was >5 minutes ago — banner "Re-run probe" |
| `Cached` text + timestamp | AI › Provider | Profile list cached; show last refresh |
| Spinner + skeleton row | Any async leaf | Loading from proxy |
| Inline error toast | Any leaf | "Allowlist rejected: <value>. See your administrator." |

---

## 9. Search

- **Always-visible search box** at the top of the page. `Cmd+/` or `Ctrl+/` to focus.
- **Indexes:** label, helper text, and a small synonym table (`provider` matches `vendor` / `connector`; `pack` matches `knowledge` / `vertical`; `tiles` matches `canvas` / `frames`).
- **Result row:** breadcrumb (`AI › Provider`) + leaf label + matched-text highlight.
- **Result click:** routes to the leaf with focus.
- **Below 18 leaves**, search is a release valve, not load-bearing. Above 25, becomes a primary navigation path.
- **No global "search settings + actions"** (command palette) in v1. Defer to v0.4 when leaf count or user feedback justifies.

---

## 10. Keyboard map

| Key | Action |
|---|---|
| `Ctrl/Cmd+,` | Open Settings at last-visited group |
| `Esc` | Close Settings, return to app |
| `Ctrl/Cmd+/` | Focus search box |
| `Ctrl/Cmd+K` | (Reserved for v0.4 command palette — not bound today) |
| `↑` / `↓` in left rail | Move group focus |
| `Enter` on group | Open group |
| `Tab` / `Shift+Tab` | Move through controls within group |
| `Ctrl/Cmd+S` on Apply-required leaf | Apply changes |
| Space on toggles | Toggle |

ARIA: every group is a `region`, the left rail is a `tablist` with `tab` items, the content pane is `tabpanel`. Search results are an ARIA listbox. WAI-ARIA Tabs Pattern + WCAG 2.2 focus-visibility rules apply.

---

## 11. Enterprise guardrails — allowed sources

This is the load-bearing section for a managed-organization deployment. The premise: **every user-provided value that names an external resource passes through an organization-controlled allowlist with no client-side bypass paths**.

### 11.1 Why this is the real challenge

Original audit state (2026-05-13 at HEAD `8fde791`):

- **No organization allowlist exists in code.** Profiles are filtered in `proxy/server.js` only by hiding underscore-prefixed names. Anyone can name any configured profile.
- **No browser-side allowlist on BI embed URLs.** `EmbedConfigForm` accepts any HTTPS URL; `GenericIframeAdapter` mounts it. Power BI's URL validator is regex-only and accepts any `*.powerbi.com` host.
- **No AAD tenant allowlist.** `pbiAuth.ts` accepts whatever tenant ID the user types into the SSO config field. MSAL will sign in against that tenant. Phishing vector.
- **No pack allowlist.** `PackPicker` uses a hardcoded list today; when the future `/assistant/knowledge/packs` endpoint lands, there's no allowlist gate planned.
- **CSP `frame-src` allows wildcard subdomains** under `*.powerbi.com`, `*.tableau.com`, `*.qlikcloud.com`, `*.looker.com`. Any compromised subdomain in those TLDs is allowed.

These are the loopholes the user named. The fixes below are mandatory for any pilot beyond a maintainer's laptop.

Implementation status later on 2026-05-13: Phase 1 now exists in code. The proxy has an allowlist normalizer/startup gate, filtered `/assistant/allowlist` and `/assistant/profiles`, route-level rejection with audit events, Power BI workspace/report/tenant checks, and an allowlisted pack registry. The playground consumes those endpoints for provider, embed URL, tenant, and pack selection, and `BIPanel` refuses to mount non-allowlisted embed origins. Remaining gaps: generated CSP from the allowlist, full `/settings` store/shell revalidation, and a direct allowlist-aware wrapper around the lower-level `pbiAuth.ts` helper.

### 11.2 The allowlist taxonomy

Six distinct allowlists. Each has a single source of truth (proxy `config.json`) and is enforced at multiple points (defense in depth).

| Allowlist | Controls | Source of truth | Settings UI |
|---|---|---|---|
| **BI providers** | Which BI vendors are selectable | `proxy/config.json` → `allowlist.biProviders` | BI › Provider — filtered |
| **BI embed origins** | Which hostnames can be mounted as iframe src | `proxy/config.json` → `allowlist.embedOrigins` (per-vendor) | BI › Embed — URL validated |
| **AAD tenants** | Which Azure AD tenants can be used for SSO | `proxy/config.json` → `allowlist.aadTenants` | BI › Authentication — tenant locked |
| **AI providers (profile names)** | Which `/assistant/profiles` names are visible to a user | `proxy/config.json` → `allowlist.aiProfiles` (or per-group) | AI › Provider — filtered |
| **Knowledge packs** | Which packs are installable + selectable | `proxy/config.json` → `allowlist.packs` | AI › Knowledge pack — filtered |
| **Knowledge sources** (future, Phase 3) | Which retrieval sources are visible | `proxy/config.json` → `allowlist.knowledgeSources` | Knowledge Base UI — filtered |

### 11.3 Allowlist contract

#### 11.3.1 Proxy `config.json` schema

Full shape (covers the whole 2-axis matrix — MVP 0.2 uses a tightened default below):

```json
{
  "allowlist": {
    "biProviders": ["powerbi", "tableau"],
    "embedOrigins": {
      "powerbi": ["app.powerbi.com"],
      "tableau": ["10ax.online.tableau.com", "us-east-1.online.tableau.com"]
    },
    "powerbiWorkspaces": ["<workspace-guid-1>", "<workspace-guid-2>"],
    "powerbiReports": ["<report-guid-1>"],
    "aadTenants": ["<org-tenant-guid>"],
    "aiProfiles": {
      "default": ["sales-genie", "marketing-genie"],
      "byGroup": {
        "app.pulseplay.users.finance": ["finance-genie"]
      }
    },
    "genieSpaces": ["<space-id-1>", "<space-id-2>", "<space-id-3>", "<space-id-4>"],
    "supervisorProfiles": ["org-supervisor-v1"],
    "packs": ["cpg-fmcg"],
    "knowledgeSources": [],
    "license": {
      "powerbi": {
        "minTier": "Premium",
        "allowedTiers": ["Premium P1", "Premium P2", "Premium P3", "PPU"],
        "embedSku": ["EM1", "EM2", "EM3"],
        "fabricEnabled": false
      }
    }
  },
  "allowlistEnforcement": "strict"
}
```

**Production defaults are fail-closed.** If `allowlist` is missing entirely, the proxy refuses to start in production (`NODE_ENV=production`) and emits a startup warning in development. Local development/test without an allowlist remains permissive so existing contributor flows do not break; any controlled pilot must deploy a non-empty allowlist with `allowlistEnforcement: "strict"`.

#### 11.3.2 MVP 0.2 default allowlist values (canonical)

**Reference implementation:** [proxy/config.example.json](../proxy/config.example.json) ships the MVP 0.2 shape with `YOUR_*` placeholders the deployer fills in (`YOUR_POWER_BI_WORKSPACE_ID`, `YOUR_AAD_TENANT_ID`, `YOUR_GENIE_SPACE_ID`). Use it as the starting point for any new deployment. The canonical shape below mirrors that file.

For the MVP 0.2 deployment, the allowlist defaults to:

```json
{
  "allowlist": {
    "biProviders": ["powerbi"],
    "embedOrigins": {
      "powerbi": ["app.powerbi.com"]
    },
    "powerbiWorkspaces": ["<set-by-admin-per-deployment>"],
    "powerbiReports": [],
    "aadTenants": ["<org-tenant-guid>"],
    "aiProfiles": {
      "default": ["<set-by-admin-per-deployment>"],
      "byGroup": {}
    },
    "genieSpaces": ["<set-by-admin-per-deployment>"],
    "supervisorProfiles": ["<set-by-admin-if-any>"],
    "packs": ["cpg-fmcg"],
    "knowledgeSources": [],
    "license": {
      "powerbi": {
        "minTier": "Premium",
        "allowedTiers": ["Premium P1", "Premium P2", "Premium P3", "PPU"],
        "embedSku": ["EM1", "EM2", "EM3"],
        "fabricEnabled": false
      }
    }
  },
  "allowlistEnforcement": "strict"
}
```

**Notes:**

- `biProviders` is `["powerbi"]` only — Tableau / Qlik / Looker / generic-iframe are absent. The Settings UI renders the BI Provider picker with one option and a footer link "Other BI tools coming in v0.3+".
- `embedOrigins.powerbi` is `["app.powerbi.com"]` — no wildcards. The CSP `frame-src` is generated to match: `frame-src 'self' https://app.powerbi.com;`
- `powerbiReports` is empty meaning "any report within an allowed workspace." When admins want to lock to specific reports (e.g., finance-team deployment), they populate this array.
- `aiProfiles.default` is empty — the deploying admin populates it with the org's Genie + Supervisor profile names. Without this, no AI is selectable; Settings shows the empty-state copy from § 7.
- `genieSpaces` enumerates every Genie space the proxy SP can reach. Supervisor's fan-out routing is validated against this list.
- `license.powerbi.fabricEnabled` is `false` — Fabric features will fail-fast in the adapter with the copy-paste diagnostic from § 6.1.2.
- `allowlistEnforcement: "strict"` is the only supported value for MVP 0.2 production. Dev mode may set `"warn"` for debugging, never for pilot deployments.

#### 11.3.3 Proxy endpoint (shipped 2026-05-13)

```
GET /assistant/allowlist        — returns the user-visible subset of the allowlist
```

Implemented at [proxy/lib/allowlist.js](../proxy/lib/allowlist.js); served from [proxy/server.js](../proxy/server.js). Browser-side typed contract: [playground/src/types/allowlist.ts](../playground/src/types/allowlist.ts).

Filtered by the requesting user's IdP-validated group membership. Browser caches for the session (refreshed on `/settings` open). Response shape:

```json
{
  "biProviders": ["powerbi", "tableau"],
  "embedOrigins": { "powerbi": ["app.powerbi.com"], "tableau": [...] },
  "aadTenants": ["<org-tenant-guid>"],
  "aiProfiles": ["sales-genie"],
  "packs": ["cpg-fmcg"],
  "knowledgeSources": [],
  "enforcement": "strict",
  "fetchedAt": "2026-05-13T10:00:00Z"
}
```

### 11.4 Fail-closed defaults

| Default | Behaviour |
|---|---|
| Allowlist missing in `config.json` | Proxy refuses to start when `NODE_ENV=production`; dev mode warns and stays permissive for local contributor use only |
| Allowlist response unreachable from browser | Settings page shows global error banner: "Allowlist unreachable. PulsePlay cannot operate safely. Contact administrator." All pickers disabled. |
| Allowlist response empty for this user | Settings shows the empty-state copy from § 7 ("Your role doesn't grant access to any providers.") |
| User-pasted embed URL doesn't match an allowed origin | Reject with toast: "URL hostname `<host>` is not in your organization's allowed origins. Allowed: `<list>`." No iframe mount. |
| User-typed AAD tenant ID doesn't match allowlist | Tenant input rejects on blur with inline error. SSO sign-in button disabled. |
| User-supplied profile name (via header tampering, localStorage edit, etc.) not in allowlist | Proxy returns 403 + audit log entry `allowlist.rejected.profile`; browser displays "Selected AI provider unavailable. Re-select." |
| Pack/sub-vertical not in allowlist | Same as profile — proxy rejects, browser re-selects from allowed packs |

### 11.5 Enforcement points (defense in depth)

| Layer | Where | What it does |
|---|---|---|
| **1. Browser — Settings UI** | `settingsStore.ts` | Pickers render only allowlisted options; user-typed values validated before persistence |
| **2. Browser — Shortcuts** | `settingsStore` setters | Shortcuts go through the same setters as the Settings page; cannot bypass |
| **3. Browser — Adapter mount** | `BIPanel.tsx`, vendor adapters | Mount validates `embedConfig.url` hostname against the cached allowlist; refuses mount on mismatch |
| **4. Browser — CSP** | `index.html` meta CSP | `frame-src` is generated FROM the allowlist at deploy time; wildcards eliminated |
| **5. Proxy — Allowlist middleware** | `proxy/server.js` | Every route that accepts a `profile`, `pack`, `subVertical`, `tenant`, or `vendor` value runs through `requireAllowed()` |
| **6. Proxy — IdP claims** | `req.user.groups` | Per-group allowlist refinement (group → allowed profiles) applied after global allowlist |
| **7. Audit log** | every rejection | Allowlist rejections written with full context: user, value, allowlist, route |
| **8. SIEM alert** | external | Sustained allowlist rejections per user trigger investigation |

Current status: layers 3, 5, 6, and 7 are implemented for the existing playground/proxy paths. Layers 1 and 2 become complete when the full `/settings` store/shell lands. Layer 4 is still static in `playground/index.html` and must be generated from the deployed allowlist before a non-laptop pilot. The **adapter-mount validation** closes the biggest current hole: even if a user manages to inject a non-allowlisted URL into `embedConfig` via XSS or DevTools localStorage editing, the adapter refuses to mount it. Layer 4 is the browser-enforced backstop once generated CSP is wired.

### 11.6 Admin surface

The Settings page itself does **not** let an author edit the allowlist. Allowlists are admin-controlled out-of-band:

- **`proxy/config.json`** is the source of truth, deployed via the org's config-management pipeline (e.g., committed to a private git repo, deployed via CD).
- **System › Security** shows the current allowlists read-only ("These BI providers are allowed: powerbi, tableau") with a link to the operator runbook.
- Future (v0.4+): a separate admin app at `/admin/allowlist` for in-band edit by users with the `app.pulseplay.admins` IdP group claim. Not in this spec's scope.

---

## 12. Security setup

This section consolidates the deploy-time checklist from [SECURITY.md](SECURITY.md) and [SECURITY_ARCHITECTURE.md § 9](SECURITY_ARCHITECTURE.md). Settings page support means the System group renders the current value of each item read-only.

### 12.1 Deployment checklist (must be true before any non-laptop pilot)

#### Proxy host

- [ ] `PROXY_INLINE_CREDENTIALS_MODE=off` (rejects browser-supplied creds)
- [ ] `PROXY_SHARED_KEY` set to 32+ char random vault value
- [ ] `PROXY_IDP_REQUIRED=true` + `PROXY_IDP_JWKS_URL` + `PROXY_IDP_ISSUER` + `PROXY_IDP_AUDIENCE` configured
- [ ] `PROXY_CORS_ORIGIN` pinned to playground deployment origin(s); never `*`
- [ ] CSP `frame-src` generated from allowlist (no wildcards)
- [ ] All credentials (SP secret, OpenAI key, Bedrock keys) in vault, referenced via env
- [ ] Managed identity assigned to proxy host with least-privilege vault read role
- [ ] `proxy/config.json.allowlist` populated and non-empty
- [ ] `proxy/config.json.allowlistEnforcement=strict`
- [ ] Egress allowlist enforced at network layer
- [ ] TLS 1.2+ enforced
- [ ] `NODE_EXTRA_CA_CERTS` set if org uses TLS-MITM proxy
- [ ] Logs piped to org SIEM
- [ ] Audit log monitored for `inlineCredsUsed:true` (should always be zero in production)
- [ ] Audit log monitored for `allowlist.rejected.*` (investigate sustained rejections)

#### Identity & authorization

- [ ] SSO wired via org IdP (JWT or SAML)
- [ ] MFA enforced at IdP
- [ ] SCIM provisioning configured
- [ ] `app.pulseplay.users` group exists and is the gate
- [ ] Per-group allowlist refinement defined in `config.json.allowlist.aiProfiles.byGroup`
- [ ] No PATs in production — OAuth M2M with rotation only

#### Data layer

- [ ] Unity Catalog row/column policy reviewed for catalogs PulsePlay queries
- [ ] Genie space access matches user-group access
- [ ] BI workspace permissions reviewed for embedded reports
- [ ] Sensitive columns have UC column masks applied

#### BI embeds

- [ ] Embed-token endpoints per vendor implemented + scoped to user + report + TTL
- [ ] Sandbox attributes per-adapter narrowed where vendor permits
- [ ] Approved vendor-origin allowlist published in CSP (and matches `config.json.allowlist.embedOrigins`)

#### AI

- [ ] Prompt-injection defenses reviewed
- [ ] BI event payload sanitization (PII redactor) applied
- [ ] Validator framework wired
- [ ] AI is NOT granted tool permission for write-back, export, or refresh in v1

### 12.2 Secrets handling

| Secret | Location | Rotation cadence | Surfaced in Settings? |
|---|---|---|---|
| `PROXY_SHARED_KEY` | Vault → env | 90 days | No (System › Security shows "configured: yes") |
| Power BI SP client secret | Vault → env | 180 days (or per AAD app policy) | No |
| Databricks OAuth M2M secret | Vault → env | 365 days | No |
| Azure OpenAI key | Vault → env | 180 days | No |
| Bedrock keys | Vault → env | 180 days | No |
| AAD app client ID (frontend SSO) | localStorage (`pulseplay:pbi-sso-config`) | n/a (not a secret) | Yes (BI › Authentication) |
| AAD tenant ID | localStorage + allowlist | n/a (not a secret) | Yes (BI › Authentication, locked to allowlist) |
| MSAL access tokens | sessionStorage | Auto (Microsoft-managed) | No |
| Embed tokens | Proxy LRU cache (in-process) | 60 s before vendor expiry | No |
| User session JWT | Browser cookie (IdP-managed) | Per IdP policy | No |

Settings page never displays secret values. Read-only status for each ("configured / missing / healthy / expired").

### 12.3 Audit log surface

The Settings page surfaces audit log existence + last-error info via System › Diagnostics. The audit log itself lives at the proxy and is forwarded to SIEM. Settings does NOT let an author read individual entries — that requires admin tooling.

Audit log captures (per [SECURITY_ARCHITECTURE.md § 5](SECURITY_ARCHITECTURE.md)):

- User identity + group
- Route, action, profile, status, latency
- BI vendor / report / dashboard context
- Pack / sub-vertical
- Redacted user prompt
- Model / agent invoked
- Validator pass/fail
- `X-Request-Id` for cross-system correlation
- **Allowlist rejection events** (new): `allowlist.rejected.<resource>` with value, user, allowlist contents at time of rejection

---

## 13. Maintenance

### 13.1 Rotation

| Item | Where to rotate | UI surface |
|---|---|---|
| `PROXY_SHARED_KEY` | Vault + restart proxy | Status flip in System › Proxy status |
| SP client secrets | Vault + AAD app config | Status flip + audit log |
| AAD app registration | AAD portal | BI › Authentication shows "AAD app expired — re-configure with administrator" if `aadClientId` no longer valid |
| Embed token cache | Manual purge via Advanced › Danger zone → "Clear embed-token cache" | Calls proxy `POST /admin/embed-tokens/purge` (new, admin-only) |
| MSAL session cache | Advanced › Danger zone → "Clear MSAL session" | Calls `signOutPbi()` |

### 13.2 Deprecation

When a BI provider, AI provider, or pack is removed from the allowlist, existing references in user state become orphaned. Handling:

- On `/settings` open: settingsStore reconciles persisted state against allowlist. Orphaned values show a `Deprecated` banner with "This provider is no longer available in your organization. Pick another."
- Auto-fallback is NEVER silent. The user always confirms the new selection.

### 13.3 Health budget

System › Proxy status renders a single SLO chip:

- Green: 5xx rate < 0.5%, p95 latency < 2s (last 5 min)
- Yellow: 5xx rate < 2% OR p95 latency < 5s
- Red: 5xx rate >= 2% OR p95 latency >= 5s

Authors can copy the diagnostic bundle via Export bundle for support. The chip's underlying numbers are read-only here; the operator gets them via SIEM/Grafana.

---

## 14. Administration

### 14.1 RBAC model

Three classes of user:

| Role | Source | Capabilities |
|---|---|---|
| **Author** (`app.pulseplay.users`) | IdP group | Use Settings + Pulse Setup + the playground. Pickers filtered to their group's allowlist. Cannot reset proxy config, cannot view audit log directly. |
| **Operator** (`app.pulseplay.operators`) | IdP group (future) | Author capabilities + can run proxy admin commands (purge token cache, view raw audit log). |
| **Administrator** (`app.pulseplay.admins`) | IdP group (future) | All of the above + can edit `proxy/config.json` allowlist via future admin app at `/admin/*`. |

For v0.2: Authors only. Operator + Administrator roles surface in v0.3 when the admin app lands.

### 14.2 Audit surface

System › Diagnostics shows the user their own audit-log entries from the current session (read from the proxy via `GET /assistant/audit/me` — new endpoint, returns the last N entries scoped to `req.user.sub`). Full audit log + cross-user queries live in SIEM.

### 14.3 Monitoring (alerts the operator owns)

Per [SECURITY.md § Continuous monitoring](SECURITY.md):

- 401 rate > 50/min on `/assistant/*` → brute-force or IdP outage
- `inlineCredsUsed:true` in production → misconfiguration
- Sustained 5xx from a backend → backend issue
- Validator failure rate spike → AI quality regression or prompt-injection campaign
- Embed-token cache hit-rate drop → schema thrashing or storage issue
- **`allowlist.rejected.*` rate spike per user** (new) → user attempting to bypass allowlist; investigate
- Cross-tenant access attempt → kill-the-session event when multi-tenant lands

---

## 15. Loophole audit

### 15.1 Methodology

Subagent scan (2026-05-13) of every code path where a user-provided value flows into a security-relevant operation. Cross-referenced against [SECURITY_ARCHITECTURE.md § 8](SECURITY_ARCHITECTURE.md) closed/open gaps. Findings below are unique to the Settings surface — generic proxy gaps are tracked in SECURITY_ARCHITECTURE.

### 15.2 HIGH findings (close before any pilot)

**Status legend:** ✅ CLOSED · ◐ PARTIAL (some layers landed, others pending) · ◌ OPEN. Updated 2026-05-13 after Phase 1 + Phase 7 shipped.

| # | Status + finding | File | Fix |
|---|---|---|---|
| L1 | ✅ **CLOSED — AAD tenant allowlist.** Form validates tenant; proxy enforces tenant on embed-token mint; `pbiAuth.signInAndPrepareEmbed` now throws `PbiAllowlistError` BEFORE MSAL init when the tenant is missing or not in `allowedTenants`. Any future caller that builds `PbiAuthConfig` and skips the form still hits the gate. | [playground/src/lib/pbiAuth.ts](../playground/src/lib/pbiAuth.ts), [playground/src/components/EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx) | Done 2026-05-13. Verified by [playground/src/lib/__tests__/pbiAuth.allowlist.test.ts](../playground/src/lib/__tests__/pbiAuth.allowlist.test.ts). |
| L2 | ✅ **CLOSED — adapter-mount allowlist.** EmbedConfigForm validates origins; BIPanel refuses non-allowlisted hostnames; each iframe-mounting adapter (generic-iframe + powerbi secure-embed path) now also enforces `allowedOrigins` via `assertIframeOriginAllowed` / `assertPowerBIOriginAllowed` BEFORE constructing the iframe. BIPanel forwards the per-vendor allowlist into `embedConfig.allowedOrigins` on every mount. | [bi-adapters/generic-iframe/index.ts](../bi-adapters/generic-iframe/index.ts), [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts), [playground/src/biPanel/BIPanel.tsx](../playground/src/biPanel/BIPanel.tsx) | Done 2026-05-13. Verified by [bi-adapters/generic-iframe/__tests__/allowlist.test.ts](../bi-adapters/generic-iframe/__tests__/allowlist.test.ts). |
| L3 | ✅ **CLOSED — PBI secure-embed URL parsing.** Form parses `groupId` and `reportId` from the pasted URL's query params and validates BOTH against `powerbiWorkspaces` / `powerbiReports` allowlists before persisting. Pasting a portal URL pointing at an unauthorized workspace or report now fails with a copy-paste-clear diagnostic. | [playground/src/components/EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx) | Done 2026-05-13. New helper `extractGroupIdFromPowerBIUrl` mirrors the existing reportId extractor. |
| L4 | ✅ **CLOSED — AI profile allowlist.** `GET /assistant/profiles` returns the user-filtered subset (per-group via `aiProfiles.byGroup`). Every route reading `assistantProfile` runs through `requireAllowed()` middleware with audit events on rejection. | [proxy/lib/allowlist.js](../proxy/lib/allowlist.js), [proxy/server.js](../proxy/server.js) | Done. Verified by `proxy/tests/allowlist.test.js`. |
| L5 | ✅ **CLOSED — Pack allowlist.** `GET /assistant/knowledge/packs` filters by `allowlist.packs`; `POST /assistant/conversations/start` rejects non-allowlisted packs with audit events. | [proxy/lib/packRegistry.js](../proxy/lib/packRegistry.js), [proxy/lib/allowlist.js](../proxy/lib/allowlist.js) | Done. Verified by `proxy/tests/packRegistry.test.js` + `proxy/tests/allowlist.test.js`. |
| L6 | ✅ **MITIGATED — dev-mode startup banner.** Production is gated by `PROXY_IDP_REQUIRED=true` (or it refuses to start). Dev mode is `127.0.0.1`-only per ADR-0002 AND now emits a loud `[security]` warning at startup explaining the dev posture so a misconfigured staging deploy is obvious. | [proxy/server.js](../proxy/server.js) | Done 2026-05-13. The banner is suppressed in `NODE_ENV=test` to keep CI quiet. |
| L7 | ✅ **CLOSED — CSP from allowlist.** Vite plugin [vite.cspFromAllowlist.ts](../playground/vite.cspFromAllowlist.ts) reads `proxy/config.json` (or example fallback) at build time and emits a strict CSP with full hostnames only — no `*.powerbi.com`, no `*.tableau.com`, no `*.microsoftonline.com`, no `'unsafe-eval'`. Dev mode keeps the permissive default in `playground/index.html` so HMR's `'unsafe-eval'` continues to work. Production `dist/index.html` verified after build. | [playground/vite.cspFromAllowlist.ts](../playground/vite.cspFromAllowlist.ts), [playground/vite.config.ts](../playground/vite.config.ts) | Done 2026-05-13. Verified by [playground/__tests__/cspFromAllowlist.test.ts](../playground/__tests__/cspFromAllowlist.test.ts) + post-build grep of `dist/index.html`. |
| L8 | ✅ **CLOSED — inline-credentials startup gate.** [proxy/server.js](../proxy/server.js) now refuses to start (`FATAL`, `process.exit(1)`) when `NODE_ENV=production` and `resolveInlineCredentialsMode()` is anything other than `"off"`. The auto-detect path (`PROXY_SHARED_KEY` / `WEBSITE_SITE_NAME`) already pins to `"off"` in most prod-like envs; the explicit gate catches the misconfiguration where neither is set. | [proxy/server.js startup gate](../proxy/server.js) | Done 2026-05-13. |

### 15.3 MEDIUM findings

| # | Status + finding | File | Fix |
|---|---|---|---|
| L9 | ◐ **ACCEPTED (v0.2)** — CSP `connect-src` wildcards on `*.microsoftonline.com`. Tightened in production by the L7 CSP-from-allowlist plugin (no `*.powerbi.com` etc.). The login.microsoftonline.com endpoint is one origin regardless of tenant; per-tenant URL paths can't be CSP-restricted because CSP works on origin only. Accepted as residual risk — see Risk acceptance log in § 15.6. | [playground/index.html](../playground/index.html), [vite.cspFromAllowlist.ts](../playground/vite.cspFromAllowlist.ts) | Defer: would require a Microsoft platform change to support per-tenant origins. |
| L10 | ◐ **ACCEPTED (v0.2)** — `apiBaseUrl` overridable via `VITE_API_BASE_URL` env var. Build-time only; an attacker would need write access to the deployer's env, in which case all bets are off. Production builds bake the URL in. Documented in `docs/SECURITY.md` deploy checklist. | various | Defer: orthogonal to runtime attacker model. |
| L11 | ✅ **CLOSED (Phase 2)** — `settingsStore` re-validates every persisted value against the live allowlist on load. Orphaned values surface in the UI as warning banners instead of being silently used. | [settingsStore.tsx](../playground/src/settings/settingsStore.tsx) | Done. |
| L12 | ✅ **CLOSED (Phase 6 medium cleanup)** — `safeAuthorPrompt` runs `redactAuthorPrompt` (secrets) **+ `stripInstructionKeywords`** (prompt-injection heuristics) over every author-supplied free-text field before the AI prompt builder sees it. New heuristic patterns: ignore-prior, disregard-prior, override-system, you-are-now-jailbroken, act-as, from-now-on, developer-mode, reveal-system, end-of-prompt, instruction-fence-attack. Truncates to 16 000 chars. AI vendor's prompt hierarchy + the validator framework remain the real fence; this is defense in depth. | [pulse/promptRedaction.ts](../playground/src/pulse/promptRedaction.ts), [pulse/visualHelpers.ts](../playground/src/pulse/visualHelpers.ts) | Done 2026-05-13. 11 new tests. |
| L13 | ◐ **ACCEPTED (v0.2)** — server-side enforces `powerbiWorkspaces` + `powerbiReports` allowlist at embed-token issuance. Per-user report ACLs (vs the static org allowlist) require a Power BI REST API lookup per embed; deferred until the per-vendor ACL story formalizes in Phase 9b. The static allowlist is the load-bearing fence today. | [proxy/server.js:2494](../proxy/server.js#L2494) | Phase 9b. |
| L14 | ✅ **CLOSED (Phase 6 medium cleanup)** — `probeConnector` rejects profile names that don't match `^[a-zA-Z0-9._-]{1,128}$` with a `ProbeInvalidProfileError` BEFORE any network call. Prevents accidental PII leakage (e.g. pasting an email) and ensures the wire format stays clean. | [playground/src/lib/probeClient.ts](../playground/src/lib/probeClient.ts) | Done 2026-05-13. 6 new tests. |
| L15 | ✅ **CLOSED (Phase 6 medium cleanup)** — `loadPromptContext` rejects pack + subVertical identifiers that don't match `^[a-z0-9][a-z0-9-]{0,62}$` BEFORE constructing any filesystem path. New `isValidPackIdentifier` export. Defense in depth even if `allowlist.packs` is ever misconfigured. | [proxy/lib/packPromptLoader.js](../proxy/lib/packPromptLoader.js) | Done 2026-05-13. 7 new tests. |

### 15.4 LOW findings (track, fix opportunistically)

| # | Status + finding | File | Fix |
|---|---|---|---|
| L16 | ⏳ OPEN — `BIEmbedConfig` typed via `as` casts; adapter receives untyped shape | [biPanel/BIAdapter.ts](../playground/src/biPanel/BIAdapter.ts) | Discriminated-union types per vendor. Defer to Phase 9b when more vendors graduate. |
| L17 | ✅ **CLOSED (Phase 6 medium cleanup)** — `proxy/lib/configValidator.js` runs `validateConfigShape` at startup. Production hard-fails on malformed config; dev mode logs warnings and continues. No new JSON-schema dependency — hand-rolled checks on the fields whose wrong types cause runtime crashes. | [proxy/lib/configValidator.js](../proxy/lib/configValidator.js), [proxy/server.js startup gate](../proxy/server.js) | Done 2026-05-13. 16 new tests. |
| L18 | ✅ **CLOSED (Phase 6 medium cleanup)** — `GET /admin/embed-tokens/stats` returns cache size, max, per-entry expiry; `POST /admin/embed-tokens/purge` clears the cache and returns the count. Both gated by the same constant-time shared-key compare the existing admin routes use (extracted to `_adminAuthOk`). | [proxy/server.js](../proxy/server.js) | Done 2026-05-13. 5 new tests. |
| L19 | ⏳ OPEN — No `/assistant/audit/me` endpoint for user-scoped audit retrieval. | n/a | Add for System › Diagnostics. Defer to Phase 9b. |

### 15.5 Risk acceptance log

For findings marked **ACCEPTED**, the residual risk is explicitly documented here so a future reviewer knows the boundary was a deliberate choice, not an oversight.

| # | Severity | Why accepted | Re-open trigger |
|---|---|---|---|
| L9 | MEDIUM | CSP works on origin, not path. `login.microsoftonline.com` is the AAD endpoint for every tenant — there's no per-tenant origin. Tenant restriction happens via the URL path MSAL constructs from the allowlisted tenant ID (closed at L1). Accepting the broader origin in CSP is the cost. | A Microsoft platform change to expose per-tenant origins, OR a tenant-pinned proxy reverse-proxies AAD endpoints. |
| L10 | MEDIUM | `VITE_API_BASE_URL` is a build-time env var. An attacker who can rewrite the deployer's env has already won game. Production builds bake the URL in; runtime override is not possible from the browser. | A future runtime configuration mechanism that lets the browser pick the proxy URL. |
| L13 | MEDIUM | The org-wide static allowlist (`powerbiWorkspaces` + `powerbiReports`) is the load-bearing fence. Per-user report ACLs require a Power BI REST API lookup per embed-token mint — adds latency and depends on the org granting the proxy SP `Report.Read.All` over the org's catalog. Deferred until the Phase 9b stub-to-SDK ACL design formalizes. | Phase 9b stub-to-SDK graduation, OR an org request for tighter per-user gating. |

### 15.6 Biggest single risk (post-Phase-6 medium cleanup)

**All 8 HIGH loopholes CLOSED or MITIGATED. All MEDIUM findings CLOSED or ACCEPTED with explicit risk acceptance.** The audit surface is now down to:

- **L16, L19** (LOW) — typed-config refinement + per-user audit endpoint. Defer to Phase 9b.
- **3 ACCEPTED MEDIUMs** (L9, L10, L13) — each has an explicit re-open trigger in § 15.5.

**Net:** pilot-readiness from the audit perspective is green; remaining gate is live credentialed Power BI + Genie/Supervisor smoke against an org-deployed proxy with a populated allowlist.

**Historical context (resolved):**
- L7 (CSP wildcards) — closed in Phase 6 via Vite plugin.
- L8 (inline-credentials startup gate) — closed in Phase 6 via refuse-to-start check.
- L1 (AAD tenant allowlist) — closed in Phase 3 via `pbiAuth.signInAndPrepareEmbed` gate.
- L2 (adapter-mount allowlist) — closed in Phase 3 via adapter-level helpers.
- L3 (PBI secure-embed query-param parsing) — closed in Phase 3 via groupId/reportId extraction + allowlist match.
- L4 (per-user/group AI profile allowlist) — closed in Phase 1 via filtered `/assistant/profiles` + `requireAllowed`.
- L5 (pack allowlist) — closed in Phase 1 via `/assistant/knowledge/packs` filter.
- L6 (dev-mode embed-token route auth) — mitigated in Phase 6 via dev-mode banner + ADR-0002 `127.0.0.1` bind.
- L11 (localStorage values not re-validated on read) — closed in Phase 2 via settingsStore reconciliation.

---

## 16. Implementation phases

Phases below land in this order. **MVP 0.2 ships through Phase 6.** Phases 7-8 are v0.3+ work that builds on the MVP 0.2 foundation.

**Live status (2026-05-13):** Phases 0, 1, 2, 3, 4, **5**, 6 (HIGH gaps), 7 are DONE. MVP 0.2 functional core complete. Remaining: MEDIUM findings L9-L15, KB UI (Phase 8, post-MVP-0.2), and live credentialed smoke before pilot.

| Phase | Status | Scope | MVP 0.2? | What landed / Acceptance criteria |
|---|:---:|---|:---:|---|
| **0. Document & align** | ✅ DONE | This spec doc + [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) + HANDOVER + AGENDA links | ✅ | Spec + cross-references shipped 2026-05-13 |
| **1. Allowlist contract** | ✅ DONE | `proxy/config.json.allowlist` normalization (incl. `powerbiWorkspaces` + `genieSpaces` + `supervisorProfiles` + `license`) + `GET /assistant/allowlist` endpoint + startup validator + per-route allowlist middleware + audit events | ✅ | Shipped 2026-05-13. Lives at [proxy/lib/allowlist.js](../proxy/lib/allowlist.js), [proxy/server.js](../proxy/server.js), [proxy/config.example.json](../proxy/config.example.json), [playground/src/types/allowlist.ts](../playground/src/types/allowlist.ts), [App.tsx](../playground/src/App.tsx), [EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx), [BIPanel.tsx](../playground/src/biPanel/BIPanel.tsx). Tests: 428/428 proxy + 161/161 playground. **L4, L5 fully closed; L1, L2, L3 partially closed at primary paths.** |
| **2. Settings store + shell** | ✅ DONE | `playground/src/settings/settingsStore.tsx` + `SettingsShell.tsx` + path-based router + left rail + status strip + search box + 5 group surfaces. Re-validates persisted values against the allowlist on load (orphan detection); the legacy `pulseplay:display-change` event bus bridges new store ↔ old code. Gear popover gets an "Open full Settings →" link; global `Cmd/Ctrl+,` shortcut opens Settings; `Esc` returns to app. | ✅ | Shipped 2026-05-13. Lives at [playground/src/settings/](../playground/src/settings/). 25 new tests (10 route + 9 store + 6 shell). Total playground tests 186/186. tsc clean. Vite build green (initial JS 89 KB raw / 24.6 KB gzip). Preferences group is wired live end-to-end; BI/AI/System/Advanced show structure with Phase 3-5 stubs. **L11 closed at primary read paths** (settingsStore re-validates on load). |
| **3. BI group L1/L2/L3 cleanup + license posture** | ✅ DONE | (a) `pbiAuth.signIn()` allowlist wrapper that throws `PbiAllowlistError` before MSAL init (L1 cleanup); (b) `allowedOrigins` field on adapter `BIEmbedConfig` + `assertIframeOriginAllowed` helper in generic-iframe + `assertPowerBIOriginAllowed` in powerbi adapter (L2 cleanup); (c) `extractGroupIdFromPowerBIUrl` + workspace/report allowlist match on secure-embed paste (L3 cleanup); (d) License posture readout in BI › Status + System › Security with no-Fabric diagnostic. | ✅ | Shipped 2026-05-13. Lives at [playground/src/lib/pbiAuth.ts](../playground/src/lib/pbiAuth.ts), [bi-adapters/generic-iframe/index.ts](../bi-adapters/generic-iframe/index.ts), [bi-adapters/powerbi/index.ts](../bi-adapters/powerbi/index.ts), [playground/src/biPanel/BIPanel.tsx](../playground/src/biPanel/BIPanel.tsx), [playground/src/components/EmbedConfigForm.tsx](../playground/src/components/EmbedConfigForm.tsx), [playground/src/settings/groups/BiGroup.tsx](../playground/src/settings/groups/BiGroup.tsx), [playground/src/settings/groups/SystemGroup.tsx](../playground/src/settings/groups/SystemGroup.tsx). `buildVisibleAllowlist` (proxy) now includes `license`. Tests: 13 new (5 pbiAuth + 8 generic-iframe). |
| **4. AI group + Knowledge pack (Genie + Supervisor)** | ✅ DONE | (a) settingsStore `activeAiProfile` with allowlist-aware setter + orphan detection + fallback read from Pulse `genieSettings`. (b) Provider picker filtered by allowlist with Supervisor badge. (c) `/assistant/profiles` extended with `type` + `spaces` + `agentName` for fan-out rendering. (d) Read-only Supervisor fan-out table showing each constituent space + allowlist match. (e) Connection test: single probe via TestConnectionPanel for Genie; per-space probe matrix with 2 s stagger (ADR-0003) + aggregate summary for Supervisor. (f) Knowledge pack picker rendered inline with allowlist filter. | ✅ | Shipped 2026-05-13. Lives at [playground/src/settings/settingsStore.tsx](../playground/src/settings/settingsStore.tsx), [playground/src/settings/groups/AiGroup.tsx](../playground/src/settings/groups/AiGroup.tsx), [proxy/server.js `/assistant/profiles`](../proxy/server.js). 10 new tests (5 store activeAiProfile + 5 AiGroup integration). |
| **5. Preferences + System + Advanced** | ✅ DONE | Retired floating gear popover (now a direct nav button to `/settings`); repointed Pulse Cycle H Display tab to an "Open Settings → Preferences" link; System Proxy status with live 10 s `/api/health` poll + latency badge + auth-mode + config-source readout; System Diagnostics with rolling 20-event BI buffer + last 20 `console.error` messages (via `pulseplay:bi-event` window event + monkey-patched `console.error`); System Export bundle JSON download with token/secret redaction; Advanced Reset section / Reset all / Danger zone gated by type-to-confirm input. | ✅ | Shipped 2026-05-13. Lives at [playground/src/settings/groups/SystemGroup.tsx](../playground/src/settings/groups/SystemGroup.tsx), [playground/src/settings/groups/AdvancedGroup.tsx](../playground/src/settings/groups/AdvancedGroup.tsx), [playground/src/settings/diagnosticsBuffer.ts](../playground/src/settings/diagnosticsBuffer.ts), [playground/src/settings/exportBundle.ts](../playground/src/settings/exportBundle.ts), [playground/src/biPanel/BIPanel.tsx](../playground/src/biPanel/BIPanel.tsx) (event dispatcher), [playground/src/App.tsx](../playground/src/App.tsx) (gear retirement), [playground/src/pulse/visual.tsx](../playground/src/pulse/visual.tsx) (Display tab repoint). 7 new tests (4 exportBundle redaction + 3 AdvancedGroup type-to-confirm gates). |
| **6. Loophole closure (parallel with 2-5)** | ✅ DONE for HIGH gaps | (a) ✅ CSP-from-allowlist (L7). (b) ✅ refuse-to-start in production if `PROXY_INLINE_CREDENTIALS_MODE !== "off"` (L8). (c) ✅ dev-mode startup banner for embed-token route (L6 mitigation). (d) ⏳ MEDIUM findings L9-L15 (next iteration) | ✅ | All HIGH loopholes closed or mitigated. L7: [playground/vite.cspFromAllowlist.ts](../playground/vite.cspFromAllowlist.ts). L8: [proxy/server.js startup gate](../proxy/server.js) refuses to start with FATAL message when `NODE_ENV=production` and inline mode is not "off". L6: warning banner at startup when running outside production without IdP. |
| **7. Pack registry endpoint** | ✅ DONE (pulled forward) | `GET /assistant/knowledge/packs` + App-loaded pack discovery + allowlist filtering | post-MVP-0.2 → shipped early | Lives at [proxy/lib/packRegistry.js](../proxy/lib/packRegistry.js), [proxy/server.js](../proxy/server.js), [App.tsx](../playground/src/App.tsx), [PackPicker.tsx](../playground/src/components/PackPicker.tsx). `DEFAULT_AVAILABLE_PACKS` retained as legacy/test fallback per HANDOVER tripwire. |
| **8. Knowledge Base UI** | ✅ DONE | Separate page at `/knowledge`. Read-only browser for pack content (glossary, ontology, references, sub-vertical KPIs + sample questions + prompt context + BI/AI fit, runtime-use explanation, demo config list). Mounted by App.tsx via `useKnowledgeRoute`. Settings › AI › Browse library ↗ deep-link routes here. | shipped 2026-05-13 | Lives at [playground/src/knowledge/](../playground/src/knowledge/), [proxy/lib/packRegistry.js](../proxy/lib/packRegistry.js) (new `loadPackDetail` + `loadSubVerticalDetail` + `isSafePackSegment`), [proxy/server.js](../proxy/server.js) (new `GET /assistant/knowledge/packs/:pack` + `GET /assistant/knowledge/packs/:pack/sub-verticals/:subVertical`). 24 new tests. |
| **9a. Configuration expansion** | ✅ AVAILABLE TODAY | **Pure configuration, no code.** Add more Genie spaces, Supervisor fan-outs, Azure OpenAI profiles (analytics mode), AWS Bedrock profiles, Mosaic Foundation Model endpoints, Power BI workspaces, AAD tenants, packs by editing `proxy/config.json` + the allowlist. The proxy already has the routes for every connector type listed in `config.example.json`. Pack registry auto-discovers any directory in `pulsepacks/`. | n/a | Deployer-driven; see [DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md). No spec restructure needed. |
| **9b. Stub-to-SDK graduation** | ⏳ v0.3+ (per vendor) | **Per-vendor code work.** Tableau / Qlik / Looker BI adapters currently extend `GenericIframeAdapter` — they render iframes only, no AI-applied filters / page navigation / event bridge. Graduating each one means wiring the vendor's SDK: Tableau Embedding API v3 (`<tableau-viz>`), Qlik (`<qlik-embed>`), Looker (`@looker/embed-sdk`). The `BIAdapter` contract is stable; what each adapter needs is real vendor-side wiring + tests + smoke. | when an org standardises on a non-PBI BI tool | Tableau / Qlik / Looker stubs at [bi-adapters/](../bi-adapters/) graduate. License/governance UI extends per vendor. Generic-iframe stays as the escape hatch. |
| **10. Fabric feature support** | ⏳ v0.4+ | **Additive code inside the existing Power BI adapter.** Classic Power BI (Import / DirectQuery / Composite) is already plug-and-play. Fabric adds three feature classes: (1) Direct Lake datasets — different embed flow, (2) Dataflow Gen2 — different refresh semantics, (3) Semantic-link APIs — new tool-call surface. The `license.powerbi.fabricEnabled` flag exists; the adapter refuses Fabric-only reports today via the no-Fabric diagnostic. | when an org enables Fabric | `license.powerbi.fabricEnabled: true` becomes supported; the PBI adapter gains Direct-Lake mount path + Dataflow Gen2 capability detection; no-Fabric diagnostic copy retired. |

---

## 17. Trigger conditions for IA change

The current tree is locked for v0.2. Promotion / split conditions documented so the next change is principled.

| Trigger | What changes |
|---|---|
| **Phase 3 retrieval provider interface ships** (`IndexProviderAdapter`, `KnowledgeRetriever`) | Knowledge promotes to top-level group `Knowledge` (peer to BI + AI). Knowledge pack leaf moves out of AI. New leaves: Sources, Retrieval profile, Evaluation. |
| **≥2 source-adapter types wired** (e.g. PulsePack + Unity Catalog) | Same as above — Knowledge promotion. |
| **Knowledge Base UI surface ships** | Same. |
| **Multi-user / Workspace scope arrives** | Settings page gets a scope switcher at the top (User / Workspace). Existing groups split per-scope. `Preferences` stays User-scope; new `Workspace` group appears. |
| **Vendor count > 6** (BI providers) | BI group splits into Provider + per-vendor subpages. Search becomes load-bearing. |
| **AI connector count > 8** | AI Provider leaf becomes a searchable picker (today: flat list works). |
| **Pack authoring lands** | New top-level `Authoring` group; or stays inside Knowledge once that's promoted. |

---

## 18. Open questions

1. **Per-user vs per-group AI profile allowlist.** Spec defaults to per-group (IdP claims). Per-user override list TBD — likely not needed in v0.2.
2. **Tile mode lives where?** Currently shown under BI › Canvas. Some users may expect it under Preferences. Decision: keep under BI because tile count is a property of "what you're looking at," not "how the playground feels."
3. **Connection test re-run cadence.** Auto-rerun on AI Provider change is fine. Auto-rerun on Pack change is overkill. Decision: pack change does not invalidate probe.
4. **Authentication leaf scope.** Today covers PBI SSO config only. When Tableau / Qlik / Looker SSO arrives, this leaf grows. Defer until those vendors graduate from stub.
5. **Status group inside BI vs Diagnostics inside System.** Some overlap (mount errors live in both). Decision: BI › Status shows live mount state; System › Diagnostics shows historical errors. Two views of the same underlying source.
6. **Pulse Setup deep-link target.** Today opens the Setup tab. When Pulse splits between Setup and Authoring, decide which one the deep-link targets. Defer.

---

## Cross-references

- [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) — Knowledge plane, retrieval contracts, Settings IA at-a-glance
- [SECURITY.md](SECURITY.md) — internal-scoped guardrails
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) — board-ready audit + closed/open gaps
- [PROXY_REFERENCE.md](PROXY_REFERENCE.md) — proxy API surface + future allowlist endpoint shape
- [ARCHITECTURE.md](ARCHITECTURE.md) — 2-axis design + Knowledge plane
- [PACKS.md](PACKS.md) — pack architecture overview
- [DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md) — deployer checklist for MVP 0.2 (PBI + Genie + Supervisor, no Fabric)
- [AGENDA.md § Settings + Knowledge plane](AGENDA.md) — open work tracker
- [research/SETTINGS_IA_PROMPT.md](research/SETTINGS_IA_PROMPT.md) — the external-LLM research brief that informed the IA
- [HANDOVER.md](HANDOVER.md) — session-by-session log
