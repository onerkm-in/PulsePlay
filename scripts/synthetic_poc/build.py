"""Build CLI for the synthetic supply-chain POC.

Phases (compose freely, run in this order): --selfcheck --dry-run --create --validate
  --scale-factor FLOAT   default 0.01 (1% fact scale; dims always full)
  --seed INT             default 42
  --json-output          emit a machine-readable summary to stdout

Safety: dimensions build before facts; per-object failure isolation on --create;
never drops/alters/overwrites; writes only into the target catalog.schema.
"""

from __future__ import annotations

import argparse
import decimal
import hashlib
import json
import logging
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .contract_loader import BUILD_TARGETS, METRIC_VIEW_TARGETS, load_package, ContractError
from .databricks_client import DatabricksClient, DatabricksError
from .logging_config import get_logger, log
from . import privacy_validator as PV
from . import relationships as REL
from . import sqlgen
from . import validate as VAL

REPO_ROOT = Path(__file__).resolve().parents[2]
PKG_DIR = Path(__file__).resolve().parent
DEFAULT_SCALE = 0.01
DEFAULT_SEED = 42


def round_half_up(x: float) -> int:
    return int(decimal.Decimal(str(x)).quantize(0, rounding=decimal.ROUND_HALF_UP))


def new_run_id() -> str:
    return "run-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]


def generator_hash() -> str:
    h = hashlib.sha256()
    for p in sorted(PKG_DIR.glob("*.py")):
        h.update(p.read_bytes())
    return h.hexdigest()


def content_hash(names, rows) -> str:
    h = hashlib.sha256()
    h.update("|".join(names).encode())
    for row in rows:
        h.update(repr(row).encode())
    return h.hexdigest()


def compute_targets(package, scale):
    targets = []
    for bt in BUILD_TARGETS:
        tc = package["contracts"][bt.contract_short_name]
        if bt.role == "dimension":
            rows = tc.row_count
        else:
            rows = round_half_up(tc.row_count * scale)
        targets.append((bt, tc, rows))
    return targets


def generate_all(package, seed, scale, logger):
    targets = compute_targets(package, scale)
    rels = package["relationships"]
    parent_keys: dict[str, dict[str, list]] = {}
    built = {}
    rel_meta_by_table = {}
    for bt, tc, rows in targets:
        names, data, key_export, rel_meta = REL.generate_table(
            tc, rows, seed, rels, parent_keys)
        parent_keys[bt.contract_short_name] = key_export
        types = [c.type for c in tc.physical_columns]
        PV.validate_generated(bt.dest_name, names, data)
        built[bt.dest_name] = {
            "target": bt, "tc": tc, "names": names, "types": types,
            "rows": data, "expected_rows": rows,
            "content_hash": content_hash(names, data),
        }
        if rel_meta:
            rel_meta_by_table[bt.contract_short_name] = rel_meta
        log(logger, logging.INFO, "generated", table=bt.dest_name,
            rows=len(data), cols=len(names))
    return built, rel_meta_by_table


# ---- phases ------------------------------------------------------------------

def phase_selfcheck(package, args, logger, client=None):
    res = {"phase": "selfcheck", "checks": []}

    def add(n, ok, d=""):
        res["checks"].append({"check": n, "pass": bool(ok), "detail": d})

    add("contracts_loaded", len(package["contracts"]) == 6, len(package["contracts"]))
    # privacy
    try:
        for tc in package["contracts"].values():
            PV.validate_contract(tc)
        PV.scan_package_raw(package["dir"])
        add("privacy_clean", True)
    except PV.PrivacyError as e:
        add("privacy_clean", False, str(e))
    # DDL buildable
    try:
        for bt in BUILD_TARGETS:
            sqlgen.build_create_ddl("x.y." + bt.dest_name, package["contracts"][bt.contract_short_name])
        add("ddl_buildable", True)
    except Exception as e:  # noqa
        add("ddl_buildable", False, str(e))
    # connectivity + collision (best-effort)
    if client:
        try:
            wid = client.resolve_warehouse()
            add("warehouse_resolved", True, client.warehouse_name)
            cat, sch = args.catalog, args.schema
            collisions = [bt.dest_name for bt in BUILD_TARGETS
                          if client.object_exists(cat, sch, bt.dest_name)]
            collisions += [n for n in METRIC_VIEW_TARGETS.values()
                           if client.object_exists(cat, sch, n)]
            add("no_collisions", not collisions, collisions)
        except (DatabricksError, Exception) as e:  # noqa
            add("connectivity", False, str(e))
    res["pass"] = all(c["pass"] for c in res["checks"])
    return res


def phase_dry_run(package, built, args):
    plan = {"phase": "dry-run", "scale": args.scale_factor, "seed": args.seed,
            "objects": [], "metric_views_blocked": list(METRIC_VIEW_TARGETS.values())}
    for bt in BUILD_TARGETS:
        b = built[bt.dest_name]
        fqn = f"{args.catalog}.{args.schema}.{bt.dest_name}"
        plan["objects"].append({
            "dest_fqn": fqn, "role": bt.role, "rows": b["expected_rows"],
            "physical_columns": len(b["names"]),
            "measures_excluded": len(b["tc"].measure_columns),
            "content_hash": b["content_hash"],
            "ddl": sqlgen.build_create_ddl(fqn, b["tc"]),
        })
    return plan


