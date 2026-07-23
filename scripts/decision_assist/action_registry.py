"""Governed action registry. Each action has a control level and a required capability.

MVP ceiling = Level 3 (trigger-on-approval). Level 4/5 are absent by design; a rule referencing
an unknown or >3 action fails validation at load. In MVP, triggered actions are **logged-only**
(payload persisted, not sent) unless an approved integration exists.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Action:
    code: str
    label: str
    level: int              # 1 inform, 2 prepare, 3 trigger-on-approval
    required_capability: str


# code -> Action
ACTIONS: dict[str, "Action"] = {
    "view_evidence":        Action("view_evidence", "View evidence", 1, "can_view_evidence"),
    "assign_owner":         Action("assign_owner", "Assign to owner", 2, "can_trigger_request"),
    "prepare_review":       Action("prepare_review", "Prepare review request", 2, "can_trigger_request"),
    "trigger_supplier_review": Action("trigger_supplier_review", "Trigger supplier delivery review", 3, "can_trigger_request"),
    "trigger_replenishment":   Action("trigger_replenishment", "Trigger replenishment review", 3, "can_trigger_request"),
    "trigger_forecast_review": Action("trigger_forecast_review", "Trigger forecast bias review", 3, "can_trigger_request"),
    "trigger_supplier_perf":   Action("trigger_supplier_perf", "Raise supplier performance review", 3, "can_trigger_request"),
    "trigger_inventory_review": Action("trigger_inventory_review", "Raise SKU redistribution request", 3, "can_trigger_request"),
    "snooze":               Action("snooze", "Snooze", 1, "can_snooze"),
    "mark_false_positive":  Action("mark_false_positive", "Mark false positive", 1, "can_mark_false_positive"),
    "reject":               Action("reject", "Reject recommendation", 1, "can_reject"),
    "approve":              Action("approve", "Approve and proceed", 3, "can_approve_hitl"),
}


def get_action(code: str) -> "Action":
    if code not in ACTIONS:
        raise KeyError(f"Unknown action code: {code}")
    return ACTIONS[code]
