# Technical Update For Other Agents

## Purpose

This document is written for another LLM, agent, or implementation assistant that needs to learn from this package and decide whether the same pattern should be applied in a different project or application.

Use this document as an adaptation guide, not as an instruction to copy the package unchanged.

The receiving agent should not automatically replace or rewrite what already exists in the target system. It should first understand the current architecture, identify what is already mature or well-designed, and then recommend only the changes that are justified by fit, advancement, safety, or maintainability.

This document is intended to be portable. It should remain understandable even if the reader has no access to this repository, its source files, or its packaged artifact.

The receiving agent should also avoid modifying its own previously generated code by default. The first responsibility is to review, compare, and assess. Changes should only be proposed after understanding the existing implementation and should only be applied when they are clearly needed.

## Required Operating Stance For Another Agent

Another agent, LLM, or person using this document should follow this operating stance:

- do not treat these notes as a command to rewrite your existing solution
- do not replace your current generated code just because this package includes additional enhancements
- first refer to your own implementation, architecture, and constraints
- review what already exists before proposing any modification
- check whether the same enhancement is already present in a stronger or more appropriate form
- preserve your current implementation unless a meaningful improvement is clearly justified
- discuss or document proposed changes before applying them when the impact is non-trivial

In short:

- refer first
- review second
- enhance third
- modify only when truly needed

## Portable Snapshot Of This Package

This package is a Power BI custom visual that integrates a chat-style assistant with Databricks Genie.

At a high level, the package does the following:

- receives report context from Power BI through bound dimensions and measures
- converts that context into a compact, governed business summary
- sends the summary and user question to Databricks Genie
- receives the answer from Databricks and renders it in a Genie-style chat interface
- renders data results as interactive tables (with row numbers and column type indicators) and as D3 charts (bar, line, area, pie, scatter) with chart titles, axis labels, chart-type switching, and axis configuration
- renders rich markdown responses (bold, italic, lists, inline code) with expandable SQL disclosure and source view badge
- parses Genie follow-up questions from the `suggested_questions` attachment and renders them as multiple clickable buttons
- exposes connection status and contextual empty states for guided setup
- supports limited outbound interaction by turning known context values into clickable Power BI selections

The package is designed around the idea that:

- Power BI is the context source
- Databricks Genie is the answering engine
- the custom visual is the bridge between them

This is context for comparison, not an instruction to make another system identical to this one.

## Critical Databricks Genie API Lessons

Any agent implementing this pattern against the Databricks Genie API must verify these points. Each was discovered from real API responses:

### attachment_id, not id

Databricks returns each message attachment with an `attachment_id` field. The field is **not** named `id`. If your implementation builds the query-result fetch URL from `att.id`, the URL will be built incorrectly and query results will never render. Always use `att.attachment_id`.

### Query results come from a separate endpoint

After a message reaches `COMPLETED` status, inline message content does not contain query rows. You must detect the presence of a QUERY attachment and make a separate fetch to `/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}/query-result/{attachment_id}` to retrieve the actual rows and columns.

### Follow-up questions are in a separate attachment

Genie returns follow-up suggestions as a separate attachment in the message with a `suggested_questions` key (not `follow_up_questions` or `followUpQuestions`). The attachment looks like:

```json
{ "suggested_questions": ["...", "..."], "attachment_id": "..." }
```

Parse that array and expose each item as a clickable follow-up button. If you only look for `follow_up_questions`, the suggestions will never appear.

### Three query-result response formats

The `/query-result/{attachment_id}` endpoint can return data in three different shapes:

1. `statement_response` wrapper — rows are at `response.statement_response.result.data_array`, columns at `response.statement_response.manifest.schema.columns`
2. Direct `data_array` — rows are at `response.data_array`, columns at `response.manifest.schema.columns`
3. Legacy `data_table` — rows are at `response.data_table.rows`, columns at `response.data_table.columns`

A robust parser should attempt all three and fall back gracefully.

## Portable Architecture Summary

The implementation follows a modular pattern that another agent can reuse conceptually in a different host system.

### Host Adapter Layer

The host adapter is responsible for:

- receiving host lifecycle updates
- reading the current bound data context
- reading formatting or configuration settings
- reading current selection identities if the host supports them
- passing normalized data into the application layer

In this package, the host is Power BI. In another system, the host could be a dashboard application, embedded analytics product, or custom reporting shell.

### Context Builder Layer

The context builder is responsible for:

- extracting meaningful dimensions and measures from the host context
- summarizing high-cardinality fields without dumping raw data
- producing a compact prompt-safe business context
- preserving enough detail for the backend assistant to answer in context

### Assistant Client Layer

The assistant client is responsible for:

- performing health checks
- sending chat requests
- polling or waiting for results if needed
- submitting optional feedback or telemetry
- separating transport logic from UI logic

### UI Layer

The UI is responsible for:

- showing the conversation surface with structured message sections (analysis, text, data, follow-up, feedback)
- rendering data results as both tables and interactive charts with chart-type switching
- showing connection status
- showing contextual empty states when configuration or data binding is incomplete
- surfacing developer diagnostics in a mode that does not clutter the end-user view
- providing context chips or similar interaction aids when the host supplies usable identities
- detecting and rendering follow-up suggestions from the assistant as clickable buttons

### Proxy Layer

The proxy layer is optional but preferred for broader deployment.

It is responsible for:

- keeping backend credentials off the browser when possible
- proxying assistant API requests
- exposing a lightweight health endpoint
- becoming the place where enterprise authentication, logging, throttling, or request governance can be added

## Portable Behavior Summary

The current package supports these behaviors.

### Inbound Context Behavior

The assistant surface can react to:

- report filters
- page filters
- visual filters
- slicers
- cross-filtering and cross-highlighting from other visuals

This only works to the extent that the host application passes structured context into the integration.

### Outbound Interaction Behavior

When the host provides data identities, the visual can expose clickable context chips that push selections back into the host application.

This does not mean free-text answers automatically become filters. Outbound interaction is limited to context values that the host has explicitly provided in a structured form.

### Connection Status Behavior

The UI includes a small status indicator with these conceptual states:

- not configured
- checking
- online
- offline

Connection checks should be lightweight and cached so the host application is not burdened by excessive polling.

### Developer Diagnostics Behavior

In developer mode, the package can surface:

- assigned fields
- matched or unmatched approved fields
- context summary text
- rendering information
- request timing or tracker information
- high-level counts for context fields being sent toward the assistant

These diagnostics are for rollout and debugging, not for default end-user display.

## Portable Configuration Model

A similar solution in another project will usually need configuration for:

- assistant workspace or API base URL
- assistant space or agent identifier
- authentication method or token source
- approved backend fields for validation
- optional domain guidance or business instructions
- appearance and developer-mode toggles

These names can differ by project, but the pattern is stable:

- connection settings
- validation settings
- behavior settings
- UI settings

## Portable Best-Practice Authoring Pattern

In host systems that resemble Power BI, the best-practice authoring pattern is:

1. Bind an anchor measure so the integration participates in host context changes.
2. Bind the key business dimensions the assistant should explicitly understand.
3. Bind one to three useful business measures if they help summarize the current slice.
4. Point the assistant to an approved semantic object or governed view.
5. Validate frontend fields against approved backend vocabulary when possible.

Example anchor measure in a BI tool:

```text
ROW_COUNT_CONTEXT = COUNTROWS(<table_or_view>)
```

The exact syntax will vary by host platform.

## Portable Security And Governance Position

This package assumes the following security posture, which another agent should evaluate carefully before reuse:

- frontend filters do not equal backend authorization
- browser-side secrets are a last-resort deployment option
- proxy or gateway patterns are preferred
- backend answering should happen against governed semantic objects
- prompt context should remain bounded and explainable

If another system cannot support those principles, the receiving agent should flag that as an architectural concern rather than silently weakening the design.

## Portable Known Constraints

Another agent should understand these constraints even without seeing the source code.

- The host application usually does not grant unrestricted access to the full semantic model.
- The integration often only sees fields explicitly bound or exposed to it.
- High-cardinality fields should be summarized rather than dumped raw.
- Backend latency usually dominates end-to-end response time more than frontend rendering does.
- Outbound interaction only works when the host provides usable identities or selection primitives.
- A mature host application may already solve some of these concerns better than this package does.

## What This Package Opens Up

This package establishes a reusable pattern for connecting a governed BI experience to an external LLM-backed analytics system without turning the BI tool into the source of truth.

The main capabilities opened up are:

- Power BI can act as a context listener instead of a full data transport layer.
- Report, page, slicer, visual, and cross-filter context can be converted into a compact business prompt.
- Databricks Genie can answer from governed backend objects while still respecting the user-visible report state.
- The custom visual can participate in two-way interaction:
  - inbound from Power BI filters and selections
  - outbound through clickable context chips that create Power BI selections
