"""Append-only audit writer. Every detect/view/action/approval writes a row here."""
from __future__ import annotations

import hashlib
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


def _event_id(*parts) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:20]


def write_event(*, prompt_id: str, rule_id: str, source_table: str, evidence_signature: str,
                user_id: str, persona: str, action: str, previous_status: str | None,
                new_status: str, permission_result: str = "allowed",
                approval_required: bool = False, rationale: str | None = None,
                request_payload_hash: str | None = None, request_status: str | None = None,
                cfg=None) -> str:
    cfg = cfg or sql_client.resolve_config()
    eid = _event_id(prompt_id, user_id, action, new_status, evidence_signature)
    cols = ("event_id, prompt_id, user_id, persona, action, previous_status, new_status, "
            "rule_id, source_table, evidence_signature, permission_result, approval_required, "
            "rationale, request_payload_hash, request_status, event_ts")
    vals = ", ".join([
        _v(eid), _v(prompt_id), _v(user_id), _v(persona), _v(action), _v(previous_status),
        _v(new_status), _v(rule_id), _v(source_table), _v(evidence_signature),
        _v(permission_result), _v(approval_required), _v(rationale),
        _v(request_payload_hash), _v(request_status), "current_timestamp()",
    ])
    sql_client.execute(f"INSERT INTO {SETTINGS.audit_table} ({cols}) VALUES ({vals})", cfg=cfg)
    return eid


def audit_detection(prompt: DecisionPrompt, was: str, cfg=None) -> str:
    """Record that detection produced/refreshed a prompt (system actor)."""
    return write_event(
        prompt_id=prompt.prompt_id, rule_id=prompt.rule_id, source_table=prompt.source_table,
        evidence_signature=prompt.evidence.signature, user_id="system:detector",
        persona="system", action="detected", previous_status=None,
        new_status="new" if was == "inserted" else "refreshed",
        approval_required=prompt.approval_required, cfg=cfg)
