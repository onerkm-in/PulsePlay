# PulsePlay Settings IA — Research & Recommendation Prompt

> **Purpose.** This file preserves the exact research brief we hand to external
> LLMs (ChatGPT, Gemini, Codex) when soliciting an opinionated IA proposal for
> PulsePlay's new Settings page. When their response comes back, audit it
> against [CLAUDE.md](../../CLAUDE.md) constraints and the 2-axis abstraction
> per `feedback_external_llm_audit.md` before adopting anything.
>
> **History.** Drafted 2026-05-13. Iterated from a 4-group "lifecycle-of-intent"
> tree (BI Surface / AI Assistant / Workspace / Admin & Health) that felt
> cluttered, into this fully-elaborated research brief.

---

## Role

You are acting as a **senior product designer, information-architecture specialist, enterprise UX researcher, and developer-tooling product strategist**.

Your task is to produce the strongest possible IA and UX recommendation for a new **Settings page** for a product called **PulsePlay**.

Do **not** answer from generic UX memory. Research relevant product patterns, official documentation, design systems, industry standards, GitHub/community discussions, and credible UX blogs before making a recommendation.

Be opinionated. Pick winners. Name losers. Do not provide a bland balanced survey.

---

## Product Context — PulsePlay

PulsePlay is an **inner-source enterprise React playground**, not a public SaaS product.

It:

- Hosts **any BI tool** as an embedded guest:
  - Power BI
  - Tableau
  - Qlik
  - Looker
  - Generic iframe

- Has an **AI assistant sidebar** that can talk to **any AI brain**:
  - Databricks Genie
  - Azure OpenAI
  - AWS Bedrock
  - Mosaic AI Foundation Model
  - Supervisor multi-agent connector

- Has a defining product architecture: **2-axis independence**
  - BI vendor is one axis.
  - AI connector is another axis.
  - They are independently switchable.
  - Any BI vendor + any AI connector combination should be valid.

- Supports **knowledge packs**
  - Domain bundles such as CPG/FMCG.
  - These compose with both BI and AI axes.

- Is currently:
  - Single-user-in-a-browser.
  - LocalStorage-backed.
  - Not yet a multi-user workspace product.
  - No User vs Workspace scope conflict today.

- Embeds a richer **Pulse Setup** tab of approximately 3000 LOC.
  - This is used for deep AI prompt and KPI configuration.
  - The new Settings page must **deep-link to Pulse Setup**.
  - Do **not** inline Pulse Setup into the new Settings page.

---

## Current Mess to Clean Up

Today, PulsePlay has many persisted localStorage keys and scattered edit surfaces.

### Persisted State Examples

- `bi-vendor`
- `pbi-sso-config`
- `pack-selection`
- `ui-mode`
- `enabled-components`
- `layout-mode`
- `bi-tile-mode`
- `visual-settings:*` owned by Pulse

### Current Edit Surfaces

- Top-bar `VendorPicker`
- Top-bar `EmbedConfigForm`
  - Power BI has 4 sub-modes:
    - secure embed link
    - AAD SSO
    - service-principal-via-proxy
    - manual paste
- Top-bar `ConnectorPicker`
- `TestConnectionPanel`
- `PackPicker`
- Floating gear
- "Cycle H Display" tab inside Pulse Developer Tools modal
  - duplicates UI mode
  - duplicates panels
  - duplicates layout
  - duplicates tile-mode toggles
- Pulse Setup tab itself
- Env-only proxy configuration:
  - CORS allowlist
  - CSP
  - IdP JWKS
  - rate limits

---

## Current Proposal to Challenge

Challenge this. Do not simply validate it.

```text
BI Surface         → Vendor, Embed config, Tiles
AI Assistant       → Connector, Connection test, Knowledge pack, Pulse Setup ↗
Workspace          → UI mode, Visible panels, AI position, Reset all
Admin & Health     → Proxy status, Security posture, Audit log ↗, Diagnostics
```

Proposed layout:

- Single-page layout with anchored sections.
- Floating gear and connection pill remain as shortcuts into specific groups.
- Canvas BI-tile toolbar remains as inline quick-switch.
- Pulse Setup remains separate and is only deep-linked.

---

## Research Requirement — Mandatory

Before recommending the final IA, perform research across the following source classes.

Prioritize **official documentation and design-system guidance** over random blogs. Use blogs and community discussions mainly to identify real-world pain, scaling issues, and complaints.

### 1. Official Product Documentation

Research and compare:

- VS Code
  - Settings UI
  - `settings.json`
  - User/workspace scopes
  - Settings Sync
- JetBrains IDEs
  - Settings/Preferences dialog
  - Settings tree
  - Search behavior
