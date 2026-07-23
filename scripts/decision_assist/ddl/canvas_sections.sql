-- Prepared DDL for the Canvas persistence adapter (v3.2 §11/§13).
-- NOT executed by PulsePlay. A reviewer runs this under authorization against the
-- approved schema only, after retention/RLS/rollback review. Generated from
-- proxy/lib/canvasStoreDatabricks.js prepareDdl() (single source of truth).

-- Approved schema only. Review retention, RLS, and rollback before applying.
CREATE TABLE IF NOT EXISTS uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_canvas_sections (
  section_id STRING NOT NULL,
  owner_actor_id STRING NOT NULL,
  dedupe_key STRING NOT NULL,
  body_json STRING NOT NULL,          -- validated CanvasSection body
  layout_order INT,
  save_state STRING,
  version INT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_context_snapshots (
  snapshot_id STRING NOT NULL,
  owner_actor_id STRING NOT NULL,
  section_id STRING NOT NULL,
  body_json STRING NOT NULL,          -- immutable snapshot body
  created_at TIMESTAMP NOT NULL
) USING DELTA;
