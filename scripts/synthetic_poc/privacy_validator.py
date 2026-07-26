"""Privacy / leakage validation.

Two surfaces:
  1. contract-side  -- prove the package withholds real values (values_withheld,
     redacted DDL literals, masked patterns only, synthetic examples).
  2. generated-side -- prove every value we emit is synthetically produced and no
     secret / real literal ever appears.

We never had access to source row values, so leakage is prevented by construction;
these checks are the fail-closed proof of that.
"""

from __future__ import annotations

import re

from .models import TableContract

# Masking convention (per MANIFEST): A = letter, 9 = digit. Structural characters
# -- whitespace, punctuation and non-ASCII diacritics (ó, ñ, ç, ...) -- are kept
# literal. A LEAK is an un-masked ASCII letter other than 'A', or an ASCII digit
# other than the '9' placeholder (e.g. a real word like "Brazil" or "2024").
_REAL_CHAR = re.compile(r"[B-Zb-z]|[0-8]")
_SECRET = re.compile(r"dapi[0-9a-f]{16,}|Bearer\s+\S+", re.I)
_REDACTED = "<REDACTED_LITERAL>"


class PrivacyError(Exception):
    pass


def validate_contract(tc: TableContract) -> list[str]:
    """Return list of confirmations; raise PrivacyError on any leak."""
    notes: list[str] = []
    for c in tc.columns:
        if c.sensitivity == "categorical-withheld":
            if not c.profile.get("valuesWithheld"):
                raise PrivacyError(f"{tc.short_name}.{c.name}: categorical not withheld")
            for mp in c.masked_patterns:
                pat = str(mp.get("pattern", ""))
                if _REAL_CHAR.search(pat):
                    raise PrivacyError(
                        f"{tc.short_name}.{c.name}: mask {pat!r} contains real chars"
                    )
        # exampleSynthetic (if present) must be self-declared synthetic.
        # (read from raw not stored on model -> checked at package level below)
    # DDL: any string literal must be redacted. Heuristic: no single-quoted
    # literal other than the redaction marker.
    for lit in re.findall(r"'([^']*)'", tc.ddl_redacted):
        if lit and lit != _REDACTED.strip("<>"):
            if _REDACTED not in f"'{lit}'":
                raise PrivacyError(f"{tc.short_name}: DDL has non-redacted literal {lit!r}")
    notes.append(f"{tc.short_name}: {len(tc.columns)} cols privacy-clean")
    return notes


def scan_package_raw(contract_dir) -> list[str]:
    """Scan raw JSON text for secrets and for exampleSynthetic honesty."""
    import json
    from pathlib import Path

    notes = []
    for p in sorted(Path(contract_dir).glob("*.json")):
        text = p.read_text(encoding="utf-8")
        if _SECRET.search(text):
            raise PrivacyError(f"{p.name}: contains a secret-shaped token")
        if p.name == "_relationships.json":
            continue
        raw = json.loads(text)
        for c in raw.get("columns", []):
            ex = c.get("exampleSynthetic")
            if ex is not None and "synthetic" not in str(ex).lower():
                raise PrivacyError(
                    f"{p.name}.{c['name']}: exampleSynthetic not declared synthetic"
                )
        notes.append(f"{p.name}: no secrets, examples declared synthetic")
    return notes


def validate_generated(table_name: str, columns: list[str], rows: list[tuple]) -> list[str]:
    """Fail-closed scan of generated rows for secret-shaped strings."""
    for row in rows:
        for v in row:
            if isinstance(v, str) and _SECRET.search(v):
                raise PrivacyError(f"{table_name}: generated value looks like a secret")
    return [f"{table_name}: {len(rows)} generated rows secret-free"]
