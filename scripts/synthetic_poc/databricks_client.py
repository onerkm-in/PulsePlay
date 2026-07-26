"""Thin Databricks SQL Statement Execution API client.

Credentials resolve from (in order): explicit args, environment
(DATABRICKS_HOST / DATABRICKS_TOKEN), then ~/.databrickscfg [DEFAULT].
The warehouse is resolved by NAME at runtime -> id kept only in memory.
TLS uses the OS trust store via `truststore` (this host has a corporate CA).
No token, id or connection string is ever written to disk or logs.
"""

from __future__ import annotations

import configparser
import os
import time
from pathlib import Path
from typing import Any, Optional

try:
    import truststore
    truststore.inject_into_ssl()
except Exception:  # pragma: no cover - truststore optional
    pass

import requests

_API_STATEMENTS = "/api/2.0/sql/statements"
_API_WAREHOUSES = "/api/2.0/sql/warehouses"


class DatabricksError(Exception):
    pass


def resolve_credentials(host: Optional[str] = None, token: Optional[str] = None):
    host = host or os.environ.get("DATABRICKS_HOST")
    token = token or os.environ.get("DATABRICKS_TOKEN")
    if host and token:
        return host.rstrip("/"), token
    cfg_path = Path.home() / ".databrickscfg"
    if cfg_path.is_file():
        cp = configparser.ConfigParser()
        cp.read(cfg_path)
        prof = os.environ.get("DATABRICKS_CONFIG_PROFILE", "DEFAULT")
        if cp.has_section(prof) or prof == "DEFAULT":
            sec = cp[prof] if cp.has_section(prof) else cp.defaults()
            host = host or sec.get("host")
            token = token or sec.get("token")
    if not host or not token:
        raise DatabricksError(
            "MISSING credentials: set DATABRICKS_HOST/DATABRICKS_TOKEN or ~/.databrickscfg"
        )
    return host.rstrip("/"), token


class DatabricksClient:
    def __init__(self, host=None, token=None, warehouse_name=None, timeout=100):
        self.host, self._token = resolve_credentials(host, token)
        self.warehouse_name = warehouse_name or os.environ.get("DATABRICKS_WAREHOUSE_NAME")
        self.timeout = timeout
        self._warehouse_id: Optional[str] = None
        self._session = requests.Session()
        self._session.headers.update({"Authorization": f"Bearer {self._token}"})

    # -- infra ---------------------------------------------------------------
    def _url(self, path):
        return f"{self.host}{path}"

    def _request(self, method, path, **kwargs):
        """HTTP with bounded retry on transient network errors (DNS, reset)."""
        last = None
        for attempt in range(5):
            try:
                r = self._session.request(method, self._url(path), timeout=self.timeout, **kwargs)
                r.raise_for_status()
                return r
            except (requests.ConnectionError, requests.Timeout) as e:
                last = e
                time.sleep(min(2 ** attempt, 15))
        raise DatabricksError(f"network error after retries: {last}")

    def resolve_warehouse(self) -> str:
        if self._warehouse_id:
            return self._warehouse_id
        r = self._request("GET", _API_WAREHOUSES)
        whs = r.json().get("warehouses", [])
        if not self.warehouse_name:
            if len(whs) == 1:
                self._warehouse_id = whs[0]["id"]
                self.warehouse_name = whs[0]["name"]
                return self._warehouse_id
            raise DatabricksError("warehouse name required (multiple warehouses)")
        for w in whs:
            if w["name"] == self.warehouse_name:
                self._warehouse_id = w["id"]
                return self._warehouse_id
        raise DatabricksError(f"warehouse not found by name: {self.warehouse_name}")

    def execute(self, statement: str, catalog=None, schema=None,
                parameters: Optional[list[dict]] = None) -> dict:
        body: dict[str, Any] = {
            "warehouse_id": self.resolve_warehouse(),
            "statement": statement,
            "wait_timeout": "50s",
        }
        if catalog:
            body["catalog"] = catalog
        if schema:
            body["schema"] = schema
        if parameters:
            body["parameters"] = parameters
        resp = self._request("POST", _API_STATEMENTS, json=body).json()
        # poll until terminal
        stmt_id = resp.get("statement_id")
        while resp.get("status", {}).get("state") in ("PENDING", "RUNNING"):
            resp = self._request("GET", f"{_API_STATEMENTS}/{stmt_id}").json()
        state = resp.get("status", {}).get("state")
        if state != "SUCCEEDED":
            err = resp.get("status", {}).get("error", {})
            raise DatabricksError(f"statement {state}: {err.get('message', 'unknown')}")
        return resp

    def scalar(self, statement, catalog=None, schema=None):
        resp = self.execute(statement, catalog, schema)
        data = resp.get("result", {}).get("data_array") or []
        return data[0][0] if data and data[0] else None

    def rows(self, statement, catalog=None, schema=None) -> list[list]:
        resp = self.execute(statement, catalog, schema)
        return resp.get("result", {}).get("data_array") or []

    # -- helpers -------------------------------------------------------------
    def object_exists(self, catalog, schema, name) -> bool:
        q = (
            "SELECT 1 FROM information_schema.tables "
            f"WHERE table_schema='{schema}' AND table_name='{name}'"
        )
        return bool(self.rows(q, catalog, schema))
