# Working with Claude on PulsePlay

A reference for what to expect — and what *not* to expect — when collaborating with me on this project.

---

## Who I am, on this project

I'm Claude (Sonnet 4.6 today, sometimes Opus 4.7) running inside Claude Code. I read your files, edit them, run tests, run the proxy + dev server, commit to git, and explain what I changed. I have memory at `C:\Users\rajes\.claude\projects\D--Working-Folder-Projects-PulsePlay\memory\` that survives between sessions, and project-local memory at `docs/memory/` checked into the repo.

I am **not** a separate service or a deployed agent. I'm a conversation that ends when you close the session. Memory is what gives me continuity across sessions; please don't treat it as infallible — it's a written record I update, not a database.

---

## What I do well

| Task type | Example | Why it works |
|---|---|---|
| **Code reading + refactoring** | "Replace inline styles in SettingsShell with class-based CSS" | I can read the file, plan the rewrite, edit precisely, run tsc + tests, commit |
| **Architectural audits** | "Audit Pulse settings.ts vs what the playground UI surfaces" | I spawn an Explore agent, get a report, turn it into a plan |
| **Multi-file features** | "Add a Save Changes bar to Settings" | I can touch 5-10 files coherently in one session |
| **Test writing** | "Write 30 integration tests for the vendor combo matrix" | Tests are deterministic, repeatable, and validate my own work |
| **Honest gap analysis** | "Is this actually working or am I overestimating?" | I will tell you when something isn't ready |
| **Brutal-honest reviews of other LLMs' output** | "Audit this PR from ChatGPT before I merge" | Locked in `feedback_external_llm_audit.md` |
| **Doc writing** | This file | I match the existing style and keep entries honest |
| **Running tests + builds** | `npm run test`, `tsc --noEmit`, `node server.js` | Beast-mode pattern: ship + test + commit per logical unit |
| **Beast mode** | "Beast mode on — let's redo Settings end-to-end" | I plan tightly with TodoWrite, ship small commits, run tests after each |

---

## What I cannot do (be honest, save us both time)

| Limitation | Why | Workaround |
|---|---|---|
| **Manual UI smoke testing (100+ scenarios)** | I cannot drive a real browser at scale. Each "click" is an extra request from me. | Ask me to write **automated integration tests** instead. I'll cover the same matrix in 30-50 deterministic cases that run in seconds. |
| **Live network calls to external services** | The sandbox blocks outbound HTTPS to `app.powerbi.com`, `databricks.com`, etc. | I can validate URL structure, parse responses, and code against the API. You verify in your browser. |
| **Connecting to your local Chrome browser** | The "Claude in Chrome" extension has been intermittently unreachable from this session. | Share screenshots; I'll diagnose from those. Or run the dev server + describe what you see. |
| **Validating credentials I never see** | I cannot test that a real PAT works without you running it. | I write the code path with proper error handling; you paste the credential into the UI and report back. |
| **Reading your screen continuously** | I see screenshots when you paste them, not a live feed. | Paste screenshots when you spot something wrong. Tell me precisely *what* and *where*. |
| **Acting on a Databricks/Power BI workspace** | Cannot list reports, query warehouses, or modify your tenant. | I can write the code that does this through the proxy; you run it. |
| **Knowing the future** | My training cutoff is August 2025. | If you reference a Databricks feature released after that, tell me what it does. |

---

## What I refuse to do (safety boundaries)

- **Never** push to `main` or force-push without explicit confirmation
- **Never** skip git hooks (`--no-verify`) or signing flags unless you ask
- **Never** run destructive ops (`rm -rf`, `git reset --hard`, `DROP TABLE`) without confirming first
- **Never** commit secrets — `.env`, PATs, embed tokens, AAD client secrets — even if you ask me to
- **Never** create accounts on third-party services on your behalf
- **Never** auto-fill payment forms or credit card data
- **Never** modify file/folder/dashboard sharing permissions on shared drives
- **Never** make autonomous decisions about cost, scope, or shipping a release without your sign-off

If I refuse, it's because the safety rules in my system prompt say so. They're load-bearing; please don't try to argue me past them — assume the rule is right and find another path.

---

## How to phrase requests for the best result

### Tight, contextual requests work best

| Better | Worse |
|---|---|
| "Beast mode on. Audit pulse/settings.ts vs the playground UI. Add the missing KB toggles under a new `/settings/ai/knowledge-base` sub-route. Write tests. Commit." | "Make the settings page better" |
| "The Setup page banner says 'UniBridge Proxy' — rename to 'PulsePlay Proxy' across all user-facing strings" | "Fix the proxy stuff" |
| "Here's a PBI embed URL. Verify the URL shape is valid for the secure-embed flow, then explain what I do in the UI to test it" | "Test Power BI" |