def phase_create(package, built, args, client, logger):
    result = {"phase": "create", "created": [], "failed": []}
    for bt in BUILD_TARGETS:  # dimensions first by order
        b = built[bt.dest_name]
        fqn = f"{args.catalog}.{args.schema}.{bt.dest_name}"
        try:
            if client.object_exists(args.catalog, args.schema, bt.dest_name):
                raise DatabricksError("object already exists -- refusing to overwrite")
            client.execute(sqlgen.build_create_ddl(fqn, b["tc"]), args.catalog, args.schema)
            n_batches = 0
            for stmt in sqlgen.build_insert_batches(fqn, b["names"], b["types"], b["rows"], args.batch_size):
                client.execute(stmt, args.catalog, args.schema)
                n_batches += 1
            result["created"].append({"fqn": fqn, "rows": b["expected_rows"],
                                      "batches": n_batches, "content_hash": b["content_hash"]})
            log(logger, logging.INFO, "created", table=fqn, rows=b["expected_rows"])
        except Exception as e:  # noqa - per-object isolation
            result["failed"].append({"fqn": fqn, "error": str(e)})
            log(logger, logging.ERROR, "create_failed", table=fqn, error=str(e))
    return result


def phase_validate(package, built, args, client, rel_meta_by_table):
    report = {"phase": "validate", "tables": [], "relationships": [], "queries": []}
    for bt in BUILD_TARGETS:
        b = built[bt.dest_name]
        report["tables"].append(
            VAL.validate_table(client, args.catalog, args.schema, bt.dest_name,
                               b["tc"], b["expected_rows"]))
    report["relationships"] = VAL.validate_relationships(
        client, args.catalog, args.schema, rel_meta_by_table)
    report["queries"] = VAL.representative_queries(client, args.catalog, args.schema)
    report["pass"] = (
        all(t["pass"] for t in report["tables"])
        and all(r["pass"] for r in report["relationships"])
        and all(q["nonempty"] for q in report["queries"])
    )
    return report


def build_manifest(package, built, run_id, args, create_result=None):
    return {
        "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "package_version": __version__,
        "seed": args.seed,
        "scale_factor": args.scale_factor,
        "scale_label": "1% fact scale (POC)" if args.scale_factor != 1.0 else "full scale",
        "target": {"catalog": args.catalog, "schema": args.schema,
                   "warehouse_name": args.warehouse_name},
        "contract_package_hash": package["package_hash"],
        "generator_hash": generator_hash(),
        "objects": [
            {"dest_fqn": f"{args.catalog}.{args.schema}.{bt.dest_name}",
             "source_contract": package["contracts"][bt.contract_short_name].fqn,
             "role": bt.role, "rows": built[bt.dest_name]["expected_rows"],
             "content_hash": built[bt.dest_name]["content_hash"],
             "created": bool(create_result and any(
                 c["fqn"].endswith(bt.dest_name) for c in create_result.get("created", [])))}
            for bt in BUILD_TARGETS
        ],
        "metric_views_blocked": {
            v: "measure formulas redacted in contract; not reproduced"
            for v in METRIC_VIEW_TARGETS.values()},
    }


def main(argv=None):
    ap = argparse.ArgumentParser(prog="synthetic_poc")
    ap.add_argument("--selfcheck", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--create", action="store_true")
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--scale-factor", type=float, default=DEFAULT_SCALE, dest="scale_factor")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--catalog", default="workspace")
    ap.add_argument("--schema", default="databrickspractice")
    ap.add_argument("--warehouse-name", default=None, dest="warehouse_name")
    ap.add_argument("--batch-size", type=int, default=2000, dest="batch_size")
    ap.add_argument("--json-output", action="store_true", dest="json_output")
    ap.add_argument("--artifacts-dir", default=str(REPO_ROOT / "docs" / "synthetic_poc"),
                    dest="artifacts_dir")
    args = ap.parse_args(argv)

    run_id = new_run_id()
    logger = get_logger(run_id)
    summary = {"run_id": run_id, "phases": {}}

    try:
        package = load_package(REPO_ROOT)
    except ContractError as e:
        summary["error"] = f"BLOCKED: {e}"
        print(json.dumps(summary, indent=2)); return 2

    needs_db = args.create or args.validate or args.selfcheck
    client = None
    if needs_db:
        try:
            client = DatabricksClient(warehouse_name=args.warehouse_name)
        except DatabricksError as e:
            if args.create or args.validate:
                summary["error"] = f"BLOCKED: {e}"; print(json.dumps(summary, indent=2)); return 2

    if args.selfcheck:
        summary["phases"]["selfcheck"] = phase_selfcheck(package, args, logger, client)

    built = rel_meta_by_table = None
    if args.dry_run or args.create or args.validate:
        built, rel_meta_by_table = generate_all(package, args.seed, args.scale_factor, logger)

    if args.dry_run:
        summary["phases"]["dry_run"] = phase_dry_run(package, built, args)

    create_result = None
    if args.create:
        create_result = phase_create(package, built, args, client, logger)
        summary["phases"]["create"] = create_result

    if args.create or args.dry_run:
        summary["manifest"] = build_manifest(package, built, run_id, args, create_result)

    if args.validate:
        summary["phases"]["validate"] = phase_validate(package, built, args, client, rel_meta_by_table)

    if args.json_output:
        print(json.dumps(summary, indent=2, default=str))
    else:
        print(json.dumps({k: v for k, v in summary.items()}, indent=2, default=str)[:4000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
