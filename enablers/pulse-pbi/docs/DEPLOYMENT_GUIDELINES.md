# Deployment Guidelines

Related documents:

- [../README.md](../README.md)
- [PACKAGE_PRINCIPLES.md](PACKAGE_PRINCIPLES.md)
- [PERFORMANCE_AND_SECURITY_CHECKLIST.md](PERFORMANCE_AND_SECURITY_CHECKLIST.md)
- [TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md)
- [PROXY_GUIDE.md](PROXY_GUIDE.md)
- [AUTH_GUIDE.md](AUTH_GUIDE.md)
- [HANDOVER.md](HANDOVER.md)

## Purpose

Use this visual as a governed context bridge between Power BI and Databricks Genie.
Power BI supplies the current report context. Databricks Genie answers from an approved metric view or view.

## Core Principle

The visual should receive context, not the full dataset.

- Power BI owns report context, filters, slicers, and cross-visual interactions.
- The visual captures the effective filtered context from bound fields.
- Databricks owns the governed data and the final answer.
- Genie should answer using the approved backend metric view, not by relying on a raw dataset sent from the visual.

## Required Preconditions

Before deploying this visual to any report:

- A Databricks Genie space must already exist.
- The Genie space must point to a governed metric view or view.
- The Power BI model fields used by the visual must align with the business meaning of the Databricks metric-view fields.
- Authentication must be approved for the target environment.
- Security expectations must be reviewed separately for Power BI and Databricks.

## Connection Standard

Supported connection patterns:

- Preferred: proxy or gateway that calls Databricks securely on behalf of the visual.
- Controlled-only: direct PAT from the visual.

Status light behavior:

- green for reachable
- amber for checking
- red for unreachable or not configured

Required configuration in the visual:

- `Databricks Workspace URL` or `API Base URL Override`
- `Access Token` when direct mode is used
- `Genie Space ID`
- `Genie View Fields`
- optional `Domain Guidance`

## Report Authoring Standard

Each report should bind at least one field into the visual.

Best-practice setup:

1. Add one anchor measure so the visual always participates in Power BI filter context.
2. Add the main business dimensions that Genie should name explicitly.
3. Add one to three high-value business measures for numeric context.

Recommended anchor measure pattern:

```DAX
PBIGENIE_FILTER = COUNTROWS(<table_or_view_name>)
```

## Field Binding Rules

Bind only fields that satisfy all of the following:

- They are meaningful to report users.
- They are likely to be affected by slicers, page filters, report filters, or cross-highlighting.
- They exist in the Databricks metric view with aligned semantics.
- They are approved as part of the business context contract for the report.

Good candidates:

- geography fields such as `Country`, `Region`, `State`, `City`
- time fields such as `Order Date`, `Ship Date`, `Month`, `Quarter`
- business dimensions such as `Segment`, `Category`, `Sub-Category`, `Product Name`
- measures such as `Sales`, `Profit`, `Quantity`

Avoid binding:

- internal-only technical columns unless required
- duplicate fields with overlapping meaning
- fields that do not exist in the Genie metric view
- sensitive columns that should not be included in prompt context

## Best-Practice Setup Template

Minimum setup:

- one anchor measure bound to `Measure (for context)`

Recommended setup:

- anchor measure plus key business dimensions

Best-practice setup:

- anchor measure
- key business dimensions
- one to three business measures

Example:

- Measure: `PBIGENIE_FILTER`
- Dimensions: `Region`, `State`, `City`, `Segment`, `Category`, `Sub-Category`, `Order Date`
- Measures: `PBIGENIE_FILTER`, `Sales`, `Profit`, `Quantity`

## Interactive Behavior Standard

Inbound interaction that should work:

- report filters
- page filters
- visual-level filters
- slicers
- cross-filtering and cross-highlighting from other visuals

Outbound interaction supported by this visual:

- clickable context chips built from bound dimension values can apply Power BI selections back to the report

Important note:

- free-text Genie answers are informational
- only structured context values exposed by the visual can reliably cross-filter other visuals

## Security And Governance Rules

- Do not assume Power BI RLS automatically propagates to Databricks.
- Treat Databricks-side authorization as a separate enforcement layer.
- Do not send unrestricted raw dataset extracts through the visual.
- Keep the prompt context bounded to approved business fields and the current report state.
- Review any deployment that uses a shared token or service identity.

For a full explanation of the authorization gap between Power BI and Databricks, and guidance on deployment models that bridge it, see [AUTH_GUIDE.md](AUTH_GUIDE.md).

## Validation Checklist

Before promoting a report that uses this visual:

1. Confirm the Genie space ID is correct.
2. Confirm the metric view is the approved backend object.
3. Confirm the visual field bindings align with the metric-view field names and meanings.
4. Confirm the anchor measure is present.
5. Confirm slicers and other visuals update the Genie visual correctly.
6. Confirm clicking a context chip in the Genie visual filters the report correctly.
7. Confirm the generated prompt context reflects the intended business/report state.
8. Confirm sensitive or unapproved fields are not being passed.
9. Confirm the connection indicator behavior matches the actual runtime state.

## Operating Model

End users should only need to ask questions and optionally click context chips.
Report authors are responsible for the binding contract, approved field mapping, and deployment validation.
