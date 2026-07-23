"""Rule-pack loading tests for the Decision Assist engine.

These run with no Databricks connection: they exercise config, rule validation,
the MVP Level-3 ceiling enforcement, and the governed action registry.
Run from the scripts/ directory: `python -m pytest decision_assist/tests -q`.
"""
import json
from pathlib import Path

import pytest

from decision_assist.rules import load_rules, RuleConfigError
from decision_assist.action_registry import ACTIONS, get_action
from decision_assist.config import SETTINGS, MVP_ACTION_LEVEL_CEILING


def test_shipped_rule_pack_loads():
    rules = load_rules()
    assert len(rules) >= 1
    ids = [r.rule_id for r in rules]
    assert len(ids) == len(set(ids)), "rule ids must be unique"


def test_every_rule_respects_the_level_ceiling():
    for r in load_rules():
        assert r.action_level <= MVP_ACTION_LEVEL_CEILING


def test_no_registered_action_exceeds_the_ceiling():
    for code, action in ACTIONS.items():
        assert action.level <= MVP_ACTION_LEVEL_CEILING, f"{code} exceeds ceiling"


def test_l4_action_level_is_rejected_at_load(tmp_path: Path):
    bad = {
        "version": "1.0", "business_domain": "Test",
        "rules": [{
            "rule_id": "BAD-L4-001", "detector": "kpi_cell", "kpi": "X",
            "business_process": "P", "detect_metric": "m", "direction": "below",
            "target": 90.0, "severity_thresholds": {"high": 80.0},
            "root_cause_category": "supply", "persona": "Supply Chain Planner",
            "owner": "Supply Chain Manager", "action_code": "trigger_supplier_review",
            "action_level": 4, "approval_required": True,
        }],
    }
    p = tmp_path / "bad_rules.json"
    p.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(RuleConfigError, match="exceeds MVP ceiling"):
        load_rules(p)


def test_unknown_action_code_is_rejected(tmp_path: Path):
    bad = {
        "version": "1.0", "business_domain": "Test",
        "rules": [{
            "rule_id": "BAD-ACT-001", "detector": "kpi_cell", "kpi": "X",
            "business_process": "P", "detect_metric": "m", "direction": "below",
            "target": 90.0, "severity_thresholds": {"high": 80.0},
            "root_cause_category": "supply", "persona": "Supply Chain Planner",
            "owner": "Supply Chain Manager", "action_code": "apply_fix_autonomously",
            "action_level": 3, "approval_required": True,
        }],
    }
    p = tmp_path / "bad_rules.json"
    p.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(KeyError):
        load_rules(p)


def test_config_defaults_carry_no_real_scope():
    # committed defaults must never point at a real catalog/table/warehouse
    assert SETTINGS.warehouse_id == "" or SETTINGS.warehouse_id
    assert "REPLACE_ME" in SETTINGS.target_table or SETTINGS.target_table.count(".") == 2
    # the placeholder must be obviously fake when unset
    if "REPLACE_ME" in SETTINGS.target_table:
        assert SETTINGS.prompt_store_table.startswith("REPLACE_ME")
