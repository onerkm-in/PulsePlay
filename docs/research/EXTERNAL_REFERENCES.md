# PulsePlay — External References (signed)

> **Purpose.** A single, living catalogue of every web source the research-first workflow has consulted. Every entry carries a URL (the **signature**) so future sessions can re-verify or chase the source. Append-only — never reorder or remove entries.
>
> **Rule that produced this doc.** `feedback_research_first.md` — *"spawn multiple research agents to do check for more detailed reference and then we will brainstorm and resume the work"* + *"for above spawn agents for both online and offline assessment and review"*. Online-track agents accumulate web findings here; offline-track findings live elsewhere (code archaeology in `docs/research/<topic>_<date>.md`, screenshots in `D:\Working_Folder\Artifacts\Pulse_ref\`).
>
> **How to add entries.** When an agent returns web findings: append a section at the bottom with date header, topic, and one entry per source (URL · title · one-line takeaway · where applied). Don't merge with prior entries — even duplicate URLs go in again if a new context cites them, so the chain of consultation is auditable.

---

## Topic index (newest first)

- [2026-05-23 - DevTools MCP Databricks feed mining](#2026-05-23---devtools-mcp-databricks-feed-mining)
- [2026-05-23 - Chrome DevTools MCP tooling](#2026-05-23---chrome-devtools-mcp-tooling)
- [2026-05-23 - Azure Databricks integration offering](#2026-05-23---azure-databricks-integration-offering)
- [2026-05-23 — Enterprise UX architecture blueprint and typeahead system](#2026-05-23--enterprise-ux-architecture-blueprint-and-typeahead-system)
- [2026-05-23 — Flow limits and multiplicity simplification](#2026-05-23--flow-limits-and-multiplicity-simplification)
- [2026-05-23 — Business Context claims audit and source hardening](#2026-05-23--business-context-claims-audit-and-source-hardening)
- [2026-05-23 — Persona + First-Launch Architecture for PulsePlay](#2026-05-23--persona--first-launch-architecture-for-pulseplay)
- [2026-05-22 — PulsePlay end-to-end feature and journey research](#2026-05-22--pulseplay-end-to-end-feature-and-journey-research)
- [2026-05-22 — Settings alignment observation + Figma VS Code handoff](#2026-05-22--settings-alignment-observation--figma-vs-code-handoff)
- [2026-05-22 — Settings progressive setup design + sustainability gauge study](#2026-05-22--settings-progressive-setup-design--sustainability-gauge-study)
- [2026-05-22 — Power BI DAX / Q&A enablement guide](#2026-05-22--power-bi-dax--qa-enablement-guide)
- [2026-05-22 — Settings page IA: progressive parent-child + engagement patterns](#2026-05-22--settings-page-ia-progressive-parent-child--engagement-patterns)
- [2026-05-22 — `powerbi-semantic-model` deep-dive: durable PBI NL path post-Q&A retirement](#2026-05-22--powerbi-semantic-model-deep-dive-durable-pbi-nl-path-post-qa-retirement)
- [2026-05-22 — Power BI Q&A readiness assessment + deprecation finding (CRITICAL)](#2026-05-22--power-bi-qa-readiness-assessment--deprecation-finding-critical)
- [2026-05-22 — G3 initial-render flicker: preventing CLS in staged AI chat reveal](#2026-05-22--g3-initial-render-flicker-preventing-cls-in-staged-ai-chat-reveal)
- [2026-05-22 — Databricks Genie + Unity Catalog column metadata propagation](#2026-05-22--databricks-genie--unity-catalog-column-metadata-propagation)
- [2026-05-22 — Azure App Service deep deployment findings](#2026-05-22--azure-app-service-deep-deployment-findings)
- [2026-05-22 — Azure App Service configuration challenges](#2026-05-22--azure-app-service-configuration-challenges)
- [2026-05-22 — Chart axis label humanization + value formatting (G2)](#2026-05-22--chart-axis-label-humanization--value-formatting-g2)
- [2026-05-22 — Auto-route vs click-to-switch when chart shape is wrong (G4)](#2026-05-22--auto-route-vs-click-to-switch-when-chart-shape-is-wrong-g4)
- [2026-05-22 — Azure Databricks Apps enterprise installation guide](#2026-05-22--azure-databricks-apps-enterprise-installation-guide)
- [2026-05-22 — Executive briefing card patterns (Ask Pulse narrative regression)](#2026-05-22--executive-briefing-card-patterns-ask-pulse-narrative-regression)
- [2026-05-22 — Chart rationale popover design (data-shape-aware narrative + warnings)](#2026-05-22--chart-rationale-popover-design-data-shape-aware-narrative--warnings)

---

## 2026-05-23 - DevTools MCP Databricks feed mining

**Context.** Mined the local signed-in Chrome DevTools MCP capture feed at `D:\Working_Folder\Artifacts\Databricks_PulsePlay_Feed\DevToolMCPFeed` and cross-checked the product/API interpretation against official Azure Databricks docs. Applied in [DEVTOOLS_MCP_DATABRICKS_FEED_MINING_2026-05-23.md](DEVTOOLS_MCP_DATABRICKS_FEED_MINING_2026-05-23.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/databricks/genie/conversation-api | Azure Databricks - Genie Conversation API | Official app-integration path for stateful Genie conversations, management APIs, and query-result retrieval. | Production integration posture |
| https://learn.microsoft.com/en-us/azure/databricks/genie/ | Azure Databricks - What is a Genie space | Genie spaces are curated NL analytics spaces with metadata, instructions, sample queries, feedback, and governance. | Genie Space product model |
| https://learn.microsoft.com/azure/databricks/workspace/genie | Azure Databricks - Genie UI | Genie UI aggregates dashboards, Genie Spaces, and Databricks Apps for business users. | Destination surface model |
| https://learn.microsoft.com/en-us/azure/databricks/dashboards/genie-spaces | Azure Databricks - Genie spaces with dashboards | Published dashboards can include companion Genie spaces; external embedding should use the Genie Conversation API. | Embed caveat |
| https://learn.microsoft.com/en-us/azure/databricks/genie-code/ | Azure Databricks - Genie Code | Genie Code is a Databricks-native autonomous AI partner integrated across workspace surfaces. | Adjacent AI surface |
| https://learn.microsoft.com/en-us/azure/databricks/genie-code/use-genie-code | Azure Databricks - Use Genie Code | Genie Code provides context-aware help, documentation-sourced answers, and Agent mode for multi-step tasks. | Genie Code interpretation |
| https://learn.microsoft.com/en-us/azure/databricks/genie-code/mcp | Azure Databricks - Connect Genie Code to MCP servers | Databricks itself is leaning into MCP for making external context available to Genie Code. | MCP strategy |
| https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/ | Azure Databricks - Mosaic AI Model Serving | Model Serving provides governed APIs for custom, foundation, and external models and is accessible through AI Playground. | Agent/model endpoint posture |
| https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/custom-models | Azure Databricks - Custom models overview | Custom Python/MLflow models and code can be served through Databricks endpoints. | Custom code agent evidence |
| https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/model-serving-limits | Azure Databricks - Model Serving limits and regions | Custom model and AI agent endpoints have workspace/resource limits that affect deployment. | Quota caveat |
| https://learn.microsoft.com/en-us/azure/databricks/ai-bi/tools | Azure Databricks - Business intelligence tools | AI/BI includes dashboards and Genie spaces, plus external BI tool connection paths. | BI/AI positioning |

---

## 2026-05-23 - Chrome DevTools MCP tooling

**Context.** Rajesh asked to use `gh repo clone ChromeDevTools/chrome-devtools-mcp` to get more data. The repo was cloned via public `git clone` fallback after GitHub CLI required auth and now lives at `D:\Working_Folder\Projects\chrome-devtools-mcp`. Applied in [CHROME_DEVTOOLS_MCP_TOOLING_2026-05-23.md](CHROME_DEVTOOLS_MCP_TOOLING_2026-05-23.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://github.com/ChromeDevTools/chrome-devtools-mcp | ChromeDevTools/chrome-devtools-mcp | Official repo for Chrome DevTools MCP server and CLI. | Tooling note |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/README.md | Chrome DevTools MCP README | Codex/Windows config, privacy flags, server options, and browser connection modes. | Safe MCP config |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md | Chrome DevTools MCP Tool Reference | Full tool inventory across automation, network, console, screenshots, performance, memory, extensions, and WebMCP. | Capability matrix |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/cli.md | Chrome DevTools MCP CLI | Experimental CLI shape for non-MCP browser automation. | Fallback workflow |
| https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/troubleshooting.md | Chrome DevTools MCP Troubleshooting | Windows, sandbox, npx, and plugin installation caveats. | Tripwires |

---

## 2026-05-23 — Persona + First-Launch Architecture for PulsePlay

**Context.** Live-demo regression: AI Insights briefing came back trimmed to 2 sections due to cross-helper leak (fixed at `5363ff9`). Audience also described the design as "clumsy" and "confused." User directed: model identity-optional persona architecture + first-launch UX, no asking the user their role, behavioral learning with visibility. 4 parallel agents (1 offline + 3 online) ran the full 7-step cycle. Full proposal: [PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md](PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md).

### Non-blocking guided setup patterns

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://docs.stripe.com/connect/hosted-onboarding | Stripe — Hosted onboarding (Connect) | Re-entrant setup surface; account links re-issuable; not a one-shot wizard. | Drawer pattern + re-entry |
| https://docs.stripe.com/connect/supported-embedded-components/account-onboarding | Stripe — Account onboarding embedded component | Embedded component lets users complete onboarding across sessions. | Resumable flow pattern |
| https://onboardme.substack.com/p/how-notion-solved-the-blank-page-product-strategy-deepdive | OnboardMe — How Notion Solved the Blank Page | Blank canvas + 3-question intent quiz preloads templates. Zero setup tax. | Defaults must be functional on day zero |
| https://vercel.com/docs/project-configuration/project-settings | Vercel — Project Settings | Framework presets auto-fill; per-field OVERRIDE toggle. No setup flow. | Per-field opt-in customization |
| https://vercel.com/blog/advanced-project-settings | Vercel — Advanced Project Settings blog | Pre-filled, greyed; flip to OVERRIDE per field. | Per-field reveal pattern |
| https://linear.app/docs/account-preferences | Linear — Account Preferences | Preferences pane is overlay, not blocking. Per-setting mutability. | Drawer-style preferences |
| https://linear.app/docs/display-options | Linear — Display Options | Each display setting independently mutable. No wizard. | Persistent preferences surface |
| https://riyajawandhiya.medium.com/deferral-button-in-saas-onboarding-how-ux-copy-of-these-buttons-can-reduce-the-churn-313ed7212f2b | Medium — Deferral buttons in SaaS onboarding | "Not now" / "Maybe later" beats "Skip" for re-engagement. Microcopy matters. | "Maybe later" not "Skip" |
| https://userguiding.com/blog/progressive-onboarding | UserGuiding — Progressive Onboarding | Progressive over wizard; short lists 3-5 items. | 3-question layout drawer |
| https://www.nngroup.com/articles/wizards/ | NN/G — Wizards: Definition and Design | Wizards have specific use cases; overuse is the anti-pattern. | Justification for non-wizard approach |
| http://stef.thewalter.net/installer-anti-pattern.html | Stef Walter — The Wizard Anti-Pattern | Installer-style wizards force linear decisions and block exploration. | Anti-pattern reference |
| https://help.figma.com/hc/en-us/articles/18888057155991-Create-an-onboarding-flow-with-advanced-prototyping | Figma — Onboarding flow tooltips | Dismissible overlay tips, Skip available, tips re-enableable. | Re-triggerable hints pattern |
| https://slack.com/help/articles/360000355143-Review-your-workspaces-settings | Slack — Workspace Settings | Workspace customization journey, separate from end-user prefs. | Author vs end-user split |

### Anonymous-first SaaS state patterns

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://linear.app/docs/login-methods | Linear — Login methods | Auth-walled (anti-pattern for open BI tool). | Validates Linear is wrong precedent for PulsePlay |
| https://www.junoschool.org/article/how-to-use-figma-community-files/ | Figma — Community files | Read without account; fork requires sign-in. | Read-anonymous, write-identified line |
| https://forum.figma.com/ask-the-community-7/anyone-can-edit-1008 | Figma community — FigJam Open Sessions | Anonymous edit scoped to session link. Identity surfaces as colored avatars. | Session-bounded anonymous edit |
| https://vercel.com/docs/deployments/sharing-deployments | Vercel — Sharing a Preview Deployment | "Anyone with the link" can view + comment; sign-in only at write/protected | Read anonymous, light interact OK |
| https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection | Vercel — Bypass deployment protection | Identity-optional viewer access pattern. | Optional identity escalation |
| https://www.notion.com/help/sharing-and-permissions | Notion — Sharing and permissions | Anonymous = consumer; sign-in = producer. | Anonymous-first consumer model |
| https://blog.codepen.io/2019/08/06/anonymous-pen-save-option-removed/ | CodePen — Anonymous Pen Save Option Removed | Removed anonymous save after abuse + user confusion (lost work they couldn't reopen). | Anti-pattern guardrail: don't promise persistence you can't deliver |
| https://blog.replit.com/anon | Replit — reCAPTCHA and the anonymous experience | Phased out anonymous create/save. Read-only language pages only. | Same anti-pattern lesson |
| https://dev.to/github/vscode-in-the-browser-for-free-github-web-editor-k4h | DEV — GitHub Web Editor (github.dev) | Pure anonymous editor; identity only at write-back to GitHub. **Best precedent for PulsePlay.** | "Edit anonymously, identity only at write-back" |
| https://blog.logto.io/implement-guest-mode-with-logto | Logto — Implement guest mode | 3-phase pattern: guest session token → OIDC carry → server-side merge into user account. | Phase-2 identity escalation plan |
| https://firebase.google.com/docs/auth/web/auth-state-persistence | Firebase — Auth state persistence | Anonymous user upgrade pattern (same shape as Logto). | Alternative implementation |
| https://medium.com/@emadalam/namespace-localstorage-e2d1d2e68b20 | Medium — Namespace localStorage | Prefix keys with `app:user:{userId}:` for per-user isolation; migrate from `app:anon:{sessionId}:`. | Storage namespace plan |
| https://ui-patterns.com/patterns/autosave | ui-patterns — Autosave pattern | Visible "Save" button even with autosave because users trust what they see. | Save-bar honesty |
| https://brianlovin.com/writing/design-to-save-people-from-themselves | Brian Lovin — Design to save people from themselves | Recovery affordance is non-negotiable for anonymous draft state. | Honesty about persistence |
| https://algolytics.com/how-to-unify-user-data-across-multiple-devices-real-time-identity-graph-fingerprinting-crossuid/ | Algolytics — identity graph + fingerprinting | Fingerprinting is probabilistic; deterministic link only forms at login. | Don't use fingerprinting as quasi-login |

### BI tool first-launch UX comparison

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://thereportinghub.com/blog/its-all-a-big-mess-why-power-bi-feels-overwhelming-to-new-users | The Reporting Hub — "It's all a big mess: why Power BI feels overwhelming" | **The canonical "clumsy" complaint.** Packed with options, jargon, no clear starting point. | The anti-pattern PulsePlay matched in tonight's demo |
| https://medium.com/@kaleighspitz/simplifying-power-bi-onboarding-designing-a-guided-workflow-feca0ec6b9e8 | Kaleigh Spitzer / Medium — Simplifying Power BI Onboarding | Proposes 5-step guided flow: pick goal → sample data → connect → customize → publish. | Sample-data-ready hero pattern |
| https://www.tableau.com/blog/top-new-tableau-pulse-feature-releases-know | Tableau Pulse — 2025 feature releases | Metrics homepage on first launch; finished insight above the fold; no wizard. | Hero-first first-launch precedent |
| https://genesysgrowth.com/blog/tableau-pulse-vs-power-bi-copilot-vs-looker-looker-studio-(gemini) | Genesys Growth — Tableau Pulse vs Power BI Copilot vs Looker | Pulse wins because curated metrics show immediately; Copilot needs an existing report. | Why Pulse-style works for first launch |
| https://docs.thoughtspot.com/cloud/latest/user-onboarding-experience | ThoughtSpot — User Onboarding Experience | Single search bar + auto-tour. Re-runnable via Profile → Revisit onboarding. | Single high-affordance entry point |
| https://docs.thoughtspot.com/cloud/latest/business-user-onboarding | ThoughtSpot — Business User Onboarding | Search Assist walks user through sample searches → picks a Liveboard. | Auto-tour pattern |
| https://medium.com/@gaillereports/how-to-use-looker-studio-beginner-guide-2025-841529422ab3 | Medium — Looker Studio beginner guide 2025 | "Big empty page" — explicit anti-pattern callout. Templates as antidote. | Empty-state is the void to avoid |
| https://www.capterra.com/p/188405/Sigma/reviews/ | Capterra — Sigma Computing reviews | Spreadsheet shape feels familiar but role/governance gaps confuse first sessions. | Pattern: familiar shape + lurking complexity |
| https://aipulsechecker.com/mode-analytics.html | AI Pulse Checker — Mode Analytics review | SQL-first onboarding works only because Mode targets analysts who already know SQL. | Audience-matched onboarding |
| https://docs.databricks.com/aws/en/workspace/genie | Databricks AWS — Use the Genie interface | "For you" homepage + Common Questions pre-seeded in Genie Spaces. | Common Questions pattern for AI sidebar |
| https://docs.databricks.com/aws/en/genie/best-practices | Databricks — Curate an effective Genie Space | Recommend ≥5 example questions per space; iterative curation. | Validates 3-5 starter prompts in AI sidebar |
| https://www.userflow.com/blog/onboarding-user-experience-the-ultimate-guide-to-creating-exceptional-first-impressions | Userflow — Onboarding UX guide | Populate new accounts with sample data + one-click dismiss. | Sample-data-ready hero |
| https://carbondesignsystem.com/patterns/empty-states-pattern/ | Carbon Design — Empty States pattern | Hybrid (sample + clear dismiss) beats pure empty state. | Empty-state alternative |
| https://www.assistant-ui.com/docs/guides/suggestions | assistant-ui — Suggestions API | Pre-seeded click-to-send starter prompts. The library-supported pattern. | Implementation reference |
| https://www.capterra.com/p/208764/Tableau/reviews/ | Capterra — Tableau reviews | Reviewers cite "so many options and configuration settings to navigate." | Configuration density = clumsy reaction |

### Synthesis takeaway

The "clumsy" reaction is documented industry-wide and the fix shape is consensus. Three patterns to copy (sample insight above fold + Common Questions in sidebar + single high-affordance entry point) + three to avoid (wizard before value + configuration density + jargon-first labeling). Storage architecture (Logto 3-phase + per-user namespacing) is a known solved pattern, not new design work.

**Decision pending user direction.** Implementation effort estimated at ~38-50 hours across 10 work items in [PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md](PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md).

---

## 2026-05-23 — Business Context claims audit and source hardening

**Context.** User asked for several deep-research agents to study the claims behind the draft Business Context / pack-default implementation. Six read-only agents audited CPG, Retail, SaaS, ESG/sustainability, provenance/trust architecture, and Strategic Lens implementation shape. Consolidated audit: [BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md](BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md).

### Claim validation sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://ghgprotocol.org/corporate-standard | GHG Protocol — Corporate Standard | Provides requirements/guidance for corporate-level GHG inventories; correct source family for Scope 1/2/3 glossary, not packaging-circularity or software-efficiency claims. | CPG/ESG source ID correction |
| https://ghgprotocol.org/scope_2_guidance | GHG Protocol — Scope 2 Guidance | Standardizes purchased electricity/steam/heat/cooling accounting and market/location-based Scope 2 treatment. | Scope 2 wording and source IDs |
| https://ghgprotocol.org/corporate-value-chain-scope-3-standard | GHG Protocol — Corporate Value Chain Scope 3 Standard | Scope 3 covers 15 upstream/downstream categories, but category mapping depends on boundary and accounting policy. | Scope 3 caveats |
| https://developers.google.com/analytics/devguides/collection/ga4/reference/events | Google Analytics for Developers — Recommended events | GA4 supports ecommerce event names/parameters; it is not authority for ROAS/CAC/LTV formulas. | Retail growth-marketing claim narrowing |
| https://support.google.com/analytics/answer/12200568 | Google Analytics Help — Set up ecommerce events | Confirms ecommerce events and parameters are collected for reporting when configured. | GA4 taxonomy validation |
| https://www.saasmetricsboard.com/standards | SaaS Metrics Standards Board — Standards | Publishes and tracks SaaS metric standards/status; also shows some metrics such as CLTV-to-CAC are in progress, not final standards. | SaaS source tiering |
| https://www.saasmetricsboard.com/annual-recurring-revenue | SaaS Metrics Standards Board — Annual Recurring Revenue | ARR formula/source page; useful as SaaS operating metric authority, not GAAP accounting authority. | ARR correction |
| https://info.sapphireventures.com/2024-keybanc-capital-markets-and-sapphire-ventures-saas-survey | KeyBanc Capital Markets & Sapphire Ventures — 2024 SaaS Survey | Useful benchmark/survey source, not formula authority for NRR or ARR. | SaaS benchmark role |
| https://greensoftware.foundation/standards/sci/ | Green Software Foundation — Software Carbon Intensity | SCI is a software carbon-intensity methodology; it does not define PUE. | SaaS sustainability source split |
| https://www.thegreengrid.org/node/372 | The Green Grid — Power Usage Effectiveness | PUE is total data-center energy divided by ICT equipment energy. | PUE source correction |
| https://sciencebasedtargets.org/step-by-step-guide/ | Science Based Targets initiative — Target services | Companies submit targets for validation; PulsePlay can map to validated targets but cannot validate actions itself. | SBTi wording |
| https://www.wbcsd.org/actions/circular-transition-indicators/ | WBCSD — Circular Transition Indicators | CTI is a universal framework/tool for measuring circular performance; better source family for packaging/circularity than GHG Scope 3 alone. | Retail/CPG packaging circularity |

### Synthesis takeaway

Business Context is the right simplification, but the current draft claim layer overstates confidence. Treat pack-generated defaults as draft until source IDs resolve to real source registers, confidence labels stop defaulting to `sme-reviewed`, and a validator blocks citation downgrades, invented IDs, and unsupported benchmarks.

---

## 2026-05-23 — Flow limits and multiplicity simplification

**Context.** User asked to explore all limits, what else can be added, how flows can be simplified, what the end-user journey should become, and how to simplify multiplicity. Synthesis document: [FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md](FLOW_LIMITS_AND_MULTIPLICITY_SIMPLIFICATION_2026-05-23.md).

### UX and interaction sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://atlassian.design/components/empty-state/ | Atlassian Design System — Empty state | Empty states describe what the user can do next. | Sample/finished-insight-first landing and recovery states |
| https://learn.microsoft.com/en-us/windows/powertoys/command-palette/overview | Microsoft Learn — PowerToys Command Palette | Command palettes keep frequent commands, search, and actions one keystroke away for power users. | PulsePlay global command palette recommendation |
| https://learn.microsoft.com/en-us/windows/apps/develop/input/access-keys | Microsoft Learn — Access keys | Keyboard access improves usability and accessibility for users who navigate without a pointer. | Keyboard-first Authoring and command-surface requirements |
| https://primer-docs-preview.github.com/product/components/dialog/guidelines/ | GitHub Primer — Dialog guidelines | Command palettes can be implemented as accessible dialogs with required title/close behavior and scrollable body. | Command palette modal anatomy |
| https://docs.slack.dev/concepts/agent-design/ | Slack Developer Docs — Agent design | Agents must show up transparently, respect data boundaries, and use appropriate guardrails. | Trust footer, context-quality badge, owner-aware blocked states |
| https://www.atlassian.com/blog/design/designing-atlassians-new-navigation | Atlassian — Designing the new navigation | Navigation simplification requires realistic prototyping, consistent action placement, accessibility, responsiveness, and content rules. | AppShell / primary-nav simplification and route unification |

### Synthesis takeaway

The most valuable additions are not more selectors. They are context visibility, command access, source proof, generated-default review, owner-aware recovery, and a non-blocking Viewer-first landing. Multiplicity should collapse by making Business Context the parent and generated defaults the child.

---

## 2026-05-22 — Settings page IA: progressive parent-child + engagement patterns

**Context.** User: *"the menu or navigations are not smooth for the author, it's very confusing, it should follow Parent - Child pattern and should be progressive and should be interactive, I mean the author should feel like they are engaged and well informed of the settings they are doing, this applies for all the sections those fall in the setting page, can we please do a proper mapping here."*

4 parallel agents ran the full 7-step cycle: in-tree IA audit + design-spec archaeology + industry IA patterns + engagement-pattern research. Full proposal in [docs/research/SETTINGS_IA_PROPOSAL_2026-05-22.md](SETTINGS_IA_PROPOSAL_2026-05-22.md).

### Industry IA + engagement sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.nngroup.com/articles/menu-design/ | NN/g — Menu Design Checklist: 17 Guidelines | 2-3 tier max for menu structures. Industry consensus. | Validates 3-level cap |
| https://www.nngroup.com/articles/local-navigation/ | NN/g — Local Navigation Wayfinding | Same-plane sibling navigation for L2/L3 feels fastest. | Left-rail + breadcrumb pattern |
| https://www.nngroup.com/articles/efficiency-vs-expectations/ | NN/g — Don't Prioritize Efficiency Over Expectations | Autosave caveats: don't surprise users. | Save-model decision |
| https://uxmovement.com/navigation/the-fastest-navigation-layout-for-a-three-level-menu/ | UX Movement — Fastest 3-level layout | Left-left-left or left-top-top fastest. | Nav layout choice |
| https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/ | UXPin — Progressive Disclosure | Core → Advanced → Expert pattern is dominant 2026. | Disclosure model |
| https://pixxen.com/progressive-disclosure-saas/ | Pixxen — Progressive Disclosure in SaaS | "Show advanced" reveal at moment of readiness. | Sub-section expand pattern |
| https://ixdf.org/literature/topics/progressive-disclosure | Interaction Design Foundation — Progressive Disclosure | Jakob Nielsen's 1995 principle still rules. | Theoretical foundation |
| https://docs.stripe.com/stripe-apps/patterns | Stripe Apps Design Patterns / SettingsView | 2-level + 3-level islands. SettingsView standardises leaf page header. | Pattern reference for Leaf primitive |
| https://docs.stripe.com/stripe-apps/build-ui | Stripe Apps Build a UI | Form patterns + explicit save per leaf. | Save model |
| https://docs.stripe.com/stripe-apps/patterns/onboarding-experience | Stripe Apps Onboarding patterns | OnboardingView component pattern for first-run. | First-run UX |
| https://docs.stripe.com/connect/onboarding | Stripe Connect onboarding | "Recommended" pill + one-line rationale on trade-off settings. | Decision-guidance affordance |
| https://linear.app/docs/display-options | Linear — Display Options / Parent-child | Strict 2-level minimalism. No nested expanders. | Counter-example to 42-setting scale |
| https://vercel.com/docs/project-configuration/project-settings | Vercel — Project Settings | 3-level: Scope (Team/Project/Personal) → Settings → leaf. | Scope-first pattern |
| https://vercel.com/changelog/dashboard-universal-search | Vercel — Universal Search + AI Nav Assistant | Cmd-K + AI navigation assistant for large surfaces. | Search-first affordance |
| https://noteforms.com/notion-glossary/sub-page | Notion — Sub-pages glossary | Breadcrumbs for nested context at L3+. | Breadcrumb necessity |
| https://primer.style/product/ui-patterns/saving/ | Primer (GitHub) — Saving pattern | Explicit save for forms; autosave for imperative toggles. | Save-model split |
| https://www.damianwajer.com/blog/autosave/ | Damian Wajer — Autosave vs explicit save | Mixing within one form is the cardinal sin. | Save-model rule |
| https://carbondesignsystem.com/patterns/status-indicator-pattern/ | Carbon Design System — Status Indicators | Severity rollup + 3-5 chips max + filled icons for high-severity. | Status chip rules |
| https://www.patternfly.org/patterns/dashboard/design-guidelines/ | PatternFly — Dashboard | Status chip aggregation rules. | Status chip aggregation |
| https://tutorialsdojo.com/why-aws-feels-overwhelming-at-first-and-how-to-approach-it-properly/ | Tutorials Dojo — Why AWS Feels Overwhelming | "Visibility ≠ complexity" — 4-5 levels is the anti-pattern. | Don't go deeper than 3 |
| https://ui-patterns.com/patterns/LivePreview | ui-patterns.com — Live Preview pattern | Update result on every keystroke; commit-or-explore. | Engagement affordance #2 |
| https://launchdarkly.com/platform/feature-flags/ | LaunchDarkly — Feature flag platform | Simulate targeting rules before publishing. Admin-grade live preview. | Live impact callout reference |
| https://www.smashingmagazine.com/2022/01/software-administration-ux/ | Smashing Magazine — Software Administration UX | Settings should point out which service is affected + next step. | Engagement principle |
| https://cloudscape.design/patterns/general/unsaved-changes/ | AWS Cloudscape — Unsaved changes | 2-tier nav guard (in-page modal + beforeunload). Most concrete public spec. | Save-aware navigation pattern |
| https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ | Superhuman — Command Palette | Always-on shortcut, fuzzy, synonyms, frequency-weighted. | Cmd+K spec |
| https://mobbin.com/glossary/command-palette | Mobbin — Command Palette variants | Linear/Figma/Notion/Vercel/Raycast all converged on Cmd+K. | Pattern validation |
| https://www.useronboard.com/onboarding-ux-patterns/empty-states/ | UserOnboard — Empty States | Checklists drive activation 25-30% → 40%+. | First-run guidance |
| https://userpilot.medium.com/onboarding-ux-patterns-and-best-practices-in-saas-c46bcc7d562f | Userpilot — SaaS Onboarding | One CTA per uninitialized section. | Empty-state pattern |
| https://brianlovin.com/writing/design-to-save-people-from-themselves | Brian Lovin — Design to save people from themselves | Dirty-state safety net for settings. | Save-bar honesty |

### In-tree state (offline-agent findings)

- **42 leaf settings** across 6 groups (Setup / BI / AI / Preferences / System / Advanced).
- **3-tier IA**: Group → SubSection → Leaf, with sub-routes for dense surfaces (Appearance, Knowledge Base, Supervisor Fusion, Governance, Developer Tools).
- **Status strip**: 6 chips at top (Setup / BI / AI / Pack / Proxy / Security) — live-bound to system state.
- **Save model**: Draft-based via `useSettingsDraft` — many leaves write live to localStorage; "Save" bar implies semantics that don't match.
- **Search**: Ctrl+/ focuses search input; indexes leaf labels only, not helper text.
- **Test anchor**: `GROUP_LEAF_LABELS` drift-detector enforces every rendered leaf is in the dictionary.

### 12 friction points identified (in-tree)

1. No breadcrumbs at depth 3
2. Sub-route navigation is button-click indirect
3. Conditional leaves have silent fallback when not rendered
4. Settings change → silent impact on app state
5. 42 leaves without progressive disclosure within groups
6. Search doesn't index helper text
7. Left rail subitems don't show conditional/sub-route distinction
8. Orphan badges only on setup/advanced (not the group with the actual orphan)
9. Sub-pages don't preserve scroll position
10. No "what does this control" cross-reference
11. Mixed immediate vs draft application is confusing
12. Save bar semantics don't match the live-write reality

### 10 strengths to preserve

1. Explicit save gate (draft + commit pattern)
2. Left rail + chip navigation dualism
3. Search spans all 42 leaves
4. Deep-link per-leaf via copy button
5. Live edit preview in app
6. SubSection + Leaf semantic clarity
7. Multi-form sub-pages for dense UIs
8. Orphan detection + banners
9. Read-only display of governed state
10. Status badges per setting

### Synthesis takeaway

**The Settings IA design contract in [docs/SETTINGS_SPEC.md](../SETTINGS_SPEC.md) is well-documented and principled.** User frustration is about **execution gaps** flagged in `docs/inherited/SETTINGS_AUTHOR_VIEWER_UX_SCAN.md`, not the IA itself.

**5 highest-impact affordances** (ranked):

1. **Cmd+K settings palette** — Linear/Superhuman pattern. Fuzzy match + frequency-weighted ranking. Collapses 42-setting IA to one keypress.
2. **Live impact callout** — "Changing this affects: Connector X, 3 active sessions, Embed-token cache." Makes consequences visible *before* save.
3. **Sticky dirty-state action bar + Cloudscape 2-tier nav guard** — fixes the "wait, I had unsaved changes" disaster.
4. **"Recommended" pill + one-line rationale on trade-off settings** — Stripe pattern. Turns dropdown roulette into guided choice.
5. **Time-stamped status chips that deep-link to their check source** — "Proxy Connected · checked 12s ago →"

**Plus the documented P1 items from heritage lessons:**

- Settings role/scope metadata (`SettingRole`, `SettingScope`, `SettingLifecycle`) so the IA can render scope-aware UI.
- Make the Save bar honest: either real draft semantics or rename the affordance.
- Restore mobile navigation (rail → horizontal tab strip below 720px; chips → dots below 480px).
- Unified `AuthoringStateSnapshot` facade so the app can reason about state without grepping localStorage.

### Decision recorded 2026-05-22

User direction: *"make sure we keep everything documented so that it will help in the future, taking a discussion."* + *"if genie works, then let's keep it minimal for now... let's not divert."*

Implementation deferred. Full research preserved in [docs/research/SETTINGS_IA_PROPOSAL_2026-05-22.md](SETTINGS_IA_PROPOSAL_2026-05-22.md) for future discussion. Quick-win candidates (Cmd+K palette, time-stamped status chips, Save bar honesty) flagged but not started.

---

## 2026-05-22 — `powerbi-semantic-model` deep-dive: durable PBI NL path post-Q&A retirement

**Context.** Org constraints: cannot use Microsoft Copilot (not approved), no Fabric in roadmap, Power BI Premium P-SKU for 1-2 years. With Q&A retiring Dec 2026, PulsePlay's `powerbi-semantic-model` backend (#10) becomes the SOLE viable durable PBI natural-language path. 3 parallel agents (1 offline + 2 online) ran the deep-dive.

### Power BI executeQueries API + LLM grounding

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries | Microsoft Learn — Datasets: Execute Queries REST API | The ONLY Microsoft-blessed programmatic path. DAX only (no MDX). 100K rows / 1M values / 15 MB / 120 req/min/user. | The API PulsePlay's semantic-model backend uses |
| https://community.fabric.microsoft.com/t5/Developer/Service-Principal-RLS-ExecuteQueries-REST-API/m-p/4805401 | Fabric Community — Service Principal + RLS blocked | **HARD ARCHITECTURAL CONSTRAINT:** Service Principal blocked on RLS datasets via executeQueries. Must use OAuth On-Behalf-Of. | Forces user-delegation auth model |
| https://powerbi.microsoft.com/en-us/blog/executequeries-rest-api-versus-xmla-endpoints-at-scale/ | Power BI Blog — executeQueries vs XMLA at scale | 120 q/min cap is tenant-wide, cannot be raised by Premium. XMLA fallback path needed at scale (PPU-only). | Day-1 architectural risk to plan around |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/rls-sso | Microsoft Learn — RLS with token-based identities | `effectiveIdentity` for embed-token RLS. Distinct from executeQueries RLS path. | Two separate enforcement points |
| https://pbidax.wordpress.com/2025/05/14/llms-and-dax-where-things-stand-today/ | pbidax — LLMs and DAX: Where things stand today | Reasoning models hit 80-90% accuracy; non-reasoning GPT-4o unpredictable; common failure modes (row-vs-filter, missing CALCULATE, SQL keyword leakage). | LLM-DAX-gen risk profile |
| https://www.daxbench.com/ | DAXBench (benchmark site) | 123 models × 30 tasks. Reasoning models lead: Gemini 3.1 Flash Lite Preview 97.4%, GPT-5.3 Chat 96.2%, Claude Sonnet 4.6 84.5%. | Quantified model-tier ranking |
| https://pbidax.wordpress.com/2025/08/10/first-look-at-gpt-5-on-an-nl2dax-benchmark/ | pbidax — First Look at GPT-5 on NL2DAX | GPT-5 near-perfect on NL2DAX benchmark; reasoning tier is the bar for production. | Model selection guidance |
| https://powerbi.microsoft.com/en-us/blog/announcing-public-preview-of-the-tabular-model-definition-language-tmdl/ | Power BI Blog — TMDL public preview | Human-readable semantic-model definition format. Best grounding for LLM DAX generation. | Grounding strategy |
| https://learn.microsoft.com/en-us/analysis-services/tom/tom-pbi-datasets | Microsoft Learn — Programming PBI semantic models with TOM | Tabular Object Model API for full schema introspection. Required when DMVs blocked in executeQueries. | Metadata fetch path |
| https://data-goblins.com/power-bi/dmvs | Data Goblins — Query DMVs to assess a dataset | XMLA endpoint required for `$SYSTEM.TMSCHEMA_*` DMVs (PPU minimum). | Schema fetch requires XMLA read endpoint |
| https://medium.com/data-science-collective/intent-driven-natural-language-interface-a-hybrid-llm-intent-classification-approach-e1d96ad6f35d | Medium — Hybrid LLM + intent classification | Pattern: embedding classifier → templates first, LLM raw-gen fallback on miss. Best cost/coverage trade-off. | Recommended architecture pattern |

### Third-party landscape

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://docs.thoughtspot.com/cloud/latest/connections | ThoughtSpot Embrace — Connections | Live-query over Snowflake/BigQuery/Databricks etc. **Does NOT integrate with PBI semantic models.** Replaces PBI's model. | Confirms NL-over-PBI is an open market gap |
| https://www.pyramidanalytics.com/lp/genbi/ | Pyramid Analytics GenBI | Own semantic layer (Snowflake/Databricks/Fabric/SAP). Not PBI-integrated. | Same — competitors sidestep PBI |
| https://www.sigmacomputing.com/product/ai | Sigma AI | NL over Snowflake Semantic Views + dbt Semantic Layer. Not PBI. | Same gap |
| https://www.atscale.com/use-cases/universal-semantic-layer/ | AtScale Universal Semantic Layer | Sits UNDERNEATH PBI (XMLA endpoint), not OVER PBI's model. | Inversion — confirms gap remains |
| https://python.langchain.com/docs/integrations/toolkits/powerbi/ | LangChain — Power BI toolkit | NL→DAX→executeQueries agent. Production-ready with reasoning model + grounded schema. | Existing OSS pattern PulsePlay can adapt |
| https://github.com/microsoft/powerbi-modeling-mcp | Microsoft — Power BI Modeling MCP | Official MCP server; "query and validate DAX" against model. Honors Fabric RBAC. | Microsoft-blessed pattern; not RLS-bypass |
| https://platform.claude.com/docs/en/about-claude/pricing | Anthropic — Claude API Pricing | Sonnet 4.6: $3/M input, $15/M output. ~$0.015/query for 3K in + 400 out. | Cost estimate baseline |

### `powerbi-semantic-model` in-tree state (offline-agent findings)

**45% ready to be the Q&A replacement.** Production-ready foundation, missing critical product layers.

**Already implemented:**
- Proxy: `proxy/lib/powerbiDatasetClient.js` (407 lines) — Azure AD auth (SP + user-refresh), single-flight token cache, `executeDax()` + `executeDaxNormalized()`, separate `generateQnAEmbedToken()`
- Proxy: `proxy/lib/powerbiDaxTemplates.js` (262 lines) — 4 hardcoded templates: `top-n`, `aggregate-by`, `trend`, `total`. Slot validation (DAX injection prevention). Markdown output.
- Proxy: `proxy/lib/powerbiQuestionMatcher.js` (332 lines) — Deterministic NL→template router. 5-pass algorithm: measure → time → top-N → dimension → fallback. Brittle (keyword + substring; no fuzzy / semantic).
- Routes: `POST /powerbi/conversations/start`, `GET /powerbi/health`
- Tests: 37 total (20 client + 14 templates + ~17 matcher). All happy-path; no security/scale tests.
- Manifest: `powerbi-dataset-dax` declared with profile schema + RLS fields.

**Missing (P1, must-have for production Q&A replacement):**
1. **RLS at the proxy route** — `executeDax()` accepts `impersonatedUserName` but `/powerbi/conversations/start` doesn't extract user identity from request headers. Per Microsoft docs, executeQueries requires OAuth On-Behalf-Of for RLS datasets (SP blocked entirely).
2. **Frontend question-input UI** — No PulsePlay surface for user typing. Backend route only. Q&A has UI; semantic-model doesn't.
3. **Template extensibility** — 4 templates hardcoded in JavaScript. Deployers need code patch to add domain-specific patterns.
4. **Matcher robustness** — Brittle on partial measure names, ambiguous questions, non-English. No fuzzy matching / semantic similarity.
5. **Result pagination / row cap** — No `TOPN` wrapper. Unbounded queries could OOM.

**Missing (P2, nice-to-have):**
- Probe caching with TTL management
- User-facing error messages (current path returns raw Power BI errors)
- Streaming/progress
- Security tests (DAX injection edge cases, scale)

### Recommended hybrid architecture (consolidated from all 3 agents)

**Pattern:** Tier 1 templated DAX → Tier 2 grounded LLM raw-DAX → Tier 3 reasoning-model retry on validator failure.

| Layer | What | Why |
|---|---|---|
| Tier 1 | Existing 4 templates + matcher | 80% of common questions, deterministic, $0 LLM cost, ~200ms p50 |
| Tier 2 | Claude Sonnet 4.x (Bedrock) raw-DAX with TMDL grounding | Long-tail coverage; ~$0.015/query; ~3s p50 |
| Tier 3 | GPT-5 / o3-mini reasoning escalation on Tier 2 validator failure | <5% of queries; ~$0.07/query; 6-9s p95 |
| Validator | AST parse + function whitelist + dry-run before execute | Catches DAX hallucination failure modes documented in DAXBench |
| Grounding | TMSCHEMA cached 24h (fetched via XMLA read, PPU minimum) | Per DAXBench: grounded measure descriptions move accuracy from 50%→90% |
| RLS | OAuth On-Behalf-Of (user-delegated), NOT Service Principal | Hard Microsoft constraint: SP + RLS = blocked on executeQueries |
| Caching | 3 layers: semantic question (1h, per-RLS-bucket) / generated DAX (24h) / result-set (60s) | Cuts LLM bill ~40%; respects data freshness |
| Cost (100 users × 10 q/day, blended w/ cache) | ~$200-500/month | Production-viable for an internal org |
| Latency (p50 / p95) | 3s / 6-9s (non-reasoning) | Below 10s "business user tolerance" |

### Major risks (named honestly)

1. **120 q/min/user tenant cap.** Cannot be raised by P-SKU. If assistant gets popular, 429s before budget. **Plan XMLA-endpoint fallback Day 1** (requires PPU minimum).
2. **executeQueries returns no column-type metadata.** Type inference from JSON values is fragile (dates vs numbers vs currency). **Lift types from cached TMSCHEMA, not from result.**
3. **OBO requires PBI user to have dataset access.** PulsePlay cannot grant what user doesn't have. Org needs workspace-membership governance for the assistant to be useful broadly.
4. **No SP+RLS path = no headless batch.** Scheduled "morning briefing" features cannot reuse this connector → need different design (pre-computed materialized briefings under a service-account workspace).
5. **LLM DAX hallucination floor:** even reasoning models hit ~10% failure on novel questions. Validator catches some; user-facing recovery UI needed for the rest.

### Decision recorded 2026-05-22 (pending user direction)

The architecture is sound and PulsePlay would be filling a real market gap (no major third-party tool does NL over PBI semantic models). The work to make it production-ready is ~10-15 focused hours across the 5 P1 items.

---

## 2026-05-22 — Power BI Q&A readiness assessment + deprecation finding (CRITICAL)

**Context.** User asked "every leaf should be checked no leaf unturned" on Power BI Q&A readiness as an AI source for PulsePlay. 5 parallel agents (2 offline + 3 online) ran the full 7-step research-first cycle. **The single most important finding: Microsoft officially deprecated Power BI Q&A on 2025-12-01 with retirement on 2026-12-31.**

### Authoritative Microsoft sources (deprecation evidence)

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://powerbi.microsoft.com/en-us/blog/deprecating-power-bi-qa/ | Power BI Updates Blog — Deprecating Power BI Q&A (2025-12-01) | **OFFICIAL ANNOUNCEMENT.** Q&A retired entirely December 2026. ALL surfaces (reports / dashboards / mobile / embedded / Q&A Setup). Migration target: Copilot. | The single most-load-bearing fact in this research |
| https://mc.merill.net/message/MC1218421 | Microsoft 365 Message Center notice MC1218421 (2026-01-16) | Tenant-admin notice with hard end-of-life 2026-12-31. Includes the `powerbi.qna.embed()` JS SDK path. | Confirms enterprise-customer-facing sunset date |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-copilot-enhancements | Microsoft Learn — Enhance Q&A with Copilot | Microsoft's named migration path. Q&A docs now lead with red deprecation banner. | Migration architecture target |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/qanda | Microsoft Learn — Q&A in Power BI embedded analytics | Embed surface: `type:'qna'`, single dataset only, two modes (Interactive / ResultOnly). Auth: AAD token OR embed token. | The specific surface PulsePlay implements at `/powerbi/qna` |
| https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/embed-q-and-a | Microsoft Learn — Embed a Q&A visual (JS SDK reference) | `ILoadQnaConfiguration` shape; `setQuestion(string): Promise<void>`; `visualRendered` event; **no new features 2024-2026** (pure maintenance mode). | Confirms zero Microsoft investment in Q&A SDK |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-advanced | Microsoft Learn — Edit Q&A linguistic schema | `.lsdl.yaml` format, authored in Power BI Desktop ONLY, no programmatic deploy API. **Now opens with deprecation banner.** | Why investing in linguistic-schema tooling is a stranded asset |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-limitations | Microsoft Learn — Q&A limitations | Object-level security unsupported on AAS live-connect; composite models only index import/DirectQuery; opaque "We weren't able to load suggestions" failures. | Practical failure modes |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-tokens | Microsoft Learn — Permission tokens for embed | A/EM/P-SKU for embed-for-customers; F64+/Pro/PPU for embed-for-organization. Q&A NOT "free" for SaaS. | Licensing reality check |
| https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction | Microsoft Learn — Copilot for Power BI overview | Migration target. Available F2+ since 2025-04-28. **NOT yet supported in App-Owns-Data / embed-for-customers JS SDK**. | The migration gap that creates a "dead zone" risk |
| https://learn.microsoft.com/en-us/fabric/enterprise/fabric-copilot-capacity | Microsoft Learn — Fabric Copilot Capacity | F2+ availability for Copilot (loosened 2025-04-28). Excludes trial SKUs. Region-gated. | Copilot license gating for the migration |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/cloud-rls | Microsoft Learn — Cloud RLS with embedded | `effectiveIdentity` (username + roles) passed at `GenerateToken` time; RLS applies to Q&A queries. | RLS is supported; that's not the issue |
| https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/refresh-token | Microsoft Learn — Refresh access token in Power BI embedded | Embed-for-customers (app-owns-data) does NOT support automatic token refresh in client ≥2.20.1. Multi-tenant SaaS must hand-roll. | PulsePlay's existing 5-min-before-expiry refresh in PowerBiQnA.tsx is correct |
| https://powerbi.microsoft.com/en-us/blog/power-bi-january-2026-feature-summary/ | Power BI January 2026 Feature Summary | Wave 2 release notes confirming Copilot consolidation. Zero Q&A entries. | Microsoft investment signal (silence on Q&A is the signal) |

### Practitioner + community sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.magnetismsolutions.com/news/power-bi-qampa-to-retire-by-december-2026-what-you-need-to-know | Magnetism Solutions — Power BI Q&A to Retire | Independent confirmation of Dec 2026 sunset. | Validates Microsoft announcement |
| https://sumproduct.com/news/no-more-qa-in-power-bi/ | SumProduct — No More Q&A in Power BI | MVP reaction: matter-of-fact, no nostalgia. | Sentiment signal: community already moved on |
| https://medium.com/@kyle.hale/the-5-key-differences-between-databricks-genie-and-power-bi-copilot-67ea663e128e | Kyle Hale (Databricks) — Genie vs Power BI Copilot | Genie answers across full semantic model + emits SQL; Copilot is scope-bounded to existing visuals. **Q&A isn't even in his shortlist** — already legacy. | Comparative strategic context |
| https://community.fabric.microsoft.com/t5/Developer/Embedded-Q-amp-A-only-displays-quot-We-weren-t-able-to-load/m-p/327419 | Fabric Community — Embedded Q&A loading failures | Opaque "We weren't able to load suggestions" failures, no usable error envelope. | Failure mode in production |
| https://github.com/microsoft/powerbi-client-react | microsoft/powerbi-client-react (official) | Lists `qna` as supported type. v2.0.0 (Jan 2025) is last release; no Q&A-specific changes. **No dedicated Q&A sample in the official demo.** | Microsoft's own investment signal |
| https://venturebeat.com/data-infrastructure/snowflake-launches-cortex-analyst-an-agentic-ai-system-for-accurate-data-analytics | VentureBeat — Snowflake Cortex Analyst (vendor benchmark) | Cortex Analyst ~90% accuracy vs Genie ~79% vs raw GPT-4o ~51% on text-to-SQL. Q&A not benchmarked. | Q&A is pre-LLM technology |
| https://www.neenopal.com/blog/NaturalLanguageProcessing | NeenOpal — Q&A NLP analysis | Q&A's traditional NLP cannot reason, cannot multi-step, depends on hand-tuned synonyms. | Q&A's intrinsic ceiling |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-best-practices | Microsoft Learn — Q&A best practices | Linguistic schema authoring "requires time and effort" with ongoing synonym maintenance. | Why authoring is high-cost low-payback |
| https://arxiv.org/abs/2404.14618 | arXiv 2404.14618 — Small model fallback / cost routing | Up to 40% fewer big-model calls with hybrid routing. Patterns apply to LLM-LLM, not Q&A-LLM. | Hybrid pattern doesn't help here |

### PulsePlay in-tree state (offline-agent findings)

**Already implemented (75% scaffolded):**

| Layer | Where | Status |
|---|---|---|
| Proxy route | [proxy/server.js:5969](../../proxy/server.js) `POST /powerbi/qna/embed-token` | Production-ready. `llmCallCount: 0` audit-logged. |
| Embed-token mint | [proxy/lib/powerbiDatasetClient.js:342](../../proxy/lib/powerbiDatasetClient.js) `generateQnAEmbedToken()` | Calls `/v1.0/myorg/groups/{id}/datasets/{id}/GenerateToken`. Supports RLS. |
| Connector manifest | [proxy/lib/connectorManifests.js:98](../../proxy/lib/connectorManifests.js) `powerbi-dataset-qna` | Marked `maturity: "beta"`, `capabilities.llm: false`. |
| Frontend client | [playground/src/lib/powerbiQnAClient.ts](../../playground/src/lib/powerbiQnAClient.ts) | Sanitizes profile names; handles Problem+JSON errors. |
| Embed component | [playground/src/components/PowerBiQnA.tsx](../../playground/src/components/PowerBiQnA.tsx) | Lazy-loads `powerbi-client` SDK; 5-min-before-expiry token refresh. |
| Full-page route | [playground/src/powerbi/PowerBiQnARoute.tsx](../../playground/src/powerbi/PowerBiQnARoute.tsx) | Mounted at `/powerbi/qna`. |
| Settings launcher | [playground/src/settings/groups/AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Conditional Leaf when `isPowerBiSemanticModel === true`. |
| Tests | proxy 5 + frontend 7 (total 12) | All passing. |

**Missing (25% — not catastrophic):**

| Layer | Where | Status |
|---|---|---|
| Pulse-tab integration | Pulse visual `activeTab` state machine | Would be 3rd tab alongside Chat / Insights. Deferred per HANDOVER. |
| Connector registry entry | [playground/src/pulse/backend/connectorRegistry.ts](../../playground/src/pulse/backend/connectorRegistry.ts) | Intentionally absent — Q&A isn't an "AI connector," it's Microsoft's NLP in their tenant. |
| Author first-time setup form | Settings UI | Today: must configure `powerbi-semantic-model` profile FIRST, then "Power BI Q&A" Leaf appears. |
| `/powerbi/qna/health` endpoint | proxy | Spec exists in S2 contract; not yet built. |
| **EOL countdown marker** | UI + docs | **NEW REQUIREMENT** — surface scheduled for retirement 2026-12-31; users + authors must know. |

### Synthesis takeaway

- **Microsoft retires Power BI Q&A on 2026-12-31.** 7 months from today. ALL surfaces — including the `powerbi.qna.embed()` JS SDK path PulsePlay uses.
- **PulsePlay's existing Q&A implementation is 75% complete** and production-ready for the next 7 months. The proxy embed-token mint, the React component, the full-page route — all work.
- **Practitioner community has already migrated to Copilot.** Zero recent (2025-2026) third-party Q&A case studies. No MVP defends Q&A. Microsoft has shipped no Q&A features since 2024.
- **Migration target (Copilot) has a gap:** Copilot is NOT yet supported in App-Owns-Data / embed-for-customers JS SDK. There may be a dead zone between Dec 2026 (Q&A off) and Copilot-for-ISV-embed ship date.
- **PulsePlay's `powerbi-semantic-model` backend (already shipped as #10)** is the durable replacement for "deterministic NL over PBI" use cases. No Microsoft dependency. No sunset.

### Decision recorded 2026-05-22 (pending user direction)

**Recommended path (all 5 agents converge):**

1. **Keep the existing Q&A surface as a tactical bridge through Dec 2026.** Don't delete what works.
2. **Add an EOL countdown to the UI** + a banner in Settings → AI → Power BI Q&A: *"Microsoft is retiring this feature on December 31, 2026. PulsePlay will continue to mint embed tokens until that date."*
3. **DO NOT invest in linguistic-schema authoring, featured-questions curation, or Q&A-specific tooling.** Stranded asset.
4. **DO NOT add Q&A to the Pulse-tab system as a permanent 3rd tab.** Acceptable as a transitional setting.
5. **Mark `proxy/connectors/powerbi-dataset-qna` as `EOL: 2026-12-31`** in the manifest. Plan deletion for Q1 2027.
6. **Plan Copilot-for-PBI-embed adoption** when Microsoft ships ISV/SaaS support. Until then, route durable "NL over PBI" through the existing `powerbi-semantic-model` backend.

---

## 2026-05-22 — G3 initial-render flicker: preventing CLS in staged AI chat reveal

**Context.** User reported the Ask Pulse briefing card "first sync was off" — initial render flicker, skeleton → partial → final visible jump. Offline agent mapped six concrete in-tree culprits; online agent researched industry consensus on streaming-response stability.

### Industry consensus sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.smashingmagazine.com/2026/04/designing-stable-interfaces-streaming-content/ | Smashing Magazine — Designing Stable Interfaces For Streaming Content | Five patterns: append-don't-rebuild, rAF buffering, defer-incomplete-structures, scroll-intent threshold, reduced-motion one-paint. | Streaming reveal architecture |
| https://web.dev/articles/content-visibility | web.dev — content-visibility | `content-visibility: auto` + `contain-intrinsic-size: auto <h>` — browser remembers last-rendered size, ideal for stacked briefing cards. | Section-card containment |
| https://web.dev/articles/defining-core-web-vitals-thresholds | web.dev — Defining Core Web Vitals Thresholds | CLS thresholds: 0.1 = good, 0.25 = needs improvement; internal data ≥ 0.15 perceived as disruptive. | Target CLS budget |
| https://uxpatterns.dev/glossary/s/skeleton-screen | UX Patterns — Skeleton Screen | Sizing rules: skeleton must match 95th percentile of content; skeletons shown < 300 ms INCREASE perceived disruption. | Skeleton sizing + min-latency gate |
| https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/ | SitePoint — Streaming Backends & React | Network layer should NEVER directly drive React renders. Buffer outside state, flush snapshots at display cadence. | Cadence-gated reveal pattern |
| https://www.erwinhofman.com/blog/skeleton-loading-and-perceived-performance-cro/ | Erwin Hofman — Skeleton Loading and Perceived Performance | < 300 ms loads anti-pattern; users prefer "instant partial content in a STABLE frame" over "slightly slower full render." | Justification for min-height pre-allocation |
| https://www.npmjs.com/package/react-loading-skeleton | react-loading-skeleton (npm) | Production sizing guidance for skeleton placeholders. | Reference implementation |
| https://playbook.ebay.com/design-system/components/loading-skeleton | eBay Playbook — Loading Skeleton | Match skeleton to FINAL content dimensions, not arbitrary widths. | Eliminates the 92/78/85% width mismatch in PulsePlay's current skeleton |
| https://help.tableau.com/current/online/en-us/pulse_intro.htm | Tableau — About Tableau Pulse | Insight cards have fixed-height frame with "empty insight" affordance — height preserved even when content sparse. | Pre-allocated frame pattern |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Create Smart Narrative | Desktop: placeholder symbols preserve height. Service: placeholders hidden (accepting small CLS at publish-time). | Two-mode rendering reference |
| https://react.dev/reference/react-dom/flushSync | react.dev — flushSync | Synchronous commit; useful to measure DOM before painting next stage. CAVEAT: breaks `<ViewTransition>` + conflicts with router `startTransition`. | Render-batching trade-off |
| https://react.dev/reference/react/ViewTransition | react.dev — ViewTransition | Animates state changes; pairs with `useTransition` for non-urgent reveals. | Optional perceptual polish |

### In-tree culprits (offline-agent findings)

| # | Where | What's wrong | Visibility |
|---|---|---|---|
| 1 | [visual.tsx:10493-10495](../../playground/src/pulse/visual.tsx) skeleton bars at 92% / 78% / 85% | Hardcoded widths don't match final content; visible horizontal jump on swap | HIGH |
| 2 | [visual.less:8123-8150](../../playground/src/pulse/style/visual.less) `.gn-insights-section` | No `min-height`. Placeholder ~49-65px; real content 70-120px+ → vertical jump on swap | HIGH (2-4× height variance) |
| 3 | [visual.less:3488-3490](../../playground/src/pulse/style/visual.less) `.gn-chart-container` | No `min-height`. ECharts mounts, container grows post-render | MEDIUM |
| 4 | [progressIndicator.tsx:50-66](../../playground/src/pulse/progressIndicator.tsx) → placeholder transition | Progress indicator collapses (~120px), cards above jump up before placeholder→content swap | MEDIUM |
| 5 | [visual.less:8131-8157](../../playground/src/pulse/style/visual.less) `.gn-insights-section` animation | 300ms reveal + 6px lift per section; React key change forces DOM recycle | LOW (subtle stutter) |
| 6 | [visual.tsx:10622](../../playground/src/pulse/visual.tsx) `renderSectionBody` | Body content height varies wildly per section type (prose / table / KPI strip / chart) — placeholder doesn't model the variance | HIGH |

### Synthesis takeaway

**Two complementary patterns** (online agent's recommendation):

1. **Pattern 1 (structural, kills CLS):** CSS Grid with `grid-template-rows` + `min-height` per row sized to 95th-percentile content. Skeleton placeholders render INTO the grid rows from the start; content swaps in place. `aspect-ratio` on chart slot + `content-visibility: auto` on section stack so browser memoizes per-section sizes after first render.

2. **Pattern 2 (perceptual, kills the "jump" feel):** Cadence-gated reveal driven OUTSIDE React state. Sections arrive into a buffer; rAF loop commits one stage per ~300 ms tick via `startTransition`. HEADLINE keeps "ship first" priority; rest reveals on fixed rhythm.

Pattern 1 is the cheaper, more durable fix. Pattern 2 makes the feel buttery. **Both compose without conflict.**

**Minimum-viable fix (offline agent's 2 small changes):**

- Add `min-height: 65px` to placeholder sections in CSS.
- Add `min-height: 350px` to `.gn-chart-container` (320 chart + 30 axis overflow).
- Bonus: unify skeleton bar widths to a single consistent `~90%` (eliminates horizontal micro-flicker).

**Acceptance signal:** Web Vitals CLS ≤ 0.1 on briefing render. Manual eye-test: no visible cards jumping during the skeleton → content transition.

---

## 2026-05-22 — Databricks Genie + Unity Catalog column metadata propagation

**Context.** Asked whether the "backend complement to G2" (UC `COMMENT` on columns) would actually translate to friendly chart labels in PulsePlay. Two research agents (offline in-tree + online Databricks docs) ran in parallel. Findings corrected three of my initial guesses.

### Authoritative Databricks sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://docs.databricks.com/aws/en/genie/best-practices | Databricks — Curate an effective Genie Space (Best practices) | *"Genie relies on quality table and column descriptions to understand what the data represents."* UC `COMMENT` IS consumed by Genie — but for prompt context, not result labels. | Corrects initial guess that UC comments weren't used |
| https://docs.databricks.com/aws/en/ai-bi/release-notes/2026 | Databricks — AI/BI release notes 2026 (April 2 entry) | Space authors can set `column_configs.display_name` on **stored** table/view columns. **"Display names appear in query results and in downloaded CSVs."** First-class friendly-label feature, shipped 2026-04-02. STORED COLUMNS ONLY. | The actual lever for backend-driven friendly labels |
| https://docs.databricks.com/aws/en/genie/knowledge-store | Databricks — Build a knowledge store for more reliable Genie Spaces | Knowledge store = friendly column names + canonical metrics + business definitions; scoped to space, doesn't overwrite UC. | Architecture layer for canonical labels |
| https://docs.databricks.com/aws/en/genie/tune-quality | Databricks — Tune Genie Space quality | Column synonyms + format assistance + edit descriptions are space-level annotations distinct from UC. | Space-level annotation surface |
| https://www.databricks.com/blog/data-dialogue-best-practices-guide-building-high-performing-genie-spaces | Databricks blog — From Data to Dialogue: Building High-Performing Genie Spaces | Example SQL queries act as "style templates" — Genie learns preferred alias styles but does NOT guarantee them for LLM-invented derived columns. | Justification for hybrid (backend + frontend) approach |
| https://github.com/databricks-solutions/vibe-coding-workshop-template/blob/main/data_product_accelerator/skills/semantic-layer/03-genie-space-patterns/SKILL.md | Databricks Solutions — Vibe Coding Workshop: Genie Space Patterns | Official guidance: synonyms belong in `column_configs[].synonyms`, NOT in UC `COMMENT` strings; UC `COMMENT` is for business definitions/grain/valid-values. | Separation of concerns between UC and Genie space |
| https://www.aimpointdigital.com/blog/talk-to-your-data-but-make-it-count-operationalizing-the-semantic-layer-in-databricks | Aimpoint Digital — Operationalizing the Semantic Layer in Databricks | Practitioner view: semantic layer is plumbing; presentation-layer humanization stays the consumer's responsibility. | Confirms frontend humanization as durable floor |

### Synthesis takeaway

- **UC `COMMENT` does NOT change rendered column names.** It feeds Genie's NL→SQL prompt context (helps Genie pick the right columns + write correct SQL) but doesn't replace the column name in the response shape.
- **The real friendly-label lever is `column_configs.display_name`** (Genie Space annotation, shipped 2026-04-02). Stored columns only — does NOT cover LLM-invented derived columns (the `prev_order_count`, `sales_change_pct`, `margin_change_pp` cases that motivated G2).
- **PulsePlay's plumbing is dead code.** [`genieSpaceTypes.ts:65-68`](../../playground/src/pulse/genieSpaceTypes.ts) defines `ColumnConfig.description` but the proxy strips columns to `{ name, type }` in `enrichQueryResults` and the frontend models `queryResult.columns` as `string[]`. The metadata channel is closed; opening it is a real code change (~3-4 hr).
- **Hybrid is the only viable architecture.** Backend `display_name` for stored columns + frontend humanization for derived columns. Industry consensus across Databricks docs + practitioner blogs treats presentation-layer humanization as the consumer's job regardless of semantic-layer effort.
- **Cost ladder:**
  - UC `COMMENT` on canonical columns: ~30 min in SQL. Doesn't change rendering. Improves Genie SQL quality.
  - Genie Space `display_name` for stored columns: ~1-2 days (Databricks UI work) for a 10-table dataset.
  - Sample SQL queries + SQL Expressions in Genie: ~2-4 hr — *encourages* (doesn't guarantee) LLM to mimic friendly aliasing.
  - PulsePlay code to consume `display_name`: ~3-4 hr (proxy enrichment + frontend type + chart-label override).

### Decision recorded 2026-05-22

User direction (pending — research presented as `(c) Hybrid` recommendation). Backlog framing:

- Frontend G2 humanization (`acc3a89`) remains the floor and ships TODAY.
- Backend `display_name` adoption queued as opportunistic future work — only worth doing alongside an actual Databricks-side Genie space configuration effort.

---

## 2026-05-22 — Azure App Service Configuration Challenges

**Context.** Rajesh asked to attempt Azure App Service hosting after the Databricks Apps deployment and then asked to document the App Service configuration challenges and guidance. The result is [DEPLOY_AZURE_APP_SERVICE.md](../DEPLOY_AZURE_APP_SERVICE.md), a docs-only runbook focused on monorepo/Oryx build, startup command, App Service Authentication vs PulsePlay proxy auth, Key Vault references, diagnostics exposure, package layout, scale, slots, and logging.

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs | Microsoft Learn — Configure Node.js apps in Azure App Service | Node version, startup command, PM2 foreground mode, app settings, logs, and URL rewrites are the key Node App Service levers. | Runtime/startup guidance |
| https://learn.microsoft.com/en-us/azure/app-service/deploy-zip | Microsoft Learn — Deploy files to Azure App Service | ZIP contents must be at the app root; deployment uses Kudu and can run build automation. | ZIP/package-layout guidance |
| https://learn.microsoft.com/en-us/azure/app-service/configure-common | Microsoft Learn — Configure an App Service app | App settings are injected as environment variables, encrypted at rest, and trigger restarts when changed. | App settings guidance |
| https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings | Microsoft Learn — Environment variables and app settings in Azure App Service | App Service exposes many platform env vars and Key Vault reference status metadata. | Config diagnostics |
| https://learn.microsoft.com/en-gb/azure/app-service/app-service-key-vault-references | Microsoft Learn — Use Key Vault references as app settings | Managed identity plus Key Vault Secrets User access lets app settings resolve secrets without code changes. | Secret storage guidance |
| https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization | Microsoft Learn — Authentication and authorization in Azure App Service | Easy Auth can require authentication before requests reach the app and injects identity headers, but app-level authorization still needs deliberate design. | Auth challenge section |

---

## 2026-05-22 — Chart axis label humanization + value formatting (G2)

**Context.** Ask Pulse Chart tab renders raw SQL column names like `prev_order_count`, `sales_change_pct`, `margin_change_pp` in legends + axes; values display as raw floats (`0.05747126436781609`). Most of these are Genie-invented SQL aliases (not stable DB columns), so backend-only solutions don't fully cover the case. Research scope: industry humanization conventions + value formatting per unit type.

### Industry humanization + formatting sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/pro/desktop/en-us/data_clean_adm.htm | Tableau — Field Type Detection and Naming Improvements | Auto-converts underscores to spaces + Title Case; force-uppercases short letter-only tokens (`QTY`). Tableau-style: don't expand prefixes you can't prove. | Algorithmic fallback (tier 3) — snake_case → Title Case |
| https://docs.thoughtspot.com/cloud/10.8.0.cl/worksheets | ThoughtSpot Cloud — Worksheets | Automatic Title Case + underscore replacement on column add. Also auto-generates synonyms for NL search. | Synonym layer (future enhancement) |
| https://cloud.google.com/looker/docs/reference/param-field-label | Looker — `label` for fields | First-class label/synonym field on every column; defaults to field name if author hasn't supplied one. Labels are authorial, not algorithmic. | Backend (UC comment) path |
| https://tabulareditor.com/blog/naming-conventions-for-power-bi-semantic-models | Tabular Editor — Naming Conventions for Power BI Semantic Models | Recommended pattern: `<Metric> <Modifier> <Unit?>` (e.g. "Sales YoY Change", "Gross Margin %"). Modifier first, unit last. | Registry entries for `_yoy`/`_qoq`/`_change`/`_pct` |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-tooling-advanced | Microsoft Learn — Edit Q&A Linguistic Schema | Power BI Q&A uses a linguistic schema (synonyms + labels) authored alongside the model. | Backend semantic-model parallel path |
| https://docs.sqlbi.com/dax-style/dax-naming-conventions | SQLBI — DAX Naming Conventions | YoY/QoQ/MoM/WoW/YTD/QTD/MTD as standard recognized acronyms — preserve casing. | Registry casing rules |
| https://service-manual.ons.gov.uk/content/numbers/percentages | ONS Service Manual — Percentages and Percentage Points | "Percentage points" in narrative; " pp" compressed for chart labels. Always show unit somewhere. | Value formatter for `_pp` suffix |
| https://www.datawrapper.de/academy/custom-number-formats-that-you-can-display-in-datawrapper | Datawrapper — Custom Number Formats | `0.0%` for percent, `$0,0.[00]a` for abbreviated currency, `123.4k` for big counts. Always show the unit. | Value formatter targets |
| https://d3js.org/d3-format | D3 — d3-format spec | De-facto standard for format-spec mini-language; ECharts wraps similar conventions in `formatter`. | Format string syntax for `axisLabel.formatter` |
| https://docs.getdbt.com/best-practices/how-we-style/1-how-we-style-our-dbt-models | dbt — How we style our dbt models | Friendly form in `meta:` / `description:` YAML; BI layer reads it. | Long-term backend parallel path |

### Synthesis takeaway

- **Three-tier cascade**: (1) Registry of common analytics tokens (`prev → Prior`, `pct → %`, `yoy → YoY`, `cnt → Count`, `amt → Amount`, `pp → pp`) — deterministic, audit-friendly, zero LLM cost. (2) LLM-emitted `columnLabels: { raw: friendly }` map — opt-in, validator-gated. (3) Algorithmic snake → Title Case fallback — guarantees no raw `prev_order_count` ever displays.
- **Value formatting per unit** keyed off the same suffix registry: `_pct/_rate` → d3 `.1%` (`0.057 → 5.7%`); `_pp` → `+.1f pp`; `_amt/_revenue/_cost` → `$,.0f` with SI prefix on axes; `_count/_qty/_cnt` → `,.0f`.
- **Gold mine**: PulsePlay's `chartAutoPick.ts` already has `detectColumnUnit()` + `UNIT_LABELS` from the chart-rationale upgrade. Currently only used in popover text; needs wiring into `buildEChartsOption.ts` axis + tooltip formatters.
- **Brutal-honesty caveat**: Without a semantic model, PulsePlay cannot perfectly distinguish `_change` (delta) from `_change_pct` (ratio) from `_change_pp` (already in percentage points). Registry MUST encode all three explicitly; ambiguous columns get a no-transform passthrough rather than a wrong guess.

---

## 2026-05-22 — Auto-route vs click-to-switch when chart shape is wrong (G4)

**Context.** Ask Pulse chart-rationale popover currently emits informational warnings like "Only 1 row of data — KPI tile shows the value more clearly. Try: KPI tile" but offers no clickable action. The question: silent auto-route to suggested view, OR add a one-click button? Research scope: industry conventions + UX research on auto-switching trust.

### Industry chart-suggestion sources

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/pro/desktop/en-us/buildauto_showme.htm | Tableau — Use Show Me to Start a View | "Show Me doesn't automatically switch chart types when data changes." Highlights suggested chart in orange outline; user clicks to apply. | Decision against auto-route |
| https://docs.thoughtspot.com/6.0/end-user/search/lock-chart-type.html | ThoughtSpot — Disable automatic selection of chart type | Auto-picks "best fit" on FIRST render only; explicit lock once user overrides. "Disable automatically select my chart" setting. | Stickiness pattern (session-scoped, not cross-session) |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Smart Narrative Visual | "Try: KPI card" surfaces as text/button in Copilot pane; never silently swaps a visual. | Click-to-switch button pattern |
| https://support.google.com/looker-studio/faq/7219787 | Looker Studio Troubleshooting (data shape mismatch) | Shows error empty state on mismatch; user picks from chart catalog manually. No auto-suggest button in the warning. | Confirms "user picks, not the system" |
| https://vizml.media.mit.edu/assets/2019-VizML-CHI.pdf | VizML (CHI 2019) — ML Approach to Visualization Recommendation | Academic — ML-based viz recommendation; emphasizes the human-in-the-loop principle for AI-suggested charts. | Justification for keeping user in control |
| https://idl.cs.washington.edu/files/2023-Draco2-VIS.pdf | Draco 2 — Extensible Platform to Model Visualization Design | Modeling viz design; same principle of suggest-then-apply. | Theoretical backing |
| https://blog.logrocket.com/ux-design/user-preference-settings-ai-powered-designs | LogRocket — How much choice should we give users in AI-powered designs? | "UX designers should offer ways to override or adjust AI-predicted user interactions." | Override-ability is a user right |
| https://docs.thoughtspot.com/software/10.1.0.sw/chart-types | ThoughtSpot — Chart Types | Inventory of chart types + when each fits. | Reference for suggestedView → ChartKind mapping |
| https://www.datawrapper.de/charts | Datawrapper — Charts overview | Opinionated chart selection at CREATION only; never re-routes mid-edit. | Confirms "no mid-edit auto-switch" |
| https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design | Tabular Editor — Better KPI Visualizations in Power BI | KPI card best practices — when KPI is the right choice over a chart. | KPI-tile suggestion contexts |
| https://zapier.com/blog/turn-off-smart-compose/ | Zapier — How to turn off Smart Compose | Gmail Smart Compose UX: Tab to accept, keep typing to ignore. Suggest-then-apply, never apply-then-ask-forgiveness. | Pattern parallel to click-to-switch |

### Synthesis takeaway

- **No major BI tool silently auto-switches charts**. Tableau, Power BI, Looker, ThoughtSpot, Datawrapper all explicitly chose against this; they had the same option.
- **Robust pattern**: suggest → one-click apply → easy undo. Mirrors Gmail Smart Compose (Tab to accept).
- **Stickiness rule**: respect explicit user override for the session/conversation; re-evaluate on a fresh conversation.
- **Severity gradient**: implicit pattern is "escalate the affordance, not the automation" — info = label only, caution = button, error = forced empty state with manual CTA. Never auto-switch.
- **PulsePlay recommendation locked**: click-to-switch button inside warning card. `suggestedView` text becomes `<button>` that calls `setChartType(...)` on the parent. User-confirmed direction 2026-05-22.

---

## 2026-05-22 — Executive briefing card patterns (Ask Pulse narrative regression)

**Context.** Ask Pulse on the deployed Databricks App was rendering executive briefings ("Summarize current performance...") with broken alignment — labels far left, content slammed far right (classic `flex justify-between` accident). Two research agents ran in parallel: industry-standard executive-briefing layouts + design-system component references. The recommended path (option 1: full card with tabs-always-show) was approved by user.

### Industry best-practice patterns

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.tableau.com/current/online/en-us/pulse_insights_platform_insight_types.htm | Tableau Pulse — Insights Platform | One composite card with internal sections; KPI strip on top + stacked AI-narrative sections below. Direct competitor pattern. | Briefing card structure decision |
| https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-smart-narrative | Microsoft Learn — Smart Narrative Visual | Power BI ships the AI narrative inside a single visual container with internal formatting; no per-section split. | Confirms single-card pattern |
| https://carbondesignsystem.com/patterns/status-indicator-pattern/ | Carbon Design System — Status Indicator Pattern | Red = critical, orange = threshold breached, yellow = non-service-affecting warning, green = success. Pairs colour with directional symbols for a11y. | Colour semantics for risk/opportunity/recent-change |
| https://carbondesignsystem.com/components/notification/style/ | Carbon Design System — Notification Style | Inline notification = coloured left accent strip + neutral bg (alt to tinted-bg pattern). | Border-treatment alternate pattern |
| https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design | Tabular Editor — KPI Card Best Practices | Pair colour with directional arrows/icons so signal survives colour-blindness. Specific KPI-card layout numbers. | KPI tile structure + a11y rationale |
| https://www.datawrapper.de/blog/text-in-data-visualizations | Datawrapper — Text in Data Visualizations | Labels must sit "as close to the elements they explain as possible." The two-column label-left/content-right-aligned pattern is the canonical anti-pattern for narrative content. | Justification for replacing flex with grid; never use `space-between` |
| https://medium.com/eightshapes-llc/cards-and-composability-in-design-systems-8845ecbee50e | Eight Shapes — Cards and Composability | Card-as-stacked-container pattern: media/header > title > body > actions. Industry convention. | Card-internal section ordering |
| https://m1.material.io/components/cards.html | Material Design — Cards | Foundational stacking pattern; 16-24px padding; rounded corners; subtle shadow. | Outer card sizing |
| https://www.stan.vision/journal/ui-card-design-examples-best-practices-and-common-patterns | Stan.vision — UI Card Design Patterns | Body text ≥16px for accessibility; standard padding numbers (24px outer, 16px section gaps). | Typography sizing decision |

### Design-system component references

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://ui.shadcn.com/docs/components/alert | shadcn/ui — Alert | Uses **CSS grid** (`grid-cols-[auto_1fr]`), NOT flex. 16px padding × 12px vertical, 8px radius, 16px icon, 12px icon→text gap. The single biggest layout fix. | Replaces broken `.gn-kpi-row` flex pattern |
| https://ant.design/components/alert/ | Ant Design — Alert | Hex palette: info #e6f4ff/#91caff · success #f6ffed/#b7eb8f · warning #fffbe6/#ffe58f · danger #fff2f0/#ffccc7. Tinted bg + 1px coloured border. | Section bg/border palette |
| https://www.tremor.so/docs/ui/card | Tremor — Card | KPI tile spec: `rounded-lg border p-6 shadow-xs` (24px internal padding). | KPI tile sizing |
| https://tailwindcss.com/plus/ui-blocks/application-ui/data-display/stats | Tailwind UI — Stats / KPI blocks | KPI strip pattern: label (sm muted) over big metric (text-3xl bold), inline directional arrow + delta, prior period in parens text-muted sm. | KPI tile content layout |
| https://refine.dev/blog/material-ui-card/ | Refine — MUI Card spec | Standardised padding numbers (24px outer, 16-20px section gaps, 8px icon→label). | Spacing tokens |
| https://www.figma.com/community/file/879668624364329411/insight-cards | Figma community — Insight Cards | Concrete Figma template with full insight-card dimensions + variants. | Design reference; download for finer specs if needed |
| https://www.figma.com/community/file/1130917765288346079/kpi-charts | Figma community — KPI Charts | Figma template for KPI-with-trend cards. | KPI tile visual reference |
| https://impeccable.style/antipattern-examples/thick-border-cards | Impeccable Style — Thick Border Cards anti-pattern | 8px+ accent stripes are an anti-pattern; 4px max for left-border accents. | Constrains border width |

### Synthesis takeaway

- **Layout primitive:** CSS Grid `grid-cols-[auto_1fr]`, never `flex justify-between` for label+content rows.
- **Structure:** Single composite card; sections stacked vertically (KPI strip → headline → risk → opportunity → recent change → action); 16-20px between sections.
- **Colour palette (final hex):** Risk amber/red bg + border (`#fffbe6/#ffe58f` or `#fff2f0/#ffccc7`); Opportunity `#f6ffed/#b7eb8f`; Recent change `#e6f4ff/#91caff`; Action filled `#1a6fd4` solid + white text.
- **Icons:** 16px Lucide-style (`alert-triangle`, `trending-up`, `activity`, `arrow-right`), 8px gap to label.
- **Typography:** Section labels 12-13px uppercase 600 weight; body 14-16px; KPI primary 28-32px 700 weight.
- **Padding:** Outer card 24px; section gaps 16-20px; icon→label 8px; label→body 4-6px.

---

## 2026-05-22 — Chart rationale popover design (data-shape-aware narrative + warnings)

**Context.** Earlier same-day session shipped the "Why did we pick this chart?" popover upgrade (commit `d81ef08`). Online research covered competitor patterns + design-system tooltip-popover conventions + Figma component shapes. The full detail is preserved in commit `d81ef08`'s diff + the `docs/research/DWD_FOR_BI_DEEP_SCAN_2026-05-22.md` offline component. Sources retroactively logged here for future re-verification.

### Industry best-practice patterns (chart rationale / "why this chart")

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.tableau.com/visualization/data-visualization-best-practices | Tableau — Data Visualization Best Practices | Auto-pick rationale must explain chart choice in user's data terms, not just rule names. | Personalised narrative ("Your data has X rows and Y numeric columns...") |
| https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-q-and-a-explorer | Power BI Q&A Explorer | Chart suggestions surface alongside the chart itself with a brief why. | Popover anchor pattern (button next to chart, not separate panel) |
| https://cloud.google.com/looker/docs/best-practices/dashboard-design | Looker — Dashboard Design Best Practices | Warning when chart shape doesn't match data shape (mixed units, mixed signs, donut with negatives). | 8 warning templates in `generateWarnings()` |
| https://material.io/components/tooltips/web | Material Design — Tooltips (Web) | Tooltip-popover card sizing: 320-340px width, soft shadow, 12-14px body. | ChartRationalePill popover sizing |
| https://www.untitledui.com/components/alerts | Untitled UI — Alert Components | Severity-coded card with coloured left border + icon + title + body + suggested action. | Warning card structure (info/caution/warning palette) |

### Design-system component references (chart rationale)

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://ui.shadcn.com/docs/components/tooltip | shadcn/ui — Tooltip | Anchor + 6px gap + soft shadow; click-to-pin pattern (hover for ephemeral, click for sticky). | ChartRationalePill open/close behaviour |
| https://ant.design/components/popover/ | Ant Design — Popover | `below-left` and `below-right` placements; auto-flip when clipped. | `popoverPlacement` prop in ChartRationalePill |
| https://m3.material.io/styles/color/the-color-system/color-roles | Material 3 — Color Roles | `errorContainer` / `secondaryContainer` token usage for warning bands. | Warning palette CSS vars (`--pp-caution-bg`, `--pp-warning-bg`) |

### Synthesis takeaway (chart rationale session)

- Speak about the AUTO-pick, never the user override (anti-pattern: "you picked X, we'd pick Y" framing).
- Sourced narrative: short narrative + sibling alternatives + structured warnings + "avoid for this shape" KB rule.
- Severity-coded warning cards (info=blue, caution=amber, warning=red), left-border + icon + title + body + optional "Try:" suggestion.

---

## How to extend this doc

When a research agent returns web findings:
1. **Don't replace** existing entries — append a new dated section at the bottom.
2. **One row per URL.** If two agents cited the same URL in the same session, list it once in this doc but note both contexts.
3. **Include a takeaway sentence** — future sessions need to know *why* this URL mattered without re-reading the source.
4. **Cross-link to where it was applied** — commit SHA, design proposal file, or feature memory.
5. **Update the topic index** at the top.

If a URL turns out to be dead, broken, or wrong, add a `*[verified-dead 2026-MM-DD]*` annotation but do not remove — the dead URL is itself evidence.

---

## 2026-05-22 — Azure Databricks Apps Enterprise Installation Guide

**Context.** Rajesh asked for a single installation guide after the first live PulsePlay Databricks Apps deploy was not straightforward. A research agent inspected the local deploy guide, long-form lessons, app manifest, and older proxy-only README while the main session verified current Azure Databricks Apps docs. The result is the refreshed [DEPLOY_DATABRICKS_APP.md](../DEPLOY_DATABRICKS_APP.md) plus a superseded signpost in [proxy/README.databricks-app.md](../../proxy/README.databricks-app.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/ | Microsoft Learn — Azure Databricks Apps overview | Apps run on Databricks serverless infrastructure, integrate with UC/SQL/OAuth, are billed while running, and require Premium workspace support. | Prerequisites and scope |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/configure-env | Microsoft Learn — Set up Databricks Apps workspace and development environment | Workspace must be in a serverless-supported region and network policy must allow outbound access to `*.databricksapps.com`; CLI 0.229+ required. | Enterprise prerequisites and network blockers |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/key-concepts | Microsoft Learn — Key concepts in Databricks Apps | App resources are environment-specific and app permissions are separate from app/user authorization. | Auth model and resource ownership |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/deploy | Microsoft Learn — Deploy a Databricks app | Git deploys can target branch, tag, or commit; private repos require SP Git credential; troubleshooting calls out env/resource resolution and Private Link egress. | Create/deploy sequence |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/app-runtime | Microsoft Learn — Configure app execution with app.yaml | `app.yaml` owns `command` and `env`; apps must receive runtime config through env/resource references. | `app.yaml` guidance |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/environment-variables | Microsoft Learn — Define environment variables in a Databricks app | Use `valueFrom` for resource-backed values; secrets should never be hardcoded in app config. | Secret/resource binding section |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/resources | Microsoft Learn — Add resources to a Databricks app | Add resources through app configuration/UI or bundles; app SP needs least-privilege access to existing resources. | Resource binding stance |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/auth | Microsoft Learn — Configure authorization in a Databricks app | User authorization is public preview and requires scopes/consent; app authorization uses the app SP. | Auth model decision table |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/permissions | Microsoft Learn — Configure permissions for a Databricks app | `CAN USE` / `CAN MANAGE` app permissions do not equal data authorization; apps cannot be anonymous/public. | Permission and access checklist |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/monitor | Microsoft Learn — Logging and monitoring for Databricks Apps | Use stdout/stderr, external logging/APM where needed, and system audit tables for app security events. | Ops checklist |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/best-practices | Microsoft Learn — Best practices for Databricks Apps | App compute is for UI/control plane; bind to `0.0.0.0:$DATABRICKS_APP_PORT`, avoid privileged operations, minimize cold start. | Challenge matrix |
| https://learn.microsoft.com/en-us/azure/databricks/resources/limits | Microsoft Learn — Azure Databricks resource limits | Enterprise resource limits differ from Free Edition; Databricks Apps quota is workspace-scoped. | Free Edition vs enterprise caution |

---

## 2026-05-22 — Azure App Service Deep Deployment Findings

**Context.** Rajesh asked for a deep multi-agent research document before planning a clean PulsePlay deployment on Azure App Service. Four research slices covered repo/package readiness, current Microsoft App Service docs, Azure account/cost guardrails, and enterprise auth/security. The result is [AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md](AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans | Microsoft Learn — Azure App Service plans | Free/Shared use shared compute; Basic+ uses dedicated compute. | SKU recommendation and F1/B1 framing |
| https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits | Microsoft Learn — Azure subscription/service limits | App Service Free has tight CPU/storage limits and Linux support differs by tier. | Personal-account cost guardrails |
| https://azure.microsoft.com/en-us/pricing/details/app-service/linux/ | Microsoft Azure — App Service on Linux pricing | Linux F1 free is smoke-only scale; B1 is the lowest practical paid sandbox. | SKU/cost caveats |
| https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs | Microsoft Learn — Configure Node.js apps in App Service | Node apps need dependencies, startup command, PM2 foreground mode if used, and build automation awareness. | Runtime/startup/package plan |
| https://learn.microsoft.com/en-us/azure/app-service/deploy-zip | Microsoft Learn — Deploy files to App Service | ZIP package contents must be rooted at the app root, not a nested repo folder; Kudu can run build automation when enabled. | Curated ZIP package guidance |
| https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings | Microsoft Learn — App settings/env var reference | `SCM_DO_BUILD_DURING_DEPLOYMENT` enables ZIP build automation; platform settings are exposed as env vars. | App settings checklist |
| https://learn.microsoft.com/en-us/azure/app-service/configure-common | Microsoft Learn — Configure App Service app settings | App settings are environment variables and encrypted at rest. | Lab settings vs production secret posture |
| https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization | Microsoft Learn — App Service Authentication / Easy Auth | Easy Auth can authenticate before app code, but app authorization still needs deliberate design. | Easy Auth vs proxy-auth blocker |
| https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities | Microsoft Learn — Access user claims in app code | App Service can inject authenticated user claims headers. | Possible future Easy Auth header trust mode |
| https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity | Microsoft Learn — Managed identity in App Service | Managed identity represents the app for Azure resources, not the end user. | Key Vault and per-user auth distinction |
| https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references | Microsoft Learn — Key Vault references as app settings | Key Vault references let App Service resolve secrets via managed identity; network-restricted vaults need VNet routing. | Production secrets guidance |
| https://learn.microsoft.com/en-us/azure/app-service/troubleshoot-diagnostic-logs | Microsoft Learn — App Service diagnostic logging | Linux app logs can stream from file system; logging/storage choices can add cost. | Logs/App Insights caution |
| https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account | Microsoft Learn — Avoid charges with Azure free account | Free accounts start with limited-time credit and need portal/billing checks before spend. | Approval gate before resource creation |
| https://learn.microsoft.com/azure/databricks/dev-tools/databricks-apps/auth | Microsoft Learn — Databricks Apps authorization | User authorization can forward a user token and enforce Unity Catalog permissions, but is public preview. | Databricks Apps vs App Service comparison |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/environment-variables | Microsoft Learn — Databricks Apps environment variables | Use `valueFrom` for app resources/secrets instead of plaintext values. | Databricks baseline comparison |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/secrets | Microsoft Learn — Databricks Apps secret resources | Secret resources inject env vars; use separate scopes where possible. | Databricks secret guidance |
| https://learn.microsoft.com/azure/databricks/dev-tools/databricks-apps/networking | Microsoft Learn — Databricks Apps networking | Databricks Apps supports IP lists, private connectivity, NCC, and network policies. | Enterprise hosting comparison |

---

## 2026-05-22 — Power BI DAX / Q&A Enablement Guide

**Context.** Rajesh asked for a research-agent-backed document on what it takes to enable Power BI DAX / Q&A connection for AI in PulsePlay. One read-only agent mapped local code paths while the main session verified current Microsoft docs. The result is [POWERBI_DAX_QNA_ENABLEMENT.md](../POWERBI_DAX_QNA_ENABLEMENT.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries | Microsoft Learn — Datasets: Execute Queries REST API | DAX-only API; tenant setting required; read/build permission required; one query/table; 100K rows / 1M values / 15 MB / 120 req/min/user; service principals not supported for RLS/SSO datasets; INFO/DMV unsupported. | Semantic-model DAX prerequisites, limits, and INFO.* probe risk |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal | Microsoft Learn — Embed Power BI content with service principal and application secret | Service principal setup requires Entra app, optional security group, tenant settings, and workspace access; Microsoft recommends certificates over secrets. | Entra/tenant/workspace checklist |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/generate-embed-token | Microsoft Learn — Generate an embed token | GenerateToken authorizes embedded reports/semantic models; effective identities are the RLS control for embedded data. | Q&A token route and RLS identity guidance |
| https://learn.microsoft.com/en-us/power-bi/developer/embedded/qanda | Microsoft Learn — Q&A in Power BI embedded analytics | Embedded Q&A uses `type: "qna"`, supports interactive/result-only modes, and currently supports one dataset in the embed config. | `/powerbi/qna` behavior and limitations |
| https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-limitations | Microsoft Learn — Limitations of Power BI Q&A | Q&A is going away in December 2026; supported data-source and RLS/OLS caveats remain before retirement. | Q&A bridge-only stance |
| https://powerbi.microsoft.com/en-us/blog/deprecating-power-bi-qa/ | Power BI Updates Blog / Fabric Community — Deprecating Power BI Q&A | Official Microsoft announcement: Q&A deprecated December 2025 and fully retired December 2026 across reports, dashboards, mobile, embedded, and Q&A Setup. | Strategic warning in guide and UI roadmap |
| https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app | Microsoft Learn — Register an application in Microsoft Entra ID | App registration establishes trust with Microsoft identity platform and captures client ID/tenant details. | Entra app-registration setup section |

---

## 2026-05-22 — Settings Progressive Setup Design + Sustainability Gauge Study

**Context.** Rajesh asked for deep design research with multiple agents because Settings still feels confusing: too many open cards, weak parent-child progression, unsurfaced areas, and uncertainty around the sustainability gauge. Four read-only research agents covered Settings code/IA, cross-page consistency, sustainability gauge behavior, and external UI patterns. Main session verified official/free design references, checked Canva templates, and attempted a Figma FigJam generation. The result is [SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md](SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.nngroup.com/articles/progressive-disclosure/ | Nielsen Norman Group — Progressive Disclosure | Show only the most important options first; reveal advanced or rare options on request; avoid going beyond two useful disclosure levels. | Setup Home first, mode cards before child forms, advanced/support gating |
| https://www.nngroup.com/articles/wizards/ | Nielsen Norman Group — Wizards: Definition and Design Recommendations | Wizards work for occasional complex input when subsequent steps depend on previous choices; dynamic branching keeps users on the shortest relevant path. | First-run Settings setup can be guided; ongoing Settings should remain task-list/detail, not modal-only |
| https://www.patternfly.org/components/wizard/design-guidelines/ | PatternFly — Wizard Design Guidelines | Progressive wizards can add or change later steps based on earlier choices. | BI mode determines required child fields |
| https://design-system.service.gov.uk/components/task-list/ | GOV.UK Design System — Task List | Task lists suit long complex services where users may complete tasks in different orders or sessions; each row has task name, hint, and status. | Setup Home readiness checklist |
| https://design-system.service.gov.uk/patterns/check-answers/ | GOV.UK Design System — Check Answers | Review pages increase confidence, reduce errors, and let users change specific answers without repeating the whole flow. | Review and publish step |
| https://fluent2.microsoft.design/components/web/react/core/nav/usage | Microsoft Fluent 2 — Nav | Navigation should be brief, scannable, goal-focused, and no deeper than one nesting level before using a tree/detail model. | Two-level parent nav, deeper content in detail pages |
| https://fluent2.microsoft.design/components/web/react/core/field/usage | Microsoft Fluent 2 — Field | Fields need visible labels, helper text, validation state, and accessible required/disabled behavior. | Always-visible labels and inline probe results |
| https://design-system-docs-proxy.services.atlassian.com/patterns/forms/ | Atlassian Design System — Forms | Long forms should be split with multi-step forms or progressive disclosure; each step groups fields that logically belong together. | Split BI/AI setup into parent choice, required fields, test, and review |
| https://carbondesignsystem.com/patterns/disclosures-pattern/ | Carbon Design System — Disclosures | Use one disclosure at a time, avoid nested disclosures, and do not hide critical workflow information. | Progressive sections with one open child and required setup visible |
| https://carbondesignsystem.com/patterns/empty-states-pattern/ | Carbon Design System — Empty States | Empty states should be contextual, replace the missing content, and focus on one next action. | Blocked profile/allowlist and missing BI content states |
| https://www.patternfly.org/patterns/status-and-severity/ | PatternFly — Status and Severity | Status and severity are not interchangeable; status requires text plus icon/color, not color alone. | Readiness chips with source/freshness and separate risk severity |
| https://m1.material.io/patterns/settings.html | Material Design — Settings | Settings should show important options first, move less-important options to subscreens, and use brief meaningful labels with current-state secondary text. | Current-state headers and dedicated child pages for dense controls |
| https://m1.material.io/patterns/empty-states.html | Material Design — Empty States | Avoid completely empty states; starter or educational content can help when it is brief and dismissible. | Viewer preview and setup recovery states |
| https://www.canva.com/learn/visual-hierarchy/ | Canva — Visual Hierarchy | Size and scale guide attention; the most important decision should have the strongest visual rank. | Reduce equal-weight card grids; make the next setup decision dominant |
| https://fluent2.microsoft.design/ | Microsoft Fluent 2 — Figma UI kits entry | Fluent provides Figma-oriented design resources and accessibility utilities. | Figma handoff should use established enterprise component grammar |
| https://www.figma.com/templates/dashboard-designs/ | Figma — Dashboard Design Templates | Figma has many dashboard templates and components, but templates should inspire layout only, not replace product-specific IA. | Avoid generic dashboard skin; produce annotated Settings flow frames |
| https://vercel.com/docs/pricing/manage-and-optimize-usage | Vercel Docs — Manage and optimize usage | Usage experiences usually show current usage, trends/projections, and controls/alerts when account-level data exists. | Future AI usage panel only if persisted usage/budget data is added |
| https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works | Stripe Docs — How usage-based billing works | Usage systems need ingestion, aggregation, billing/ownership, and monitoring before presenting account-level usage claims. | Current gauge must stay labelled as session token usage, not sustainability/account spend |

### Connector notes

- Canva connector: `_search_brand_templates` with query `settings dashboard` and dataset `any` returned no connected workspace template matches.
- Figma connector: generated a plan for "PulsePlay Settings Progressive Setup Model", but `_generate_diagram` requires selecting a team or organization plan in the connector widget before FigJam creation.

### Synthesis takeaway

The Settings redesign should be structural first: Setup Home task list, parent mode cards, child-field reveal, test/source/freshness, review-and-publish, honest save semantics, mobile parent nav, and a calm token/session efficiency indicator near Ask with a small digital wellbeing gesture. Decorative styling alone will not solve the confusion Rajesh reported.

---

## 2026-05-22 — Settings Alignment Observation + Figma VS Code Handoff

**Context.** Rajesh asked for one more deep observation pass before brainstorming: re-observe all Settings screenshot evidence, align with the existing design brief, and ground the Figma/VS Code handoff path in official sources. The result is [SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md](SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://help.figma.com/hc/en-us/articles/15023121296151-Figma-for-VS-Code | Figma Help Center — Figma for VS Code | Official VS Code extension supports inspecting Figma files, seeing comments/activity, linking code files to design components, and code suggestions. | Handoff path once Settings frames exist |
| https://marketplace.visualstudio.com/items?itemName=figma.figma-vscode-extension | Visual Studio Marketplace — Figma for VS Code | Confirms the extension ID Rajesh shared and its inspect/comment/code-suggestion positioning. | Extension verification |
| https://help.figma.com/hc/en-us/articles/39890361040535-VS-Code-and-Figma-Set-up-the-MCP-server | Figma Help Center — VS Code and Figma: Set up the MCP server | Remote Figma MCP is the preferred broad path; desktop MCP is for specific organization/enterprise cases. | Future VS Code/Figma MCP setup guidance |
| https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode | Figma Help Center — Guide to Dev Mode | Dev Mode supports ready-for-development statuses, inspect, annotations, and side-by-side VS Code handoff, but requires a paid plan and Full or Dev seat. | Explains Figma handoff prerequisites |
| https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect | Figma Help Center — Code Connect | Code Connect maps Figma components to code paths and contributes component context to Figma MCP. | Later component-library handoff after primitives are named |
| https://help.figma.com/hc/en-us/articles/22012921621015-Guide-to-inspecting | Figma Help Center — Guide to inspecting | Dev Mode inspect exposes layout, color, typography, variables, assets, measurements, and annotations. | Why annotated frames are useful before implementation |
| https://design-system.service.gov.uk/components/task-list/ | GOV.UK Design System — Task List | Task lists support complex services completed across sessions and show task status beside each row. | Setup Home readiness model |
| https://carbondesignsystem.com/patterns/disclosures-pattern/ | Carbon Design System — Disclosures | Only one disclosure should open at a time to avoid screen clutter and preserve focus. | Progressive detail sections |
| https://m1.material.io/patterns/settings.html | Material Design — Settings | Settings should use brief labels, current-state secondary text, and secondary screens for longer explanations. | Current-state-first Settings detail pages |
| https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls | Microsoft Learn — Progressive Disclosure Controls | Progressive disclosure keeps essential information visible first and reveals additional fields or follow-up steps as needed. | Parent choice before child fields |
| https://fluent2.microsoft.design/accessibility | Microsoft Fluent 2 — Accessibility | Layouts should reflow down to 320px and support text zoom without clipping. | Mobile Settings parent navigation requirement |
| https://fluent2.microsoft.design/layout | Microsoft Fluent 2 — Layout | Responsive layouts can reposition, reflow, show/hide, or re-architect content to preserve focus. | Mobile should be re-architected, not only compressed |

---

## 2026-05-22 — PulsePlay End-To-End Feature And Journey Research

**Context.** Rajesh asked for multiple research agents to map every fused feature in PulsePlay so far, review the information flow, study the Author and Viewer journeys, and prepare for a later brainstorming session. Six read-only agents mapped feature inventory, Author journey, Viewer journey, information flow, cross-page storytelling, and Figma/design handoff. The result is [PULSEPLAY_END_TO_END_FEATURE_AND_JOURNEY_RESEARCH_2026-05-22.md](PULSEPLAY_END_TO_END_FEATURE_AND_JOURNEY_RESEARCH_2026-05-22.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://www.nngroup.com/articles/journey-mapping-101/ | Nielsen Norman Group — Journey Mapping 101 | Journey maps need one actor, scenario/expectations, phases, actions/mindsets/emotions, and opportunities. | Separate Author and Viewer journey maps |
| https://www.nngroup.com/articles/service-blueprints-definition/ | Nielsen Norman Group — Service Blueprints: Definition | Service blueprints visualize people, props, and processes tied to a specific customer journey. | PulsePlay service blueprint recommendation |
| https://www.nngroup.com/articles/ux-mapping-cheat-sheet/ | Nielsen Norman Group — UX Mapping Methods Compared | Pick map type by product goal: journey for user experience, blueprint for operational delivery, flow for task path. | Figma artifact sequencing |
| https://www.figma.com/resource-library/user-journey-map/ | Figma — User Journey Mapping | Journey maps align teams around user goals, phases, actions, pain points, and opportunities. | Author and Viewer journey structure |
| https://www.figma.com/resource-library/service-blueprint/ | Figma — Service Blueprint | Service blueprints connect frontstage user actions to backstage systems and support processes. | Browser/UI/proxy/BI/token/governance blueprint |
| https://www.figma.com/resource-library/what-is-information-architecture/ | Figma — Information Architecture | IA organizes content and interaction so users can understand where they are and where to go next. | Cross-page IA critique |
| https://www.figma.com/resource-library/user-flow/ | Figma — User Flow | User flows show the path a user takes to complete a task. | First FigJam flow recommendation |
| https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode | Figma Help Center — Guide to Dev Mode | Dev Mode supports inspect and developer handoff after designs are ready. | Dev handoff should follow IA/framing |
| https://help.figma.com/hc/en-us/articles/20774752502935-Add-measurements-and-annotate-designs | Figma Help Center — Add measurements and annotate designs | Annotations and measurements clarify design intent and implementation detail. | Annotated setup frames |
| https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect | Figma Help Center — Code Connect | Code Connect maps Figma components to code and requires the right Figma plan/seat. | Code Connect should come after stable primitives |
| https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/ | Microsoft HAX Toolkit — Guidelines for Human-AI Interaction | Human-AI experiences should be planned across initial interaction, ongoing interaction, failures, and long-term use. | Ask Pulse trust/recovery guidance |
| https://pair.withgoogle.com/guidebook-v2/ | Google People + AI Guidebook | AI design patterns are organized around onboarding, explanation, trust calibration, control, and failure recovery. | AI onboarding and recovery questions |
| https://www.ibm.com/design/ai/ethics/explainability/ | IBM Design for AI — Explainability | Users should understand when they are interacting with AI and be able to review why it made recommendations. | Evidence/source/freshness recommendations |
| https://atlassian.design/foundations/tokens/design-tokens | Atlassian Design System — Design tokens explained | Tokens name reusable design decisions and support theming, responsive design, and consistent handoff. | Component primitive and token recommendation |

---

## 2026-05-23 — Enterprise UX Architecture Blueprint And Typeahead System

**Context.** Rajesh asked for a world-class enterprise web application architecture, product design, UX/UI system, wireframe, typeahead, benchmarking, and Codex implementation blueprint. The result is [ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md](ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://fluent2.microsoft.design/layout | Microsoft Fluent 2 — Layout | Spacing, proximity, and responsive reflow create relationships and preserve focus across screen sizes. | Global shell layout, context bar, responsive rules |
| https://fluent2.microsoft.design/components/web/react/core/nav/usage | Microsoft Fluent 2 — Nav | Nav should be brief, high-level, scannable, and avoid deep nesting. | L0-L3 navigation model and primary nav cap |
| https://fluent2.microsoft.design/accessibility | Microsoft Fluent 2 — Accessibility | Structure, focus management, contrast, zoom, and 320px reflow are baseline accessibility expectations. | A11y acceptance criteria |
| https://www.microsoft.com/en-us/haxtoolkit/ | Microsoft HAX Toolkit | AI products should plan behavior across first use, normal use, failure, and long-term use. | Ask Pulse trust, recovery, and AI status grammar |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ | WAI-ARIA APG — Combobox Pattern | Custom typeahead controls need correct roles, focus, and keyboard interaction. | Command palette accessibility contract |
| https://atlassian.design/foundations/tokens/design-tokens/ | Atlassian Design System — Design Tokens | Tokens are single-source design decisions for theming, consistency, and code handoff. | `--pp-*` semantic token recommendation |
| https://atlassian.design/components/empty-state | Atlassian Design System — Empty State | Empty states should describe the missing data and what the user can do next. | Empty/error/blocked state grammar |
| https://linear.app/docs/conceptual-model | Linear Docs — Conceptual Model | Actions are available through buttons, shortcuts, contextual menus, and command menu. | Keyboard-first enterprise action model |
| https://linear.app/docs/peek | Linear Docs — Peek Preview | Command menu items can support right-side quick preview without full navigation. | Typeahead `RightArrow` preview behavior |
| https://www.notion.com/help/search | Notion Help — Search | Search combines quick jump, recents, AI search, and command-like access. | Result grouping and recents |
| https://www.notion.com/help/keyboard-shortcuts | Notion Help — Keyboard Shortcuts | Slash commands and keyboard shortcuts reduce friction in creation and navigation. | `/` Ask-scoped command behavior |
| https://vercel.com/docs/concepts/dashboard-features | Vercel Docs — Dashboard Features | Dashboard command menu supports keyboard navigation and common actions. | Global command surface |
| https://vercel.com/changelog/dashboard-universal-search | Vercel Changelog — Universal Search | Universal search helps users find teams, projects, and pages from one entry point. | Assets/routes/settings unified search |
| https://primer.style/product/components/action-list/ | GitHub Primer — ActionList | Action rows support leading/trailing visuals, keyboard shortcuts, selection, and accessible contrast. | Command result row component |
| https://docs.stripe.com/stripe-apps/design | Stripe Apps — Design Your App | ContextView and SettingsView separate in-workflow context from configuration. | Viewer Experience vs Authoring Console split |
| https://docs.stripe.com/stripe-apps/patterns | Stripe Apps — Design Patterns | Onboarding/settings patterns should be secure, intuitive, and clearly scoped. | Setup/Home and settings patterns |
| https://slack.com/help/articles/201259356-Slash-commands-in-Slack | Slack Help — Shortcuts And Slash Commands | Slash commands let users take common actions from where they are. | Ask composer slash actions |
| https://docs.slack.dev/surfaces/modals | Slack Developer Docs — Modals | Modals should capture focused interactions and preserve focus until submit/dismiss. | Modal vs drawer rules |
| https://docs.databricks.com/gcp/en/workspace/genie | Databricks Docs — Genie Interface | Genie is a simplified business-user entry point for dashboards, natural-language questions, and apps. | Viewer-first AI/BI entry model |
| https://docs.databricks.com/en/genie/talk-to-genie.html | Databricks Docs — Genie Spaces | Genie spaces include owners, tags, descriptions, and common questions. | Suggested questions and source context |
| https://www.figma.com/resource-library/what-is-information-architecture/ | Figma — Information Architecture | IA organizes content and wayfinding so users understand where they are and where to go next. | Shell taxonomy and route map |
| https://www.figma.com/resource-library/user-flow/ | Figma — User Flow | User flows map entry points, steps, decisions, and endpoints for a task. | Author and Viewer wireframes |
| https://www.figma.com/resource-library/design-tokens/ | Figma — Design Tokens | Primitive, semantic, and component tokens keep design and code aligned. | Design system token hierarchy |
| https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk | OpenAI Help — Build With The Apps SDK | AI app experiences combine chat behavior, UI, backend connection, and safety/privacy expectations. | AI-native side-by-side app UI guidance |
| https://openai.com/academy/projects/ | OpenAI Academy — Projects | Project-like context keeps source files, instructions, and chats together. | PulsePlay context grouping and trust strip |
| https://www.algolia.com/doc/ui-libraries/autocomplete/introduction/what-is-autocomplete | Algolia Docs — What Is Autocomplete | Autocomplete can display search terms, results, products, pages, and actions to reduce typing and discovery effort. | Typeahead performance/result design |

### Synthesis takeaway

Enterprise-grade PulsePlay should be structured around a Viewer Experience, Authoring Console, and Command Surface. The command palette must be deterministic and fast first, AI-assisted second. Settings should become progressive Authoring, and every answer should carry the same source/scope/freshness/request-id trust grammar.

---

## 2026-05-23 - Azure Databricks Integration Offering

**Context.** Rajesh asked for deep research on the Databricks Technology Partners page, with an explicit Azure Databricks inclination. Synthesis document: [AZURE_DATABRICKS_INTEGRATION_OFFERING_2026-05-23.md](AZURE_DATABRICKS_INTEGRATION_OFFERING_2026-05-23.md).

| URL (signature) | Title / publisher | One-line takeaway | Applied to |
|---|---|---|---|
| https://docs.databricks.com/aws/en/integrations | Databricks AWS - Technology partners | Clean source for the linked Partner Connect partner categories and Unity Catalog support signals. | Partner category inventory |
| https://learn.microsoft.com/en-us/azure/databricks/integrations/ | Microsoft Learn - Technology partners for Azure Databricks | Azure equivalent of the partner page; broadly mirrors AWS but has per-cloud/listing differences. | Azure parity caution |
| https://learn.microsoft.com/en-us/azure/databricks/partner-connect/ | Microsoft Learn - What is Databricks Partner Connect? | Partner Connect provisions/passes resources such as SQL warehouses, service principals, and PATs; requirements and regional exclusions matter. | Partner Connect threat model |
| https://docs.databricks.com/aws/en/partner-connect/best-practice | Databricks - Partner Connect setup best practices | Prefer SSO, same-region hosting, and gateway clusters where relevant. | Integration setup guardrails |
| https://docs.databricks.com/aws/en/partner-connect/admin | Databricks - Manage Partner Connect connections | Admins own partner account users, service principals, PAT lifecycle, disconnect/reset cleanup, and UC partner access. | Admin lifecycle caveats |
| https://learn.microsoft.com/en-us/azure/databricks/getting-started/connect/ | Microsoft Learn - Azure Databricks integrations overview | Azure Databricks integration space spans data sources, BI tools, ETL, developer tools, and Git. | Broader integration map |
| https://learn.microsoft.com/en-us/azure/databricks/compute/sql-warehouse/ | Microsoft Learn - Connect to a SQL warehouse | SQL warehouses are the compute/data access hub for BI and developer tools; serverless is recommended when available. | Screenshot interpretation |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/sql-drivers-tools | Microsoft Learn - SQL connectors, libraries, drivers, APIs, and tools | Official programmatic surface: JDBC, ODBC, Python, Go, Node.js, REST Statement Execution, CLI, and SQL IDEs. | Developer connector matrix |
| https://learn.microsoft.com/en-us/azure/databricks/partners/bi/power-bi | Microsoft Learn - Power BI with Azure Databricks | Power BI supports Desktop, service publishing, M2M OAuth, ADBC/ODBC options, and metric-view guidance. | Power BI bridge summary |
| https://learn.microsoft.com/en-us/azure/databricks/partners/bi/power-bi-desktop | Microsoft Learn - Connect Power BI Desktop to Azure Databricks | Desktop can use Partner Connect or manual hostname/HTTP path setup; SQL warehouse recommended for DirectQuery. | Power BI author setup |
| https://learn.microsoft.com/en-us/azure/databricks/partners/bi/power-bi-service | Microsoft Learn - Publish to Power BI service from Azure Databricks | Publishing requires UC, SQL warehouse, Premium/Fabric capacity, XMLA read/write, and Entra consent/credentials. | Power BI service caveats |
| https://learn.microsoft.com/en-us/azure/databricks/partners/bi/bi-metric-view | Microsoft Learn - Query metric views from BI tools | Beta BI compatibility mode exists generally, but the page warns Microsoft removed the Power BI connector option. | Metric-view Power BI risk |
| https://learn.microsoft.com/en-us/azure/databricks/partners/bi/tableau | Microsoft Learn - Tableau with Azure Databricks | Tableau has Partner Connect/manual paths, UC requirements for Tableau Cloud exploration, and performance guidance. | Tableau bridge assessment |
| https://learn.microsoft.com/en-us/azure/databricks/ai-bi/ | Microsoft Learn - Databricks AI/BI | Native BI umbrella for dashboards, Genie Spaces, business semantics, admin/API/audit, and consumer access. | Databricks-native destination |
| https://learn.microsoft.com/en-us/azure/databricks/dashboards/ | Microsoft Learn - Dashboards | AI/BI dashboards support authoring, filters, embedding, source control, bundles, REST APIs, jobs, and usage monitoring. | Native dashboard adapter priority |
| https://docs.databricks.com/aws/en/dashboards/share/embedding | Databricks - Embed a dashboard | Embedding has basic and external-user modes, permission tradeoffs, no Ask Genie for external-user embed, light-mode caveat, and cookie caveat. | Embedding guardrails |
| https://learn.microsoft.com/en-us/azure/databricks/genie-ui/genie | Microsoft Learn - Use the Genie interface | Genie is the simplified business-user entry point for dashboards, natural-language questions, apps, favorites, search, and domains. | Launchpad pattern validation |
| https://learn.microsoft.com/en-us/azure/databricks/genie/ | Microsoft Learn - What is a Genie Space | Genie Spaces use UC data, knowledge stores, sample SQL, SQL functions, trusted assets, benchmarks, and UC row/column governance. | Genie evidence model |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/ | Microsoft Learn - Databricks Apps | Apps host Python/Node apps on Databricks serverless and integrate with UC, SQL, and OAuth. | PulsePlay hosting stance |
| https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/resources | Microsoft Learn - Add resources to a Databricks app | App resources bind Genie, SQL warehouses, model serving, secrets, UC assets, functions, volumes, and vector indexes without hardcoding IDs. | Resource binding guidance |
| https://learn.microsoft.com/en-us/azure/databricks/business-semantics/ | Microsoft Learn - Unity Catalog business semantics | Metric views and agent metadata define governed metrics and business language for dashboards, Genie, and tools. | First-party semantic layer |
| https://learn.microsoft.com/en-us/azure/databricks/connect/uc-connections | Microsoft Learn - Unity Catalog connections | UC connections cover managed ingestion, query federation, catalog federation, JDBC, and HTTP/MCP/API tools. | Governed connection model |
| https://learn.microsoft.com/en-us/azure/databricks/connect/ | Microsoft Learn - Connect to data sources and external services | External access patterns include object storage, UC connections, federation, managed ingestion, streaming, drivers, and Partner Connect. | Data-source integration map |
| https://learn.microsoft.com/en-us/azure/databricks/data-engineering/ | Microsoft Learn - Data engineering with Databricks | Lakeflow covers Connect, Spark Declarative Pipelines, Jobs, and runtime foundations. | Ingestion/orchestration boundary |
| https://learn.microsoft.com/en-us/azure/databricks/ingestion/lakeflow-connect/faq | Microsoft Learn - Lakeflow managed connector FAQs | Managed connectors include Salesforce, Workday, SQL Server, ServiceNow, GA4, and SharePoint, with UI/API/bundle differences. | Upstream data-provider inventory |
| https://learn.microsoft.com/en-us/azure/databricks/machine-learning/model-serving/ | Microsoft Learn - Model Serving | Model Serving provides governed REST endpoints for custom models, agents, Databricks foundation models, and external models. | AI connector capability |
| https://learn.microsoft.com/en-us/azure/databricks/vector-search/create-vector-search | Microsoft Learn - Vector Search endpoints and indexes | Vector Search supports UI/Python/REST endpoint/index creation, Delta Sync indexes, direct vector access, and production SP auth. | Knowledge provider capability |

### Synthesis takeaway

Azure Databricks-native assets should be PulsePlay's destination posture. Partner Connect is a useful setup accelerator and partner discovery surface, but it must not become PulsePlay's security, policy, or experience spine. The next useful implementation artifact is a capability map that classifies each integration as destination, bridge, upstream provider, governance signal, future action provider, or deferred.
