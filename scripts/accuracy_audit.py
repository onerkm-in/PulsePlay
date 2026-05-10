#!/usr/bin/env python3
"""
Accuracy audit: run SQL ground truth via Databricks SQL API, then ask Genie
the same questions, compare answers.

Ground truth queries hit the raw UC tables directly.
Genie answers come through the proxy (natural language → SQL).
"""
import json, time, urllib.request, urllib.error, re, sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

DATABRICKS_HOST = "https://dbc-f88d29ce-4aa2.cloud.databricks.com"
WAREHOUSE_ID    = "6510da50329f1e85"
PROXY           = "http://127.0.0.1:8787"

# ── load token from proxy config ─────────────────────────────────
with open("proxy/config.json") as f:
    cfg = json.load(f)
TOKEN = cfg["profiles"]["sales"]["token"]

# ── Databricks SQL helper ─────────────────────────────────────────
def sql_exec(statement, max_wait=120):
    """Run a SQL statement synchronously, return rows as list of dicts."""
    url = f"{DATABRICKS_HOST}/api/2.0/sql/statements"
    payload = {
        "statement": statement,
        "warehouse_id": WAREHOUSE_ID,
        "wait_timeout": "30s",
        "on_wait_timeout": "CONTINUE",
        "format": "JSON_ARRAY"
    }
    req = urllib.request.Request(url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {TOKEN}"},
        method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        resp = json.loads(r.read())

    stmt_id = resp["statement_id"]
    t0 = time.time()
    while resp.get("status", {}).get("state") not in ("SUCCEEDED", "FAILED", "CANCELED"):
        if time.time() - t0 > max_wait:
            return None, "TIMEOUT"
        time.sleep(3)
        get_req = urllib.request.Request(
            f"{DATABRICKS_HOST}/api/2.0/sql/statements/{stmt_id}",
            headers={"Authorization": f"Bearer {TOKEN}"},
            method="GET")
        with urllib.request.urlopen(get_req, timeout=20) as r:
            resp = json.loads(r.read())

    state = resp.get("status", {}).get("state")
    if state != "SUCCEEDED":
        return None, f"FAILED: {resp.get('status',{}).get('error',{}).get('message','')}"

    cols = [c["name"] for c in resp.get("manifest", {}).get("schema", {}).get("columns", [])]
    rows = resp.get("result", {}).get("data_array", []) or []
    return [dict(zip(cols, row)) for row in rows], "OK"

# ── Genie helper ──────────────────────────────────────────────────
def genie_ask(profile, question, max_wait=160):
    def post(path, payload):
        req = urllib.request.Request(PROXY + path,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())
    def get(path):
        with urllib.request.urlopen(PROXY + path, timeout=30) as r: return json.loads(r.read())

    t0 = time.time()
    s = post("/assistant/conversations/start",
             {"assistantProfile": profile, "content": question, "contextText": ""})
    conv = s.get("conversation_id"); msg = s.get("message_id")
    if not conv: return "ERROR", "(no conversationId)", round(time.time()-t0,1)

    status = "SUBMITTED"; poll = {}
    while time.time() - t0 < max_wait:
        time.sleep(4)
        try: poll = get(f"/assistant/conversations/{conv}/messages/{msg}?assistantProfile={profile}")
        except: continue
        status = poll.get("status","")
        if status in ("COMPLETED","FAILED","CANCELLED"): break

    elapsed = round(time.time()-t0, 1)
    answer = ""
    for att in poll.get("attachments",[]):
        t = att.get("text")
        if isinstance(t, str) and t.strip(): answer = t; break
        if isinstance(t, dict) and t.get("content"): answer = str(t["content"]); break
    if not answer: answer = str(poll.get("content","(no answer)"))
    return status, answer, elapsed

# ── Extract a number from a Genie answer string ───────────────────
def extract_number(text, expected=None):
    """Extract the numeric answer, preserving signs and ignoring nearby years."""
    text = text.replace(",", "")
    matches = re.finditer(r"(?<![\w-])\$?(-?\d+(?:\.\d+)?)\s*(B|M|K)?%?", text, re.IGNORECASE)
    values = []
    for m in matches:
        val = float(m.group(1))
        suffix = (m.group(2) or "").upper()
        if suffix == "B": val *= 1_000_000_000
        elif suffix == "M": val *= 1_000_000
        elif suffix == "K": val *= 1_000
        values.append(val)
    if not values:
        return None
    if expected is None:
        return values[0]
    return min(values, key=lambda v: abs(v - expected))

def pct_error(truth, genie_val):
    if truth is None or genie_val is None or truth == 0: return None
    return round(abs(truth - genie_val) / abs(truth) * 100, 2)

def accuracy_grade(err_pct):
    if err_pct is None: return "N/A"
    if err_pct < 1:   return "EXACT"
    if err_pct < 5:   return "NEAR"
    if err_pct < 15:  return "CLOSE"
    return "DRIFT"

# ══════════════════════════════════════════════════════════════════
# GROUND TRUTH QUERIES + MATCHING GENIE QUESTIONS
# ══════════════════════════════════════════════════════════════════
CHECKS = [
    # ── L1: Total orders ─────────────────────────────────────────
    {
        "id": "L1", "label": "Total distinct orders",
        "profile": "sales",
        "sql": "SELECT COUNT(DISTINCT `Order ID`) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat",
        "sql_key": "val",
        "genie_q": "How many total orders are in the dataset? Do not ask clarifying questions.",
    },
    # ── L2: Total sales ──────────────────────────────────────────
    {
        "id": "L2", "label": "Total sales revenue",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Sales),2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat",
        "sql_key": "val",
        "genie_q": "What is the total sales revenue? Do not ask clarifying questions.",
    },
    # ── L3: Total profit ─────────────────────────────────────────
    {
        "id": "L3", "label": "Total profit",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Profit),2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat",
        "sql_key": "val",
        "genie_q": "What is the total profit across all orders? Do not ask clarifying questions.",
    },
    # ── L4: Unique customers ─────────────────────────────────────
    {
        "id": "L4", "label": "Unique customers",
        "profile": "sales",
        "sql": "SELECT COUNT(DISTINCT `Customer Name`) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat",
        "sql_key": "val",
        "genie_q": "How many unique customers are there in the dataset? Do not ask clarifying questions.",
    },
    # ── M1: West region total sales ──────────────────────────────
    {
        "id": "M1", "label": "West region total sales",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Sales),2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE Region='West'",
        "sql_key": "val",
        "genie_q": "What is the total sales revenue for the West region only? Do not ask clarifying questions.",
    },
    # ── M2: Technology category total profit ─────────────────────
    {
        "id": "M2", "label": "Technology total profit",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Profit),2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE Category='Technology'",
        "sql_key": "val",
        "genie_q": "What is the total profit for the Technology category? Do not ask clarifying questions.",
    },
    # ── M3: Tables sub-category profit margin ────────────────────
    {
        "id": "M3", "label": "Tables profit margin %",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Profit)/SUM(Sales)*100,2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE `Sub-Category`='Tables'",
        "sql_key": "val",
        "genie_q": "What is the profit margin percentage for the Tables sub-category (profit divided by sales)? Do not ask clarifying questions.",
    },
    # ── M4: Consumer segment return count ────────────────────────
    {
        "id": "M4", "label": "Consumer segment returned order count",
        "profile": "sales",
        "sql": "SELECT COUNT(DISTINCT `Order ID`) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE Segment='Consumer' AND Returned='Yes'",
        "sql_key": "val",
        "genie_q": "How many distinct orders were returned by Consumer segment customers? Do not ask clarifying questions.",
    },
    # ── H1: West 2017 profit ─────────────────────────────────────
    {
        "id": "H1", "label": "West region 2017 profit",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Profit),2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE Region='West' AND YEAR(`Order Date`)=2017",
        "sql_key": "val",
        "genie_q": "What is the total profit for the West region in 2017? Do not ask clarifying questions.",
    },
    # ── H2: Central region profit margin 2017 ───────────────────
    {
        "id": "H2", "label": "Central 2017 profit margin",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Profit)/SUM(Sales)*100,2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE Region='Central' AND YEAR(`Order Date`)=2017",
        "sql_key": "val",
        "genie_q": "What is the profit margin percentage for the Central region in 2017 (profit divided by sales)? Do not ask clarifying questions.",
    },
    # ── H3: Corporate segment 2017 Technology revenue ───────────
    {
        "id": "H3", "label": "Corporate Technology 2017 revenue",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Sales),2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE Segment='Corporate' AND Category='Technology' AND YEAR(`Order Date`)=2017",
        "sql_key": "val",
        "genie_q": "What is the total revenue (sales) for Corporate customers in the Technology category in 2017? Do not ask clarifying questions.",
    },
    # ── H4: HSE West 2017 actual sales ──────────────────────────
    {
        "id": "H4", "label": "HSE West 2017 actual sales",
        "profile": "hse",
        "sql": "SELECT ROUND(SUM(actual_sales),2) AS val FROM workspace.databrickspractice.vw_genie_targets_fulfillment_hse WHERE region='West' AND YEAR(metric_date)=2017",
        "sql_key": "val",
        "genie_q": "What is the total actual sales for the West region in 2017? Do not ask clarifying questions.",
    },
    # ── H5: Furniture orders containing Technology items ─────────
    {
        "id": "H5", "label": "Orders with both Furniture AND Technology",
        "profile": "sales",
        "sql": """
SELECT COUNT(DISTINCT a.`Order ID`) AS val
FROM workspace.databrickspractice.vw_superstore_analysis_flat a
JOIN workspace.databrickspractice.vw_superstore_analysis_flat b
  ON a.`Order ID` = b.`Order ID`
WHERE a.Category = 'Furniture' AND b.Category = 'Technology'
""",
        "sql_key": "val",
        "genie_q": "How many unique orders contain at least one Furniture item AND at least one Technology item? Count at the order level. Do not ask clarifying questions.",
    },
    # ── UH1: Machines 2015 profit margin ─────────────────────────
    {
        "id": "UH1", "label": "Machines 2015 profit margin",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Profit)/SUM(Sales)*100,2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE `Sub-Category`='Machines' AND YEAR(`Order Date`)=2015",
        "sql_key": "val",
        "genie_q": "What is the profit margin percentage for Machines sub-category in 2015 (profit divided by sales)? Do not ask clarifying questions.",
    },
    # ── UH2: Machines 2017 profit margin ─────────────────────────
    {
        "id": "UH2", "label": "Machines 2017 profit margin",
        "profile": "sales",
        "sql": "SELECT ROUND(SUM(Profit)/SUM(Sales)*100,2) AS val FROM workspace.databrickspractice.vw_superstore_analysis_flat WHERE `Sub-Category`='Machines' AND YEAR(`Order Date`)=2017",
        "sql_key": "val",
        "genie_q": "What is the profit margin percentage for Machines sub-category in 2017 (profit divided by sales)? Do not ask clarifying questions.",
    },
]

