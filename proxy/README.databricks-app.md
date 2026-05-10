# Databricks App: test_SuperUser Genie Proxy

This directory can run as a Databricks App-hosted version of the Genie for
Power BI proxy.

Databricks app names must be lowercase with hyphens, so the workspace app uses
`test-superuser-genie-powerbi` while the project prefix remains `test_SuperUser`
in descriptions and app configuration.

## Runtime

Databricks Apps provides these values automatically:

- `DATABRICKS_HOST`
- `DATABRICKS_APP_PORT`
- `DATABRICKS_CLIENT_ID`
- `DATABRICKS_CLIENT_SECRET`

`server.js` uses those service principal credentials to request Databricks
OAuth tokens at runtime. No PAT or `config.json` should be deployed with the
app.

## App configuration

`app.yaml` currently points the default profile at:

- Genie space: `01f13d2bcd0a1be2a333d78bca0911b6`
- SQL warehouse: `ENTER_WAREHOUSE_ID`

Update those IDs if you want the app to route to a different Genie space or
warehouse.

## Safe deployment

This workspace enforces Git-backed Databricks Apps, so the default helper path
uses the bundle definition in `databricks.yml`:

```powershell
.\scripts\Deploy-DatabricksApp.ps1
```

For workspaces that allow workspace-file app sources, use:

```powershell
.\scripts\Deploy-DatabricksApp.ps1 -WorkspaceSource
```

The workspace-source path stages only `server.js`, `package.json`,
`package-lock.json`, `app.yaml`, and this README before uploading to
Databricks. It intentionally does not upload `proxy/config.json`.