- Chrome, Firefox, and Edge preferences/settings
- Figma
  - Account
  - Workspace
  - Team
  - Organization settings
- Notion
  - Account vs workspace settings
- Slack
  - Personal preferences vs workspace settings/admin settings
- Linear
  - Personal/workspace/team/admin settings
- Vercel
  - Personal account
  - Team
  - Project settings
- Stripe Dashboard
  - Personal/account/product/developer settings
- GitHub
  - User settings
  - Repository settings
  - Organization settings
  - Danger Zone patterns
- GitLab
  - Group/project/admin settings
  - Settings redesign learnings
- 1Password or Bitwarden
  - Security-first settings
  - Admin/security posture patterns
- macOS System Settings
  - Especially the 2022 redesign
  - What worked and what failed
- Discord
  - Consumer-density settings
- Atlassian admin
  - Jira/Confluence admin settings
- Databricks workspace settings
  - Closest domain peer for PulsePlay's admin/runtime concerns

### 2. Design-System and UX Standards

Research:

- Nielsen Norman Group:
  - Progressive disclosure
  - Information architecture
  - Navigation
  - Settings usability
  - Cognitive load
- W3C WCAG 2.2:
  - Accessibility requirements
  - Keyboard navigation
  - Focus behavior
- WAI-ARIA Authoring Practices:
  - Tabs
  - Accordions
  - Disclosure components
  - Tree views
  - Keyboard interactions
- Material Design:
  - Settings patterns
  - Navigation
  - Lists
  - Disclosure
- Apple Human Interface Guidelines
  - Settings/preferences
  - Sidebar navigation
  - Progressive disclosure
- Microsoft Fluent Design
  - Settings
  - Navigation
  - Command surfaces
- Firefox Acorn or equivalent Mozilla design-system guidance for preferences/settings

### 3. Security and Operational Standards

Research:

- OWASP secure-by-default guidance
- OWASP ASVS
- Security-first product UX patterns from:
  - 1Password
  - Bitwarden
  - GitHub
  - Stripe
  - Cloud platforms

Focus especially on:

- Secure defaults
- Dangerous action isolation
- Diagnostics
- Audit logs
- Proxy/security posture
- Runtime health
- Connection tests
- Exportable support bundles

### 4. GitHub, Community, Blog, and Case-Study Evidence

Look for:

- GitHub issues or discussions where settings IA caused scaling problems.
- GitLab settings-page redesign case studies.
- Backstage settings/plugin extensibility discussions.
- Community complaints about macOS System Settings 2022.
- Community confusion around Notion account/workspace settings.
- Community discussions around VS Code settings complexity.
- Any credible design or engineering blog discussing settings IA at scale.

Use this evidence carefully:
- Do not over-weight random opinions.
- Use community material to identify pain patterns.
- Use official documentation and UX standards to support final decisions.

---

## Required Evidence Table

For every product or standard referenced, extract the following:

| Product / Standard | Top-Level IA Structure | Depth | Scope Model | Search Behavior | Default Landing | Anti-Clutter Tactic | What They Got Wrong | Direct Lesson for PulsePlay |
|---|---|---:|---|---|---|---|---|---|

Be specific enough that the claim can be verified.

Avoid vague language like:
- "Good UX"
- "Clean interface"
- "Easy to use"
- "Modern settings"

Instead say:
- "Uses left-rail settings navigation with searchable settings"
- "Separates user settings from workspace settings"
- "Uses dangerous action isolation at the bottom of repository settings"
- "Uses admin-only visibility for organization settings"
- "Shows health checks as status cards instead of exposing raw configuration first"

---

## Required Pattern Taxonomy

After the evidence table, distill the research into a small named taxonomy of settings IA patterns.

At minimum, consider:

- Scope-first IA
- Feature-domain IA
- Lifecycle-of-intent IA
- Runtime-centric IA
- Search-first IA
- Progressive disclosure
- Command-palette-first
- Security-first IA
- Admin-console IA
- Consumer-density IA
- Expert-density IA

Tag every researched product with the patterns it uses.

Format:

| Pattern | Description | Products That Use It | Strength | Failure Mode |
|---|---|---|---|---|

---

## Required Critique of Current Proposal

Critique the current PulsePlay proposal honestly.

Discuss:

1. Where the 4-group model works.
2. Where it fails.
3. What it borrows well from GitHub/Stripe/VS Code/other tools.
4. What it misses.
5. Whether "Workspace" is the right label while PulsePlay is single-user.
6. Whether "Admin & Health" is too broad.
7. Whether "AI Assistant" mixes connector runtime, knowledge packs, validation, and authoring.
8. Whether Pulse Setup should remain separate.
9. Whether inline shortcuts should remain or be removed.
10. Whether canonical state ownership is clear.

