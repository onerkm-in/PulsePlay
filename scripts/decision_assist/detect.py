"""Deterministic detection: run rules over the KPI fact and build 10-part Decision Prompts.

Rules detect. This module never authorizes, executes, or invents facts — every field is derived
from governed SQL over main.supply_chain.*. LLM wording (llm_explain) is optional and additive.
"""
from __future__ import annotations

import hashlib

from .action_registry import get_action
from .config import SETTINGS
from .models import DecisionPrompt, Evidence, Rule
from .rules import load_rules
from . import sql_client

# Allowlist of KPI-fact columns a kpi_cell rule may test (defence-in-depth; config is trusted).
KPI_METRIC_ALLOWLIST = {
    "otif_pct", "line_fill_rate_pct", "case_fill_rate_pct", "forecast_accuracy_pct",
    "on_time_shipment_pct", "carrier_on_time_pct", "days_of_supply",
}
CONF_SCORE = {"high": 0.9, "medium": 0.7, "low": 0.5}


def _sig(*parts) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _prompt_id(rule: Rule, affected_key: str, month_key: int, severity: str,
               evidence_signature: str) -> str:
    return _sig(rule.rule_id, rule.persona, affected_key, month_key, severity,
               rule.root_cause_category, rule.action_code, evidence_signature)


def _severity(value: float, thr: dict[str, float], direction: str) -> str | None:
    if direction == "below":
        if value < thr["critical"]:
            return "critical"
        if value < thr["high"]:
            return "high"
        if value < thr["medium"]:
            return "medium"
    else:
        if value > thr["critical"]:
            return "critical"
        if value > thr["high"]:
            return "high"
        if value > thr["medium"]:
            return "medium"
    return None


def latest_month(cfg) -> int:
    rows = sql_client.query(f"SELECT MAX(month_key) AS mk FROM {SETTINGS.target_table}", cfg=cfg)
    return int(rows[0]["mk"])


def _confidence_phrase(confidence: str, root_cause: str) -> str:
    if confidence == "high":
        return f"The issue appears to be {root_cause}."
    if confidence == "medium":
        return f"The likely root cause is {root_cause}."
    return f"A possible factor is {root_cause}."


def _narrative(kpi: str, entity: str, value: float, unit: str, target: float,
               confidence: str, root_cause: str, impact_label: str, impact_str: str,
               action_label: str, evidence_signature: str, approval: bool) -> str:
    q = ("Do you want me to " + action_label.lower()
         + (" for approval?" if approval else "?"))
    return (
        f"STATUS: {kpi} is not looking good for {entity} "
        f"({value}{unit} vs {target}{unit} target).\n"
        f"ISSUE: {kpi} has breached its certified target.\n"
        f"ROOT CAUSE: {_confidence_phrase(confidence, root_cause)}\n"
        f"EVIDENCE: signature {evidence_signature}; sourced from governed SQL over "
        f"{SETTINGS.target_table}.\n"
        f"BUSINESS IMPACT: {impact_label} = {impact_str}.\n"
        f"RECOMMENDED FIX: {action_label}.\n"
        f"ACTION QUESTION: {q}\n"
        f"CONFIDENCE: {confidence}.\n"
        f"AUDIT NOTE: acting will log rule, persona, evidence signature, and approval outcome."
    )


def _make_prompt(rule: Rule, *, affected_key: str, entity: str, category, region,
                 month_key: int, value: float, unit: str, severity: str,
                 confidence: str, root_cause: str, impact_value: float, impact_unit: str,
                 impact_label: str, detect_sql: str, metrics: dict,
                 sample: list[dict]) -> DecisionPrompt:
    action = get_action(rule.action_code)
    ev_sig = _sig(rule.rule_id, affected_key, month_key,
                  *[round(float(v), 2) if isinstance(v, (int, float)) else v
                    for v in metrics.values()])
    pid = _prompt_id(rule, affected_key, month_key, severity, ev_sig)
    impact_str = (f"${impact_value:,.0f}" if impact_unit == "USD"
                  else f"{impact_value:,.0f} {impact_unit}")
    headline = f"{rule.kpi} is not looking good for {entity}: {value}{unit} vs {rule.target}{unit} target"
    issue = f"{rule.kpi} at {value}{unit} is below the {rule.target}{unit} certified target for {entity}."
    if rule.direction == "above":
        issue = f"{rule.kpi} at {value}{unit} is above the {rule.target}{unit} target band for {entity}."
    narrative = _narrative(rule.kpi, entity, value, unit, rule.target, confidence, root_cause,
                           impact_label, impact_str, action.label, ev_sig, rule.approval_required)
    return DecisionPrompt(
        prompt_id=pid, rule_id=rule.rule_id, business_domain=SETTINGS.business_domain,
        business_process=rule.business_process, kpi=rule.kpi, source_table=SETTINGS.target_table,
        affected_key=affected_key, category=category, region=region, month_key=month_key,
        severity=severity, root_cause_category=rule.root_cause_category, root_cause=root_cause,
        business_impact_value=round(impact_value, 2), business_impact_unit=impact_unit,
        business_impact_label=impact_label, persona=rule.persona, owner=rule.owner,
        recommended_action=action.label, action_level=action.level, action_code=action.code,
        approval_required=rule.approval_required, confidence=confidence,
        confidence_score=CONF_SCORE[confidence],
        headline=headline, issue=issue,
        evidence=Evidence(source_table=SETTINGS.target_table, detect_sql=detect_sql,
                          signature=ev_sig, sample=sample, metrics=metrics),
        narrative=narrative, status="new",
    )