- Connectivity, diagnostics, and setup validation can be surfaced directly in the visual so rollout is easier to support.
- A proxy-first deployment path can reduce browser-side authentication exposure and improve production readiness.

## The Core Pattern To Learn

Do not treat the BI visual as a data-export tool.

Instead, treat it as:

- a report-context collector
- a governed prompt builder
- a thin interaction bridge to the backend assistant

The backend assistant should remain responsible for:

- data access
- governed semantics
- actual query execution
- final answer generation

## What Another Agent Should Evaluate First

Before applying this pattern to another project, the receiving agent should determine whether the target application supports the same assumptions.

Check these areas first.

The receiving agent should also determine what is already working well in the target system. Reuse mature capabilities where they are already stronger than this package, and only introduce changes where there is a clear improvement opportunity.

The receiving agent should begin by reviewing its own current implementation without modifying it. This document should be used as a checklist for comparison and enhancement discovery before any code changes are made.

### 1. Interaction Capability

Can the target application expose current filter, selection, or page context in a structured way?

Examples:

- Power BI custom visuals: yes, but only through declared roles and data mappings
- dashboard apps with event/state APIs: maybe
- static embedded reports without context APIs: likely no

If the target application cannot expose effective user context, this package's context-listener pattern will not transfer cleanly.

### 2. Governed Backend Surface

Is there an approved backend object for the assistant to answer against?

Examples:

- Databricks metric view
- governed SQL view
- semantic layer endpoint
- application-owned analytics API

If the target system does not have a governed answering surface, the agent should stop and recommend creating one before integrating an assistant.

### 3. Field Vocabulary Alignment

Do the frontend fields and backend fields refer to the same business concepts?

The receiving agent should verify:

- naming alignment
- semantic alignment
- grain compatibility
- measure meaning
- date and category consistency

If `Region` in the report does not mean the same thing as `Region` in the backend, the agent must introduce a mapping layer instead of assuming direct reuse.

### 4. Security Boundary

Can the target application safely authenticate to the backend assistant?

Preferred pattern:

- application -> proxy or gateway -> backend assistant

Use direct browser-side token handling only when the deployment context is tightly controlled and explicitly approved.

### 5. Performance Envelope

Can the target application tolerate request/response latency from an external assistant?

The receiving agent should evaluate:

- UI update frequency
- expected request volume
- caching opportunities
- timeout behavior
- whether health checks and prompt building are cheap enough for the host app

### 6. Existing-System Maturity

Is the target system already more mature in some areas than this package?

The receiving agent should actively inspect:

- current architecture quality
- current security posture
- current authentication model
- current performance profile
- current observability and diagnostics
- current UX quality

If the target system is already stronger in one of these areas, the agent should preserve that strength and adapt only the learning that adds value.

## Required Adaptation Checklist For Another Project

If another agent wants to apply this pattern in its own project, it should follow this sequence.

### Step 0. Understand Before Changing

The agent should begin with discovery, not replacement.

It should document:

- what the current system already does well
- what is already more mature than this package
- what pain points actually exist
- what constraints the project team cares about
- what must remain stable

If the existing system already handles a concern better, the agent should preserve it and adapt this package's learning around it.

The agent should keep its current code unchanged during this step unless inspection itself requires safe, non-behavioral instrumentation.

### Step 1. Identify The Host Constraints

The agent should document:

- how the host app exposes filter and selection context
- whether interactions are inbound only or bidirectional
- whether the host app limits field access like Power BI does
- whether the host app supports per-field identities for outbound interaction

### Step 2. Identify The Backend Contract

The agent should confirm:

- backend assistant endpoint
- governed data object or semantic surface
- required authentication method
- available health-check route
- feedback or telemetry route if needed

### Step 3. Map Frontend Context To Backend Vocabulary

The agent should produce an explicit mapping table with:

- host field name
- backend field name
- type
- semantic notes
- whether the field is allowed in prompts
- whether the field can be used for interactive selections

If this mapping cannot be built cleanly, the integration is not ready.

### Step 4. Decide The Prompt Contract

The agent should define:

- what context is always included
- what context is optional
- how high-cardinality fields are summarized
- how measures are formatted
- what setup state blocks requests

The prompt contract must be compact, explainable, and stable.

### Step 5. Decide The UX Contract

The receiving agent should preserve these user-facing principles:

- chat should be visible without unnecessary scrolling
- assistant messages should use a structured layout: analysis header, text body, data view, follow-up suggestion, feedback
- data results should be renderable as both tables and interactive charts with type switching
- setup guidance should use contextual empty states, not separate panels
- connection status should be visible
- diagnostics should be available in developer mode, not forced on end users
- the interface should match the backend assistant's native look (e.g., Databricks Genie dark theme) unless the host product requires a different style

### Step 6. Decide The Deployment Pattern

The agent should choose one of these:

1. local or test proxy
2. production proxy or gateway
3. controlled direct backend access

The agent should prefer the most secure option the target project can support.

### Step 7. Discuss Improvements Before Implementation

If the target system is already mature, the agent should not treat maturity as a reason to avoid review. It should still look for improvement opportunities in:

- performance
- readability
- modularity
- security
- authentication
- diagnostics
- user experience
- maintainability

But before implementation, the agent should:

- explain what it found
- describe why the change is beneficial
- identify likely impact
- confirm whether the change should be adopted as-is, adapted, or skipped

The goal is informed improvement, not automatic churn.

If the receiving agent already has generated code in place, it should treat that code as the current baseline and avoid modifying that copy unless the proposed improvement is materially useful, safe, and consistent with the target project's design.

### Step 8. Validate The Result In Context

After implementation, the agent should validate:

- whether host context is being captured correctly
- whether the backend assistant receives the intended vocabulary
- whether security and authentication still follow project rules
- whether performance is acceptable under realistic usage
- whether the user interface remains understandable for both authors and end users
- whether diagnostics help without overwhelming the main experience

## What Should Be Reused

Another agent should strongly consider reusing these ideas even if the code itself is not copied:

- thin host adapter plus modular UI/application layer
- compact context builder
- explicit field validation against approved backend fields
- connection health indicator
- developer-mode diagnostics
- proxy-first authentication path
- change-tracked technical handover docs

## What Should Usually Be Rebuilt

Another agent should usually rebuild or customize these areas per project:

- field mapping rules
- prompt phrasing
- business-domain guidance
- backend route structure
- authentication handling
- visual styling
- developer diagnostics wording
- interaction UX details

## What Another Agent Must Not Assume

Do not assume any of the following without checking:

- the target system needs broad replacement just because this package has a newer pattern
- the target system's existing generated code should be rewritten because these notes mention enhancements
- Power BI behavior exists in the target host
- frontend filters automatically become backend authorization
- browser requests to backend services will be allowed
- bound fields equal full model access
- raw context dumps improve answer quality
- every visible host filter can be named individually by the integration

## Concrete Portable Example

A portable mental model for another agent is this:

```text
User changes slicer or clicks chart
-> host application updates current context
-> integration reads approved dimensions and measures
-> integration builds a compact business summary
-> integration sends summary plus user question to backend assistant
-> backend assistant answers using governed backend data
-> integration renders answer and optional diagnostics
-> if supported, user clicks a structured context chip to push a selection back into the host
```

This flow is more important than the exact source code from this repository.

## Project-Fit Decision Tree

Another agent should ask these questions in order.

1. Does the host app expose effective user context?
2. Is there a governed backend answering surface?
3. Can frontend fields be mapped to backend semantics?
4. Can authentication be handled safely?
5. Is the UX allowed to include a visible assistant surface?
6. Is the performance budget acceptable?

If any answer is no, the agent should adjust the architecture before implementation.

## Minimum Deliverables For A Receiving Agent

If another agent decides the pattern fits its project, it should produce at least:

- an assessment of what should stay unchanged
- a comparison note describing which enhancements were reviewed without modifying the current implementation
- a host-to-backend field mapping
- a prompt-contract note
- an authentication and security note
- a deployment note
- a testing checklist for context propagation
- a handover note explaining what was reused and what was changed

## Suggested Message To Another Agent

Use the following as the operating message when handing this package's learning to another implementation agent:

```text
Learn the pattern, not just the code. Do not automatically replace what already exists in the target system, and do not modify your existing generated code by default. First refer to your own implementation, review it carefully, and identify what is already mature or stronger than this package. Preserve those parts unless there is a clear and worthwhile reason to improve them. Use these notes to check for possible enhancements, best practices, and gaps without changing your current copy during the assessment stage. Then verify whether your host application can expose structured report/filter context and whether your backend has an approved semantic or metric surface. Map host fields to backend fields explicitly, choose a secure authentication path, keep the prompt compact, and adapt the UX so diagnostics remain available without cluttering the end-user experience. Discuss material improvements before implementation, and only modify your current solution when the change is genuinely needed, safe, and aligned with your project's constraints.
```
