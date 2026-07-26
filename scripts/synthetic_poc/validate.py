"""Post-create validation against the live Databricks objects.

Uses only aggregate / metadata queries (COUNT, MIN, MAX, COUNT DISTINCT,
information_schema). Never selects raw business-shaped rows into the report.
All data under test is synthetic by construction.
"""

from __future__ import annotations

from .databricks_client import DatabricksClient
from .generators import parse_invariants
from .models import TableContract

NULL_RATE_TOL = 0.05          # absolute
CARD_TOL_FACTOR = 3.0         # order-of-magnitude band
INTEGRITY_TOL = 5.0           # percentage points


def _fqn(cat, sch, name):
    return f"{cat}.{sch}.{name}"


def validate_table(client: DatabricksClient, cat: str, sch: str, dest: str,
                   tc: TableContract, expected_rows: int) -> dict:
    fqn = _fqn(cat, sch, dest)
    checks = []

    def add(name, ok, detail):
        checks.append({"check": name, "pass": bool(ok), "detail": detail})

    # 1. exists
    exists = client.object_exists(cat, sch, dest)
    add("exists", exists, fqn)
    if not exists:
        return {"table": dest, "fqn": fqn, "pass": False, "checks": checks}

    # 2. schema diff (names + types, order)
    info = client.rows(
        "SELECT column_name, full_data_type FROM information_schema.columns "
        f"WHERE table_schema='{sch}' AND table_name='{dest}' ORDER BY ordinal_position",
        cat, sch,
    )
    live = [(r[0], r[1].lower()) for r in info]
    expected = [(c.name, c.type) for c in tc.physical_columns]
    add("schema_diff_empty", live == expected,
        {"live_cols": len(live), "expected_cols": len(expected),
         "first_mismatch": next((i for i, (a, b) in enumerate(zip(live, expected)) if a != b), None)})

    # 3. exact row count
    n = int(client.scalar(f"SELECT COUNT(*) FROM {fqn}") or 0)
    add("row_count_exact", n == expected_rows, {"actual": n, "expected": expected_rows})

    # 4. null-rate + cardinality per column
    inv = parse_invariants(tc.invariants)
    null_ok = card_ok = True
    range_ok = inv_ok = True
    col_report = []
    for c in tc.physical_columns:
        agg = client.rows(
            f"SELECT COUNT(*)-COUNT(`{c.name}`) AS nulls, COUNT(DISTINCT `{c.name}`) AS card "
            f"FROM {fqn}", cat, sch)[0]
        nulls, card = int(agg[0]), int(agg[1])
        exp_null_rate = (c.null_count / tc.row_count) if tc.row_count else 0.0
        act_null_rate = nulls / n if n else 0.0
        crow = {"col": c.name, "nulls": nulls, "null_rate": round(act_null_rate, 4),
                "exp_null_rate": round(exp_null_rate, 4), "distinct": card}
        if abs(act_null_rate - exp_null_rate) > NULL_RATE_TOL:
            null_ok = False; crow["null_flag"] = True
        # cardinality band vs distinctApprox, capped by available non-null rows
        # (a 97%-null column at 1% scale simply cannot reach its full distinct count)
        if c.distinct_approx:
            non_null_rows = max(1, expected_rows - round(exp_null_rate * expected_rows))
            exp_card = min(c.distinct_approx, non_null_rows)
            if not (exp_card / CARD_TOL_FACTOR <= max(card, 1) <= exp_card * CARD_TOL_FACTOR + 1):
                card_ok = False
                crow["card_flag"] = {"live": card, "exp_card": exp_card}
        # numeric range
        rng = c.numeric_range()
        if rng and c.name.lower() not in inv and c.type in ("int", "bigint", "double"):
            mm = client.rows(f"SELECT MIN(`{c.name}`), MAX(`{c.name}`) FROM {fqn}", cat, sch)[0]
            if mm[0] is not None:
                lo, hi = float(mm[0]), float(mm[1])
                if lo < rng[0] - 1e-6 or hi > rng[1] + 1e-6:
                    range_ok = False; crow["range_flag"] = {"lo": lo, "hi": hi, "exp": rng}
        # invariant range
        if c.name.lower() in inv:
            lo_e, hi_e = inv[c.name.lower()]
            mm = client.rows(f"SELECT MIN(`{c.name}`), MAX(`{c.name}`) FROM {fqn}", cat, sch)[0]
            if mm[0] is not None and (int(mm[0]) < lo_e or int(mm[1]) > hi_e):
                inv_ok = False; crow["inv_flag"] = {"lo": mm[0], "hi": mm[1], "exp": [lo_e, hi_e]}
        col_report.append(crow)

    add("null_rates_within_tol", null_ok, {"tol": NULL_RATE_TOL})
    add("cardinality_within_band", card_ok, {"factor": CARD_TOL_FACTOR})
    add("numeric_ranges_ok", range_ok, {})
    add("invariants_ok", inv_ok, {"invariants": tc.invariants})

    ok = all(c["pass"] for c in checks)
    return {"table": dest, "fqn": fqn, "pass": ok, "row_count": n,
            "checks": checks, "columns": col_report}


