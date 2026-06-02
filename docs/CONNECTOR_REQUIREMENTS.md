# Connector Requirements & Free-Edition Notes

> **Purpose.** Everything an operator must configure to make each AI connector
> (the X-axis) work, plus what the **Databricks Free Edition** / free-tier
> accounts do and don't support. Captured hands-on during the 2026-06-02 live
> connector pass. Pair with [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) (run/host)
> and [PROXY_REFERENCE.md](PROXY_REFERENCE.md) (API surface).
>
> **Plug-and-play principle:** swapping an org's credentials into
> `proxy/config.json` (or `PROXY_PROFILE_*` env vars) should make a connector
> live. This doc is the checklist of *what those credentials/fields are* per
> connector. If the free edition can't do something, it's flagged **[FREE-GAP]**
> with what a paid tier needs.

---

## How to discover what your workspace actually supports

Before configuring the LLM-backed connectors, list the **serving endpoints**
your workspace actually exposes — names differ per workspace/tier and the wrong
name returns `404 ENDPOINT_NOT_FOUND`:

```bash
# from proxy/ — uses the default profile's host+token
NODE_OPTIONS=--use-system-ca node -e "
const c=require('./config.json'),p=c.profiles.default,https=require('https');
const host=p.host.replace(/^https?:\/\//,'').replace(/\/$/,'');
https.request({host,path:'/api/2.0/serving-endpoints',method:'GET',headers:{Authorization:'Bearer '+p.token}},r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>console.log(JSON.parse(d).endpoints.map(e=>e.name).join('\n')))}).end();
"
```

Example output on a **Free Edition** workspace (2026-06-02) — note **no
`*-405b`**, and Llama is `3-3-70b` / `3-1-8b` (dashes, not dots):

```
databricks-claude-opus-4-8
databricks-gpt-oss-120b
databricks-gpt-oss-20b
databricks-qwen3-next-80b-a3b-instruct
databricks-llama-4-maverick
databricks-meta-llama-3-1-8b-instruct
databricks-meta-llama-3-3-70b-instruct
databricks-gte-large-en        (embeddings)
databricks-bge-large-en        (embeddings)
```

> **Tripwire (verified live):** a stale config pointed at
> `databricks-meta-llama-3.1-405b-instruct` (dot-form, 405b) — that endpoint
> does **not** exist on Free Edition, so Foundation Model chat 404'd and
> Supervisor synthesis fell back to raw results. Always set
> `foundationModelEndpoint` / `synthesisEndpoint` to a name from the list above.

---

## Per-connector checklist

