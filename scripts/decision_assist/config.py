"""Configuration for the Decision Assist detection engine.

Env-first, CLI-profile fallback. No secrets, tokens, table names, or warehouse IDs
are hardcoded here — every environment-specific coordinate is read from an env var
with a neutral placeholder default, so a real deployment supplies its own scope and
this file stays safe to commit (see docs placeholder policy). Business rules live in
rules.json, credentials come from env or the Databricks CLI profile.

Required env for a live run:
  DATABRICKS_HOST, DATABRICKS_TOKEN   (or a ~/.databrickscfg profile)
  DATABRICKS_WAREHOUSE_ID             SQL warehouse that runs the rule SQL
  AI_TARGET_TABLE                     approved KPI source table
  AI_PROMPT_STORE                     governed Decision Prompt store table
  AI_AUDIT_TABLE                      append-only audit table
Optional:
  AI_SUPPLIER_TABLE, AI_SUPPLIER_DIM, AI_ORDER_LINE_TABLE, AI_LLM_ENDPOINT,
  DATABRICKS_CONFIG_PROFILE
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent

# MVP action-control ceiling: Level 1 Inform, 2 Prepare, 3 Trigger-on-approval.
# Level 4 (apply fix) and 5 (autonomous) are forbidden in MVP and rejected at rule load.
MVP_ACTION_LEVEL_CEILING = 3

# Neutral placeholder so an unconfigured run fails loudly against an obviously-fake
# name instead of silently touching a real table. Real coordinates come from env.
_UNSET = "REPLACE_ME.schema.table"


@dataclass(frozen=True)
class Settings:
    profile: str = os.environ.get("DATABRICKS_CONFIG_PROFILE", "DEFAULT")
    warehouse_id: str = os.environ.get("DATABRICKS_WAREHOUSE_ID", "")
    business_domain: str = os.environ.get("AI_BUSINESS_DOMAIN", "Supply Chain")
    target_table: str = os.environ.get("AI_TARGET_TABLE", _UNSET)
    supplier_table: str = os.environ.get("AI_SUPPLIER_TABLE", _UNSET)
    supplier_dim: str = os.environ.get("AI_SUPPLIER_DIM", _UNSET)
    order_line_table: str = os.environ.get("AI_ORDER_LINE_TABLE", _UNSET)
    prompt_store_table: str = os.environ.get("AI_PROMPT_STORE", _UNSET)
    audit_table: str = os.environ.get("AI_AUDIT_TABLE", _UNSET)
    # LLM is explain-only and optional in MVP detection.
    llm_endpoint: str = os.environ.get("AI_LLM_ENDPOINT", "")
    rules_path: Path = field(default_factory=lambda: PACKAGE_DIR / "rules.json")
    action_level_ceiling: int = MVP_ACTION_LEVEL_CEILING


SETTINGS = Settings()
