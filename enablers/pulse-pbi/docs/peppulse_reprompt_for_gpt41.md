# Re-prompt: PepPulse Reference MD (Build Blueprint Version)

> Paste the entire block below into GPT-4.1 as your next message. It has access to the codebase context from earlier in your session, so it will fill in real values. Do not edit unless noted.

---

## Role
You are documenting an existing Power BI custom visual called **PepPulse** that embeds Databricks Genie. The output is a build blueprint for a new, larger-scope application. The reader will reproduce behavior from this document alone, without access to the original codebase. Treat this as a hand-off doc to a team that has never seen your code.

## Hard rules (non-negotiable)
1. Every section must contain at least one concrete artifact: a TypeScript interface, a JSON example, a code snippet, a lookup table, a regex pattern, or a mermaid diagram. Prose-only sections fail review and must be redone.
2. No marketing language. Banned words include: robust, seamless, powerful, leverages, cutting-edge, best-in-class. State what the code does and how.
3. When a value, list, regex, key order, or table exists in the codebase, transcribe it verbatim. Do not paraphrase, summarize, or "clean up" formatting.
4. When a value is genuinely unknown, mark it as `TODO: confirm from <file path>` inline. Do not invent values to fill gaps.
5. No em dashes anywhere in the output. Use commas, colons, parentheses, or split sentences.
6. Use fenced code blocks with language tags (`ts`, `json`, `js`, `bash`, `mermaid`). Use mermaid for all diagrams.
7. Do not write a "Summary" section at the end. The doc ends with section 24.

## Output format
A single Markdown document. H2 for top-level sections, H3 for subsections. Include a Table of Contents at the top with anchor links. Return Markdown only, no preamble, no closing remarks.

---

## Required sections

### 1. Glossary
Table with columns: **Term | Definition | Where it appears in code**.

Must include at minimum: Genie space, stage, supervisor panel, compare panel, status capsule, knowledge base, multi-space config, context injection, schema-aware suggestion, prompt injection moat, DataView, pbiviz, format pane, Setup modal.

### 2. Component tree
A mermaid `flowchart` diagram of the React component hierarchy starting from the root in `visual.tsx`. Annotate edges with the major props passed down.

### 3. Root state shape
TypeScript interface for the root state. Show how it is initialized in the constructor and which fields are owned by which tab. Include a snippet of the actual state update pattern used.

### 4. Settings model (two interfaces)
- TS interface for the **Setup modal** settings (operational: connection, security, instructions, knowledge base, multi-space).
- TS interface for the **format pane** settings (appearance: header visibility, icon style, scale, mode, theme, setup-access toggle).
- Table mapping each setting field to the component that consumes it.

### 5. capabilities.json (full file)
The full file in a `json` fenced block. Above each top-level block (dataRoles, dataViewMappings, objects, privileges) include a one-line comment in the surrounding prose explaining its purpose. Highlight the **WebAccess allowlist** entries with their justification.

### 6. Power BI visual lifecycle
Subsections for `constructor`, `update`, `destroy`, `enumerateObjectInstances`. For each: when called by PBI host, inputs received, what PepPulse does, and a code snippet from `visual.tsx`.

### 7. Connection modes
Table with columns: **Mode | Auth mechanism | Endpoint pattern | Request shape | Response shape | When to use | Trade-offs**.

One row each for: Direct, Proxy, Gateway, Azure OpenAI, AWS Bedrock. Follow the table with the runtime mode-switching code snippet.

### 8. Proxy server contract (`proxy/server.js`)
- Env vars table: **Var | Required | Default | Purpose**.
- Endpoint table: **Method | Path | Request | Response | Auth | Rate limit**.
- Startup sequence as a numbered list with exact shell commands.
- IPv4/IPv6 dual-bind code snippet.
- CORS config snippet.
- Why `127.0.0.1` and not `localhost`: one paragraph with the actual failure mode it prevents.

### 9. AI Insights pipeline (6 stages)
For each stage (Context Build, Prompt Build, Query, Parse, Format, Display), a subsection containing:
- Purpose in one sentence.
- Input shape (TS interface).
- Output shape (TS interface).
- Algorithm summary, plus the verbatim prompt template if applicable.
- What is cached at this stage.
- Failure modes and recovery behavior.

End the section with a mermaid `sequenceDiagram` of the full pipeline that explicitly shows both the cache-hit and cache-miss paths.

