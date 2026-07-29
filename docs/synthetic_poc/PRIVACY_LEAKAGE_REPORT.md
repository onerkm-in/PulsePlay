# PRIVACY_LEAKAGE_REPORT — synthetic LATAM supply-chain POC

**Result: no leakage.** The generator never had access to source row values; privacy is
guaranteed by construction and confirmed by the checks below.

## Data-flow guarantee
- Input was the **contract package only** (`data-contracts/genie-01f130be/`), which withholds
  all real values: categoricals are masked character-class patterns (`A`=letter, `9`=digit)
  with length/cardinality stats; numerics/dates are aggregate profiles; measures are all-data
  grand totals; DDL string literals are `<REDACTED_LITERAL>`.
- The source workspace (`adb-7901759384367063`) was **never queried for rows** — it is not even
  reachable with the current credentials (source Genie space → HTTP 404).
- Every generated value is produced by instantiating a masked pattern with random letters/digits
  or by uniform sampling within a captured numeric/date range. No source sample is ever copied.

## Contract-side checks (`privacy_validator.validate_contract` + `scan_package_raw`)
- ✅ every `categorical-withheld` column has `valuesWithheld: true`
- ✅ every masked pattern contains only `A`, `9`, structural punctuation/space, or non-ASCII
     diacritics — **no un-masked ASCII word or literal digit run** (would reject e.g. "Brazil", "2024")
- ✅ no DDL literal other than `<REDACTED_LITERAL>`
- ✅ no secret-shaped token (`dapi…`, `Bearer …`) anywhere in the package
- ✅ every `exampleSynthetic` is self-declared synthetic

## Generated-side checks (`privacy_validator.validate_generated` + live scan)
- ✅ 0 generated values match a secret shape (checked pre-persist for all 184,477 rows)
- ✅ live scan of text columns for `dapi[0-9a-f]{16}` → **0 rows**
- ✅ every table carries a `COMMENT` declaring it synthetic, 1% fact scale, no real data

## Secret handling
- Credentials came from environment variables (`DATABRICKS_HOST`/`DATABRICKS_TOKEN`) / `~/.databrickscfg`;
  never hardcoded in source. The structured logger redacts token/secret patterns from all output.
- The resolved warehouse **id** is kept in runtime memory only; not written to source files.
