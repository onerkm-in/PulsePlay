# Authentication and Authorization Guide

Related documents:

- [DEPLOYMENT_GUIDELINES.md](DEPLOYMENT_GUIDELINES.md)
- [PROXY_GUIDE.md](PROXY_GUIDE.md)
- [PERFORMANCE_AND_SECURITY_CHECKLIST.md](PERFORMANCE_AND_SECURITY_CHECKLIST.md)

## Key Principle

**Power BI Row-Level Security (RLS) does not automatically propagate to Databricks.**

This is the most important authorization boundary to understand before deploying this visual. The rest of this document explains what each system controls, where the boundary lies, and how to enforce authorization on both sides deliberately.

---

## What Power BI Controls

Power BI enforces access through:

- **Report and workspace permissions** — who can open or edit a report.
- **Row-Level Security (RLS)** — rules in the semantic model that restrict which rows a given user can see. Applied at the Power BI layer before any data reaches a visual.
- **Sensitivity labels** — metadata labels that govern how data can be exported and shared.
- **Workspace and capacity governance** — which tenants and users can access which Power BI workspaces.

When a user views a report with this visual, Power BI has already filtered the data model according to their RLS rules. The visual only ever receives the filtered, aggregated context that Power BI exposes to a custom visual — never the raw underlying dataset.

**What Power BI does NOT do:**

- It does not pass the Power BI user's identity to Databricks.
- It does not enforce any Databricks access controls.
- It does not restrict which Databricks objects the visual can query once a connection is established.

---

## What Databricks Controls

Databricks enforces access through:

- **Workspace permissions** — who can access the Databricks workspace.
- **Unity Catalog** — row- and column-level security on tables, views, and metric views.
- **Genie space permissions** — who can ask questions to a specific Genie space.
- **Token-based authentication** — Personal Access Tokens or OAuth tokens that identify the caller to Databricks.

When the visual or proxy calls Databricks, the caller is identified by the token used in the `Authorization` header. Databricks applies its own access controls for that caller identity, regardless of who the Power BI user is.

**What Databricks does NOT know (without additional integration):**

- Who the Power BI user is.
- What RLS rules were applied in Power BI.
- Whether the Power BI user is authorized to ask this question.

---

## The Authorization Gap

The gap between the two systems:

```
Power BI user (alice@example.com)
    |
    | Power BI RLS applied — Alice sees filtered data
    |
Custom Visual
    |
    | Calls Databricks using the configured token
    |
Databricks (sees: the token's identity, not Alice)
```

Unless the deployment explicitly bridges this gap, the Databricks call is made using a single shared identity (the configured PAT or proxy service account), regardless of which Power BI user is viewing the report.

This means:

- All users of the report share the same Databricks access level.
- A user who is restricted by Power BI RLS can still ask Genie questions about data they may not be able to see in the report directly.
- Databricks Unity Catalog controls apply to the token identity, not to the Power BI user identity.

---

## Deployment Models and Their Auth Characteristics

### Model 1: Direct PAT (controlled use only)

The visual is configured with a Personal Access Token in the format-pane settings.

Auth characteristics:

- The PAT identifies a specific Databricks user or service principal.
- All report users share this Databricks identity.
- The PAT is visible to any Power BI report editor who can inspect the visual settings.
- There is no per-user Databricks authorization.

Acceptable when:

- The report is restricted to a small, trusted group of users.
- The Genie space is already restricted to data that all authorized users are permitted to see.
- The team accepts the shared identity model as a deliberate choice.

Not acceptable when:

- Different users should receive different Databricks answers based on their identity.
- The report is published to a broad audience.
- The Genie space or metric view contains data that not all report users are authorized to query.

### Model 2: Proxy with a shared service identity

A proxy sits between the visual and Databricks. The proxy authenticates to Databricks using a service principal or shared token stored server-side.

Auth characteristics:

- The PAT is not exposed to report editors (stored in a secrets manager on the proxy).
- All report users still share the same Databricks identity (the proxy service account).
- The proxy can add caller authentication (requiring Power BI users to be authenticated to reach the proxy), but Databricks still sees the proxy's service identity.
- Better token hygiene and rotation than direct PAT mode.

Acceptable when:

- The Genie space is scoped to data that all authorized proxy callers should be able to see.
- Caller authentication to the proxy provides sufficient access control.
- Per-user Databricks identity propagation is not required.

This is the recommended baseline for most production deployments.

### Model 3: Proxy with per-user identity propagation (advanced)

A proxy bridges Power BI user identity to Databricks using OAuth token exchange or on-behalf-of flows.

Auth characteristics:

- The Power BI user authenticates to the proxy (typically via Azure AD / Entra ID).
- The proxy exchanges the user's identity for a Databricks-scoped token using an OAuth on-behalf-of flow.
- Databricks sees the individual user's identity.
- Unity Catalog row- and column-level security applies per user.
- This is the only model where Power BI user identity meaningfully maps to Databricks authorization.

Implementation requirements:

- Azure AD (Entra ID) application registration for the proxy.
- Databricks configured to accept Azure AD tokens (Unity Catalog with Azure AD integration).
- OAuth 2.0 on-behalf-of flow implemented in the proxy.
- Power BI users must be Entra ID users with access to the proxy application.

This model is significantly more complex but provides the strongest authorization posture for multi-user deployments where data sensitivity varies by user.

---

## Governing the Prompt Context as an Authorization Layer

Regardless of which model is used, the visual provides a first layer of governance through the prompt context:

- Only fields explicitly bound by the report author are included in the context sent to Genie.
- Only fields listed in the **Genie View Fields** setting are passed as approved field names.
- The visual never sends raw dataset rows — only aggregated summaries and dimension samples.

This limits what Genie can be asked about, but it is not a substitute for Databricks-side authorization. A user can type any free-text question, which is sent to Genie regardless of what context was automatically captured.

The Databricks Genie space and its underlying metric view are the authoritative enforcement layer for what data can be returned.

---

## Recommendations by Scenario

| Scenario | Recommended Model |
|---|---|
| Single developer testing on a local machine | Direct PAT with local proxy |
| Internal report for a known, trusted team | Proxy with shared service identity |
| Broad internal deployment, same data access for all users | Proxy with shared service identity + caller auth |
| Multi-user deployment with per-user data restrictions | Proxy with per-user identity propagation (OAuth OBO) |
| External or customer-facing report | Requires per-user identity propagation and Unity Catalog enforcement |

---

## Validation Checklist for Authorization

Before deploying to any shared environment:

1. Confirm the Genie space and metric view are scoped to only the data this report's audience should see.
2. Confirm Unity Catalog permissions on the metric view match the intended access scope for the token or identity used.
3. Confirm whether different Power BI users need different Databricks data access. If yes, implement Model 3.
4. Confirm the PAT or service principal used has the minimum Databricks permissions required (Genie space access, not workspace admin).
5. Confirm no PAT is stored in a Power BI report file that is distributed or exported.
6. Confirm the proxy (if used) requires authentication from callers before forwarding to Databricks.
7. Confirm Power BI RLS is not being relied on as a substitute for Databricks authorization.
8. Confirm the deployment decision (shared identity vs. per-user identity) is documented and approved.
