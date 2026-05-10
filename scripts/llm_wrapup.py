#!/usr/bin/env python3
"""
DwD AI Assistant for PBI — LLM session wrap-up script (session exit point).

Run this at the END of every LLM session. It:
  1. Verifies HANDOVER.md was touched today (or warns if not).
  2. Verifies docs/FEEDBACK_TRACKER.md was touched if the session modified
     anything in src/proxy/genie code (heuristic).
  3. Marks .dwd-session.state.json as 'complete' with ended_at timestamp,
     so the next session's llm_onboard.py knows the previous one exited
     cleanly.
  4. Prints a short diff summary so the user (and any reviewing LLM) can
     see what shipped.

Usage:
    python scripts/llm_wrapup.py
    python scripts/llm_wrapup.py --force        # mark complete even if checks fail
    python scripts/llm_wrapup.py --note "BUG-001 + BUG-006 bundled"

Exit code:
    0 — clean wrap-up.
    1 — checks failed and --force not given (state file still active so the
        next session sees it as "in progress").
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = PROJECT_ROOT / ".dwd-session.state.json"


# ── Helpers ──────────────────────────────────────────────────────────────────

def utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_now_str() -> str:
    return _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S %z").strip()


def git(*args: str) -> str:
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


def banner(title: str, char: str = "=") -> None:
    line = char * 78
    print(f"\n{line}\n  {title}\n{line}")


def file_modified_since(path: Path, since_iso: str) -> bool:
    """Heuristic: was the file's mtime newer than the session start?"""
    if not path.exists():
        return False
    try:
        since = _dt.datetime.fromisoformat(since_iso.replace("Z", "+00:00"))
        mtime = _dt.datetime.fromtimestamp(path.stat().st_mtime, tz=_dt.timezone.utc)
        return mtime >= since
    except (ValueError, OSError):
        return False


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


# ── Checks ───────────────────────────────────────────────────────────────────

def check_handover_touched(session_start_iso: str) -> tuple[bool, str]:
    handover = PROJECT_ROOT / "docs" / "HANDOVER.md"
    if not handover.exists():
        return False, "docs/HANDOVER.md missing"
    if not file_modified_since(handover, session_start_iso):
        return False, "docs/HANDOVER.md was not modified during this session — append a new Session N+1 block at the top before wrapping up."
    return True, "docs/HANDOVER.md updated this session."


def check_tracker_touched(session_start_iso: str, code_touched: bool) -> tuple[bool, str]:
    # Feedback tracker now lives as Part 1 of docs/CONTINUITY.md (May 2026 consolidation).
    tracker = PROJECT_ROOT / "docs" / "CONTINUITY.md"
    if not code_touched:
        return True, "No code changed; tracker update not required."
    if not tracker.exists():
        return False, "docs/CONTINUITY.md missing"
    if not file_modified_since(tracker, session_start_iso):
        return False, "Code changed but docs/CONTINUITY.md (feedback tracker, Part 1) was not updated — flip closed bugs and log new ones."
    return True, "docs/CONTINUITY.md updated this session."


def code_touched_during_session(head_at_start: str) -> bool:
    """True if any source/test/proxy/visual files changed since session start."""
    if not head_at_start:
        return False
    diff = git("diff", "--name-only", head_at_start)
    if not diff:
        return False
    code_globs = ("genieChatVisual/src/", "genieChatVisual/tests/", "proxy/", "supervisor/", "scripts/")
    return any(any(line.startswith(g) for g in code_globs) for line in diff.splitlines())


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="LLM session exit point — verify docs + mark state complete.")
    parser.add_argument("--force", action="store_true", help="Mark complete even if doc checks fail.")
    parser.add_argument("--note", type=str, default=None, help="Optional one-line summary recorded in state file.")
    args = parser.parse_args()

    state = read_state()
    if not state:
        banner("No active session state found")
        print(f"  Expected file: {STATE_FILE}")
        print("  llm_onboard.py was probably not run at session start. Skipping wrap-up.")
        return 0

    if state.get("status") == "complete":
        banner("Session already marked complete")
        print(f"  Ended at: {state.get('ended_at')}")
        print("  Nothing to do. Run llm_onboard.py to start a new session.")
        return 0

    started_at = state.get("started_at") or utc_now_iso()
    head_at_start = state.get("git_head_at_start", "")

    banner("Wrap-up checks")

    # 1. HANDOVER must be touched.
    ok_handover, msg_handover = check_handover_touched(started_at)
    print(f"  [{'OK' if ok_handover else 'FAIL'}] docs/HANDOVER.md  -- {msg_handover}")

    # 2. If code changed, the feedback tracker (CONTINUITY.md Part 1) must be touched.
    code_touched = code_touched_during_session(head_at_start)
    ok_tracker, msg_tracker = check_tracker_touched(started_at, code_touched)
    print(f"  [{'OK' if ok_tracker else 'FAIL'}] docs/CONTINUITY.md  -- {msg_tracker}")

    all_ok = ok_handover and ok_tracker

    # 3. Diff summary.
    if head_at_start:
        banner("Files changed during this session")
        diff_stat = git("diff", "--stat", head_at_start)
        print(diff_stat or "  (no changes)")
        section_title = "Commits since session start"
        line = "-" * 78
        print(f"\n-- {section_title} {'-' * max(0, 78 - len(section_title) - 4)}")
        log = git("log", "--oneline", f"{head_at_start}..HEAD")
        print(log or "  (no new commits)")

    # 4. Mark state complete (or refuse).
    if not all_ok and not args.force:
        banner("Wrap-up incomplete")
        print("  One or more checks failed. State file kept 'active' so the next session")
        print("  will treat this as a crashed session and flag in-flight context.")
        print("  To force completion anyway: python scripts/llm_wrapup.py --force")
        return 1

    state["ended_at"] = utc_now_iso()
    state["ended_at_local"] = local_now_str()
    state["status"] = "complete"
    state["last_seen"] = state["ended_at"]
    if args.note:
        state["wrapup_note"] = args.note
    state["wrapup_force_used"] = bool(args.force and not all_ok)
    write_state(state)

    banner("Session marked complete")
    print(f"  Ended at: {state['ended_at_local']}")
    if state.get("wrapup_force_used"):
        print("  [!] --force used despite failing checks. Next session will see status=complete.")
    return 0


if __name__ == "__main__":
    if os.name == "nt":
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass
    sys.exit(main())
