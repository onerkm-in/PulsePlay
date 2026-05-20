# Connector Probe & Smart Connect — Agnostic Design

> **Status:** Partially implemented. Proxy probe, pack matcher, playground probe client, Test Connection panel, and Pack Picker are present. The 10-minute Genie + Power BI setup wizard still needs to compose these into one novice-author flow.
> **Scope:** Connector-agnostic. Works for Genie / Supervisor / OpenAI / Bedrock / Foundation Model / MCP / future custom backends.
> **Companion docs:** [ARCHITECTURE.md](ARCHITECTURE.md), [PACKS.md](PACKS.md), [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md), [pulsepacks/PACK_SPECIFICATION.md](../pulsepacks/PACK_SPECIFICATION.md)
> **First-build use:** [TEN_MINUTE_AUTHOR_SETUP.md](TEN_MINUTE_AUTHOR_SETUP.md)

---

## Why this exists

When a user connects PulsePlay to an AI brain (a Databricks Genie space, a Mosaic Supervisor agent, an Azure OpenAI deployment, an MCP server, etc.), three things should happen automatically — and one should always require human confirmation:

1. **Probe** — PulsePlay asks the connector, in a connector-neutral way, *"what do you know about?"*
2. **Infer** — PulsePlay matches what comes back against known pack vocabularies (Supply Chain / Procurement / Manufacturing / Sustainability / etc.) and proposes a pack + sub-vertical.
3. **Mark** — Settings-page dropdowns (KPIs, sample questions, prompt templates) get a `*` next to options that the underlying data appears to support, based on probe results.
4. **Confirm** — The author *always* gets the final say. Suggestions can be kept, edited, or removed. PulsePlay never silently locks in an inferred choice.

This is what makes PulsePlay feel "smart" without giving up agnosticism. Genie spaces happen to expose rich metadata (descriptions, instructions, table schemas, sample SQLs); chat-only OpenAI deployments expose almost nothing. The probe interface treats both uniformly and **degrades gracefully** — the experience is better when more metadata is available, but PulsePlay still works when none is.

Smart Connect is the setup/inference front door for the broader Knowledge plane. It can suggest a pack and explain why. It does not by itself provide governed retrieval, vector indexing, citations, ACL-trimmed source search, or a Knowledge Base browser. Those responsibilities live in [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md).

---

## Design principles

### 1. Agnostic-first

The probe contract is defined in *PulsePlay's* vocabulary, not Genie's. Every connector type implements its own probe adapter that translates its native metadata into the canonical shape. No code outside the connector adapter knows how Genie or OpenAI or MCP exposes metadata.

### 2. Graceful degradation

Chat-only LLMs (Azure OpenAI without `schemaContext`, raw Bedrock InvokeModel) return a probe with `metadataAvailability: "none"`. That's a valid response. The Settings page falls back to "no inference available — please pick manually" mode. PulsePlay does not pretend to know what it doesn't know.

### 3. Author-final-say

Every inferred suggestion is *suggested*, not applied. The author confirms with a single click. Wrong suggestions cost zero — the author edits or removes them. The platform never traps the author in an inferred choice.

### 4. Pack-aware, not pack-locked

If the probe suggests "Procurement" but the user's intent is to build a Supply Chain solution against the same data, the user just picks Supply Chain in the pack picker. Probe results inform; user choice overrides.

### 5. Explainability

Every inferred suggestion includes a short *because* trace. "Inferred Supply Chain because the Genie space description mentions 'OTIF', 'service level', and 'fill rate'." The author can read why, not just what.

### 6. Minimum-data fallback (the "self-aware prompting" path)

When a connector exposes no structured metadata — only raw column names, or just a connection — PulsePlay falls back to **basic prompting**: it asks the connector's LLM, in a single short call, to classify the data domain and propose 5 candidate KPIs based on the column names alone. This is a well-bounded, single-shot inference. It is not a chat. It runs once at probe time, the result is cached, and the author still confirms.

---

## The Connector Probe interface

### Probe request

PulsePlay calls `connector.probe()` at two moments:
- After the user clicks **Test Connection** in the Settings page.
- When the user changes the connector profile in an existing session (re-probe).

