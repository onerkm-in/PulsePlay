"""Deterministic synthetic supply-chain dataset for the Decision Assist demo.

Reproduces, in code, the star schema the detection engine runs on
(`main.supply_chain.*`) so the demo data is version-controlled and regenerable
instead of only existing in the Databricks workspace. The generator is seeded and
pure (no network, no clock) — same seed → identical rows. `ddl` + `load` stand the
data up in a Databricks schema; `prove_synth.py` proves the engine fires on it.

This targets a DEV stand-in schema (default `main.supply_chain_synth`); it never
writes the canonical org serving schema (that lane stays owner-gated).
"""
