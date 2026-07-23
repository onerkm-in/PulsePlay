"""Command-line entrypoint for the Action Insights detection engine.

  python -m action_insights.cli --selfcheck        # end-to-end health + detection dry run
  python -m action_insights.cli --dry-run          # detect + print, no writes
  python -m action_insights.cli --persist          # detect + upsert prompts + audit
  python -m action_insights.cli --persona "Supply Chain Planner" --limit 5
  python -m action_insights.cli --rule-id SCM-OTIF-001 --month 202512
"""
from __future__ import annotations

import argparse
import sys

from .config import SETTINGS
from . import detect as detect_mod
from . import prompt_store, audit, sql_client
from .rules import load_rules


def _print_prompt(p, verbose: bool) -> None:
    tag = f"[{p.severity.upper():8s} | conf={p.confidence:6s}]"
    print(f"  {tag} {p.rule_id}  {p.headline}")
    print(f"           persona={p.persona}  action={p.recommended_action} (L{p.action_level}, "
          f"approval={p.approval_required})  impact={p.business_impact_label}: "
          f"{p.business_impact_value:,.0f} {p.business_impact_unit}")
    if verbose:
        for line in p.narrative.splitlines():
            print(f"             {line}")
        print(f"           prompt_id={p.prompt_id} evidence_sig={p.evidence.signature}")


def cmd_detect(args) -> int:
    prompts = detect_mod.detect(month_key=args.month, rule_id=args.rule_id)
    if args.persona:
        prompts = [p for p in prompts if p.persona == args.persona]
    if args.limit:
        prompts = prompts[: args.limit]
    print(f"\nDetected {len(prompts)} decision prompt(s) "
          f"(month={args.month or 'latest'}):\n")
    for p in prompts:
        _print_prompt(p, verbose=args.verbose)
    if args.persist:
        print("\nPersisting to prompt store + audit...")
        res = {"inserted": 0, "refreshed": 0}
        for p in prompts:
            was = prompt_store.upsert(p)        # returns 'inserted' | 'refreshed'
            res[was] += 1
            audit.audit_detection(p, was=was)   # audit reflects true state
        print(f"  prompt store: {res}")
        print(f"  audit rows written: {len(prompts)}")
    return 0


def cmd_selfcheck(args) -> int:
    checks: list[tuple[str, bool, str]] = []

    def rec(name, ok, detail=""):
        checks.append((name, ok, detail))
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

    print("Action Insights self-check\n" + "=" * 40)
    cfg = None
    try:
        cfg = sql_client.resolve_config()
        rows = sql_client.query("SELECT current_catalog() c, current_user() u", cfg=cfg)
        rec("connectivity", True, f"catalog={rows[0]['c']} user={rows[0]['u']}")
    except Exception as e:
        rec("connectivity", False, str(e))
        return 1

    try:
        rules = load_rules()
        over = [r.rule_id for r in rules if r.action_level > SETTINGS.action_level_ceiling]
        rec("rule load + level ceiling", not over,
            f"{len(rules)} rules, ceiling L{SETTINGS.action_level_ceiling}"
            + (f", VIOLATIONS: {over}" if over else ""))
    except Exception as e:
        rec("rule load + level ceiling", False, str(e))

    try:
        n = sql_client.query(f"SELECT COUNT(*) n FROM {SETTINGS.target_table}", cfg=cfg)[0]["n"]
        rec("target table access", int(n) > 0, f"{SETTINGS.target_table} rows={n}")
    except Exception as e:
        rec("target table access", False, str(e))

    try:
        sql_client.query(f"SELECT COUNT(*) n FROM {SETTINGS.prompt_store_table}", cfg=cfg)
        sql_client.query(f"SELECT COUNT(*) n FROM {SETTINGS.audit_table}", cfg=cfg)
        rec("control-plane tables readable", True,
            f"{SETTINGS.prompt_store_table}, {SETTINGS.audit_table}")
    except Exception as e:
        rec("control-plane tables readable", False, str(e))

    prompts = []
    try:
        mk = detect_mod.latest_month(cfg)
        prompts = detect_mod.detect(month_key=mk, cfg=cfg)
        by_sev = {}
        for p in prompts:
            by_sev[p.severity] = by_sev.get(p.severity, 0) + 1
        rec("detection pass", len(prompts) > 0, f"month={mk}, {len(prompts)} prompts {by_sev}")
    except Exception as e:
        rec("detection pass", False, str(e))

    # structure validation on produced prompts
    try:
        needed = ["STATUS:", "ROOT CAUSE:", "BUSINESS IMPACT:", "RECOMMENDED FIX:",
                  "ACTION QUESTION:", "CONFIDENCE:", "AUDIT NOTE:"]
        ok = all(all(tok in p.narrative for tok in needed) for p in prompts) if prompts else False
        ids = [p.prompt_id for p in prompts]
        rec("prompt structure + unique ids", ok and len(ids) == len(set(ids)),
            f"{len(prompts)} prompts, {len(set(ids))} unique ids")
    except Exception as e:
        rec("prompt structure + unique ids", False, str(e))

    print("\n" + "=" * 40)
    if prompts:
        print("Sample detected prompts (top 5 by severity):")
        for p in prompts[:5]:
            _print_prompt(p, verbose=False)
    failed = [n for n, ok, _ in checks if not ok]
    print("\nRESULT:", "ALL PASS" if not failed else f"{len(failed)} FAILED: {failed}")
    return 0 if not failed else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="action_insights")
    ap.add_argument("--selfcheck", action="store_true", help="run end-to-end health + detection")
    ap.add_argument("--dry-run", action="store_true", help="detect + print, no writes (default)")
    ap.add_argument("--persist", action="store_true", help="upsert prompts + write audit")
    ap.add_argument("--persona", help="filter prompts by persona")
    ap.add_argument("--rule-id", help="run a single rule")
    ap.add_argument("--month", type=int, help="month_key (default: latest)")
    ap.add_argument("--limit", type=int, help="max prompts to show")
    ap.add_argument("-v", "--verbose", action="store_true", help="print full narrative")
    args = ap.parse_args(argv)

    if args.selfcheck:
        return cmd_selfcheck(args)
    return cmd_detect(args)


if __name__ == "__main__":
    sys.exit(main())