Probe is read-only. It must not modify state on the backend. Probe failures are non-fatal — the connector remains usable, the system just falls into "no metadata" mode.

### Probe response shape (canonical, connector-neutral)

```typescript
interface ConnectorProbeResult {
    // ── Identity ──────────────────────────────────────────────────────────
    /** Connector profile name (matches assistantProfile in requests). */
    profile: string;
    /** Connector type tag — "genie" | "supervisor-local" | "supervisor" |
     *  "openai-chat" | "openai-analytics" | "bedrock-rag" | "bedrock-direct" |
     *  "foundation-model" | "mcp-server" | "generic" */
    connectorType: string;
    /** Free-text label shown to users. May be empty. */
    displayName?: string;

    // ── Metadata availability ────────────────────────────────────────────
    /** "rich" — connector exposed structured metadata we can match against pack vocabularies.
     *  "minimal" — only basic info (e.g., connector name) was retrievable.
     *  "none" — chat-only or generic backend with no introspectable metadata. */
    metadataAvailability: "rich" | "minimal" | "none";

    // ── Domain hints (filled when metadataAvailability != "none") ────────
    /** Free-text description of what this connector is "about". */
    description?: string;
    /** Stated purpose / intent (e.g., from a Genie space's "purpose" field). */
    purpose?: string;
    /** Author / owner / team if exposed. */
    owner?: string;
    /** Last-updated timestamp if exposed. */
    lastUpdated?: string;

    // ── Schema hints (filled when the connector exposes table info) ──────
    schema?: {
        tables: Array<{
            name: string;
            description?: string;
            columns: Array<{
                name: string;
                type?: string;
                description?: string;
                /** Marked when the column appears to be a KPI / measure. */
                isMeasure?: boolean;
            }>;
        }>;
    };

    // ── Tool / capability hints (for agent-pattern + MCP connectors) ─────
    tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: object;
    }>;

    // ── KPI hints (filled when KPIs are explicitly declared in the backend) ─
    declaredKpis?: Array<{
        name: string;
        description?: string;
        formula?: string;
        higherIsBetter?: boolean;
    }>;

    // ── Sample-question hints (filled when the backend has examples) ─────
    sampleQuestions?: string[];

    // ── Pack inference (filled by PulsePlay's matcher, not the backend) ──
    inference?: {
        suggestedPack?: string;        // e.g., "cpg-fmcg"
        suggestedSubVertical?: string; // e.g., "supply-chain"
        confidence: number;            // 0..1
        because: string[];             // ["Genie space description mentions 'OTIF', 'service level'"]
        alternatives?: Array<{ pack: string; subVertical?: string; confidence: number }>;
    };

    // ── Diagnostics ──────────────────────────────────────────────────────
    /** Probe duration ms; surfaced in test-connection panel. */
    probeDurationMs: number;
    /** Non-fatal warnings encountered during probe. */
    warnings?: string[];
}
```

### Per-backend probe behavior

The probe interface is uniform; the **adapter** for each connector type implements it differently:

| Connector type | What the probe does | What it returns |
|---|---|---|
| **Genie space** | `GET /api/2.0/genie/spaces/{spaceId}` for description + instructions; `POST /sql/statements` with metadata-only queries for table list + columns; pull `sample_queries` if exposed | `metadataAvailability: "rich"` — description, schema, sometimes declared KPIs, sometimes sample questions |
| **Supervisor (real Mosaic agent)** | Read agent description from the serving-endpoint metadata; helper-space list if surfaced | `metadataAvailability: "minimal" | "rich"` — description + helper space identities |
| **Supervisor-local** | Probe each child Genie profile, merge results | `metadataAvailability: "rich"` — combined schema across helpers |
| **Azure OpenAI (analytics mode)** | Read `profile.schemaContext` if configured; otherwise `metadataAvailability: "minimal"` | `metadataAvailability: "rich"` if schema in config; `"minimal"` otherwise |
| **Azure OpenAI (chat-only)** | No backend introspection possible | `metadataAvailability: "none"` |
| **Bedrock RetrieveAndGenerate** | Read knowledge-base name / description if surfaced; document-count / index size | `metadataAvailability: "minimal" | "rich"` |
| **Bedrock InvokeModel (direct)** | No backend introspection possible | `metadataAvailability: "none"` |
| **Foundation Model serving** | Endpoint name only | `metadataAvailability: "minimal"` |
| **MCP server** | List `tools` and `resources` per the MCP spec | `metadataAvailability: "rich"` — tools array populated |
| **Generic** | Whatever the connector self-reports via custom fields | Variable |