Do not be polite. Be useful.

---

## Required Alternative IA Trees

Propose **2–3 alternative settings trees**, including the possibility of keeping a corrected version of the current proposal.

For each alternative include:

1. ASCII tree
2. Pattern it draws from
3. Why it fits PulsePlay
4. Why it does not fit PulsePlay
5. Trade-offs
6. Scalability risks
7. Which user type benefits most
8. Which user type suffers most

Example format:

```text
Settings
├── BI Runtime
│   ├── Vendor
│   ├── Embed & Auth
│   ├── Canvas Behavior
│   └── Runtime Status
│
├── AI Runtime
│   ├── Connector
│   ├── Model / Agent
│   ├── Knowledge Packs
│   ├── Test & Validation
│   └── Pulse Setup ↗
│
├── Experience
│   ├── Layout
│   ├── Panels
│   ├── Density
│   └── Reset Experience
│
└── System
    ├── Connectivity
    ├── Security
    ├── Diagnostics
    └── Advanced
```

---

## Pick a Winner

Pick **one** IA tree to ship.

Do not hedge.

You must answer:

- Which tree wins?
- Why does it win?
- Which alternatives lose?
- Why do they lose?
- What should be deferred?
- What should never be built?

The recommendation must be specific to PulsePlay's shape:
- 2-axis BI/AI independence
- Knowledge packs
- Pulse Setup separation
- Single-user today
- Possible workspace future
- Runtime/admin needs
- Enterprise inner-source audience

---

## Navigation Pattern for the Chosen Tree

Specify:

1. Where Settings lives:
   - full page
   - modal
   - side panel
   - drawer
   - route
   - command palette
2. How users get there:
   - gear
   - keyboard shortcut
   - URL route
   - command palette
   - connection pill
   - inline shortcut
3. In-page navigation:
   - left rail
   - top tabs
   - anchor scrolling
   - accordion
   - searchable index
4. How "back to app" works.
5. Mobile/narrow viewport behavior.
6. Default landing:
   - first-ever open
   - returning open
   - error-state open
7. How deep links work.
8. How breadcrumbs or ancestry are shown in search results.
9. Whether Settings has its own route.
10. Whether browser back/forward should work.

---

## User-Flow Walkthroughs

Trace the following flows step-by-step through the chosen design.

### 1. First-Time User

Configure:
- Power BI
- Databricks Genie

From blank state.

Include:
- empty states
- guided steps
- validation
- success state
- return to app

### 2. Power User

Switch BI vendor:
- Power BI → Tableau

Without losing AI context.

Explain:
- what changes
- what remains untouched
- how the UI reassures the user

### 3. Power User

Switch AI brain:
- Genie → Foundation Model

Without redoing BI setup.

Explain:
- what changes
- what remains untouched
- how the UI reassures the user

### 4. Admin

Confirm:
- proxy reachability
- CORS pinned
- CSP active
- IdP active
- JWKS valid

### 5. Diagnostic / Support

Capture a "what is happening right now" support bundle.

Include:
- current BI vendor
- current AI connector
- auth mode
- runtime status
- browser/environment summary
- recent errors
- redaction rules
- export flow

### 6. Overwhelmed Novice

Handle:
> "This is too complex. I just want it to work."

Show how the first-load experience reduces fear.

---

## Ease-of-Use Principles Applied to PulsePlay

For each principle, provide a direct recommendation.

Cover:

1. Save vs auto-save
   - Today auto-saves to localStorage on every change.
   - Should this continue?
   - Where should confirmation appear?
   - When is explicit save required?

2. Undo / Reset granularity
   - reset field
   - reset section
   - reset runtime
   - reset all
   - danger zone

3. Search affordance
   - At how many settings leaves does search become mandatory?
   - Should search be global or local?
   - Should results show ancestry?

4. Visual density
   - Stripe-dense vs Apple-sparse
   - What fits an enterprise dev tool?

5. State indicators
   - modified badges
   - broken-config warnings
   - success confirmations
   - connection status
   - dirty state
   - health badges

6. Discoverability of advanced/admin sections
   - hidden by default?
   - visible but collapsed?
   - permission-gated later?
   - show advanced toggle?

7. Keyboard navigation
   - command palette
   - `Ctrl/Cmd + ,`
   - focus search
   - arrow navigation
   - escape/back behavior

8. Empty states
   - no BI vendor configured
   - no AI connector configured
   - no knowledge pack selected
   - no proxy reachable
   - no diagnostics captured

