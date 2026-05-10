#!/usr/bin/env python3
"""
Iterative stress-test: composite, fusion, multi-angle, and adversarial questions.
Runs 3 rounds. Each round learns from prior failures.
"""
import json, sys, time, urllib.request, threading, queue

BASE = "http://127.0.0.1:8787"

def post(path, payload):
    req = urllib.request.Request(BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read())

def extract_answer(poll):
    for att in poll.get("attachments", []):
        t = att.get("text")
        if isinstance(t, str) and t.strip():
            return t[:800]
        if isinstance(t, dict):
            c = t.get("content", "")
            if c: return str(c)[:800]
    return str(poll.get("content", "(no answer)"))[:800]

def is_clarifying(answer):
    """Detect if Genie returned a clarifying question instead of an answer."""
    lower = answer.lower()
    return (lower.startswith("would you") or lower.startswith("could you") or
            lower.startswith("do you want") or lower.startswith("are you") or
            lower.endswith("?") and len(answer) < 200)

def ask(profile, question, max_wait=200):
    t0 = time.time()
    try:
        start = post("/assistant/conversations/start", {
            "assistantProfile": profile,
            "content": question,
            "contextText": ""
        })
    except Exception as e:
        return None, "ERROR", f"START ERROR: {e}"

    conv_id = start.get("conversation_id")
    msg_id  = start.get("message_id")
    if not conv_id:
        return None, "ERROR", "No conversationId"

    status = "SUBMITTED"
    poll = {}
    while time.time() - t0 < max_wait:
        time.sleep(4)
        try:
            poll = get(f"/assistant/conversations/{conv_id}/messages/{msg_id}?assistantProfile={profile}")
        except Exception:
            continue
        status = poll.get("status", "")
        if status in ("COMPLETED", "FAILED", "CANCELLED"):
            break

    elapsed = round(time.time() - t0, 1)
    answer = extract_answer(poll)
    clarifying = is_clarifying(answer)
    return elapsed, status, answer, clarifying

def ask_threaded(questions_list, results_out, label):
    """Run questions in parallel threads, collect results."""
    result_queue = queue.Queue()

    def worker(idx, profile, q):
        elapsed, status, answer, clarifying = ask(profile, q)
        result_queue.put((idx, profile, q, elapsed, status, answer, clarifying))

    threads = []
    for i, (profile, q) in enumerate(questions_list):
        t = threading.Thread(target=worker, args=(i, profile, q))
        threads.append(t)
        t.start()
        time.sleep(0.5)  # stagger slightly to avoid rate-limit burst

    for t in threads:
        t.join(timeout=220)

    results = []
    while not result_queue.empty():
        results.append(result_queue.get())
    results.sort(key=lambda x: x[0])

    print(f"\n{'='*64}")
    print(f"  {label}")
    print(f"{'='*64}\n")
    for idx, profile, q, elapsed, status, answer, clarifying in results:
        flag = "[CLARIFY]" if clarifying else ("[ERROR]" if status != "COMPLETED" else "[OK]")
        print(f"-- Q{idx+1} [{profile}] {flag} {elapsed}s --")
        print(f"   Q: {q[:120]}")
        print(f"   A: {answer[:400]}")
        print()
        results_out.append({
            "label": label, "q": idx+1, "profile": profile,
            "elapsed": elapsed, "status": status,
            "clarifying": clarifying, "answer_len": len(answer),
            "answer_snippet": answer[:200]
        })

# ============================================================
# ROUND 1 — COMPOSITE questions (multiple sub-questions fused)
# ============================================================
ROUND1 = [
    # Fusion: returns + profitability + segment in one shot
    ("sales",
     "For returned orders only: (1) what is the total revenue lost, "
     "(2) which customer segment has the most returns by count, and "
     "(3) which product category has the highest return rate by order count?"),

    # Composite: trend + outlier + recommendation
    ("sales",
     "Show me total sales and total profit by year (2015, 2016, 2017). "
     "For the year with the lowest profit margin, identify the top 2 sub-categories "
     "responsible and state what discount level they averaged that year."),

    # Multi-space fusion (sales + HSE targets)
    ("hse",
     "Compare 2017 actual sales by region against the monthly targets. "
     "For each region state: total actual sales, total target, attainment percentage, "
     "and whether the region beat or missed its annual target overall."),

    # Adversarial — schema boundary (ship mode not in sales space)
    ("sales",
     "List all distinct shipping modes available and the average number of days "
     "between order date and ship date for each mode."),

    # Complex aggregation + ranking
    ("sales",
     "Rank all 17 product sub-categories by profit margin (highest to lowest). "
     "Show sub-category name, total sales, total profit, and profit margin percentage. "
     "Flag any sub-category with negative margin."),
]

