---
name: Knowledge plane and Settings IA architecture
description: Architecture decision for PulsePlay knowledge base, packs, retrieval, settings, and Knowledge Base UI split
type: feature
originSessionId: current
---

PulsePlay now has a documented Knowledge plane in `docs/KNOWLEDGE_BASE_ARCHITECTURE.md`.

**Decision:** Knowledge is not a third product axis. The product axes stay BI Runtime, meaning what the user sees, and AI Runtime, meaning what answers. Knowledge is the governed context plane that grounds answers for any AI connector and is filtered by BI context.

**Core split:**

- `BIAdapter` observes current BI context, events, and capabilities.
- Knowledge retrieves, filters, indexes, cites, audits, and evaluates context.
- AI connectors reason over user prompt plus BI context plus normalized `GroundingBundle`.

**Vocabulary:**

- PulsePack: curated domain content under `pulsepacks/`.
- Knowledge source: source system or content set, such as PulsePack files, BI metadata, SharePoint, S3, Unity Catalog, Git docs.
- Knowledge index: provider-backed search index such as Databricks Vector Search, Azure AI Search, Bedrock Knowledge Base, OpenAI vector store, or local dev index.
- Retrieval profile: policy and strategy mapping BI context, user role, connector, and pack to allowed sources and ranking settings.
- GroundingBundle: provider-neutral retrieval result passed to any AI connector.

**Settings IA:** `/settings` should be a full-page route with shallow left rail: Quick Setup, BI Runtime, AI Runtime, Knowledge Packs, Experience, System & Health, Advanced. Settings selects and validates runtime state; it does not become the glossary or ontology reader.

**Knowledge Base IA:** Separate inspectable content library: Overview, Pack Registry, Pack Detail, Domain Knowledge, Analytics Content, Runtime Use, Governance. Read-only first; authoring later.

**Do not overclaim:** Current shipped runtime is pack matching plus pack prompt-context injection. Full RAG/governed KB requires future provider adapters, retrieval policies, citations, ACL tests, and evals.
