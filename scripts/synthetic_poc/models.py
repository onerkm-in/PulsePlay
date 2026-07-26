"""Typed models for contracts, columns, relationships and the build plan."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

# Databricks physical types we support in generated Delta tables.
# Metric-view measure pseudo-types ("double measure", "bigint measure") are
# intentionally excluded here -- measures are not reproduced.
SUPPORTED_TYPES = {"string", "int", "bigint", "double", "timestamp", "date"}
MEASURE_MARKER = "measure"


@dataclass
class ColumnContract:
    name: str
    type: str
    sensitivity: Optional[str]
    profile: dict[str, Any]
    synthetic_rule: Optional[str]
    concept_hint: Optional[str]
    comment: Optional[str]

    @property
    def is_measure(self) -> bool:
        return MEASURE_MARKER in (self.type or "")

    @property
    def null_count(self) -> int:
        return int(self.profile.get("nullCount", 0) or 0)

    @property
    def distinct_approx(self) -> Optional[int]:
        v = self.profile.get("distinctApprox")
        return int(v) if v is not None else None

    @property
    def masked_patterns(self) -> list[dict[str, Any]]:
        return self.profile.get("maskedPatterns", []) or []

    def numeric_range(self) -> Optional[tuple[float, float]]:
        if "min" in self.profile and "max" in self.profile:
            try:
                return float(self.profile["min"]), float(self.profile["max"])
            except (TypeError, ValueError):
                return None
        return None


@dataclass
class TableContract:
    fqn: str  # source fully-qualified name (contract identity)
    source_object_type: str  # VIEW | METRIC_VIEW
    row_count: int
    columns: list[ColumnContract]
    invariants: list[str] = field(default_factory=list)
    ddl_redacted: str = ""

    @property
    def short_name(self) -> str:
        return self.fqn.split(".")[-1]

    @property
    def physical_columns(self) -> list[ColumnContract]:
        return [c for c in self.columns if not c.is_measure]

    @property
    def measure_columns(self) -> list[ColumnContract]:
        return [c for c in self.columns if c.is_measure]


@dataclass
class Relationship:
    fk_table: str
    fk_column: str
    ref_table: str
    ref_column: str
    distinct_child_keys: int
    orphan_keys: int
    integrity_pct: float
    cardinality: str

    @staticmethod
    def parse_reference(ref: str) -> tuple[str, str]:
        # ref looks like cat.sch.table.column -> (cat.sch.table, column)
        parts = ref.rsplit(".", 1)
        return parts[0], parts[1]


@dataclass
class BuildTarget:
    """Maps a source contract to its synthetic POC destination object."""
    contract_short_name: str   # e.g. vw_ltm_sc_dm_countries
    dest_name: str             # e.g. tbl_pp_syn_dm_countries
    role: str                  # dimension | fact
    order: int
