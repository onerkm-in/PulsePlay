#!/usr/bin/env python3
"""Fire questions at the proxy and print answers + elapsed time."""
import json, sys, time, urllib.request

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
    """Extract text answer from Genie poll response."""
    # Try attachments first
    for att in poll.get("attachments", []):
        # text can be a string or {"content": "..."}
        t = att.get("text")
        if isinstance(t, str) and t.strip():
            return t[:700]
        if isinstance(t, dict):
            c = t.get("content", "")
            if c:
                return str(c)[:700]
    # Fall back to top-level content
    return str(poll.get("content", "(no answer)"))[:700]

def ask(profile, question, max_wait=180):
    t0 = time.time()
    try:
        start = post("/assistant/conversations/start", {
            "assistantProfile": profile,
            "content": question,
            "contextText": ""
        })
    except Exception as e:
        return None, "ERROR", f"START ERROR: {e}"

    conv_id = start.get("conversation_id") or start.get("conversationId")
    msg_id  = start.get("message_id")     or start.get("messageId")
    if not conv_id:
        return None, "ERROR", "No conversationId in response"

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
    return elapsed, status, answer

QUESTIONS = {
    "LOW": [
        ("sales", "How many total orders are in the dataset?"),
        ("sales", "What is the total sales revenue?"),
        ("sales", "How many unique customers are there?"),
        ("sales", "What is the total profit?"),
        ("sales", "Which region has the most orders?"),
    ],
    "MEDIUM": [
        ("sales", "What are the top 5 sub-categories by total sales, and what is the profit margin for each?"),
        ("sales", "Compare year-over-year sales growth between 2016 and 2017 by region."),
        ("sales", "Which customer segment generates the highest average order value?"),
        ("sales", "What is the average shipping time in days by ship mode?"),
        ("sales", "List the top 10 customers by total revenue and show their profit contribution as a percentage of total profit."),
    ],
    "HIGH": [
        ("sales", "Identify the top 3 product sub-categories with the steepest declining profit margin year-over-year from 2015 to 2017, and calculate the absolute margin drop for each."),
        ("sales", "Which combinations of region and customer segment are unprofitable (negative profit), and what is their combined average discount rate versus profitable combinations?"),
        ("sales", "For orders containing returned items, what was the average profit per order before the return, broken down by category and region?"),
        ("hse",   "Calculate monthly sales target attainment percentage by region for 2017 and flag any month-region combinations where attainment dropped below 90%."),
        ("hse",   "Which product categories show the highest variance in profit margin across regions, and which region is the consistent outlier driving that variance?"),
    ],
    "ULTRA": [
        ("sales", "Build a cohort analysis: for customers who made their first purchase in 2015, track their average annual spend in 2015, 2016, and 2017. Show whether repeat customers (active in 2 or more years) generate higher lifetime profit margins than one-time buyers, and quantify the margin difference."),
        ("sales", "Perform a basket analysis: find the top 5 pairs of sub-categories most frequently ordered together in the same order. For each pair show the combined average order value and compare profitability of orders containing both sub-categories versus orders with only one of the two."),
        ("hse",   "Using the sales targets data, compute a rolling 3-month average of actual vs target sales by region for 2017. Identify the region with the most consistent under-performance and estimate how much additional monthly revenue it would need to reach 100% attainment based on its observed growth trajectory."),
        ("sales", "Segment all customers into RFM tiers using quartile cuts on recency (days since last order), frequency (order count), and monetary value (total spend). Show customer count and average profit margin per combined RFM tier. Identify which high-frequency tier has the worst profit margin and hypothesise why."),
        ("hse",   "Cross-analyse HSE targets fulfilment against the full product hierarchy: for each category and sub-category compute the ratio of target attainment rate to profit margin. Identify sub-categories where attainment exceeds 110% but profit margin is below 10% — these are potential volume-at-cost risk areas. Rank them by risk severity."),
    ],
}

if __name__ == "__main__":
    tiers = [a.upper() for a in sys.argv[1:]] if len(sys.argv) > 1 else ["LOW"]
    all_results = []

    for tier in tiers:
        questions = QUESTIONS.get(tier, [])
        print(f"\n{'='*64}")
        print(f"  TIER: {tier} COMPLEXITY  ({len(questions)} questions)")
        print(f"{'='*64}\n")

        for i, (profile, q) in enumerate(questions, 1):
            print(f"-- Q{i} [space={profile}] --")
            print(f"   {q}")
            elapsed, status, answer = ask(profile, q)
            marker = "OK" if status == "COMPLETED" else "!!"
            print(f"   [{marker}] {status}  {elapsed}s")
            print(f"   >> {answer}")
            print()
            all_results.append((tier, i, profile, elapsed, status, len(answer)))

    # Summary table
    print(f"\n{'='*64}")
    print("  SUMMARY")
    print(f"{'='*64}")
    print(f"{'Tier':<8} {'Q':<3} {'Space':<8} {'Time':>6} {'Status':<12} {'Ans len':>8}")
    print("-"*52)
    for tier, i, profile, elapsed, status, alen in all_results:
        ok = "COMPLETED" in status
        print(f"{tier:<8} {i:<3} {profile:<8} {str(elapsed)+'s':>6} {status:<12} {alen:>8}")
    total_ok = sum(1 for r in all_results if r[4] == "COMPLETED")
    print(f"\n  {total_ok}/{len(all_results)} COMPLETED")
