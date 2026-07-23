"""End-to-end proof: the synthetic dataset drives the real detection engine.

Generates the deterministic synthetic star schema, loads it into a DEV stand-in
schema on the reachable warehouse, then runs the ACTUAL detection engine
(scripts/decision_assist/detect.py) pointed at that schema and asserts all five
SCM rules fire with the expected severities. Proves the generator + loader
reproduce a dataset the governed engine treats exactly like the live demo data —
without touching the live `main.supply_chain` or any canonical org schema.

  python scripts/decision_assist/prove_synth.py [--schema main.supply_chain_synth]

Reads Databricks creds from proxy/config.json (genie profile), same as
prove_canvas_delta.js. Dev proof only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ── point the engine at the synth schema BEFORE importing the package (config
#    reads env at import time) ──────────────────────────────────────────────
SCHEMA = os.environ.get("SYNTH_SCHEMA", "main.supply_chain_synth")
_ap = argparse.ArgumentParser(add_help=False)
_ap.add_argument("--schema", default=SCHEMA)
_args, _ = _ap.parse_known_args()
SCHEMA = _args.schema

# creds from the gitignored proxy config (never printed)
_cfg = json.loads((ROOT / "proxy" / "config.json").read_text())
_g = _cfg["profiles"]["genie"]
os.environ.setdefault("DATABRICKS_HOST", _g["host"].rstrip("/"))
os.environ.setdefault("DATABRICKS_TOKEN", _g["token"])
os.environ.setdefault("DATABRICKS_WAREHOUSE_ID", _g["warehouseId"])
os.environ["AI_TARGET_TABLE"] = f"{SCHEMA}.fact_supply_chain_kpi_monthly"
os.environ["AI_SUPPLIER_TABLE"] = f"{SCHEMA}.fact_supplier_scorecard_monthly"
os.environ["AI_SUPPLIER_DIM"] = f"{SCHEMA}.dim_supplier"
os.environ["AI_ORDER_LINE_TABLE"] = f"{SCHEMA}.fact_order_line"
os.environ.setdefault("AI_BUSINESS_DOMAIN", "Supply Chain")

sys.path.insert(0, str(ROOT))
from scripts.decision_assist import detect, sql_client  # noqa: E402
from scripts.decision_assist.synth.load import load  # noqa: E402

EXPECTED = {
    "SCM-OTIF-001": "high",
    "SCM-FILL-001": "high",
    "SCM-FA-001": "critical",
    "SCM-SUPP-001": "critical",
    "SCM-INV-001": "critical",
}


def main() -> int:
    print(f"[prove-synth] schema = {SCHEMA}")
    cfg = sql_client.resolve_config()

    print("[prove-synth] loading synthetic dataset (deterministic)...")
    counts = load(SCHEMA, drop=True, cfg=cfg)
    total = sum(counts.values())
    print(f"[prove-synth] loaded {total} rows across {len(counts)} tables")

    print("[prove-synth] running the real detection engine against the synth schema...")
    prompts = detect.detect(cfg=cfg)
    got = {p.rule_id: p for p in prompts}
    print(f"[prove-synth] engine produced {len(prompts)} prompt(s):")
    for p in prompts:
        impact = (f"${p.business_impact_value:,.0f}" if p.business_impact_unit == "USD"
                  else f"{p.business_impact_value:,.0f} {p.business_impact_unit}")
        print(f"    {p.rule_id:14s} {p.severity:9s} {impact:>18s}  {p.headline}")

    print("\n[prove-synth] asserting every rule fired at the expected severity:")
    ok = True
    for rid, sev in EXPECTED.items():
        p = got.get(rid)
        if p is None:
            print(f"    MISSING  {rid} (expected {sev})"); ok = False
        elif p.severity != sev:
            print(f"    SEV MISMATCH  {rid}: got {p.severity}, expected {sev}"); ok = False
        else:
            print(f"    ok  {rid} -> {sev}")

    print("\n[prove-synth] " + ("PASS — synthetic data drives the engine end-to-end." if ok
                                 else "FAIL — see mismatches above."))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
