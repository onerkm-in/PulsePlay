-- Prepared DDL for the event-sourced Action Request store (v3.2 §8).
-- NOT executed by PulsePlay. Generated from proxy/lib/actionRequestStoreDatabricks.js.

-- Approved schema only. Review retention, RLS, rollback, and run the
-- conditional-append concurrency POC (v3.2 §8) before trusting live.
CREATE TABLE IF NOT EXISTS uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai.tbl_pp_decision_events (
  event_id STRING NOT NULL,
  request_id STRING NOT NULL,
  prompt_id STRING,
  event_type STRING NOT NULL,
  actor_id STRING NOT NULL,
  prev_state STRING,
  new_state STRING NOT NULL,
  payload_json STRING,
  event_ts TIMESTAMP NOT NULL
) USING DELTA;
