"""Self-contained Databricks SQL access for the Action Insights engine.

Uses the SQL Statement Execution REST API + `truststore` (OS trust store) so it works behind a
TLS-intercepting proxy. Supports named parameters for safe parameterized SQL.

Credential priority: env (DATABRICKS_HOST/DATABRICKS_TOKEN) → CLI profile (~/.databrickscfg).
"""
from __future__ import annotations

import configparser
import json
import os
import time
import urllib.request
from pathlib import Path
from typing import Any

from .config import SETTINGS

# Local dev sits behind a TLS-intercepting proxy, so Python must trust the OS
# store via `truststore`. On Databricks compute there is no such proxy and the
# package may be absent — make it optional so the same engine runs as a Job.
try:
    import truststore
    truststore.inject_into_ssl()
except Exception:  # pragma: no cover - environment dependent
    pass

_TERMINAL = {"SUCCEEDED", "FAILED", "CANCELED", "CLOSED"}


class SqlError(RuntimeError):
    pass


def _from_profile(profile: str) -> tuple[str | None, str | None]:
    cfg_path = Path.home() / ".databrickscfg"
    if not cfg_path.exists():
        return None, None
    parser = configparser.ConfigParser()
    parser.read(cfg_path)
    if profile not in parser:
        return None, None
    s = parser[profile]
    return s.get("host"), s.get("token")


def resolve_config() -> dict[str, str]:
    host = os.environ.get("DATABRICKS_HOST")
    token = os.environ.get("DATABRICKS_TOKEN") or os.environ.get("DATABRICKS_PAT")
    if not (host and token):
        p_host, p_token = _from_profile(SETTINGS.profile)
        host, token = host or p_host, token or p_token
    if not host or not token:
        raise SqlError(
            "Missing Databricks host/token. Set DATABRICKS_HOST/DATABRICKS_TOKEN or configure "
            f"the '{SETTINGS.profile}' profile in ~/.databrickscfg."
        )
    return {"host": host.rstrip("/"), "token": token, "warehouse_id": SETTINGS.warehouse_id}


def _http(cfg: dict[str, str], method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        cfg["host"] + path, data=data, method=method,
        headers={"Authorization": "Bearer " + cfg["token"], "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def _to_api_params(parameters: dict[str, Any] | None) -> list[dict] | None:
    """Convert {name: value} to the Statement Execution API parameter list (typed)."""
    if not parameters:
        return None
    out = []
    for name, value in parameters.items():
        if isinstance(value, bool):
            out.append({"name": name, "value": str(value).lower(), "type": "BOOLEAN"})
        elif isinstance(value, int):
            out.append({"name": name, "value": str(value), "type": "INT"})
        elif isinstance(value, float):
            out.append({"name": name, "value": str(value), "type": "DOUBLE"})
        else:
            out.append({"name": name, "value": str(value)})  # STRING default
    return out


def query(sql: str, parameters: dict[str, Any] | None = None, *,
          cfg: dict[str, str] | None = None) -> list[dict]:
    """Run a statement; block until terminal. Returns rows as list[dict] (column->value)."""
    cfg = cfg or resolve_config()
    body: dict[str, Any] = {
        "warehouse_id": cfg["warehouse_id"], "statement": sql,
        "wait_timeout": "50s", "disposition": "INLINE", "format": "JSON_ARRAY",
    }
    api_params = _to_api_params(parameters)
    if api_params:
        body["parameters"] = api_params
    resp = _http(cfg, "POST", "/api/2.0/sql/statements", body)
    stmt_id = resp.get("statement_id")
    state = resp.get("status", {}).get("state")
    deadline = time.time() + 600
    while state not in _TERMINAL and time.time() < deadline:
        time.sleep(2.0)
        resp = _http(cfg, "GET", f"/api/2.0/sql/statements/{stmt_id}")
        state = resp.get("status", {}).get("state")
    if state != "SUCCEEDED":
        err = resp.get("status", {}).get("error", {})
        raise SqlError(f"[{state}] {err.get('message', 'unknown')} :: {sql.strip()[:120]}")
    result = resp.get("result") or {}
    manifest = resp.get("manifest") or {}
    cols = [c["name"] for c in manifest.get("schema", {}).get("columns", [])]
    data = result.get("data_array") or []
    return [dict(zip(cols, row)) for row in data]


def execute(sql: str, parameters: dict[str, Any] | None = None, *,
            cfg: dict[str, str] | None = None) -> None:
    """Run a non-SELECT statement (INSERT/MERGE/DDL)."""
    query(sql, parameters, cfg=cfg)