# ---------------- detectors ----------------

def _detect_kpi_cell(rule: Rule, mk: int, cfg) -> list[DecisionPrompt]:
    if rule.detect_metric not in KPI_METRIC_ALLOWLIST:
        raise ValueError(f"{rule.rule_id}: metric {rule.detect_metric} not allowlisted")
    metric = rule.detect_metric
    sql = f"""
        WITH cur AS (
          SELECT category, region, {metric} AS val, otif_pct, line_fill_rate_pct,
                 forecast_accuracy_pct, forecast_bias_pct, supplier_on_time_pct,
                 on_hand_units, safety_stock_units, backorder_units,
                 otif_deduction_cost, sla_penalty_cost, forecast_units, actual_units,
                 orders_total, orders_otif
          FROM {SETTINGS.target_table} WHERE month_key = :mk
        ), prv AS (
          SELECT category, region, {metric} AS prev_val
          FROM {SETTINGS.target_table} WHERE month_key = :pmk
        )
        SELECT cur.*, prv.prev_val
        FROM cur LEFT JOIN prv USING (category, region)
    """
    pmk = mk - 1 if mk % 100 > 1 else (mk // 100 - 1) * 100 + 12
    rows = sql_client.query(sql, {"mk": mk, "pmk": pmk}, cfg=cfg)
    prompts: list[DecisionPrompt] = []
    for r in rows:
        val = float(r["val"])
        sev = _severity(val, rule.severity_thresholds, rule.direction)
        if not sev:
            continue
        entity = f"{r['region']} / {r['category']}"
        affected_key = f"{r['category']}|{r['region']}"
        prev = r.get("prev_val")
        worsened = prev is not None and float(prev) > val  # for 'below' metrics
        # rule-specific root cause + confidence + impact
        if rule.rule_id == "SCM-OTIF-001":
            sot = float(r["supplier_on_time_pct"])
            if sot < 85:
                conf, rc = "high", f"supplier late deliveries (supplier on-time {sot:.0f}%)"
            elif worsened:
                conf, rc = "medium", "deteriorating on-time/in-full performance"
            else:
                conf, rc = "medium", "on-time/in-full shortfall"
            impact_v = float(r["otif_deduction_cost"]) + float(r["sla_penalty_cost"])
            impact_u, impact_l = "USD", "estimated retailer fine + SLA penalty (month)"
            metrics = {"otif_pct": val, "prev_otif_pct": prev, "supplier_on_time_pct": sot,
                       "otif_deduction_cost": r["otif_deduction_cost"], "sla_penalty_cost": r["sla_penalty_cost"]}
        elif rule.rule_id == "SCM-FILL-001":
            oh, ss = float(r["on_hand_units"]), float(r["safety_stock_units"])
            if oh < ss:
                conf, rc = "high", f"stockout — on-hand ({oh:,.0f}) below safety stock ({ss:,.0f})"
            else:
                conf, rc = "medium", "fill shortfall without a clear stockout signal"
            impact_v = float(r["backorder_units"])
            impact_u, impact_l = "units", "units on backorder (month)"
            metrics = {"line_fill_rate_pct": val, "prev": prev, "on_hand_units": oh,
                       "safety_stock_units": ss, "backorder_units": r["backorder_units"]}
        elif rule.rule_id == "SCM-FA-001":
            bias = float(r["forecast_bias_pct"])
            direction = "over-forecast" if bias > 0 else "under-forecast"
            if abs(bias) >= 10:
                conf, rc = "high", f"persistent {direction} bias ({bias:+.0f}%)"
            else:
                conf, rc = "medium", "forecast error without strong directional bias"
            impact_v = abs(float(r["forecast_units"]) - float(r["actual_units"]))
            impact_u, impact_l = "units", "forecast error vs actual (units)"
            metrics = {"forecast_accuracy_pct": val, "bias_pct": bias,
                       "forecast_units": r["forecast_units"], "actual_units": r["actual_units"]}
        else:
            conf, rc = "medium", f"{rule.kpi} below target"
            impact_v, impact_u, impact_l = 0.0, rule.kpi, "impact"
            metrics = {metric: val, "prev": prev}
        prompts.append(_make_prompt(
            rule, affected_key=affected_key, entity=entity, category=r["category"],
            region=r["region"], month_key=mk, value=round(val, 1), unit="%",
            severity=sev, confidence=conf, root_cause=rc, impact_value=impact_v,
            impact_unit=impact_u, impact_label=impact_l,
            detect_sql=sql.strip(), metrics=metrics, sample=[]))
    return prompts


def _detect_supplier(rule: Rule, mk: int, cfg) -> list[DecisionPrompt]:
    sql = f"""
        SELECT s.on_time_pct AS val, s.orders_supplied, s.defect_rate_pct,
               d.supplier_name, d.supplier_key, d.region
        FROM {SETTINGS.supplier_table} s
        JOIN {SETTINGS.supplier_dim} d USING (supplier_key)
        WHERE s.month_key = :mk AND s.on_time_pct < :thr
        ORDER BY s.on_time_pct ASC
    """
    thr = rule.severity_thresholds["medium"]
    rows = sql_client.query(sql, {"mk": mk, "thr": thr}, cfg=cfg)
    prompts = []
    for r in rows:
        val = float(r["val"])
        sev = _severity(val, rule.severity_thresholds, rule.direction)
        if not sev:
            continue
        entity = f"Supplier {r['supplier_name']}"
        affected_key = f"supplier:{r['supplier_key']}"
        late = float(r["orders_supplied"]) * (1 - val / 100.0)
        conf = "high"  # direct measurement
        rc = f"on-time delivery collapsed to {val:.0f}% (target {rule.target:.0f}%)"
        metrics = {"on_time_pct": val, "orders_supplied": r["orders_supplied"],
                   "defect_rate_pct": r["defect_rate_pct"]}
        prompts.append(_make_prompt(
            rule, affected_key=affected_key, entity=entity, category=None, region=r["region"],
            month_key=mk, value=round(val, 1), unit="%", severity=sev, confidence=conf,
            root_cause=rc, impact_value=late, impact_unit="orders",
            impact_label="orders exposed to late supply (month)",
            detect_sql=sql.strip(), metrics=metrics, sample=[]))
    return prompts


def _detect_inventory_category(rule: Rule, mk: int, cfg) -> list[DecisionPrompt]:
    sql = f"""
        SELECT category, ROUND(AVG(days_of_supply),1) AS val,
               SUM(on_hand_units) AS on_hand, SUM(backorder_units) AS backorder
        FROM {SETTINGS.target_table} WHERE month_key = :mk
        GROUP BY category
    """
    rows = sql_client.query(sql, {"mk": mk}, cfg=cfg)
    prompts = []
    for r in rows:
        val = float(r["val"])
        sev = _severity(val, rule.severity_thresholds, rule.direction)
        if not sev:
            continue
        entity = f"{r['category']} (all regions)"
        affected_key = f"category:{r['category']}"
        conf = "high"
        rc = f"days of supply at {val:.0f} vs {rule.target:.0f}-day target (excess inventory)"
        metrics = {"days_of_supply": val, "on_hand_units": r["on_hand"]}
        prompts.append(_make_prompt(
            rule, affected_key=affected_key, entity=entity, category=r["category"], region=None,
            month_key=mk, value=round(val, 1), unit=" days", severity=sev, confidence=conf,
            root_cause=rc, impact_value=float(r["on_hand"]), impact_unit="units",
            impact_label="on-hand units tied up", detect_sql=sql.strip(),
            metrics=metrics, sample=[]))
    return prompts


_DISPATCH = {
    "kpi_cell": _detect_kpi_cell,
    "supplier": _detect_supplier,
    "inventory_category": _detect_inventory_category,
}


def detect(month_key: int | None = None, rule_id: str | None = None,
           cfg=None) -> list[DecisionPrompt]:
    """Run all rules (or one) for the given month (default = latest). Rules are isolated:
    a failure in one rule is logged and skipped, never aborts the whole pass."""
    cfg = cfg or sql_client.resolve_config()
    mk = month_key or latest_month(cfg)
    rules = load_rules()
    if rule_id:
        rules = [r for r in rules if r.rule_id == rule_id]
    prompts: list[DecisionPrompt] = []
    for rule in rules:
        try:
            prompts.extend(_DISPATCH[rule.detector](rule, mk, cfg))
        except Exception as e:  # per-rule isolation
            print(f"  [rule {rule.rule_id}] FAILED: {e}", flush=True)
    # dedup by prompt_id (stable content hash)
    unique: dict[str, DecisionPrompt] = {}
    for p in prompts:
        unique.setdefault(p.prompt_id, p)
    # severity-rank
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return sorted(unique.values(), key=lambda p: (order.get(p.severity, 9), -p.confidence_score))