9. Progressive disclosure thresholds
   - when to collapse
   - when to expose
   - when to deep-link
   - when to warn

10. In-canvas shortcuts vs canonical settings
   - vendor picker
   - tile toggle
   - floating gear
   - connection pill
   - should they preview?
   - should they immediately persist?
   - should they deep-link?
   - should they share exact state with Settings?

---

## Anti-Patterns to Avoid

List concrete anti-patterns from researched products.

At minimum include:

- macOS System Settings 2022:
  - search orientation problems
  - too much consumer simplification
- Notion:
  - account/workspace/page-level confusion
- Atlassian:
  - deep admin nesting
  - settings archaeology
- JetBrains:
  - expert-density overload
- Chrome:
  - duplicated pathways and uneven search orientation
- Databricks:
  - infrastructure leakage into user mental model
- Discord:
  - consumer-density sprawl
- Any additional relevant anti-patterns from research

For each anti-pattern:

| Anti-Pattern | Product Example | Why It Fails | PulsePlay Rule |
|---|---|---|---|

---

## Risk and Maturity Gradient

Explain what works for v1 and what must evolve.

Cover:

### 1. Single-user today → Workspace future

Answer:
- What should the UI do today?
- What should the state model prepare for?
- When should workspace scope become visible?
- How should personal/workspace/environment inheritance work later?

### 2. Vendor count growth

Answer:
- With 4 vendors, is one BI Runtime section enough?
- At what vendor count does the IA need to split?
- At what vendor count does search become load-bearing?
- When should vendor-specific subpages appear?

### 3. Connector count growth

Answer:
- With 3–5 AI connectors, is one AI Runtime section enough?
- At what connector count does the AI section need sub-navigation?
- How should supervisor/multi-agent connectors be represented?

### 4. Knowledge pack growth

Answer:
- Are knowledge packs part of AI Runtime?
- Are they their own top-level area?
- When do custom packs require an Authoring section?

### 5. Authoring expansion

If PulsePlay adds:
- custom packs
- custom prompts
- KPI authoring
- prompt libraries
- evaluation suites
- test cases

Decide:
- whether this stays in Pulse Setup
- whether it creates a new top-level "Authoring"
- whether it belongs under AI Runtime
- what must not be mixed into Settings

### 6. Admin maturity

As PulsePlay grows:
- when does System become Admin?
- when does Audit Log become first-class?
- when do environment settings matter?
- when do permissions matter?
- what should be deferred?

---

## Final Output Format

Use this structure:

```markdown
# PulsePlay Settings IA — Research-Backed Recommendation

## 1. Executive Verdict
## 2. Research Method and Source Quality
## 3. Comparative Evidence Table
## 4. Pattern Taxonomy
## 5. Brutal Critique of Current Proposal
## 6. Alternative IA Trees
## 7. Winner and Rationale
## 8. Navigation Pattern
## 9. User-Flow Walkthroughs
## 10. Ease-of-Use Principles for PulsePlay
## 11. Anti-Patterns to Avoid
## 12. Risk and Maturity Gradient
## 13. Final Recommended Tree
## 14. If I Were Shipping This in 2 Weeks
```

---

## Tone and Decision Rules

Use this decision style:

- Be direct.
- Be opinionated.
- Do not hedge.
- Prefer the simplest IA that protects PulsePlay's 2-axis independence.
- Do not create fake scope names.
- Do not call something "Workspace" if there is no workspace scope yet.
- Do not bury operational health.
- Do not inline Pulse Setup.
- Do not duplicate state ownership.
- Do not expose every advanced setting by default.
- Do not confuse shortcuts with canonical settings.

---

## Citation Rules

Cite specifically.

Good citation behavior:

- Cite official docs for product structure.
- Cite UX standards for interaction and accessibility rules.
- Cite OWASP for security posture and secure defaults.
- Cite community/blog sources only when discussing observed pain or redesign learnings.

Bad citation behavior:

- Do not cite random listicles.
- Do not cite generic UX inspiration posts as primary evidence.
- Do not make claims like "users prefer X" without evidence.
- Do not cite sources that do not directly support the claim.

---

## Required Ending

End with a section titled:

# If I Were Shipping This in 2 Weeks

Provide a concrete ordered punch list.

Each item must include:

- priority
- what to build
- why it matters
- what to defer
- acceptance criteria

Example:

```markdown
| Priority | Build | Why | Defer | Acceptance Criteria |
|---:|---|---|---|---|
| P0 | Full-page Settings route with left rail | Establish canonical state ownership | Command palette | `/settings` loads, deep links work, back to app works |
```

Do not write code.
This is pure IA, UX research, and product recommendation.