Each connector is one entry in `proxy/config.json → profiles`. Common auth
options (keep all available — don't prune): PAT `token`, OAuth-M2M
(`authMode: "oauth-m2m"` + `clientId`/`clientSecret`), user-refresh/device-code,
or Databricks Apps service-principal injection.

### 1. Genie (`type` omitted or `"genie"`)
| Field | Required | Notes |
|---|---|---|
| `host` | ✅ | `https://<workspace>.cloud.databricks.com` |
| `token` | ✅ | PAT (or OAuth-M2M pair) with access to the space |
| `spaceId` | ✅ | the Genie space id |
| `warehouseId` | optional | enables SQL warmup + `/sql/preview`; omit and warmup is a 200 no-op |

**Free Edition:** ✅ fully works (live answers + charts). Genie space must be
created in the workspace UI first.

### 2. Power BI semantic-model (`type: "powerbi-semantic-model"`)
| Field | Required | Notes |
|---|---|---|
| `powerBiGroupId` / `powerBiDatasetId` | ✅ | workspace + dataset (or via `POWER_BI_GROUP_ID` / `POWER_BI_DATASET_ID` env) |
| auth | ✅ | service-principal or user-refresh token with **dataset Read + Build** |

No LLM, no warehouse. Renders deterministic DAX tables **and charts** (Ask Pulse
+ AI Insights). **`executeQueries` needs NO Fabric/Premium capacity** — works on
any Pro/PPU workspace with the tenant setting enabled.
**[FREE-GAP]** the report *visual* embed (Dashboard tab live render) needs a
Fabric trial / Premium capacity; the semantic-model DAX path does not.

### 3. Foundation Model (`type: "foundation-model"`)
| Field | Required | Notes |
|---|---|---|
| `host` | ✅ | workspace host |
| `token` | ✅ | PAT with serving-endpoint invoke permission |
| `foundationModelEndpoint` | ✅ | **must exist in the serving-endpoints list** (see above) |

Powers both sectioned AI Insights (`/foundation/section`) and **free-form Ask
Pulse chat** (added 2026-06-02). It's an ungrounded LLM — it has no data binding,
so it will say "I'd need the data" unless you feed it context. **Free Edition:**
✅ works against the free serving catalog (e.g. `databricks-meta-llama-3-3-70b-instruct`).

### 4. Supervisor — local fan-out (`type: "supervisor-local"`)
| Field | Required | Notes |
|---|---|---|
| `spaces` | optional | array of helper **Genie** profile names; empty/omitted → auto-discovers all genie-eligible profiles |
| `synthesisEndpoint` | ✅ | a valid serving endpoint name (synthesis LLM) |
| `agentName` | optional | display label |
| `host`/`token` | **not required** | borrows a helper profile's workspace creds for the synthesis call |

Routes via `/supervisor/conversations/start(-stream)` (client auto-detects via
`/supervisor/health`). Fans out only to genie-eligible helpers; **Free Edition:**
✅ works (fan-out + synthesis), subject to Genie's 5 req/min/workspace rate limit
(staggered 2000 ms per ADR-0003).

### 5–10. Other backend paths
Azure OpenAI chat/analytics, Bedrock RAG/direct, ResponsesAgent, Power BI Q&A
embed — see [ARCHITECTURE.md](ARCHITECTURE.md) "Ten runtime backend paths".
**[FREE-GAP]** Power BI Q&A and report-visual render need paid/trial capacity;
all the LLM paths need their respective cloud credentials.

---

## Free-tier functional matrix (what to expect)

| Capability | Databricks Free | Azure Free (F1) | Power BI Free |
|---|---|---|---|
| Genie chat + SQL | ✅ | n/a | n/a |
| Foundation Model serving | ✅ (limited catalog, **no 405b**) | n/a | n/a |
| Supervisor fan-out + synthesis | ✅ (rate-limited) | n/a | n/a |
| semantic-model DAX (`executeQueries`) | n/a | n/a | ✅ (Pro tenant setting) |
| report **visual** embed render | n/a | n/a | **[FREE-GAP]** Fabric trial/Premium |
| SSE/streaming responses | ✅ | **[FREE-GAP]** F1 stalls after 1st chunk → needs Basic tier | n/a |
| daily app runtime | **[FREE-GAP]** daily cap + 3-app/24h auto-stop | **[FREE-GAP]** 60 CPU-min/day, cold starts, no Always-On | n/a |

> Never provision a paid tier without explicit approval — these are dev/test
> beds to prove the build connects, not production load. See memory
> `project_azure_free_account`.

---

## Quick verification (per connector)

```bash
# Genie / Foundation (assistant chat path)
curl -s -XPOST localhost:7000/assistant/conversations/start \
  -H 'content-type: application/json' \
  -d '{"content":"What were total sales by segment?","assistantProfile":"<name>"}'

# Supervisor (dedicated route)
curl -s -XPOST localhost:7000/supervisor/conversations/start \
  -H 'content-type: application/json' \
  -d '{"content":"What were total sales by segment?","assistantProfile":"supervisor"}'
```

A healthy connector returns `status: COMPLETED` (Genie/PBI/Foundation) or a
synthesized `content` with `route.spaceResults` (Supervisor). A `404
ENDPOINT_NOT_FOUND` means a wrong `foundationModelEndpoint`/`synthesisEndpoint`;
a `403 Invalid access token` means the profile's `token` is wrong/expired
(each profile carries its **own** token — updating one doesn't update others).