A connector's probe adapter is the only place that knows about backend-specific APIs. Everything downstream sees only `ConnectorProbeResult`.

---

## Pack inference / matching

The matcher takes a probe result and runs over the installed pack vocabulary (see [pulsepacks/](../pulsepacks/) and `pack.json` manifests).

### Matching signal sources (in order of weight)

1. **Declared KPIs** — when the backend exposed KPI names (e.g., a Genie space with `declaredKpis: [{ name: "OTIF" }]`), match against pack `knowledge-base/glossary.md` and per-sub-vertical `kpis.md`. Highest weight.
2. **Description / purpose text** — fuzzy match against pack glossary terms and sub-vertical descriptions.
3. **Schema column names** — match against expected measures and dimensions (e.g., `service_level_pct`, `forecast_accuracy`, `lane_id` → Supply Chain).
4. **Tool names** (MCP) — match against pack tool-name expectations.
5. **Owner / team name** — weakest signal; sometimes the team name reveals domain ("Procurement Analytics Team" → Procurement).

### Output

```
{
    suggestedPack: "cpg-fmcg",
    suggestedSubVertical: "supply-chain",
    confidence: 0.78,
    because: [
        "Genie space description contains: 'OTIF', 'service level', 'fill rate' (all CPG-FMCG / Supply Chain glossary terms)",
        "Schema includes columns: lane_id, carrier_id, dc_id, otif_pct (typical Supply Chain measures)",
        "Three declared KPIs match Supply Chain canonical KPIs"
    ],
    alternatives: [
        { pack: "cpg-fmcg", subVertical: "vendor-management", confidence: 0.42 }
    ]
}
```

### Confidence threshold

- `confidence >= 0.70` → present as the recommended choice with a single-click confirm
- `0.40 <= confidence < 0.70` → present as a suggestion with alternatives shown side-by-side
- `confidence < 0.40` → no suggestion; show "we couldn't infer — please pick a pack manually"

---

## The Smart Connect flow (UX)

### Step 1 — Test Connection runs the probe

When the author clicks **Test Connection** in Settings, PulsePlay:
1. Authenticates against the configured profile.
2. Calls `connector.probe()` — bounded by a probe-time-budget (default 8 s).
3. Renders a probe-result panel with three sections:
   - **Connection status** — green / amber / red, with the diagnostics.
   - **Metadata snapshot** — what we found (description, schema highlights, declared KPIs, sample questions). Empty sections gracefully say "not exposed by this connector".
   - **Inference summary** — suggested pack + sub-vertical with the *because* trace, plus a "Pick a different pack" link.

### Step 2 — Author confirms or overrides the pack

The pack picker is a flat list of installed packs. The inferred choice is preselected (with a `*` icon and tooltip "auto-suggested"). Author can change it.

### Step 3 — Dropdown applicability marking

Once a pack is chosen, every Settings-page dropdown that draws from pack content (KPIs, sample questions, prompt templates, sub-vertical templates) marks options with a `*` if the option appears to be *applicable to the underlying data* based on probe results. Non-applicable options are still visible — they're just unmarked. The author can pick anything; the `*` is hint, not enforcement.

Example:
- Pack: `cpg-fmcg`, Sub-vertical: `supply-chain`
- KPI dropdown shows ten KPIs from `pulsepacks/cpg-fmcg/sub-verticals/supply-chain/kpis.md`
- Probe found `otif_pct`, `service_level`, `fill_rate` in the schema
- Those three KPIs in the dropdown get `*` marks
- The other seven KPIs remain pickable but unmarked
- A "Why these are starred" link expands the *because* trace

