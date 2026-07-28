"""Offline tests for the CPG/FMCG reskin fact grain.

Regression pins for the 2026-07-28 finding: per-market YoY in the performance
fact was a ROW-COUNT RATIO rather than a trend. Periods were allocated
proportionally but the country was an unstratified hash, so on a 177-row budget
spread over 13 markets x 30 periods most (market, period) cells were empty and
the occupied ones held 1-6 rows at random. The deployed demo reported El
Salvador at +126.43% YoY against a company total of +4.25%, Chile +31.23% and
Costa Rica +43.19% — while Mexico disappeared from 2026 altogether, dropping
$26.92 MN. Every per-market trend in the demo was noise.

These tests assert the fact is built on its declared grain instead, so the
numbers a demo audience reads mean what they appear to mean.
"""

import collections
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]

from synthetic_poc import contract_loader as CL
from synthetic_poc import cpg_reskin as R

PERF = "mtr_vw_ltm_sc_fct_performance"


@pytest.fixture(scope="module")
def package():
    return CL.load_package(REPO_ROOT)


@pytest.fixture(scope="module")
def perf(package):
    """The performance fact as it would be deployed, built offline."""
    dims = R.build_dims()
    budget = R.round_half_up(package["contracts"][PERF].row_count * R.SCALE)
    names, _types, rows = R.build_fact(package, PERF, budget, dims, package["relationships"])
    idx = {n: i for i, n in enumerate(names)}
    real = {c["country_id"] for c in dims["vw_ltm_sc_dm_countries"]}
    return {"idx": idx, "rows": rows, "real": real, "budget": budget}


def _half(perf, year):
    idx, rows = perf["idx"], perf["rows"]
    return [r for r in rows if r[idx["year"]] == year and r[idx["month"]] <= 6]


def _sales_by_market(perf, year):
    idx = perf["idx"]
    out = collections.defaultdict(float)
    for r in _half(perf, year):
        out[r[idx["country_id"]]] += float(r[idx["net_sales_usd"]] or 0)
    return out


def test_declared_grain_is_one_row_per_market_period(perf):
    """Grain is country x year x month — exactly one row per cell, no gaps."""
    idx = perf["idx"]
    cells = collections.Counter(
        (r[idx["country_id"]], r[idx["year"]], r[idx["month"]])
        for r in perf["rows"] if r[idx["country_id"]] in perf["real"]
    )
    assert cells, "no rows for any real market"
    assert max(cells.values()) == 1
    assert min(cells.values()) == 1
    # every real market that appears is present in every period
    periods = {(y, m) for (_c, y, m) in cells}
    markets = {c for (c, _y, _m) in cells}
    assert len(cells) == len(periods) * len(markets)


def test_row_budget_floor_never_starves_the_grain(package, perf):
    """A tiny SCALE must not drop below one row per grain cell."""
    # the contract budget alone (177) is far below the grid, so the floor must lift it
    assert perf["budget"] < len(perf["rows"])


def test_every_market_appears_in_both_comparison_halves(perf):
    """No market may vanish between prior-YTD and current-YTD (Mexico did)."""
    prior, current = _sales_by_market(perf, 2025), _sales_by_market(perf, 2026)
    real_prior = {k for k in prior if k in perf["real"]}
    real_current = {k for k in current if k in perf["real"]}
    assert real_prior == real_current


def test_per_market_yoy_is_a_trend_not_a_row_count_ratio(perf):
    """The reported defect: +126.43% for one market against a ~+5% total."""
    prior, current = _sales_by_market(perf, 2025), _sales_by_market(perf, 2026)
    total_yoy = (sum(current.values()) / sum(prior.values()) - 1) * 100

    for cid in sorted(k for k in prior if k in perf["real"]):
        yoy = (current[cid] / prior[cid] - 1) * 100
        # A market may legitimately out- or under-perform the company, but not
        # by 25x. Before the fix this reached +126% against a +4.25% total.
        assert abs(yoy) < 25, f"{cid} YoY {yoy:+.2f}% vs total {total_yoy:+.2f}%"


def test_market_row_counts_are_balanced_across_halves(perf):
    """Equal rows per market per half, so sums compare like with like."""
    idx = perf["idx"]
    for year in (2025, 2026):
        counts = collections.Counter(
            r[idx["country_id"]] for r in _half(perf, year)
            if r[idx["country_id"]] in perf["real"]
        )
        assert len(set(counts.values())) == 1, f"{year} uneven: {dict(counts)}"


def test_orphan_keys_exist_but_carry_no_volume(perf):
    """Orphan FKs are integrity-test artifacts, not peer markets.

    fk_domain mints synthetic ZZnn child keys with no parent row on purpose, so
    joins have unmatched keys to catch. They must stay out of the grain grid:
    when they were in it they drew a full row-per-period and ~$170 MN of net
    sales, promoting two artifacts into the top markets of every ranking.
    """
    idx = perf["idx"]
    orphan_rows = [r for r in perf["rows"] if r[idx["country_id"]] not in perf["real"]]
    assert orphan_rows, "orphan keys should still be present for integrity testing"

    per_year = collections.Counter(
        (r[idx["country_id"]], r[idx["year"]]) for r in orphan_rows
    )
    assert max(per_year.values()) == 1

    # and they must not rival a real market
    current = _sales_by_market(perf, 2026)
    real_min = min(v for k, v in current.items() if k in perf["real"])
    for cid, v in current.items():
        if cid not in perf["real"]:
            assert v < real_min / 2, f"orphan {cid} at {v:,.0f} rivals real markets"