# ══════════════════════════════════════════════════════════════════
# RUN
# ══════════════════════════════════════════════════════════════════
print(f"\n{'='*70}")
print("  ACCURACY AUDIT — Ground Truth (SQL) vs Genie (NL)")
print(f"{'='*70}\n")

audit_rows = []

for chk in CHECKS:
    cid    = chk["id"]
    label  = chk["label"]
    profile = chk["profile"]
    print(f"── {cid}: {label} ──────────────────────")

    # Ground truth
    gt_rows, gt_status = sql_exec(chk["sql"])
    if gt_status != "OK" or not gt_rows:
        gt_val = None
        print(f"  SQL: FAILED ({gt_status})")
    else:
        gt_val = float(gt_rows[0].get(chk["sql_key"], 0) or 0)
        print(f"  SQL truth : {gt_val:,.2f}")

    # Genie answer
    status, answer, elapsed = genie_ask(profile, chk["genie_q"])
    print(f"  Genie ({elapsed}s): {answer[:200]}")
    genie_val = extract_number(answer, gt_val)
    err = pct_error(gt_val, genie_val)
    grade = accuracy_grade(err)
    print(f"  Extracted : {genie_val}  |  Error: {err}%  |  Grade: {grade}")
    print()

    audit_rows.append({
        "id": cid, "label": label, "profile": profile,
        "truth": gt_val, "genie_val": genie_val,
        "err_pct": err, "grade": grade, "elapsed": elapsed, "status": status
    })