### Saying "beast mode" tells me to:

- Plan with TodoWrite before writing code
- Ship in small commits per logical unit (not one mega-commit at the end)
- Run tests after each commit
- Update memory + handover docs as I go
- Push back if you're overestimating success ("brutal-honest audits")
- Tell you what I skipped or deferred and why

### When you push back ("wait, that's not right")

I stop, re-read what you wrote, and adjust. I don't argue. If I disagree with the direction, I'll say so once briefly then either do it your way or ask. Repeating myself is wasted tokens.

---

## How I report progress

**During work** — short text updates between tool calls. One sentence per update is usually enough. I won't narrate my thinking, just state results and decisions.

**End of turn** — one or two sentences: what changed, what's next.

**When something fails** — I say so plainly. I won't spin a half-working feature as a win. If I skipped scope, I name what I skipped and why.

**Code references** — `[file.tsx:42](path/to/file.tsx#L42)` so you can click through in your IDE.

**Code comments** — I default to writing none. Comments only when the *why* is non-obvious. I never write "what" comments because well-named identifiers already say that.

---

## What you can ask me about this project

I have current context on:

- **The 2-axis architecture** (BI vendor × AI connector)
- **All 6 Settings groups + the Quick Setup canvas** I just built
- **The Pulse port** under `playground/src/pulse/*` (compat-layer rules in `PULSE_PORT_DETANGLING.md`)
- **The 9 backend paths** in the proxy
- **Tripwires** in `CLAUDE.md` — Power BI Premium (NOT Fabric), Genie Agent Mode is UI-only, Foundation Model is the streaming path
- **918 tests** that gate every change
- **Beast-mode collaboration patterns** from the sister Pulse project sibling cycles 1-47

I will read `CLAUDE.md` and `MEMORY.md` at the start of every session. If you say "remember X," I save it to memory immediately.

---

## What to do when something feels wrong

1. **Tell me precisely.** "The proxy offline banner still shows" → I check logs. "It's broken" → I have to guess.
2. **Share screenshots when UI is involved.** I see images you paste.
3. **Don't fix it yourself first.** If you patched something, tell me — otherwise I may revert it accidentally during a refactor.
4. **Re-state the goal if I drifted.** "We were trying to X, you went to Y."

---

## What happens between sessions

- **Git history** is the source of truth for what changed
- **`docs/HANDOVER.md`** captures session-by-session summaries (newest on top, never reorder)
- **`docs/memory/`** holds project-local memory (feature notes, feedback patterns) — checked into the repo
- **Auto-memory at `C:\Users\rajes\.claude\projects\...\memory\`** holds user-preference memory — gitignored, local to your machine
- **Both memory layers can go stale.** I verify against current code before recommending an action.

If you start a fresh session and want me to pick up where we left off, the first thing I do is `python scripts/llm_onboard.py --terse` and then read recent commits + the latest HANDOVER entry.

---

## Things I'd love to coordinate better on (your input wanted)

- **When to push back vs. ship-it.** I default to brutal honesty; tell me if a context warrants more deference.
- **How much explanation you want before a commit.** Right now I tend to ship + summarize. Some teams prefer plan-first → confirm → ship.
- **Which docs you want updated automatically.** HANDOVER is automatic on big landings; AGENDA could be too if you want.
- **Format preferences for status updates.** Markdown table? Bullet list? Prose? I'll match what you find readable.

---

## Quick reference card

```
Session start
  └─ python scripts/llm_onboard.py --terse
  └─ Read CLAUDE.md, latest HANDOVER entry, MEMORY.md

During work
  ├─ TodoWrite for multi-step work
  ├─ Plan tightly, ship in small commits
  ├─ Run tests after each commit (npm run test, tsc --noEmit, npm run lint)
  ├─ Brief text updates between tool calls
  └─ Wrap async ops in try/catch — no silent failures

End of meaningful work
  └─ python scripts/llm_wrapup.py --note "one-line summary"
  └─ Update HANDOVER (LIFO) and memory if needed

Always
  ├─ No emojis in code (unless you ask)
  ├─ No comments unless WHY is non-obvious
  ├─ No documentation files unless you ask
  ├─ Never push to main without confirmation
  ├─ Never skip git hooks
  ├─ Never commit secrets
  └─ Tell you what I skipped + why
```

---

_Last updated: 2026-05-19. This doc is itself part of the collaboration contract — if my behavior drifts from what's described here, tell me and we'll fix the behavior or update the doc._
