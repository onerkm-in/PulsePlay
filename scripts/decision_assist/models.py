"""Typed models for the Action Insights engine (stdlib dataclasses — no extra deps)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Rule:
    rule_id: str
    detector: str           # "kpi_cell" | "supplier" | "inventory_category"
    kpi: str
    business_process: str
    persona: str            # requester persona this prompt is routed to
    owner: str
    root_cause_category: str
    action_code: str
    action_level: int       # must be <= ceiling (enforced at load)
    approval_required: bool
    severity_thresholds: dict[str, float]   # e.g. {"critical": 85, "high": 90, "medium": 92}
    direction: str          # "below" or "above" the threshold triggers
    detect_metric: str      # column in the KPI fact to test
    target: float           # certified target for the KPI (for impact framing)
    description: str = ""


@dataclass
class Evidence:
    source_table: str
    detect_sql: str
    signature: str
    sample: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)


@dataclass
class DecisionPrompt:
    prompt_id: str
    rule_id: str
    business_domain: str
    business_process: str
    kpi: str
    source_table: str
    affected_key: str
    category: str | None
    region: str | None
    month_key: int
    severity: str
    root_cause_category: str
    root_cause: str
    business_impact_value: float
    business_impact_unit: str
    business_impact_label: str
    persona: str
    owner: str
    recommended_action: str
    action_level: int
    action_code: str
    approval_required: bool
    confidence: str
    confidence_score: float
    headline: str
    issue: str
    evidence: Evidence
    narrative: str
    status: str = "new"

    @property
    def exception_id(self) -> str:
        return f"{self.rule_id}:{self.affected_key}:{self.month_key}"