# ── Summary table ────────────────────────────────────────────────
print(f"\n{'='*70}")
print("  ACCURACY SUMMARY TABLE")
print(f"{'='*70}")
print(f"  {'ID':<5} {'Label':<40} {'Truth':>12} {'Genie':>12} {'Err%':>7} {'Grade':<8} {'Time':>6}")
print("  " + "-"*88)
for r in audit_rows:
    truth_s = f"{r['truth']:,.2f}" if r['truth'] is not None else "N/A"
    genie_s = f"{r['genie_val']:,.2f}" if r['genie_val'] is not None else "N/A"
    err_s   = f"{r['err_pct']:.2f}%" if r['err_pct'] is not None else "N/A"
    print(f"  {r['id']:<5} {r['label']:<40} {truth_s:>12} {genie_s:>12} {err_s:>7} {r['grade']:<8} {str(r['elapsed'])+'s':>6}")

# Grade counts
from collections import Counter
grades = Counter(r["grade"] for r in audit_rows)
total  = len(audit_rows)
exact  = grades.get("EXACT",0)
near   = grades.get("NEAR",0)
close  = grades.get("CLOSE",0)
drift  = grades.get("DRIFT",0)
na     = grades.get("N/A",0)

print(f"\n  Accuracy buckets (n={total}):")
print(f"    EXACT  (<1% error)  : {exact:>3}  {exact/total*100:.0f}%")
print(f"    NEAR   (1–5%)       : {near:>3}  {near/total*100:.0f}%")
print(f"    CLOSE  (5–15%)      : {close:>3}  {close/total*100:.0f}%")
print(f"    DRIFT  (>15%)       : {drift:>3}  {drift/total*100:.0f}%")
print(f"    N/A  (no extraction): {na:>3}")
answered = [r for r in audit_rows if r["err_pct"] is not None]
if answered:
    avg_err = sum(r["err_pct"] for r in answered) / len(answered)
    print(f"\n  Avg absolute error (extractable): {avg_err:.2f}%")
    print(f"  EXACT+NEAR accuracy rate       : {(exact+near)/total*100:.0f}%")