### 10. Prompt templates
Every prompt template sent to Genie, verbatim, in fenced blocks. For each template, list the interpolated variables and the source of each variable.

### 11. Chat (Ask Pulse)
- Message shape (TS interface).
- Round-trip mermaid `sequenceDiagram` from user keypress to rendered response.
- Schema-aware suggestion algorithm as pseudocode or actual code.
- Context injection mechanism: what the user types, how it is parsed, how it is appended to the prompt.
- The stateless guarantee: name the file and line where retention is explicitly prevented.

### 12. Settings / Setup modal
- Component tree of the modal as a mermaid diagram.
- Status capsule states table: **State | Color | Icon | Trigger condition | Click behavior**.
- Save flow as a mermaid `sequenceDiagram` including any re-init triggers that fire after save.

### 13. Format pane
- Object schema as it appears in capabilities.json (extracted block).
- For each object: which component consumes it and how.
- A two-column table titled "Setup modal vs Format pane" listing what belongs in each. Justify the split.

### 14. Security pipeline
- Full list of blocked DML keywords (verbatim from the regex source).
- All regex patterns with the purpose of each.
- PII redaction rules: column-name heuristics, value patterns, replacement strategy.
- Token and credential storage: location, encryption, lifecycle.
- Error redaction policy with a mapping table: **Raw error pattern | User-facing string | Logged internally**.

### 15. Cache spec
- Exact cache key tuple in the correct order, with rationale for each element's position.
- Hash algorithm for `stageHash` and `schemaHash` with code snippet.
- TTL value and where it is set.
- Invalidation triggers (full list).
- Version bump protocol: how a cache schema change is rolled out without breaking existing users.
- localStorage size budget and eviction policy.

### 16. Theming
- Token list as a TS const or interface.
- How tokens reach components (CSS variables, context, props, other).
- PBI host theme to PepPulse token mapping table.
- Dark/light handling: trigger and propagation.

### 17. i18n and locale
- Where locale comes from (server injection: show the code path).
- Fallback chain when locale is missing.
- Number and date formatting functions used (with examples).
- String catalog structure if one exists.

### 18. Failure and degradation modes
Table: **Failure | Detection | User-facing behavior | Recovery | Logged**.

Cover at minimum: Genie 5xx, network drop mid-stage, proxy unreachable, cache corrupt, schema change between runs, auth token expiry, rate limit hit, malformed Genie response, DataView empty.

### 19. Build and dev workflow
Numbered, copy-pasteable command sequences for:
- First-time setup (Node 20.19.1 install, pbiviz install, cert install for PBI Desktop on Windows).
- Proxy startup (env vars, command, expected output).
- Visual dev mode (`pbiviz start`, where to add the dev visual in Service or Desktop).
- Production package build (`pbiviz package`, output location).
- Environment matrix table: **OS | Host | Supported | Notes**.

### 20. Performance
- Bundle size budget per chunk (main, compare panel, supervisor panel).
- Code-splitting boundaries: which imports are dynamic and why.
- Render budget per stage in milliseconds.
- Measurement method (Performance API, manual timestamps, other).

### 21. Accessibility
- ARIA pattern per interactive element (table: **Element | role | aria-* attributes | Why**).
- Keyboard map table: **Key | Action | Context**.
- Focus management rules (modal open, tab switch, after async response).

### 22. File map
Table: **Path | Purpose | LOC | Key exports | Depends on**.

Cover every file under `peppulseVisual/src/` and `proxy/`. Group by directory.

### 23. Tripwires
List form. Each tripwire must include four things: the rule, why it exists, what breaks if violated, and a code snippet showing the correct usage. No bare assertions.

### 24. Open questions / TODOs
Aggregate every `TODO: confirm from <file>` from the document into a checklist here for follow-up.

---

## Self-check before returning
Run through this list and fix anything that fails:

1. Does every section have at least one fenced code block, table, or mermaid diagram? If a section is prose only, you missed required artifacts. Redo it.
2. Is any section shorter than its artifacts justify? If a section is one paragraph plus a one-row table, you under-delivered. Expand.
3. Search the output for: robust, seamless, powerful, leverages, cutting-edge. Remove or rewrite.
4. Search for em dashes. Replace all of them.
5. Search for "etc." used to skip content. Expand or remove.
6. Verify the TOC anchors match the actual H2 headings.
7. Verify all mermaid blocks are syntactically valid (no `end` as a node name in flowcharts, quoted strings in sequence diagrams where punctuation is used).

Return the full Markdown only.
