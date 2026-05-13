# PulsePlay Prompt IR Architecture

> **Status:** Phase 11a design lock. Implementation pending.
>
> **Purpose.** PulsePlay supports many AI backends today (Databricks Genie, Supervisor, Mosaic Foundation Model, Azure OpenAI analytics, AWS Bedrock) and will add more (Copilot, MCP). Each backend has different prompt conventions, system-prompt semantics, tool-calling shapes, and output-format hooks. Today the same Genie-shaped markdown (`prompt-context.md`) is fed verbatim to every backend, under-performing on non-Genie targets.
>
> **The Prompt IR (intermediate representation)** is the author-facing, vendor-neutral contract. Authors write the IR once; per-backend translators render it into each backend's native shape. New backends are added as new translators against a stable IR — no per-vendor pack rewrites.
>
> **Companion docs:** [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md), [SETTINGS_SPEC.md](SETTINGS_SPEC.md), [PACKS.md](PACKS.md), [PROXY_REFERENCE.md](PROXY_REFERENCE.md), [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Problem framing

| Today | Why it breaks |
|---|---|
| `prompt-context.md` per sub-vertical is one Genie-shaped markdown blob | Foundation Model + Bedrock would benefit from proper system prompts, few-shot examples, JSON-Schema response shape, and native tool calling — none of which a markdown blob expresses |
| KPI definitions live in human-readable `kpis.md` | Backends with function calling can't invoke them as tools without a structured definition |
| Output format is implicit (Pulse's prompt template enforces HEADLINE / TRENDS / RISKS / ACTIONS) | Each backend's output validator is hard-coded; new sections require code changes |
| Guardrails are scattered (DML blocklist server-side, PII redactor client-side, instruction-keyword stripper) | Backends with system-prompt support could enforce *before* generation, not after |
| Few-shot examples aren't authored anywhere | OpenAI / Foundation Model / Bedrock benefit greatly from 2-3 in-context examples |
| Supervisor fan-out uses a hardcoded synthesis prompt | Each downstream space gets the same blob; synthesis can't differentiate per-space context |

**The architecture decision:** introduce a single, vendor-neutral IR; route to per-backend translators; keep the IR schema as the contract.

---

## 2. IR schema (v1)

One file per sub-vertical, alongside the existing markdown:

```
pulsepacks/<pack>/sub-verticals/<sub-vertical>/prompt-ir.yaml   (recommended)
                                              /prompt-ir.json   (also accepted)
```

### 2.1 Canonical YAML example — `pulsepacks/cpg-fmcg/sub-verticals/supply-chain/prompt-ir.yaml`

```yaml
schemaVersion: 1
id: cpg-fmcg/supply-chain

# Author + audience framing
role:
  persona: "supply-chain analyst"
  audience: "operations and S&OP planners"
  tone: "concise, evidence-led, no speculation"

# What the AI is trying to do
task:
  kind: answer-grounded     # answer-grounded | summarise | recommend | classify | execute-sql
  scope: "this Genie space + the bound BI surface"
  freshness: "as of the latest data refresh shown in the chart"

# Domain vocabulary — vendor-neutral
vocabulary:
  - term: OTIF
    definition: "On-Time-In-Full delivery rate = (orders delivered complete on time) / (total orders shipped)"
    units: percentage
    direction: higher-is-better
  - term: forecast-accuracy
    definition: "1 minus WAPE over the last 13 weeks"
    units: percentage
    direction: higher-is-better

# Tools the model can call (mapped per backend in §3)
functions:
  - name: compute_kpi
    description: "Compute a KPI from the connected SQL warehouse"
    parameters:
      kpi: { type: string, enum: ["OTIF", "forecast_accuracy", "fill_rate"] }
      window: { type: string, enum: ["last_4w", "last_13w", "ytd", "yoy"] }

# Guardrails — translated per backend
guardrails:
  must:
    - "Cite the columns / measures used in every numeric claim."
    - "When unsure, state the limitation and propose a follow-up query."
    - "Use the KPI definitions in `vocabulary`; never reinvent semantics."
  mustNot:
    - "Execute DML (UPDATE / DELETE / INSERT / DROP / ALTER)."
    - "Speculate beyond data shown in the active BI view."

# Output shape — drives validator + JSON-Schema response hint when supported
output:
  format: structured-sections
  sections:
    - { id: HEADLINE, required: true, maxChars: 280 }
    - { id: TRENDS,   required: false, maxItems: 4 }
    - { id: RISKS,    required: false }
    - { id: ACTIONS,  required: false }

# Few-shot anchors (used by translators that support them)
examples:
  - q: "How's our supply chain health?"
    a: |
      ## HEADLINE
      OTIF at 92% (target 95%, ▼3pp YoY) — recovery stalling.

# Per-backend overrides — only when the translator can't faithfully represent the IR
overrides:
  genie:
    extraUserPreamble: "Use the vocabulary above when interpreting business terms."
  bedrock-anthropic:
    useXmlSections: true
```

### 2.2 The same content as `prompt-ir.json`

```json
{
  "schemaVersion": 1,
  "id": "cpg-fmcg/supply-chain",
  "role": { "persona": "supply-chain analyst" },
  "task": { "kind": "answer-grounded" },
  "vocabulary": [
    { "term": "OTIF", "definition": "On-Time-In-Full delivery rate" }
  ]
}
```

Same parsed object, same downstream behaviour. The schema is the contract; YAML/JSON are just serialisations.

### 2.3 Required vs optional fields

| Field | Required? | Default if absent |
|---|:---:|---|
| `schemaVersion` | ✅ | none — must be `1` |
| `id` | ✅ | none — must equal `<pack>/<subVertical>` |
| `role` | ⏳ optional | empty persona |
| `task.kind` | ⏳ optional | `answer-grounded` |
| `vocabulary` | ⏳ optional | empty array |
| `functions` | ⏳ optional | empty array |
| `guardrails` | ⏳ optional | empty must/mustNot |
| `output` | ⏳ optional | `format: free-text` (no validator hooks) |
| `examples` | ⏳ optional | empty array |
| `overrides` | ⏳ optional | none |
| `meta.synthetic` | ⏳ system-only | `false`; set to `true` by the synthetic-IR builder |

---

## 3. Translator pattern

Each backend gets a translator at `proxy/lib/promptTranslators/<backend>.js`. Pure function: `translate(ir, request) → backendPayload`. ~100-200 LOC each.

### 3.1 Translator interface

```typescript
interface PromptRequest {
    userQuestion: string;
    // Optional context from the BI panel (current page / filters / selections)
    biContext?: { vendor: string; page?: string; filters?: object };
    // Supervisor + analytics modes pass extra fields the translator can use
    spaces?: string[];           // Supervisor fan-out
    schemaContext?: string;      // Azure OpenAI analytics mode
}

interface Translator {
    type: string;
    translate(ir: IR, request: PromptRequest): BackendPayload;
}
```

Each `BackendPayload` is whatever the backend's native API expects (Genie: `{ kind: 'genie', userMessage: string }`; Foundation Model: OpenAI chat-completions request; Bedrock: Anthropic messages, etc.).

### 3.2 Per-backend behaviour

| Backend | IR mapping |
|---|---|
| **Genie** | No system-prompt API. Translator builds a single user message: `[Persona]…[Vocabulary]…[Available concepts: functions as descriptive list]…[Guardrails]…[Question]`. Functions are listed as concept hints (Genie can't call them). |
| **Foundation Model** (OpenAI-compatible) | System prompt from `role + guardrails + vocabulary + output.format`. Few-shot user/assistant messages from `examples`. `tools: [{ type: "function", function: f }]` from `functions`. `response_format: { type: "json_schema", json_schema: buildSchema(output.sections) }` when `output.format === structured-sections`. |
| **Supervisor (local + remote)** | Fan-out: each constituent space's request is the Genie translator output keyed for that space. The synthesis layer (if present) uses the Foundation Model translator with `task.kind = "summarise"`. |
| **Azure OpenAI (analytics mode)** | Two-call split: (1) "Write SQL for this question" — uses vocabulary + functions definitions + the analytics-mode `schemaContext`. (2) "Narrate this result" — uses `output.sections` + `guardrails`. |
| **AWS Bedrock — Anthropic** | Claude-shaped tool definitions (different JSON shape from OpenAI). XML-tagged sections when `overrides.bedrock-anthropic.useXmlSections: true`. |
| **AWS Bedrock — Llama** | OpenAI-compatible-ish; mostly the same as Foundation Model translator. |
| **Copilot** (post-MVP) | Maps `functions` to plugin manifest / OpenAPI spec. Guardrails map to content policy. |
| **MCP** (post-MVP) | Cleanest target — IR `functions` map directly to MCP tool definitions. |

### 3.3 Dispatcher

`proxy/lib/promptDispatcher.js` — top-level facade. Routes by profile type.

```js
const translators = {
    'genie':              require('./promptTranslators/genie'),
    'supervisor-local':   require('./promptTranslators/supervisor'),
    'supervisor':         require('./promptTranslators/supervisor'),
    'foundation-model':   require('./promptTranslators/foundationModel'),
    'openai':             require('./promptTranslators/openai'),
    'bedrock-anthropic':  require('./promptTranslators/bedrockAnthropic'),
    'bedrock-llama':      require('./promptTranslators/bedrockLlama'),
};

function buildBackendPayload(profile, packRequest, request) {
    const ir = loadIR(packRequest.pack, packRequest.subVertical) || buildSyntheticIR(packRequest);
    const translator = translators[profile.type || 'genie'];
    if (!translator) throw new Error(`No prompt translator for connector type "${profile.type}"`);
    return translator.translate(ir, request);
}
```

The existing `packPromptInjector.resolvePackContext()` + `wrapAsGenieUserMessage()` calls keep working: their behaviour is preserved by the **synthetic-IR + Genie translator** path (§ 4 below). No live behaviour change in Phase 11a.

---

## 4. Migration path (don't break MVP 0.2 packs)

Backward-compatibility is load-bearing. Strategy:

| Step | What | When |
|---|---|---|
| **0** | Add `loadIR(pack, sv)` that returns parsed IR if `prompt-ir.yaml` / `prompt-ir.json` exists; otherwise builds a **synthetic IR** from existing `prompt-context.md` / `glossary.md` / etc. | Phase 11a |
| **1** | Ship `genie.translate(syntheticIR, req)` whose output is **byte-identical** to today's `wrapAsGenieUserMessage(prompt-context.md content, pack, sv, question)` — locked by regression test. | Phase 11a |
| **2** | Ship `foundationModel.translate` + `supervisor.translate` — these can use richer IR when authored, fall back gracefully on synthetic IR. | Phase 11a |
| **3** | Author the first real `prompt-ir.yaml` (cpg-fmcg/supply-chain). Run dry-run preview for all enabled backends. Tune. | Phase 11a (this cycle) |
| **4** | Migrate other sub-verticals one at a time. Old `prompt-context.md` stays authoritative until the sub-vertical has its `prompt-ir.yaml`. | Phase 11b cycles |
| **5** | Add Bedrock + Copilot translators. | Phase 11c |
| **6** | Retire `prompt-context.md` as primary; keep as a fallback for un-migrated packs. | When all sub-verticals migrated |

**No MVP 0.2 deployment is affected** — packs without `prompt-ir.yaml` keep working via the synthetic IR path. Backward compat is the regression test guard.

---

## 5. Format support: YAML and JSON (both)

Authors author in whichever they prefer. The loader handles either:

```text
loadIR(pack, subVertical)
├── try `<sv-dir>/prompt-ir.yaml` → js-yaml.load() → validateIR() → return
├── try `<sv-dir>/prompt-ir.json` → JSON.parse()    → validateIR() → return
└── return buildSyntheticIR(pack, subVertical)        (backward compat)
```

| Concern | Both formats handled |
|---|---|
| **Loader precedence** | YAML first, then JSON. If both exist, warn and prefer YAML. |
| **Schema validation** | Runs on the **parsed object**, format-agnostic. |
| **Translators** | Read the parsed object — never touch the file format. |
| **Tests** | Test fixtures pair: identical content as `prompt-ir.yaml` and `prompt-ir.json`. Asserts `loadIR()` returns deep-equal objects. |

### Dependency cost

| Package | Where | Size | Notes |
|---|---|---|---|
| `js-yaml@4.x` | `proxy/package.json` dep | ~30 KB minified, ~10 KB gzipped | Proxy-side only; never ships to the browser. Use `yaml.load` with `JSON_SCHEMA` (no custom YAML tags = no historical YAML CVEs). |

### Default to YAML for authoring

| | YAML | JSON |
|---|:---:|:---:|
| Multi-line prompt bodies (`\|` / `>`) | ✅ first-class | ❌ ugly `\n` escapes |
| Comments (`#`) | ✅ first-class | ❌ none |
| Diff-friendly review | ✅ line-oriented | △ punctuation noise |
| Author familiarity (LangChain, OpenAI configs) | ✅ industry default | △ JS dev default |
| VS Code schema validation | ✅ via YAML extension | ✅ native |
| Strictness | △ less strict (footgun for novices) | ✅ strict |

Recommend YAML in `pulsepacks/*` repo content; accept JSON for authors who prefer it.

---

## 6. Authoring + preview UX (Phase 11b)

The IR is YAML — diff-friendly, comment-friendly. But authors shouldn't write YAML blindly. Three affordances:

| Affordance | Where | What it does |
|---|---|---|
| **JSON-Schema validation** | proxy startup + `node scripts/check-prompt-ir.js <pack>/<sv>` | Catches typos / missing fields / wrong enums. Returns non-zero exit code in CI. |
| **Dry-run translator preview** | Knowledge Base page: `Runtime use` tab gains a "Show translated prompt for…" picker | Pick a backend from the allowlist, see exactly what gets sent. <100ms (pure functions). |
| **Live A/B harness** (Phase 11c) | Knowledge Base › Pack Detail › Evaluate | Run 10 golden questions through each enabled backend; show side-by-side. Flag where translators diverge significantly. |

The Knowledge Base page already has a `Runtime use` tab — Phase 11b expands it to show the rendered backend payload for the active provider.

---

## 7. Validator integration

`output.sections` in the IR becomes the canonical spec. The existing `proxy/lib/insightsValidator.js` reads its section list from the loaded IR instead of hardcoded constants.

| Today | After IR |
|---|---|
| Section list hardcoded in `visualHelpers.ts` and `insightsValidator.js` | Section list read from the active pack's IR |
| Validator schema baked into Pulse + proxy | Validator builds its schema from `ir.output.sections` |
| New sections require code changes | New sections = author edit to the IR |

Pack authoring becomes the source of truth for output shape. Validator's auto-retry on shape mismatch still fires; the difference is what shape it's checking against.

---

## 8. Versioning + observability

| Concern | Mechanism |
|---|---|
| **IR evolution** | `schemaVersion` field. Validator supports N and N-1; deprecation messages on N-2. |
| **Telemetry** | Every translator output carries `meta: { irVersion, irId, translator, modelHint }`. Audit log records this per request. Lets you query "which translator-version produced the answer?" |
| **A/B safety** | Authoring change to IR ships behind a feature-flag per pack (`pack.json.experimental: true`) until the eval suite passes. |
| **Rollback** | Per-pack IR pinned at deploy time. Allowlist can pin specific IR versions if needed. |

---

## 9. Implementation phases

| Phase | Scope | Files |
|---|---|---|
| **11a (this cycle)** | Schema + loader + synthetic IR + Genie/FoundationModel/Supervisor translators + dispatcher + first concrete YAML + CLI + tests | `proxy/lib/promptIR.js`, `proxy/lib/promptTranslators/`, `proxy/lib/promptDispatcher.js`, `scripts/check-prompt-ir.js`, `pulsepacks/cpg-fmcg/sub-verticals/supply-chain/prompt-ir.yaml` |
| **11b** | Bedrock-Anthropic + Bedrock-Llama translators + Knowledge Base `Runtime use` tab gains "Show translated prompt" preview + migrate remaining cpg-fmcg sub-verticals to `prompt-ir.yaml` | `proxy/lib/promptTranslators/bedrock*.js`, `playground/src/knowledge/KnowledgeShell.tsx` |
| **11c** | Eval harness (golden Q&A run against each backend, side-by-side diff) + validator integration (validator reads from IR) | `proxy/lib/promptEval.js`, `insightsValidator.js` |
| **11d** | Copilot adapter scaffold + MCP adapter (cleanest target — IR functions map directly to MCP tool definitions) | `proxy/lib/promptTranslators/copilot.js`, `.../mcp.js` |

---

## 10. Cross-references

- [SETTINGS_SPEC.md](SETTINGS_SPEC.md) — Settings page master spec
- [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) — Knowledge plane + Knowledge Base IA
- [PACKS.md](PACKS.md) — pack architecture overview
- [PROXY_REFERENCE.md](PROXY_REFERENCE.md) — proxy API surface
- [ARCHITECTURE.md](ARCHITECTURE.md) — 2-axis design + Knowledge plane
- [DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md) — MVP 0.2 deployer checklist (existing proxy/config.json shape predates the IR; no impact on deploy until Phase 11b migrates a sub-vertical)
- [AGENDA.md § Settings + Knowledge plane](AGENDA.md) — open work tracker