# ============================================================
# ROUND 2 — MULTI-THREADED (fired simultaneously, stress rate limit)
# ============================================================
ROUND2 = [
    ("sales",
     "What is the total number of distinct products (by product_name) sold in each category?"),
    ("sales",
     "Which state has the highest total sales revenue? List the top 5 states."),
    ("hse",
     "What is the total number of rows in the HSE targets table and what date range does it cover?"),
    ("sales",
     "For the Technology category, list each sub-category with its total quantity sold and average unit price."),
    ("hse",
     "Which region consistently achieved above 100% target attainment in every month of 2016?"),
]

# ============================================================
# ROUND 3 — ULTRA FUSION: adversarial + cross-space + self-correcting
# ============================================================
ROUND3 = [
    # Self-correcting: force Genie to pick a metric and explain
    ("sales",
     "Identify the single most important leading indicator of customer churn risk "
     "in this dataset. Define it using available columns, compute it for all customers, "
     "and rank the top 10 highest-risk customers with their values."),

    # Cross-join complexity: discount bands
    ("sales",
     "Bin all orders into discount bands: 0%, 1-10%, 11-20%, 21-30%, above 30%. "
     "For each band show: order count, total revenue, total profit, and profit margin. "
     "Identify which discount band is destroying the most absolute profit dollars."),

    # Time-series + seasonality
    ("sales",
     "Calculate total sales for each month of the year (Jan-Dec) aggregated across all years. "
     "Identify the 3 highest and 3 lowest revenue months. "
     "Also show whether Q4 consistently outperforms Q1 in both sales and profit."),

    # HSE: variance + attribution
    ("hse",
     "For 2017, compute the coefficient of variation (std dev / mean) of monthly attainment "
     "for each region. The region with the highest CV is the most volatile. "
     "For that region, list each month's attainment and the months that were more than "
     "1 standard deviation below the mean."),

    # Fusion: returns impact on segment profitability
    ("sales",
     "For each customer segment (Consumer, Corporate, Home Office): "
     "(a) total orders placed, (b) total returned orders, (c) return rate percentage, "
     "(d) average profit on non-returned orders, (e) estimated profit lost to returns. "
     "Which segment has the worst return-adjusted profit?"),
]

if __name__ == "__main__":
    all_results = []

    # Round 1 — sequential composite
    print("\n" + "#"*64)
    print("  ITERATION 1 — COMPOSITE / FUSION QUESTIONS (sequential)")
    print("#"*64)
    questions1 = ROUND1
    for i, (profile, q) in enumerate(questions1):
        elapsed, status, answer, clarifying = ask(profile, q)
        flag = "[CLARIFY]" if clarifying else ("[ERROR]" if status != "COMPLETED" else "[OK]")
        print(f"\n-- Q{i+1} [{profile}] {flag} {elapsed}s --")
        print(f"   Q: {q[:130]}")
        print(f"   A: {answer[:500]}")
        all_results.append({
            "round": 1, "q": i+1, "profile": profile,
            "elapsed": elapsed, "status": status,
            "clarifying": clarifying, "answer_len": len(answer)
        })

    # Round 2 — parallel / multi-threaded
    print("\n" + "#"*64)
    print("  ITERATION 2 — MULTI-THREADED (5 simultaneous questions)")
    print("#"*64)
    ask_threaded(ROUND2, all_results, "ITERATION 2 — MULTI-THREADED")

    # Round 3 — ultra fusion adversarial
    print("\n" + "#"*64)
    print("  ITERATION 3 — ULTRA FUSION / ADVERSARIAL")
    print("#"*64)
    for i, (profile, q) in enumerate(ROUND3):
        elapsed, status, answer, clarifying = ask(profile, q)
        flag = "[CLARIFY]" if clarifying else ("[ERROR]" if status != "COMPLETED" else "[OK]")
        print(f"\n-- Q{i+1} [{profile}] {flag} {elapsed}s --")
        print(f"   Q: {q[:130]}")
        print(f"   A: {answer[:500]}")
        all_results.append({
            "round": 3, "q": i+1, "profile": profile,
            "elapsed": elapsed, "status": status,
            "clarifying": clarifying, "answer_len": len(answer)
        })

    # Final summary
    print(f"\n{'='*64}")
    print("  STRESS TEST SUMMARY")
    print(f"{'='*64}")
    completed = [r for r in all_results if r["status"] == "COMPLETED"]
    clarifying = [r for r in all_results if r.get("clarifying")]
    errors = [r for r in all_results if r["status"] != "COMPLETED"]
    slow = [r for r in all_results if r.get("elapsed") and r["elapsed"] > 60]
    print(f"  Total questions : {len(all_results)}")
    print(f"  COMPLETED       : {len(completed)}")
    print(f"  Clarifying (!)  : {len(clarifying)}")
    print(f"  Errors/Failed   : {len(errors)}")
    print(f"  Slow (>60s)     : {len(slow)}")
    if slow:
        for r in slow:
            print(f"    Round {r.get('round','?')} Q{r['q']} [{r['profile']}] {r['elapsed']}s")
    if clarifying:
        print("\n  Questions that returned a clarifying question instead of data:")
        for r in clarifying:
            print(f"    Round {r.get('round','?')} Q{r['q']} [{r['profile']}]")
