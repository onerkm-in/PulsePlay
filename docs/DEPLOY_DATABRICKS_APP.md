# Deploy PulsePlay as a Databricks App

PulsePlay should stay an enablement layer: Databricks owns dashboards, Genie, SQL warehouses, Apps, Vector Search, Unity Catalog, permissions, and audit logs. The app deployment only hosts the PulsePlay proxy and experience shell close to those resources.

## Resource Mode

Use Databricks App resources for environment binding instead of hardcoding workspace IDs or secrets.

- `APP_RESOURCE_SQL_WAREHOUSE` maps to the SQL warehouse PulsePlay should warm, inspect, and use for metric/evidence queries.
- `APP_RESOURCE_GENIE_SPACE` maps to the default Genie Space when a profile is not otherwise configured.
- `APP_RESOURCE_AIBI_DASHBOARD_ID` maps to the default AI/BI dashboard for SDK embedding.
- `APP_RESOURCE_VECTOR_SEARCH_INDEX` maps to the approved Vector Search index when Vector Search endpoints are enabled.
- `APP_RESOURCE_METRIC_VIEW` maps to the governed UC metric view used as the semantic source.

The proxy merges those values into the active profile at startup. The `/health` response reports which `APP_RESOURCE_*` values are configured, with secret-looking names redacted.

## Live Discovery First

Before treating a capability as ready, verify it against the workspace:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/assistant/capabilities?assistantProfile=default
Invoke-RestMethod http://127.0.0.1:8787/assistant/lakeview/dashboards?assistantProfile=default
Invoke-RestMethod http://127.0.0.1:8787/assistant/genie/spaces?assistantProfile=default
Invoke-RestMethod http://127.0.0.1:8787/assistant/uc/metric-views?assistantProfile=default"&"catalog=main"&"schema=default
```

In enterprise Windows environments, Node can fail Databricks TLS with `unable to verify the first certificate` even when the OS trust store is correct. Prefer one of these before running live probes:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
# or, when the enterprise root is exported:
$env:NODE_EXTRA_CA_CERTS="C:\path\to\enterprise-root.pem"
```

If REST coverage is incomplete for a preview feature, add an admin-only CLI bridge later. Do not make the browser call the Databricks CLI or expose tokens.

## Databricks Sources Used

- [AI/BI external embedding](https://docs.databricks.com/gcp/en/dashboards/share/embedding/external-embed): external dashboard embedding uses service-principal token exchange, `/tokeninfo`, user-scoped tokens, and `@databricks/aibi-client`.
- [Genie Space iframe embedding](https://docs.databricks.com/aws/en/genie/embed): Genie iframe embed is beta, requires preview/admin allowed surfaces, and needs the Databricks-generated iframe with `allow="clipboard-write"` for full copy behavior.
- [Unity Catalog metric views](https://docs.databricks.com/aws/en/business-semantics/metric-views): metric views are the governed business-semantics layer and can be consumed by dashboards, Genie Spaces, SQL, and alerts.
- [Databricks App environment variables](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/environment-variables): app resources should be referenced through `valueFrom` instead of hardcoded secrets or resource IDs.
