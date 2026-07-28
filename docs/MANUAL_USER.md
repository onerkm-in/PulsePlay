# PulsePlay - User Manual

PulsePlay shows you the supply-chain decisions waiting on you, explains why each one is flagged, and lets you ask follow-up questions in plain language - without replacing the BI tool you already use.

## Contents

- [What PulsePlay is for](#what-pulseplay-is-for)
- [The four surfaces](#the-four-surfaces)
- [Working through Decisions](#working-through-decisions)
- [Saving and reusing what you find](#saving-and-reusing-what-you-find)
- [Reading AI answers responsibly](#reading-ai-answers-responsibly)
- [When something looks wrong](#when-something-looks-wrong)
- [Getting help](#getting-help)
- [A note on the data in this deployment](#a-note-on-the-data-in-this-deployment)

## What PulsePlay is for

PulsePlay is a single screen that sits in front of the data your organisation already has. It does three things:

1. Shows you a ranked list of issues that need a human decision, each with the reason, the estimated business impact, and the evidence behind it.
2. Lets you ask questions about that data in plain language and get an answer back.
3. Hosts your existing BI report inside the same screen so you do not have to switch tabs to check a number.

**What PulsePlay is not.** It is not a replacement for your BI tool. It does not own your data, it does not restate your official reports, and it is not the system of record for anything. Your BI report stays the authority for published numbers. PulsePlay sits alongside it and adds the "what should I do about this" layer.

It also does not place orders, email suppliers, or change anything in your ERP. Every action you take in PulsePlay is recorded in PulsePlay. Acting on a decision in the real world is still a human step outside the app.

## The four surfaces

Four tabs across the top. You land on **Decisions**.

| Tab | What it is | Use it when |
|---|---|---|
| **Decisions** | Proactive decision prompts: what is off, why, the impact, and the next action to approve. | You are starting your day and want to know what needs you. This is the default landing tab. |
| **AI Insights** | Auto-generated narrative summary of the current data scope. | You want a written briefing you can skim or paste into an email. |
| **Ask Pulse** | Ask follow-up questions in natural language; SQL and a chart come back. | You have a specific question the briefing did not answer. |
| **Dashboard** | The embedded BI surface, or PulsePlay's own canvas of pinned charts. | You want to look at the underlying report, or at charts you pinned earlier. |

You can link straight to a tab by adding `?surface=` to the address: `action-insights`, `ai-insights`, `ask-pulse`, or `dashboard`.

Your organisation can publish PulsePlay in a single-page layout called **My Decision Canvas** instead of the four-tab layout. If that is what you see, the decision list, the severity charts, and your saved items are all on one scrolling page. The four-tab layout is the default.

## Working through Decisions

### What a decision card shows

Cards are ordered by severity first, then by the detection rule's confidence, so the top of the list is where to start. Each card is one flagged issue. Reading top to bottom:

- **Severity chip** - CRITICAL, HIGH, MEDIUM or LOW. The colour is backed up by the word, so you never have to read colour alone.
- **Headline** - the one-line summary.
- **Impact** - a value (dollars, percent, or units), a label saying what the value measures, and a bar showing how this card compares with the largest impact currently on your list.
- **Issue** - the plain description of what was detected.
- **WHY** - the root cause the detection rule identified.
- **FIX** - the recommended action.
- **The action question** - for example "Do you want me to raise a supplier delivery review?"
- **Footer line** - confidence (high, medium or low), the action level, the rule id, the owner, and the current status.

### The buttons

Which action buttons appear depends on what you are allowed to do and on the card's current status. Which governed actions you are offered is decided on the server, not in your browser - you will not be shown a trigger, approve, reject, snooze or false-positive button you are not permitted to press. View evidence, Pin to canvas and Save are always available on an open card.

- **The primary action** (for example "Trigger supplier delivery review", "Trigger replenishment review", "Raise SKU redistribution request"). This is the fix the rule recommends. It does not execute anything externally. It records your request and moves the card to "awaiting approval".
- **Approve & proceed** - only shown to approvers, and only on cards already waiting for approval.
- **Reject** - approvers only. Closes the card as rejected.
- **Snooze** - closes the card. It stays in the list marked "snoozed" rather than disappearing, and it stops offering buttons. This is not a "remind me later": the status sticks across every re-detection run, so the same finding will not re-open by itself. It comes back only if the underlying situation changes enough that the engine treats it as a new finding.
- **Mark false positive** - tells the system the detection was wrong. Use this rather than ignoring the card; it is the honest signal.
- **View evidence** - expands the detection SQL (labelled "measured, deterministic") and the audit note that was written when the card was created.
- **Pin to canvas** - re-runs the card's evidence query and pins the result to the Dashboard as a table you can come back to. Only offered when the card carries an evidence query and your connection can run it. No AI is involved in that pin or its later refreshes.
- **Save** - the save menu, covered in the next section.

### "Submitted, awaiting approval"

When you press a trigger action and you are not an approver, the card stops offering buttons and shows:

> Submitted - awaiting approval from [owner name].

That is not an error and the click did not fail. Triggers are Level-3 actions and always route to an approver. PulsePlay prepares the request payload, writes an audit record, and dispatches a notification to the owner. Nothing is sent to an ERP, a supplier, or any ordering system - the request is recorded, not executed. If your administrator configured a notification webhook, that notification is a real outbound call to the URL they set; with no configuration PulsePlay records that a notification was due rather than pretending one went out.

One caveat worth knowing: the owner notification only leaves PulsePlay if your administrator configured a notification webhook. With no configuration the system records that a notification was due and to whom, rather than pretending an email went out. If approvals seem to sit untouched, tell your administrator - it may simply be unconfigured.

### Who can do what

Two roles apply to people. A third, view-only persona exists on the server for automated callers; you will never be assigned it.


| | Planner | Manager / approver |
|---|---|---|
| View prompts and evidence | yes | yes |
| Trigger a request | yes | yes |
| Snooze, mark false positive | yes | yes |
| Reject | no | yes |
| Approve | no | yes |

A planner cannot approve their own request. That separation is the point of the gate.

Your role comes from your sign-in identity, not from anything you pick in the app. There is a Planner / Manager switch in the header, but it is a demonstration control: unless your administrator has explicitly enabled demo personas, the server ignores it and keeps your real permissions. The switch shows the role the server actually granted you, not the one you asked for.

### Statuses you will see

- **new** or **refreshed** - open, waiting on you.
- **pending-approval** - you or someone else triggered it; an approver has to act.
- **actioned** - approved and closed.
- **rejected**, **snoozed**, **false-positive** - closed. The card shows its status and stops offering buttons.

## Saving and reusing what you find

There are two different "pin" ideas in PulsePlay. They are not the same thing.

### The Save menu

The **Save** button (it reads "Saved" once the item is pinned) opens a small menu on a decision card:

- **Pin to Canvas** - adds the item to your personal canvas list. Press it again to unpin.
- **Bookmark** - saves it without pinning.
- **Add note** - type a short note and save it with the item.
- **Highlight** - marks it visually. Highlighting also saves it.
- **Capture snapshot** - freezes what the item said at this moment, so you can show what you saw even after the data moves.

These are stored on the server against your user rather than in your browser, so they are not tied to one machine. Three honest limits:

- The server store is in-process memory in this build. Anything you save is lost if the PulsePlay back end restarts or is redeployed. Treat saves as working notes for a session, not as a record.
- The Save menu is currently only offered on decision cards.
- The "My Canvas" list that shows what you pinned only appears in the My Decision Canvas layout. On the four-tab layout, saving works but there is no list view for it yet.

If your deployment has no single sign-on wired up, every user resolves to the same identity on the server, which means everyone sees the same saved items. Ask your administrator whether that applies to you before saving anything you would not want a colleague to see.

### Pin to canvas (charts and evidence)

Separately, charts in Ask Pulse and AI Insights, and evidence tables on decision cards, carry a **Pin to canvas** control. This puts a live tile on the **Dashboard**.

A pinned tile keeps the data as it was when you pinned it, plus the query and connection that produced it. On the Dashboard you can:

- drag a tile by its header to move it, and drag its corner to resize it on a 12-column grid,
- change a chart tile's chart type from a dropdown,
- press refresh to re-run the tile's query against the data,
- edit the query, or remove the tile.

The tile footer tells you which it is showing: **snapshot** means the original data from when you pinned it; **live** plus a time means it has been refreshed since. Refreshing a tile runs a database query only - no AI is involved.

Pinned tiles appear on the Dashboard when the Dashboard is showing PulsePlay's own canvas. If your Dashboard is showing an embedded vendor report, the report takes the space.

### Exporting a briefing

Each AI Insights section has a small row of controls: copy the section as text, export its raw data to Excel, re-run just that section, and (if your administrator has enabled it) view the SQL behind it.

## Reading AI answers responsibly

Different parts of PulsePlay have different levels of trust. Learn to tell them apart.

**Decision cards are measured, not written by an AI.** They come from detection rules that run real queries. Press View evidence and you see the actual query under a "measured, deterministic" label, plus the audit note. The impact figures on those cards are computed, not estimated by a language model. The confidence value (high, medium, low) is the rule's own confidence in the detection, not a statement about the arithmetic.

**AI Insights briefings may or may not be grounded.** If PulsePlay cannot confirm the briefing came back with real data rows, it shows a warning at the top of the briefing. There are two versions:

> Illustrative - not grounded in your data. This briefing was written by a language model with no query access, so the figures are model-produced, not measured.

> Not grounded yet. These sections did not return data rows from the dataset. This connector runs no language model - this is placeholder guidance, and measured sections replace it automatically once the data probe completes.

Take both seriously. The first one means the numbers in that briefing were invented by a model and should not be quoted. This check deliberately errs on the side of showing the warning: a query that merely looks real is not accepted as proof.

**Behind the scenes** there is a checker that re-reads every number in a generated narrative and compares it against the rows it was supposed to be based on. It marks the result as verified, partial, unverified, or ungrounded. This runs on one of the AI paths today and is not yet displayed as a per-answer label in the four surfaces.

That leads to the important caveat: **absence of a warning is not a guarantee of correctness.** A per-answer trust badge exists in the codebase but is not currently shown on the surfaces you use. So:

- Numbers you can trace to a query (decision cards, pinned tiles, sections where you can view the SQL) are as good as that query.
- Prose written by the AI can be wrong even when it sounds specific and confident. Check anything you are about to act on against the underlying report.
- If a briefing and your BI report disagree, your BI report wins.

## When something looks wrong

Practical first: **nothing queries your data until you ask it to.** Opening PulsePlay costs nothing.

- The Decisions list does not load itself. On a first visit you see a "Load decisions" button and the line "Loads on demand. Nothing queries the warehouse until you ask." After that the list is served from a short-lived cache with its age shown, and only refreshes when you press refresh, switch persona, or take an action.
- AI Insights does not generate itself. You see "No briefing generated yet for this scope. Nothing runs until you ask - generating spends live warehouse and AI calls" and a **Generate briefing** button.
- The Dashboard does not create starter charts on its own by default. Your administrator can turn on a starter-charts option; if they have, opening an empty Dashboard on a Power BI connector pins up to three charts for you the first time, which does spend warehouse calls.

So if a number looks stale, the answer is usually that you are reading a cached view. Press refresh and check the "updated" timestamp.

If something is actually wrong:

| What you see | What it means | What to do |
|---|---|---|
| A decision that is clearly not a real problem | The detection rule mis-fired | Press **Mark false positive**. Do not just ignore it. |
| The buttons disappeared after you clicked | Your action succeeded and the card is now waiting on an approver | Read the "Submitted - awaiting approval" line under the card. |
| "That action isn't permitted for the current persona." | Your role does not allow that action | Ask an approver to action it. |
| "Proxy unreachable - config locked" | PulsePlay cannot reach its own back end | Reload. If it persists, this is for your administrator. |
| A briefing figure that does not match your report | Possibly an ungrounded AI answer | Check for the grounding warning at the top, view the section SQL if available, and trust your report. |
| A pinned tile showing old data | The tile is showing its snapshot | Press refresh on the tile; the footer switches to "live". |
| "No decisions need attention right now" | The queue really is clear for your scope | Nothing to do. |
| A section that failed | One stage of the briefing errored | Use the per-section re-run control rather than regenerating the whole briefing. |

## Getting help

There is no in-app help desk or feedback button. Support runs through whoever deployed PulsePlay in your organisation.

When you report a problem, include: which tab you were on, the decision's rule id and owner from the card footer (or the exact question you asked), what you expected, what you saw, and the "updated" timestamp on the list. That is usually enough to reproduce it.

## A note on the data in this deployment

The current deployment runs on **synthetic** supply-chain data - a generated LATAM consumer-goods dataset covering three years up to 30 June 2026 (2024 and 2025 complete, 2026 January to June). It is realistic in shape and behaviour, but no figure in it describes a real supplier, plant, product, or customer.

Use it to learn the workflow and to judge whether the decisions PulsePlay surfaces are the kind of decisions you want surfaced. Do not use any number from it in a real plan.
