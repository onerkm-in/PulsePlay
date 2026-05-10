#!/usr/bin/env python3
"""
DwD AI Assistant for PBI — LLM onboarding script (session entry point).

Run this at the START of every LLM session. It:
  1. Checks the project session state file for a stale "active" session
     (i.e. a previous session ended abruptly without a wrap-up). When found,
     it prints what was in flight — git status, files modified since the
     prior session's HEAD, latest HANDOVER block — so the LLM can resume.
  2. Marks the new session as "active" with started_at + git HEAD.
  3. Prints the canonical docs and the auto-memory so the LLM has full
     project context before doing anything.

Pair with scripts/llm_wrapup.py at session END to mark the session complete.

Usage:
    python scripts/llm_onboard.py
    python scripts/llm_onboard.py --no-memory
    python scripts/llm_onboard.py --terse
    python scripts/llm_onboard.py --paths-only
    python scripts/llm_onboard.py --goal "fix BUG-001 and BUG-006"
    python scripts/llm_onboard.py --no-state-write   # read-only mode

Exit code:
    0 — onboarding completed (with or without crash recovery banner)
    1 — required canonical file (CLAUDE.md or HANDOVER.md) is missing
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable

# ── Configuration ────────────────────────────────────────────────────────────

CANONICAL_DOCS: list[tuple[str, str]] = [
    ("CLAUDE.md",                          "Project guide — directories, run sequence, tripwires"),
    ("README.md",                          "Top-level project README — front door"),
    ("docs/INDEX.md",                      "Master doc navigator — audience-routed, replaces DOCUMENT_MAP"),
    ("docs/AUTHOR_GUIDE.md",               "Operational combined doc (10 parts): feature walkthrough, author guide, Section H, multi-space, Gateway, prompt library, brand voice, live-test checklist, Azure deployment, formatting reference"),
    ("docs/ARCHITECTURE.md",               "Architecture combined doc — system topology + analytics knowledge base"),
    ("docs/ROADMAP.md",                    "Roadmap combined doc — agenda + blueprint + wave specs + audits + cockpit refactor screening"),
    ("docs/HANDOVER.md",                   "LIFO session log — newest sessions on top (relocated from root in May 2026 consolidation)"),
    ("docs/RELEASE.md",                    "Release combined doc — checklist + cumulative release notes"),
    ("docs/CONTINUITY.md",                 "Continuity combined doc — feedback tracker + stale-code + project memory + Copilot bootstrap + scratchpad"),
    ("docs/MASTER_GUIDE.md",               "Forum-facing executive narrative — stitched snapshot artifact"),
    ("docs/SECURITY_REVIEW.md",            "Standalone security audit — threat model, defense layers, compliance posture"),
    ("docs/QUALITY_METHODOLOGY.md",        "Honest statement of what we measure today and what we don't"),
    ("docs/ANALYTICS_DOMAIN_TAXONOMY.md",  "Research bibliography — 18-domain canonical taxonomy with citations"),
    ("docs/INSIGHTS_SECTION_TAXONOMY.md",  "Research bibliography — 22-archetype canonical section library with citations"),
]

# Log files surfaced in the onboarding sweep (tail mode). Useful for spotting
# real proxy errors, audit trail, or feedback log activity from the prior
# session when the LLM is picking up where it left off.
LOG_FILES: list[tuple[str, str]] = [
    ("proxy/proxy.out.log", "Proxy stdout — audit lines, request/response logs"),
    ("proxy/proxy.err.log", "Proxy stderr — startup errors, crashes"),
    ("proxy/feedback.log",  "Feedback log — captured user feedback events"),
]

LOG_TAIL_LINES = 40

DEFAULT_MEMORY_DIR = Path(
    r"C:\Users\rajes\.claude\projects\d--Working-Folder-Projects-DwD-AI-Assistant-for-PBI\memory"
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = PROJECT_ROOT / ".dwd-session.state.json"
STATE_VERSION = 1


# ── Helpers ──────────────────────────────────────────────────────────────────

def banner(title: str, char: str = "=") -> None:
    line = char * 78
    print(f"\n{line}\n  {title}\n{line}")


def section(title: str) -> None:
    print(f"\n-- {title} " + "-" * max(0, 78 - len(title) - 4))


def print_file(path: Path, terse: bool) -> bool:
    if not path.exists():
        print(f"  [missing] {path}")
        return False
    section(str(path.relative_to(PROJECT_ROOT)) if path.is_relative_to(PROJECT_ROOT) else str(path))
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as err:
        print(f"  [unreadable] {err}")
        return False
    if terse:
        lines = text.splitlines()
        print("\n".join(lines[:40]))
        if len(lines) > 40:
            print(f"  ... [{len(lines) - 40} more lines truncated; re-run without --terse for full text]")
    else:
        print(text)
    return True


def iter_memory_files(memory_dir: Path) -> Iterable[Path]:
    if not memory_dir.exists():
        return []
    return sorted(memory_dir.glob("*.md"), key=lambda p: (p.name != "MEMORY.md", p.name.lower()))


def print_log_tail(path: Path, n: int) -> None:
    section(str(path.relative_to(PROJECT_ROOT)) if path.is_relative_to(PROJECT_ROOT) else str(path))
    if not path.exists():
        print(f"  [missing — log file not yet created: {path.name}]")
        return
    try:
        # Cheap tail — load lines, slice. Safe up to ~100MB which these
        # rotating logs never reach (proxy caps feedback.log at 5MB × 3).
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        tail = lines[-n:] if len(lines) > n else lines
        if not tail:
            print("  (empty)")
            return
        if len(lines) > n:
            print(f"  ... [{len(lines) - n} earlier lines truncated; showing last {n}]")
        for line in tail:
            print(line)
    except OSError as err:
        print(f"  [unreadable] {err}")


def utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_now_str() -> str:
    return _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S %z").strip()


def git(*args: str) -> str:
    """Run a git command and return stdout, or '' on failure."""
    try:
        out = subprocess.run(
            ["git", *args],
            cwd=PROJECT_ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def detect_agent_label() -> str:
    # Best-effort: look for common harness env vars before falling back.
    for key in ("CLAUDE_AGENT", "CURSOR_AGENT", "AGENT_NAME", "USER_AGENT_LLM"):
        v = os.environ.get(key)
        if v:
            return v
    if os.environ.get("CLAUDE_CODE_VERSION") or os.environ.get("ANTHROPIC_CLAUDE_CODE"):
        return "Claude Code"
    return "unknown"


# ── Session state file ───────────────────────────────────────────────────────

def read_state() -> dict | None:
    if not STATE_FILE.exists():
        return None
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_state(state: dict) -> None:
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except OSError as err:
        print(f"  [warn] failed to write state file: {err}")


def show_crash_recovery(prior: dict) -> None:
    banner("PRIOR SESSION DID NOT EXIT CLEANLY", char="!")
    print("The previous session was marked 'active' but never wrapped up.")
    print("Inspect the in-flight context below before resuming.\n")

    print(f"  Started     : {prior.get('started_at_local') or prior.get('started_at') or 'unknown'}")
    print(f"  Last seen   : {prior.get('last_seen') or 'unknown'}")
    print(f"  Agent       : {prior.get('agent_label', 'unknown')}")
    print(f"  Goal        : {prior.get('user_goal') or '(none recorded)'}")
    print(f"  Git HEAD@start : {prior.get('git_head_at_start', 'unknown')}")
    print(f"  Branch@start   : {prior.get('git_branch_at_start', 'unknown')}")
    print(f"  Tree@start clean? : {prior.get('working_tree_clean_at_start')}")

    section("git status (current)")
    status = git("status", "--short", "--branch")
    print(status or "  [git not available or not a repo]")

    head_at_start = prior.get("git_head_at_start")
    if head_at_start:
        section(f"Files changed since prior session HEAD ({head_at_start[:10]})")
        diff = git("diff", "--name-status", f"{head_at_start}..HEAD")
        print(diff or "  (no committed changes since session start)")
        section("Uncommitted (working tree + index) since prior session HEAD")
        uncommitted = git("diff", "--name-status", head_at_start)
        print(uncommitted or "  (clean)")

    section("docs/HANDOVER.md — top 80 lines (most recent session block)")
    handover = PROJECT_ROOT / "docs" / "HANDOVER.md"
    if handover.exists():
        lines = handover.read_text(encoding="utf-8", errors="replace").splitlines()
        print("\n".join(lines[:80]))
    else:
        print("  [docs/HANDOVER.md missing]")

    section("docs/CONTINUITY.md (feedback tracker) — IN PROGRESS items")
    tracker = PROJECT_ROOT / "docs" / "CONTINUITY.md"
    if tracker.exists():
        text = tracker.read_text(encoding="utf-8", errors="replace")
        in_flight = [ln for ln in text.splitlines() if "IN PROGRESS" in ln]
        if in_flight:
            for ln in in_flight:
                print(f"  {ln.strip()}")
        else:
            print("  (no IN PROGRESS items found)")
    else:
        print("  [FEEDBACK_TRACKER.md missing]")

    print("\nResume guidance:")
    print("  1. Read the HANDOVER block above to see what the prior session intended.")
    print("  2. Compare against the git status / changed files to see how far it got.")
    print("  3. If safe, finish the in-flight task. If not, ask the user how to proceed.")
    print("  4. When done, run: python scripts/llm_wrapup.py")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="LLM session entry point — onboarding + crash recovery.")
    parser.add_argument("--no-memory", action="store_true")
    parser.add_argument("--terse", action="store_true")
    parser.add_argument("--paths-only", action="store_true")
    parser.add_argument("--memory-dir", type=Path, default=DEFAULT_MEMORY_DIR)
    parser.add_argument("--goal", type=str, default=None,
                        help="Optional goal recorded in the state file (helps the next session if this one crashes).")
    parser.add_argument("--no-state-write", action="store_true",
                        help="Don't update .dwd-session.state.json (read-only mode).")
    parser.add_argument("--no-logs", action="store_true",
                        help="Skip the proxy log-tail section.")
    parser.add_argument("--no-git", action="store_true",
                        help="Skip the recent-commits section.")
    args = parser.parse_args()

    # Paths-only short-circuit (handy for piping into another tool).
    if args.paths_only:
        for rel, _ in CANONICAL_DOCS:
            print((PROJECT_ROOT / rel).resolve())
        if not args.no_memory:
            for p in iter_memory_files(args.memory_dir):
                print(p.resolve())
        if not args.no_logs:
            for rel, _ in LOG_FILES:
                p = (PROJECT_ROOT / rel).resolve()
                if p.exists():
                    print(p)
        print(STATE_FILE.resolve())
        return 0

    # ── Crash recovery check ──
    prior = read_state()
    crashed = bool(prior and prior.get("status") == "active" and not prior.get("ended_at"))
    if crashed:
        show_crash_recovery(prior)
        if not args.no_state_write:
            prior["status"] = "crashed"
            prior["crash_detected_at"] = utc_now_iso()
            write_state(prior)

    # ── Mark new session active ──
    if not args.no_state_write:
        new_state = {
            "version": STATE_VERSION,
            "started_at": utc_now_iso(),
            "started_at_local": local_now_str(),
            "last_seen": utc_now_iso(),
            "ended_at": None,
            "status": "active",
            "agent_label": detect_agent_label(),
            "user_goal": args.goal,
            "git_head_at_start": git("rev-parse", "HEAD"),
            "git_branch_at_start": git("rev-parse", "--abbrev-ref", "HEAD"),
            "working_tree_clean_at_start": git("status", "--porcelain") == "",
            "prior_crash_recovered": crashed,
        }
        write_state(new_state)

    # ── Onboarding output ──
    banner("DwD AI Assistant for PBI - LLM onboarding")
    print(textwrap_strip("""
        Read the docs below before any non-trivial code change. Tripwires and
        active in-flight context live in CLAUDE.md, HANDOVER.md (top entry =
        most recent), and docs/PROJECT_MEMORY_DISCOVERY.md. The auto-memory
        section captures cross-session continuity Claude Code has already
        learned about this project - treat it as authoritative for
        collaboration style and resolved/pending feedback items.

        At session end, run: python scripts/llm_wrapup.py
    """))

    print("\nCanonical docs:")
    for rel, blurb in CANONICAL_DOCS:
        print(f"  - {rel:50s} - {blurb}")

    missing_required = False
    for rel, _ in CANONICAL_DOCS:
        ok = print_file(PROJECT_ROOT / rel, args.terse)
        if not ok and rel in ("CLAUDE.md", "docs/HANDOVER.md"):
            missing_required = True

    if not args.no_memory:
        banner("Auto-memory (Claude Code per-project)")
        memory_files = list(iter_memory_files(args.memory_dir))
        if not memory_files:
            print(f"  [no memory found at {args.memory_dir}]")
        else:
            for p in memory_files:
                print_file(p, args.terse)

    if not args.no_logs:
        banner("Recent log activity (tail)")
        print(f"Showing the last {LOG_TAIL_LINES} lines of each log so you can spot")
        print("real errors, audit trails, or feedback events from the prior session.")
        for rel, blurb in LOG_FILES:
            print(f"\n  {rel}  -- {blurb}")
            print_log_tail(PROJECT_ROOT / rel, LOG_TAIL_LINES)

    if not args.no_git:
        banner("Recent commits (last 20)")
        log_out = git("log", "--oneline", "-n", "20")
        print(log_out or "  [git not available or empty history]")

    banner("Done - proceed with the user's task")
    print("Reminder: HANDOVER.md is LIFO. Append a new Session N+1 block at the TOP after meaningful work.")
    print("At session end, run:  python scripts/llm_wrapup.py")
    if crashed:
        print("\n[!] Prior session crashed. State file marked 'crashed'. Resume context shown above.")

    return 1 if missing_required else 0


def textwrap_strip(s: str) -> str:
    return "\n".join(ln.strip() for ln in s.strip().splitlines())


if __name__ == "__main__":
    if os.name == "nt":
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass
    sys.exit(main())
