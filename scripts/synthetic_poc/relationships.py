"""Table assembly with contract-accurate relationship integrity.

For each FK the contract records distinctChildKeys / orphanKeys / integrityPct.
We reproduce the *distinct-key* integrity exactly: of `distinctChildKeys` distinct
FK values, `orphanKeys` are synthetic values absent from the parent and the rest
are drawn from generated parent keys. Rows then sample that child-key domain.

The pair (fct_ofr.country_channel -> dm_sales_channel.country_channel) has 0%
resolution and is explicitly NOT treated as a join key (reproduced independently).
"""

from __future__ import annotations

from .models import ColumnContract, Relationship, TableContract
from . import generators as G

JOIN_INTEGRITY_THRESHOLD = 50.0  # below this, reproduce column but don't join


def _relationships_for(table_short: str, rels: list[Relationship]) -> dict[str, Relationship]:
    return {r.fk_column: r for r in rels if r.fk_table == table_short}


def _is_unique(col: ColumnContract, row_count: int) -> bool:
    d = col.distinct_approx
    return d is not None and d >= max(1, int(row_count * 0.95))


def _gen_fk_column(col, rel, n, rng, parent_keys, full_rows):
    """Return (values, meta) reproducing the FK's distinct-key integrity."""
    distinct = max(1, rel.distinct_child_keys)
    orphan_n = min(rel.orphan_keys, distinct)
    valid_n = distinct - orphan_n

    parents = list(dict.fromkeys(v for v in parent_keys if v is not None))
    valid_keys = rng.sample(parents, min(valid_n, len(parents))) if parents else []

    orphan_pool = G.build_categorical_domain(col, rng, orphan_n * 3 + 3)
    parent_set = set(parents)
    orphan_keys = [v for v in orphan_pool if v not in parent_set][:orphan_n]
    while len(orphan_keys) < orphan_n:  # guarantee count
        orphan_keys.append(G.instantiate_mask("AAA9", rng))

    child_domain = valid_keys + orphan_keys
    if not child_domain:
        child_domain = valid_keys or orphan_keys or [G.instantiate_mask("AA", rng)]
    values = [rng.choice(child_domain) for _ in range(n)]

    # FK columns can carry their own null rate (e.g. operations.plant_id ~16%)
    null_rate = (col.null_count / full_rows) if full_rows else 0.0
    values = G._apply_nulls(values, round(null_rate * n), rng)

    non_null = [v for v in values if v is not None]
    distinct_present = len(set(non_null))
    orphans_present = len({v for v in non_null if v not in parent_set})
    integrity = 100.0 * (distinct_present - orphans_present) / distinct_present if distinct_present else 0.0
    meta = {
        "fk_column": col.name,
        "ref": f"{rel.ref_table}.{rel.ref_column}",
        "distinct_child_keys": distinct_present,
        "orphan_keys": orphans_present,
        "integrity_pct": round(integrity, 1),
        "target_integrity_pct": rel.integrity_pct,
    }
    return values, meta


def generate_table(tc: TableContract, dest_rows: int, seed: int,
                   rels: list[Relationship], parent_keys: dict[str, dict[str, list]]):
    """Return (column_names, rows, key_export, rel_meta)."""
    inv = G.parse_invariants(tc.invariants)
    fk_map = _relationships_for(tc.short_name, rels)
    phys = tc.physical_columns
    columns = {}
    rel_meta = []

    for col in phys:
        rng = G.rng_for(seed, tc.short_name, col.name)
        rel = fk_map.get(col.name)
        use_fk = (
            rel is not None
            and rel.integrity_pct >= JOIN_INTEGRITY_THRESHOLD
            and rel.ref_table in parent_keys
            and rel.ref_column in parent_keys.get(rel.ref_table, {})
        )
        if use_fk:
            pk = parent_keys[rel.ref_table][rel.ref_column]
            vals, meta = _gen_fk_column(col, rel, dest_rows, rng, pk, tc.row_count)
            rel_meta.append(meta)
        elif col.type == "timestamp":
            vals = G.generate_timestamp(col, dest_rows, rng, tc.row_count, inv)
        elif col.sensitivity == "numeric" or col.type in ("int", "bigint", "double"):
            vals = G.generate_numeric(col, dest_rows, rng, tc.row_count, inv)
        else:  # categorical-withheld / string
            vals = G.generate_categorical(
                col, dest_rows, rng, tc.row_count, unique=_is_unique(col, tc.row_count)
            )
        columns[col.name] = vals

    names = [c.name for c in phys]
    rows = list(zip(*[columns[n] for n in names])) if names else []

    # export referenced key columns for downstream children
    key_export = {}
    for col in phys:
        distinct_vals = list(dict.fromkeys(v for v in columns[col.name] if v is not None))
        key_export[col.name] = distinct_vals

    return names, rows, key_export, rel_meta
