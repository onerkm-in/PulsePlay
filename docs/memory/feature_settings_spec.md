---
name: Settings spec + enterprise guardrails
description: Settings page master spec — 5-group IA, allowlist contract, loophole audit findings. Read when touching settings code or enterprise hardening.
type: feature
---

# Settings spec — non-obvious context

## What this is

[docs/SETTINGS_SPEC.md](../SETTINGS_SPEC.md) is the consolidated source of truth for everything settings-related. Before this doc, the design lived across [KB_ARCHITECTURE.md](../KNOWLEDGE_BASE_ARCHITECTURE.md), [AGENDA.md](../AGENDA.md), [HANDOVER.md](../HANDOVER.md), and earlier memory entries. Always update SETTINGS_SPEC.md first if behaviour or IA changes.

## MVP 0.2 scope (locked 2026-05-13)

**MVP 0.2 = one cell of the 2-axis matrix:**

- **AI:** Databricks Genie, two flavors — direct Genie connector (one space per profile) + Supervisor Agent connector (one Supervisor fans across multiple Genie spaces, admin-configured).
- **BI:** Power BI, Premium workspace constraint, governed by admin/governance team. **No Fabric access** in MVP 0.2 (Direct Lake / Dataflow Gen2 / semantic-link APIs explicitly NOT available).
- **Pack:** `cpg-fmcg` only.

Tableau / Qlik / Looker / OpenAI / Bedrock / Foundation Model / Fabric / Knowledge Base UI all deferred to v0.3+. The 2-axis architecture stays intact; MVP 0.2 is allowlist + UI filtering, not a re-architecture.

**MVP 0.2 phases (SETTINGS_SPEC § 16):** 0 (docs, done) → 1 (allowlist contract, implemented 2026-05-13) → 2 (settings shell) → 3 (BI group, PBI-only) → 4 (AI group, Genie + Supervisor) → 5 (Preferences + System + Advanced) → 6 (loophole closure). Phase 7 pack registry was pulled forward and implemented early; phases 8-10 are post-MVP-0.2.

**Supervisor-specific affordance:** the Model/Agent leaf for a Supervisor profile renders a read-only fan-out table with per-space health. Connection test runs the probe across every constituent space in parallel with the 2000 ms stagger from [ADR-0003](../adr/0003-supervisor-stagger.md), reporting per-space + aggregate status.

**Power BI Premium specifics:** the BI Status leaf surfaces a license posture readout (capacity tier, embed-token availability, Fabric capability=false, available capabilities matrix). Fabric-only reports fail to mount with a copy-paste diagnostic. Workspace allowlist (`powerbiWorkspaces`) enforces server-side at embed-token issuance.

## The 5-group tree (locked v0.2)

```
Settings
├── BI            (Provider · Embed · Authentication · Canvas · Status)
├── AI            (Provider · Model · Connection test · Knowledge pack · AI Insights setup ↗ · Browse library ↗)
├── Preferences   (Layout · Panels · Position · Density)
├── System        (Proxy status · Security · Diagnostics · Export bundle)
└── Advanced      (Local storage · Reset section · Reset all · Danger zone)
```

**Key tightenings to remember when reviewing settings PRs:**

- No `Runtime` suffix. It's `BI`, not "BI Runtime".
- No `Workspace` — there's no User-vs-Workspace scope today. It's `Preferences`.
- No `& Health` glue. It's `System`; status lives inside.
- Knowledge Pack folded under AI for v1. Promotion triggers are documented in SETTINGS_SPEC § 17 (Phase 3 retrieval interface OR ≥2 source adapters OR KB UI ships).
- Pulse Setup deep-link is labeled "AI Insights setup", not "Pulse Setup". Internal product names don't leak into the user-facing UI.
- No "Quick Setup" group. First-run guidance lives as "Setup needed" status-chip badges on incomplete leaves.

## Enterprise guardrails — the load-bearing concern

Six named allowlists, single source of truth in `proxy/config.json.allowlist`, defense-in-depth at 8 enforcement layers (see SETTINGS_SPEC § 11). The browser fetches a user-filtered subset via the new `GET /assistant/allowlist` endpoint. Fail-closed: missing allowlist in production refuses to start.

| Allowlist | Why it matters |
|---|---|
| BI providers | Which vendors are selectable at all |
| Embed origins | Which iframe hostnames can be mounted (closes generic-iframe hole) |
| AAD tenants | Which Azure AD tenants are valid for SSO (closes the phishing vector) |
| AI profiles | Which `/assistant/profiles` are visible per user/group |
| Knowledge packs | Which packs are installable + selectable |
| Knowledge sources | Future Phase 3 — which retrieval sources are visible |

The Settings page never lets an author edit the allowlist. Allowlists are admin-controlled out-of-band via `proxy/config.json` deployed by the org's config pipeline.

## Loophole audit (2026-05-13)

8 HIGH / 7 MEDIUM / 4 LOW findings. Full inventory in SETTINGS_SPEC § 15.

**Biggest single risk was L1** — no AAD tenant allowlist. Phase 1 now validates the SSO tenant in `EmbedConfigForm` and enforces the Power BI profile tenant server-side for embed-token mode. Remaining work before pilot: full `/settings` store revalidation and a lower-level allowlist-aware wrapper around `pbiAuth.ts` so no future UI can call it with an arbitrary tenant.

**Second biggest:** **L2 + L7 together** — generic-iframe URL acceptance + CSP `frame-src` wildcards. Defense in depth (browser allowlist + CSP + proxy enforcement) closes both.

## When NOT to use this memory

- For implementation specifics — read SETTINGS_SPEC.md directly. This memory is for orientation only.
- For the Knowledge plane architecture — that's [KB_ARCHITECTURE.md](../KNOWLEDGE_BASE_ARCHITECTURE.md).
- For security posture across the whole product — that's [SECURITY_ARCHITECTURE.md](../SECURITY_ARCHITECTURE.md).
