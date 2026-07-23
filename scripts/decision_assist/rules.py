"""Load and validate the rule pack. Enforces the MVP action-level ceiling at load time."""
from __future__ import annotations

import json
from pathlib import Path

from .action_registry import get_action
from .config import SETTINGS
from .models import Rule

VALID_DETECTORS = {"kpi_cell", "supplier", "inventory_category"}


class RuleConfigError(RuntimeError):
    pass


def load_rules(path: Path | None = None) -> list[Rule]:
    path = path or SETTINGS.rules_path
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rules: list[Rule] = []
    seen: set[str] = set()
    for r in data.get("rules", []):
        rid = r.get("rule_id")
        if not rid:
            raise RuleConfigError("rule missing rule_id")
        if rid in seen:
            raise RuleConfigError(f"duplicate rule_id: {rid}")
        seen.add(rid)

        detector = r.get("detector")
        if detector not in VALID_DETECTORS:
            raise RuleConfigError(f"{rid}: invalid detector '{detector}'")

        level = int(r.get("action_level", 0))
        if level > SETTINGS.action_level_ceiling:
            raise RuleConfigError(
                f"{rid}: action_level {level} exceeds MVP ceiling "
                f"{SETTINGS.action_level_ceiling} (Level 4/5 forbidden)"
            )
        # action must exist and its level must also respect the ceiling
        action = get_action(r["action_code"])
        if action.level > SETTINGS.action_level_ceiling:
            raise RuleConfigError(f"{rid}: action '{action.code}' level {action.level} exceeds ceiling")

        if r.get("direction") not in ("below", "above"):
            raise RuleConfigError(f"{rid}: direction must be 'below' or 'above'")

        rules.append(Rule(
            rule_id=rid,
            detector=detector,
            kpi=r["kpi"],
            business_process=r["business_process"],
            persona=r["persona"],
            owner=r["owner"],
            root_cause_category=r["root_cause_category"],
            action_code=r["action_code"],
            action_level=level,
            approval_required=bool(r.get("approval_required", True)),
            severity_thresholds={k: float(v) for k, v in r["severity_thresholds"].items()},
            direction=r["direction"],
            detect_metric=r["detect_metric"],
            target=float(r["target"]),
            description=r.get("description", ""),
        ))
    if not rules:
        raise RuleConfigError("no rules loaded")
    return rules
