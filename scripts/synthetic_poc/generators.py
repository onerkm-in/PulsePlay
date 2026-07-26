"""Deterministic synthetic value generation, driven entirely by the contract.

Rules honoured per column:
  * categorical-withheld -> invent a domain of ~distinctApprox values whose shapes
    match the masked patterns (A=letter, 9=digit); never a source value.
  * numeric              -> sample within [min, max], scaled null rate, ~distinct.
  * timestamp            -> within the invariant date window.
  * temporal invariants  -> year/month/week/quarter clamped to declared ranges.
Determinism: RNG is seeded from (global seed, table, column) so output is stable
and independent of evaluation order.
"""

from __future__ import annotations

import hashlib
import random
import re
import string
from datetime import datetime, timedelta

from .models import ColumnContract, TableContract

_LETTERS = string.ascii_uppercase


def _stable_salt(*parts: str) -> int:
    h = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(h[:12], 16)


def rng_for(seed: int, *parts: str) -> random.Random:
    return random.Random(seed ^ _stable_salt(*parts))


def instantiate_mask(pattern: str, rng: random.Random) -> str:
    out = []
    for ch in pattern:
        if ch == "A":
            out.append(rng.choice(_LETTERS))
        elif ch == "9":
            out.append(str(rng.randint(0, 9)))
        else:
            out.append(ch)  # structural char kept verbatim (space, ., -, etc.)
    return "".join(out)


def build_categorical_domain(col: ColumnContract, rng: random.Random, size: int) -> list[str]:
    """~size distinct synthetic values matching the column's masked patterns."""
    patterns = col.masked_patterns
    if not patterns:
        # No pattern captured: fall back to length-based letter strings.
        lo = int(float(col.profile.get("lengths", {}).get("min", 4)))
        hi = int(float(col.profile.get("lengths", {}).get("max", lo)))
        patterns = [{"pattern": "A" * rng.randint(lo, max(lo, hi)), "count": 1}]
    weighted = []
    for mp in patterns:
        weighted += [mp["pattern"]] * max(1, int(mp.get("count", 1)))
    domain: list[str] = []
    seen: set[str] = set()
    attempts = 0
    target = max(1, size)
    while len(domain) < target and attempts < target * 60:
        attempts += 1
        val = instantiate_mask(rng.choice(weighted), rng)
        if val not in seen:
            seen.add(val)
            domain.append(val)
    return domain


def _null_rate(col: ColumnContract, full_rows: int) -> float:
    if full_rows <= 0:
        return 0.0
    return min(1.0, col.null_count / full_rows)


def _apply_nulls(values: list, n_null: int, rng: random.Random) -> list:
    if n_null <= 0:
        return values
    idx = rng.sample(range(len(values)), min(n_null, len(values)))
    for i in idx:
        values[i] = None
    return values


# ---- invariant parsing -------------------------------------------------------

_INV_RE = re.compile(r"(\w+)\s+in\s+\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]")


def parse_invariants(invariants: list[str]) -> dict[str, tuple[int, int]]:
    out: dict[str, tuple[int, int]] = {}
    for inv in invariants:
        m = _INV_RE.search(inv)
        if m:
            out[m.group(1).lower()] = (int(m.group(2)), int(m.group(3)))
    return out


def year_window(inv: dict[str, tuple[int, int]]) -> tuple[int, int]:
    return inv.get("year", (2024, 2027))


# ---- numeric / temporal ------------------------------------------------------

def generate_numeric(col: ColumnContract, n: int, rng: random.Random,
                     full_rows: int, inv: dict[str, tuple[int, int]]) -> list:
    name = col.name.lower()
    rng_range = col.numeric_range()
    # temporal invariant override
    if name in inv:
        lo, hi = inv[name]
    elif rng_range:
        lo, hi = rng_range
    else:
        lo, hi = 0.0, 1.0

    is_int = col.type in ("int", "bigint")
    distinct = col.distinct_approx or n
    null_n = round(_null_rate(col, full_rows) * n)
    pool_k = max(1, min(distinct, n))

    # key-like column: near-unique over the row set
    if distinct >= max(1, int(n * 0.95)):
        if is_int and (int(hi) - int(lo) + 1) >= n:
            vals = list(range(int(lo), int(lo) + n))
        elif is_int:
            vals = [rng.randint(int(lo), int(hi)) for _ in range(n)]
        else:
            vals = [round(rng.uniform(lo, hi), 6) for _ in range(n)]
        rng.shuffle(vals)
        return _apply_nulls(vals, null_n, rng)

    # bounded distinct pool -> honour the captured cardinality
    if is_int:
        lo_i, hi_i = int(round(lo)), int(round(hi))
        if hi_i < lo_i:
            hi_i = lo_i
        span = hi_i - lo_i + 1
        pool = (list(range(lo_i, hi_i + 1)) if span <= pool_k
                else rng.sample(range(lo_i, hi_i + 1), pool_k))
    else:
        pool = list({round(rng.uniform(lo, hi), 6) for _ in range(pool_k * 2)})[:pool_k] or [lo]
    vals = [rng.choice(pool) for _ in range(n)]
    return _apply_nulls(vals, null_n, rng)


def generate_timestamp(col: ColumnContract, n: int, rng: random.Random,
                       full_rows: int, inv: dict[str, tuple[int, int]]) -> list:
    y0, y1 = year_window(inv)
    start = datetime(y0, 1, 1)
    span_days = (datetime(y1, 12, 31) - start).days
    distinct = col.distinct_approx or n
    null_n = round(_null_rate(col, full_rows) * n)
    pool_k = max(1, min(distinct, n))

    def _mk():
        d = start + timedelta(days=rng.randint(0, span_days),
                              seconds=rng.randint(0, 86399))
        return d.strftime("%Y-%m-%d %H:%M:%S")

    # bounded distinct pool of timestamps (e.g. month_year has ~24 distinct)
    pool = list({_mk() for _ in range(pool_k * 3)})[:pool_k] or [_mk()]
    vals = [rng.choice(pool) for _ in range(n)]
    return _apply_nulls(vals, null_n, rng)


def generate_categorical(col: ColumnContract, n: int, rng: random.Random,
                         full_rows: int, unique: bool) -> list:
    distinct = col.distinct_approx or n
    if unique:
        domain = build_categorical_domain(col, rng, n)
        # pad if the pattern space could not fill n distinct
        while len(domain) < n:
            domain.append(instantiate_mask("AAAAAA", rng) + str(len(domain)))
        rng.shuffle(domain)
        vals = domain[:n]
    else:
        domain = build_categorical_domain(col, rng, distinct)
        vals = [rng.choice(domain) for _ in range(n)]
    return _apply_nulls(vals, round(_null_rate(col, full_rows) * n), rng)
