"""Load and structurally validate the contract package.

Fail-closed: any missing file, invalid JSON, unsupported physical type, or
duplicate column raises ContractError. Nothing is reconstructed or assumed.
"""

from __future__ import annotations

import json
import hashlib
from pathlib import Path

from .models import (
    ColumnContract,
    Relationship,
    SUPPORTED_TYPES,
    TableContract,
    BuildTarget,
)

CONTRACT_DIRNAME = "genie-01f130be"

# Source contract short-name -> synthetic POC destination object.
BUILD_TARGETS: list[BuildTarget] = [
    BuildTarget("vw_ltm_sc_dm_countries", "tbl_pp_syn_dm_countries", "dimension", 1),
    BuildTarget("vw_ltm_sc_dm_plants", "tbl_pp_syn_dm_plants", "dimension", 2),
    BuildTarget("vw_ltm_sc_dm_sales_channel", "tbl_pp_syn_dm_sales_channel", "dimension", 3),
    BuildTarget("mtr_vw_ltm_sc_fct_ofr", "tbl_pp_syn_fct_ofr", "fact", 4),
    BuildTarget("mtr_vw_ltm_sc_fct_operations", "tbl_pp_syn_fct_operations", "fact", 5),
    BuildTarget("mtr_vw_ltm_sc_fct_performance", "tbl_pp_syn_fct_performance", "fact", 6),
]

# Metric-view destinations (semantic layer). BLOCKED: measure formulas redacted.
METRIC_VIEW_TARGETS = {
    "mtr_vw_ltm_sc_fct_ofr": "mtr_pp_syn_ltm_sc_fct_ofr",
    "mtr_vw_ltm_sc_fct_operations": "mtr_pp_syn_ltm_sc_fct_operations",
    "mtr_vw_ltm_sc_fct_performance": "mtr_pp_syn_ltm_sc_fct_performance",
}

REQUIRED_FILES = ["MANIFEST.md", "GENERATION_PLAN.md", "_relationships.json"]


class ContractError(Exception):
    pass


def find_contract_dir(repo_root: Path) -> Path:
    d = repo_root / "data-contracts" / CONTRACT_DIRNAME
    if not d.is_dir():
        raise ContractError(f"MISSING contract package: {d}")
    return d


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_column(raw: dict) -> ColumnContract:
    return ColumnContract(
        name=raw["name"],
        type=raw["type"],
        sensitivity=raw.get("sensitivity"),
        profile=raw.get("profile", {}) or {},
        synthetic_rule=raw.get("syntheticRule"),
        concept_hint=raw.get("conceptHint"),
        comment=raw.get("comment"),
    )


def _load_table(path: Path) -> TableContract:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ContractError(f"invalid JSON in {path.name}: {e}") from e

    cols = [_load_column(c) for c in raw["columns"]]
    names = [c.name for c in cols]
    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        raise ContractError(f"{path.name}: duplicate columns {sorted(dupes)}")

    for c in cols:
        if c.is_measure:
            continue
        if c.type not in SUPPORTED_TYPES:
            raise ContractError(
                f"{path.name}: unsupported physical type {c.type!r} on {c.name}"
            )

    return TableContract(
        fqn=raw["table"],
        source_object_type=raw.get("sourceObjectType", ""),
        row_count=int(raw.get("rowCount", 0)),
        columns=cols,
        invariants=list(raw.get("invariants", []) or []),
        ddl_redacted=raw.get("ddlRedacted", "") or "",
    )


def load_relationships(contract_dir: Path) -> list[Relationship]:
    raw = json.loads((contract_dir / "_relationships.json").read_text(encoding="utf-8"))
    rels: list[Relationship] = []
    for r in raw:
        ref_table, ref_col = Relationship.parse_reference(r["references"])
        rels.append(
            Relationship(
                fk_table=r["fkTable"].split(".")[-1],
                fk_column=r["fkColumn"],
                ref_table=ref_table.split(".")[-1],
                ref_column=ref_col,
                distinct_child_keys=int(r.get("distinctChildKeys", 0)),
                orphan_keys=int(r.get("orphanKeys", 0)),
                integrity_pct=float(r.get("integrityPct", 0.0)),
                cardinality=r.get("cardinality", "N:1"),
            )
        )
    return rels


def load_package(repo_root: Path) -> dict:
    """Return {contracts: {short_name: TableContract}, relationships, hashes}."""
    d = find_contract_dir(repo_root)

    for f in REQUIRED_FILES:
        if not (d / f).is_file():
            raise ContractError(f"MISSING required file: {f}")

    contracts: dict[str, TableContract] = {}
    hashes: dict[str, str] = {}
    json_files = sorted(p for p in d.glob("*.json") if p.name != "_relationships.json")
    if len(json_files) != 6:
        raise ContractError(f"expected 6 object contracts, found {len(json_files)}")

    for p in json_files:
        tc = _load_table(p)
        contracts[tc.short_name] = tc
        hashes[p.name] = _sha256(p)

    for f in REQUIRED_FILES:
        hashes[f] = _sha256(d / f)

    known = {t.contract_short_name for t in BUILD_TARGETS}
    missing = known - set(contracts)
    if missing:
        raise ContractError(f"contract package missing expected objects: {sorted(missing)}")

    rels = load_relationships(d)
    package_hash = hashlib.sha256(
        "".join(hashes[k] for k in sorted(hashes)).encode()
    ).hexdigest()

    return {
        "dir": d,
        "contracts": contracts,
        "relationships": rels,
        "file_hashes": hashes,
        "package_hash": package_hash,
    }
