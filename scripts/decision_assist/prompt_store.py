"""Delta prompt store. Upserts prompts by content-hash prompt_id (MERGE), preserving any
human-set status across re-detection (only new prompts get status='new')."""
from __future__ import annotations

from typing import Any

from .config import SETTINGS
from .models import DecisionPrompt
from . import sql_client


def _v(val: Any) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)):
        return repr(val)
    return "'" + str(val).replace("\\", "\\\\").replace("'", "''") + "'"


# (column, value-fn) in table order; created/updated handled separately.
def _row(p: DecisionPrompt) -> dict[str, str]:
    return {
        "prompt_id": _v(p.prompt_id), "exception_id": _v(p.exception_id), "rule_id": _v(p.rule_id),
        "business_domain": _v(p.business_domain), "business_process": _v(p.business_process),
        "kpi": _v(p.kpi), "source_table": _v(p.source_table), "affected_key": _v(p.affected_key),
        "category": _v(p.category), "region": _v(p.region), "month_key": _v(p.month_key),
        "severity": _v(p.severity), "root_cause_category": _v(p.root_cause_category),
        "root_cause": _v(p.root_cause), "business_impact_value": _v(p.business_impact_value),
        "business_impact_unit": _v(p.business_impact_unit),
        "business_impact_label": _v(p.business_impact_label), "persona": _v(p.persona),
        "owner": _v(p.owner), "recommended_action": _v(p.recommended_action),
        "action_level": _v(p.action_level), "action_code": _v(p.action_code),
        "approval_required": _v(p.approval_required), "confidence": _v(p.confidence),
        "confidence_score": _v(p.confidence_score), "headline": _v(p.headline),
        "issue": _v(p.issue), "evidence_signature": _v(p.evidence.signature),
        "evidence_sql": _v(p.evidence.detect_sql), "narrative": _v(p.narrative),
    }


# columns whose value the engine refreshes on re-detection (status/created_ts preserved)
_REFRESH = [
    "severity", "root_cause_category", "root_cause", "business_impact_value",
    "business_impact_unit", "business_impact_label", "recommended_action", "action_level",
    "action_code", "approval_required", "confidence", "confidence_score", "headline",
    "issue", "evidence_signature", "evidence_sql", "narrative",
]


def upsert(prompt: DecisionPrompt, cfg=None) -> str:
    """MERGE one prompt. Returns 'inserted' or 'refreshed'."""
    cfg = cfg or sql_client.resolve_config()
    r = _row(prompt)
    src = ", ".join(f"{val} AS {col}" for col, val in r.items())
    set_clause = ", ".join(f"t.{c} = s.{c}" for c in _REFRESH) + ", t.updated_ts = current_timestamp()"
    insert_cols = list(r.keys()) + ["status", "created_ts", "updated_ts"]
    insert_vals = [f"s.{c}" for c in r.keys()] + [_v(prompt.status), "current_timestamp()", "current_timestamp()"]
    merge = f"""
        MERGE INTO {SETTINGS.prompt_store_table} t
        USING (SELECT {src}) s
        ON t.prompt_id = s.prompt_id
        WHEN MATCHED THEN UPDATE SET {set_clause}
        WHEN NOT MATCHED THEN INSERT ({", ".join(insert_cols)}) VALUES ({", ".join(insert_vals)})
    """
    # detect insert vs update for reporting
    existing = sql_client.query(
        f"SELECT 1 FROM {SETTINGS.prompt_store_table} WHERE prompt_id = :pid",
        {"pid": prompt.prompt_id}, cfg=cfg)
    sql_client.execute(merge, cfg=cfg)
    return "refreshed" if existing else "inserted"


def upsert_all(prompts: list[DecisionPrompt], cfg=None) -> dict[str, int]:
    cfg = cfg or sql_client.resolve_config()
    result = {"inserted": 0, "refreshed": 0}
    for p in prompts:
        result[upsert(p, cfg=cfg)] += 1
    return result


def read(persona: str | None = None, statuses: list[str] | None = None, cfg=None) -> list[dict]:
    where = []
    params: dict[str, Any] = {}
    if persona:
        where.append("persona = :persona")
        params["persona"] = persona
    if statuses:
        quoted = ", ".join("'" + s.replace("'", "''") + "'" for s in statuses)
        where.append(f"status IN ({quoted})")
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""SELECT prompt_id, rule_id, kpi, severity, confidence, headline, issue,
              recommended_action, action_level, approval_required, persona, owner, status,
              business_impact_value, business_impact_unit, business_impact_label, month_key
              FROM {SETTINGS.prompt_store_table} {clause}
              ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                       WHEN 'medium' THEN 2 ELSE 3 END, confidence_score DESC"""
    return sql_client.query(sql, params or None, cfg=cfg)
