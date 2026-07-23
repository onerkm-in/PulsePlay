"""Stand up the synthetic dataset in a Databricks schema.

Creates the schema + tables (exact DDL) and batch-inserts the generated rows via
the SQL Statement Execution API, then verifies row counts. Targets a DEV stand-in
schema by default (`main.supply_chain_synth`) — it NEVER writes the live
`main.supply_chain` or a canonical org schema.

Usage:
  python -m scripts.decision_assist.synth.load [--schema main.supply_chain_synth]
                                               [--seed 20260723] [--drop]
Requires Databricks creds (DATABRICKS_HOST/TOKEN or a ~/.databrickscfg profile)
and DATABRICKS_WAREHOUSE_ID, same as the engine.
"""
from __future__ import annotations

import argparse

from .. import sql_client
from . import ddl
from .generate import generate

DEFAULT_SCHEMA = "main.supply_chain_synth"
BATCH_ROWS = 300


def _lit(value, sqltype: str) -> str:
    if value is None:
        return "NULL"
    if sqltype == "BOOLEAN":
        return "true" if value else "false"
    if sqltype in ddl.STRING_LIKE:
        return "'" + str(value).replace("'", "''") + "'"
    return str(value)  # INT / BIGINT / DECIMAL — numeric literal


def _insert_batches(schema: str, table: str, rows: list[dict], cfg) -> None:
    cols = [c for c, _ in ddl.TABLES[table]]
    types = ddl.column_types(table)
    collist = ", ".join(f"`{c}`" for c in cols)
    for i in range(0, len(rows), BATCH_ROWS):
        chunk = rows[i:i + BATCH_ROWS]
        values = ",\n".join(
            "(" + ", ".join(_lit(r.get(c), types[c]) for c in cols) + ")"
            for r in chunk
        )
        sql = f"INSERT INTO {schema}.{table} ({collist}) VALUES\n{values}"
        sql_client.execute(sql, cfg=cfg)


def load(schema: str = DEFAULT_SCHEMA, seed: int = 20260723, drop: bool = False,
         cfg=None) -> dict[str, int]:
    cfg = cfg or sql_client.resolve_config()
    data = generate(seed)

    # guard: refuse to touch the canonical live/org schemas
    lowered = schema.lower()
    if lowered in {"main.supply_chain"} or "uc_dev_snt" in lowered:
        raise SystemExit(f"refusing to write protected schema '{schema}' — use a dev stand-in")

    sql_client.execute(ddl.create_schema_sql(schema), cfg=cfg)
    counts: dict[str, int] = {}
    for table, rows in data.items():
        if drop:
            sql_client.execute(f"DROP TABLE IF EXISTS {schema}.{table}", cfg=cfg)
        sql_client.execute(ddl.create_table_sql(schema, table), cfg=cfg)
        sql_client.execute(f"TRUNCATE TABLE {schema}.{table}", cfg=cfg)
        _insert_batches(schema, table, rows, cfg)
        got = sql_client.query(f"SELECT COUNT(*) AS n FROM {schema}.{table}", cfg=cfg)
        counts[table] = int(got[0]["n"])
        expected = len(rows)
        status = "ok" if counts[table] == expected else f"MISMATCH (expected {expected})"
        print(f"  {table:36s} loaded={counts[table]:>6d}  {status}", flush=True)
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="Load the synthetic supply-chain dataset into Databricks.")
    ap.add_argument("--schema", default=DEFAULT_SCHEMA)
    ap.add_argument("--seed", type=int, default=20260723)
    ap.add_argument("--drop", action="store_true", help="drop + recreate tables first")
    args = ap.parse_args()
    print(f"[synth] loading -> {args.schema} (seed {args.seed})")
    counts = load(args.schema, args.seed, args.drop)
    print(f"[synth] done: {sum(counts.values())} rows across {len(counts)} tables")


if __name__ == "__main__":
    main()