### Step 4 — KPI inference fallback (the self-aware prompting path)

If the probe returned `metadataAvailability: "minimal"` or schema columns that don't directly match any pack KPI, PulsePlay offers an **AI Suggest** button. Clicking it runs ONE short LLM call:
- Input: column names, basic data types, and the chosen sub-vertical name
- System prompt: "You are an analytics assistant. Given these column names from a [sub-vertical] dataset, suggest 5 KPIs that could be computed. Reply as JSON only."
- Output: 5 KPI suggestions with name + formula + why
- Author reviews, edits, keeps or removes each one. Saved suggestions persist in the profile config.

This is bounded — one call, one shot, cached. No agentic loops. Works against any LLM connector that supports chat completion (which is all of them).

### Step 5 — Author always has the final say

At every step, the author can:
- Override the suggested pack
- Edit a suggested KPI
- Remove a suggested sample question
- Add their own KPI / question / template
- Re-run the probe (e.g., if they updated the Genie space description)

PulsePlay never silently locks in an inference.

---

## What this gives us

### For the user
- Connecting to a known-domain Genie space gets you a working setup in under a minute.
- Connecting to a chat-only OpenAI deployment still works — it just doesn't get fancy inference.
- Mistakes are recoverable (re-probe, override, edit).
- The author-final-say rule means PulsePlay is *helpful*, not *bossy*.

### For the platform
- Everything is agnostic. Adding a new connector type means writing one probe adapter, not modifying inference / matching / UX.
- Adding a new pack means writing pack vocabulary; the matcher picks it up automatically.
- The inference confidence + *because* trace is auditable. If the wrong pack gets suggested too often, we can see why and fix the matcher's weighting.

### For the standards story
- The probe contract is documented and stable. Future internal teams can write their own probe adapters for proprietary internal AI endpoints without touching PulsePlay core.
- Eventually (Public OSS phase), this becomes part of the public connector authoring SDK.

---

## What this is NOT

- **Not a deep schema-introspection engine.** We do not run heavy analytical queries. The probe budget is 8 seconds total.
- **Not an automated pack creator.** Probe + matcher + suggest fall back to "ask the user" when confidence is low. We do not invent packs.
- **Not a hallucination shield.** If a backend's metadata is wrong (Genie space description claims it's about Supply Chain but actual data is Procurement), the inference will be wrong. The author confirms — that's the catch.
- **Not the AI Insights pipeline.** This is connection-time setup. Insights generation is a separate path (orchestrator + validator framework already exist in the proxy).

---

## Open questions for next cycle

1. **Probe caching strategy** — per-profile, with TTL. Default 24 h? Re-probe trigger conditions?
2. **Matcher implementation** — weighted keyword search vs embedding similarity vs hybrid. Embedding gives better fuzzy match but adds infra complexity (vector index per pack).
3. **MCP server probe** — what level of resource introspection do we expect MCP servers to support? Will need to test against several real MCP servers.
4. **Multi-pack matching** — what if the data legitimately supports multiple sub-verticals? (e.g., a finance dataset that also covers procurement). Show top-N, let the user pick.
5. **Probe audit-logging** — every probe is a backend call. Log it for cost-tracking + security audit.
6. **Probe-time-budget per connector type** — Genie probe is fast (single REST call); MCP probe could be slow if the server lists many tools. Tune per type.

---

## Cross-references

- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — the 2-axis platform design
- [docs/PACKS.md](PACKS.md) — pack architecture overview
- [pulsepacks/PACK_SPECIFICATION.md](../pulsepacks/PACK_SPECIFICATION.md) — pack manifest schema
- [pulsepacks/cpg-fmcg/](../pulsepacks/cpg-fmcg/) — first reference pack
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — current proxy state, including the 10 backend paths the probe must cover
- [docs/research/MARKET_AND_STANDARDS.md](research/MARKET_AND_STANDARDS.md) — competitive landscape and the MCP-everything hypothesis

---

*Compiled 2026-05-10 as part of the Path C foundation cycle. Implementation lives in a future cycle (post-AI-sidebar-v1, post-real-vendor-adapter).*
