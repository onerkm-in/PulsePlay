"""Offline tests: contract loading, determinism, privacy, relationships, scale."""

import copy
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]

from synthetic_poc import contract_loader as CL
from synthetic_poc import privacy_validator as PV
from synthetic_poc import generators as G
from synthetic_poc import relationships as REL
from synthetic_poc import build as B
from synthetic_poc.models import SUPPORTED_TYPES


@pytest.fixture(scope="module")
def package():
    return CL.load_package(REPO_ROOT)


# ---- contract loader ---------------------------------------------------------

def test_loads_six_objects(package):
    assert len(package["contracts"]) == 6
    assert set(package["contracts"]) == {t.contract_short_name for t in CL.BUILD_TARGETS}


def test_all_physical_types_supported(package):
    for tc in package["contracts"].values():
        for c in tc.physical_columns:
            assert c.type in SUPPORTED_TYPES


def test_missing_dir_fails_closed(tmp_path):
    with pytest.raises(CL.ContractError):
        CL.load_package(tmp_path)


def test_relationships_parsed(package):
    rels = package["relationships"]
    assert len(rels) == 8
    ofr_plant = [r for r in rels if r.fk_table.endswith("fct_ofr") and r.fk_column == "plant_id"][0]
    assert ofr_plant.orphan_keys == 30
    assert 90 < ofr_plant.integrity_pct < 95


# ---- privacy -----------------------------------------------------------------

def test_contract_privacy_clean(package):
    for tc in package["contracts"].values():
        PV.validate_contract(tc)
    PV.scan_package_raw(package["dir"])


def test_masked_pattern_rejects_real_chars(package):
    tc = copy.deepcopy(package["contracts"]["vw_ltm_sc_dm_countries"])
    tc.columns[0].profile["maskedPatterns"] = [{"pattern": "Brazil", "count": 1}]
    with pytest.raises(PV.PrivacyError):
        PV.validate_contract(tc)


def test_generated_rows_secret_free():
    PV.validate_generated("t", ["c"], [("XX",), ("YY",)])
    with pytest.raises(PV.PrivacyError):
        PV.validate_generated("t", ["c"], [("dapi0123456789abcdef0123",)])


# ---- generators / determinism ------------------------------------------------

def test_mask_instantiation():
    rng = G.random.Random(1)
    v = G.instantiate_mask("AA9 A.", rng)
    assert len(v) == 6 and v[0].isalpha() and v[2].isdigit() and v[3] == " "


def test_deterministic_same_seed(package):
    b1, _ = B.generate_all(package, 42, 0.01, B.get_logger("t1"))
    b2, _ = B.generate_all(package, 42, 0.01, B.get_logger("t2"))
    for k in b1:
        assert b1[k]["content_hash"] == b2[k]["content_hash"]


def test_different_seed_differs(package):
    b1, _ = B.generate_all(package, 42, 0.01, B.get_logger("t1"))
    b2, _ = B.generate_all(package, 7, 0.01, B.get_logger("t2"))
    assert b1["tbl_pp_syn_fct_ofr"]["content_hash"] != b2["tbl_pp_syn_fct_ofr"]["content_hash"]


# ---- scale factor ------------------------------------------------------------

def test_round_half_up():
    assert B.round_half_up(182920.96) == 182921
    assert B.round_half_up(845.56) == 846
    assert B.round_half_up(177.30) == 177
    assert B.round_half_up(0.5) == 1


def test_scale_targets(package):
    t = {bt.dest_name: rows for bt, _, rows in B.compute_targets(package, 0.01)}
    assert t["tbl_pp_syn_dm_countries"] == 20     # dim full
    assert t["tbl_pp_syn_dm_plants"] == 602        # dim full
    assert t["tbl_pp_syn_dm_sales_channel"] == 11  # dim full
    assert t["tbl_pp_syn_fct_ofr"] == 182921
    assert t["tbl_pp_syn_fct_operations"] == 846
    assert t["tbl_pp_syn_fct_performance"] == 177


def test_full_scale_targets(package):
    t = {bt.dest_name: rows for bt, _, rows in B.compute_targets(package, 1.0)}
    assert t["tbl_pp_syn_fct_ofr"] == 18292096


# ---- relationships (offline integrity reproduction) --------------------------

def test_fk_integrity_reproduced(package):
    built, rel_meta = B.generate_all(package, 42, 0.01, B.get_logger("t"))
    # ofr.country_id should be ~100%, ofr.plant_id ~92.2%
    ofr_meta = {m["fk_column"]: m for m in rel_meta["mtr_vw_ltm_sc_fct_ofr"]}
    assert ofr_meta["country_id"]["integrity_pct"] >= 99.0
    assert 88 <= ofr_meta["plant_id"]["integrity_pct"] <= 96


def test_country_channel_not_joined(package):
    _, rel_meta = B.generate_all(package, 42, 0.01, B.get_logger("t"))
    # country_channel has 0% resolution -> must NOT appear as a reproduced join
    ofr_fks = {m["fk_column"] for m in rel_meta["mtr_vw_ltm_sc_fct_ofr"]}
    assert "country_channel" not in ofr_fks


def test_dimensions_before_facts(package):
    targets = B.compute_targets(package, 0.01)
    roles = [bt.role for bt, _, _ in targets]
    assert roles == ["dimension", "dimension", "dimension", "fact", "fact", "fact"]


def test_fk_columns_carry_null_rate(package):
    """operations.plant_id has a ~16% null rate that FK generation must preserve."""
    built, _ = B.generate_all(package, 42, 0.01, B.get_logger("t"))
    b = built["tbl_pp_syn_fct_operations"]
    idx = b["names"].index("plant_id")
    nulls = sum(1 for row in b["rows"] if row[idx] is None)
    rate = nulls / len(b["rows"])
    assert 0.10 < rate < 0.22   # contract full-scale null rate is 0.1644


def test_numeric_cardinality_bounded(package):
    """month_order (distinctApprox=24) must not explode to hundreds of distinct."""
    built, _ = B.generate_all(package, 42, 0.01, B.get_logger("t"))
    b = built["tbl_pp_syn_fct_ofr"]
    idx = b["names"].index("month_order")
    distinct = len({row[idx] for row in b["rows"] if row[idx] is not None})
    assert distinct <= 24 * 3   # within the cardinality band


def test_timestamp_cardinality_bounded(package):
    """month_year (distinctApprox=24) is month-grain, not per-row unique."""
    built, _ = B.generate_all(package, 42, 0.01, B.get_logger("t"))
    b = built["tbl_pp_syn_fct_ofr"]
    idx = b["names"].index("month_year")
    distinct = len({row[idx] for row in b["rows"] if row[idx] is not None})
    assert distinct <= 24 * 3