def validate_relationships(client, cat, sch, rel_meta_by_table) -> list[dict]:
    """Re-measure distinct-key integrity live and compare to contract targets."""
    out = []
    name_map = {  # source short -> dest
        "vw_ltm_sc_dm_countries": "tbl_pp_syn_dm_countries",
        "vw_ltm_sc_dm_plants": "tbl_pp_syn_dm_plants",
        "vw_ltm_sc_dm_sales_channel": "tbl_pp_syn_dm_sales_channel",
        "mtr_vw_ltm_sc_fct_ofr": "tbl_pp_syn_fct_ofr",
        "mtr_vw_ltm_sc_fct_operations": "tbl_pp_syn_fct_operations",
        "mtr_vw_ltm_sc_fct_performance": "tbl_pp_syn_fct_performance",
    }
    for src_table, metas in rel_meta_by_table.items():
        child = name_map[src_table]
        for m in metas:
            ref_table_src, ref_col = m["ref"].split(".")
            parent = name_map.get(ref_table_src)
            fkc = m["fk_column"]
            cfqn, pfqn = _fqn(cat, sch, child), _fqn(cat, sch, parent)
            # integrity is measured over NON-NULL child keys (nulls are missing
            # values, not referential violations).
            distinct = int(client.scalar(
                f"SELECT COUNT(DISTINCT `{fkc}`) FROM {cfqn}", cat, sch) or 0)
            orphans = int(client.scalar(
                f"SELECT COUNT(*) FROM (SELECT DISTINCT `{fkc}` v FROM {cfqn} "
                f"WHERE `{fkc}` IS NOT NULL) c "
                f"LEFT ANTI JOIN {pfqn} p ON c.v = p.`{ref_col}`", cat, sch) or 0)
            integ = 100.0 * (distinct - orphans) / distinct if distinct else 0.0
            out.append({
                "child": child, "fk": fkc, "parent": parent, "ref_col": ref_col,
                "distinct_child_keys": distinct, "orphan_keys": orphans,
                "integrity_pct": round(integ, 1),
                "target_integrity_pct": m["target_integrity_pct"],
                "pass": abs(integ - m["target_integrity_pct"]) <= INTEGRITY_TOL,
            })
    return out


def representative_queries(client, cat, sch) -> list[dict]:
    """3-5 non-empty aggregation queries proving the data is queryable."""
    q = [
        ("countries_by_ou",
         f"SELECT ou, COUNT(*) n FROM {cat}.{sch}.tbl_pp_syn_dm_countries GROUP BY ou ORDER BY n DESC LIMIT 5"),
        ("plants_per_country",
         f"SELECT country_id, COUNT(*) n FROM {cat}.{sch}.tbl_pp_syn_dm_plants GROUP BY country_id ORDER BY n DESC LIMIT 5"),
        ("ofr_rows_by_year",
         f"SELECT year, COUNT(*) n FROM {cat}.{sch}.tbl_pp_syn_fct_ofr GROUP BY year ORDER BY year"),
        ("ofr_top_plants",
         f"SELECT plant_id, COUNT(*) n FROM {cat}.{sch}.tbl_pp_syn_fct_ofr GROUP BY plant_id ORDER BY n DESC LIMIT 5"),
        ("operations_by_month",
         f"SELECT month, COUNT(*) n FROM {cat}.{sch}.tbl_pp_syn_fct_operations GROUP BY month ORDER BY month LIMIT 12"),
    ]
    results = []
    for name, sql in q:
        rows = client.rows(sql, cat, sch)
        results.append({"name": name, "row_groups": len(rows), "nonempty": len(rows) > 0})
    return results
