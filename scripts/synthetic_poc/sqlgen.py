"""DDL and INSERT text generation. All values are synthetic (see generators)."""

from __future__ import annotations

from datetime import datetime

from .models import TableContract


def build_create_ddl(fqn: str, tc: TableContract) -> str:
    lines = []
    for c in tc.physical_columns:
        lines.append(f"  `{c.name}` {c.type}")
    cols = ",\n".join(lines)
    return (
        f"CREATE TABLE {fqn} (\n{cols}\n) USING DELTA\n"
        f"COMMENT 'SYNTHETIC POC clone of {tc.short_name} "
        f"(genie-01f130be); 1% fact scale; no real data'"
    )


def _lit(v, typ: str) -> str:
    if v is None:
        return "NULL"
    if typ == "timestamp":
        return f"TIMESTAMP'{v}'"
    if typ in ("int", "bigint"):
        return str(int(v))
    if typ == "double":
        return repr(float(v))
    s = str(v).replace("\\", "\\\\").replace("'", "''")
    return f"'{s}'"


def build_insert_batches(fqn: str, names: list[str], types: list[str],
                         rows: list[tuple], batch_size: int = 2000):
    collist = ", ".join(f"`{n}`" for n in names)
    for start in range(0, len(rows), batch_size):
        chunk = rows[start:start + batch_size]
        values = []
        for row in chunk:
            cells = ", ".join(_lit(v, types[i]) for i, v in enumerate(row))
            values.append(f"({cells})")
        yield f"INSERT INTO {fqn} ({collist}) VALUES\n" + ",\n".join(values)
