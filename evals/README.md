# evals — does the answer match the data?

[docs/QUALITY.md](../docs/QUALITY.md) has always been honest about the gap: the
~3,500 unit tests assert output **shape**, not answer **correctness**. "All
green" has never meant "the answers are right". This closes that gap for the
part of it that can be closed deterministically.

Each golden case asks a question in natural language and carries the SQL that
independently establishes the true answer. The harness asks the connector, runs
the reference SQL against the same warehouse, and requires the two to agree.

This is not a new idea here — [docs/HANDOVER.md](../docs/HANDOVER.md) describes
values being "reconciled against the warehouse via `/sql/preview`" during headed
validation. That was a person doing arithmetic by hand at the end of a long
session. This is the same check, repeatable, with the tolerance written down.

## Three things get checked

**The magnitude.** Does the number the connector asserts match what the
warehouse holds, within a stated tolerance?

**The notation.** Does the answer obey the Roman scale locked in `0c7d293` —
`M` = thousand, `MM` = million, `B` = billion, `K` forbidden? This is enforced
by *guidance*, not code, which means nothing in the build can currently catch a
regression. The DEC-UNITS defect was exactly this failure: one screen showed
"854.42 K tCO2e" from the model beside "854.42 M" from our own formatter — the
same number reading 1000× apart. A notation violation fails the run even when
the magnitude agreed, because it already shipped once.

**The grounding.** When an answer comes with rows — `groundedData` supplied by
the case, or the envelope's own query result — every number the answer cites is
checked against those rows using the proxy's own `groundingVerifier` (same-repo
source import, Roman-scale mode; the npm tree stays at zero). Reconciliation
catches a wrong headline number; this catches a right headline number decorated
with invented ones. `unverified` (claims exist, none match) fails the case;
`partial` warns, or fails under `--strict-grounding`.

## Running it

The pure logic is credential-free and runs anywhere, including CI:

```powershell
cd evals
npm test          # no proxy, no creds, no spend
```

The live reconciliation costs real money — one model round-trip plus (for
SQL-truth cases) one warehouse query per case:

```powershell
# proxy must be up:  cd proxy; $env:PORT=7000; node server.js
cd evals
npm run live                              # every golden/*.json suite
npm run live -- --golden pbi-scm-dax.json # one suite
npm run live -- --case otif-weighted-latest
npm run live -- --profile genie-scm-poc --verbose
```

Suites bind their own profiles: each golden file may set `answerProfile` (who
answers) and `truthProfile` (whose warehouse judges), and cases may override.
The split matters because `/sql/preview` needs a profile with a `warehouseId`,
which PBI and FM profiles do not have — so `pbi-scm-dax.json` answers on
`powerbi-dwd` and reconciles through `genie-scm-poc`. FM `groundedData` cases
carry a literal `expected` instead of SQL: the supplied rows ARE the truth.

There is also an **LLM-as-judge tier** — two model calls per case, so it is a
separate, equally explicit command:

```powershell
npm run judge -- --golden fm-grounded.json
npm run judge -- --case fm-otif-cite --judge-profile foundation
```

The judge (the FM connector via `/foundation/section`) scores faithfulness,
relevance and coherence 0–1 against the evidence rows and reference value.
Scores are **signal, not gate** — the run reports means and per-case verdicts
and only fails if the judge itself was unusable. Deterministic gates stay in
`run-live.mjs`.

**Spend discipline.** `run-live.mjs` is an explicit command and nothing else —
no CI job, no schedule, no timer, no page load. That is the project's
no-spend-without-intent rule, and this harness is precisely the kind of thing
that rule exists to keep on a leash. It also queries the warehouse for ground
truth *before* spending a model call, so a case that cannot be checked costs
nothing.

Live checks staying local matches the existing convention — `smoke.yml` runs
credential-free in CI for the same reason.

## Why this has no dependencies

Not asceticism. The eval PulsePlay actually needs is deterministic numeric
reconciliation against a warehouse, which no off-the-shelf harness does natively
— adopting one would still have meant writing a custom provider *and* a custom
assertion, i.e. all of this code plus a few hundred transitive packages of
someone else's.

The lean dependency surface is a real security property of this repo (8 runtime
packages in the playground, 3 in the proxy). Spending it on config-file
ergonomics would be a poor trade, particularly for a directory whose job is
raising confidence.

The **LLM-as-judge tier** (`run-judge.mjs`) is deliberately a v0 heuristic —
one model, one rubric, JSON by instruction — and its scores are reporting-only.
That keeps it inside the zero-dep rule. If judge scores ever need to *gate*
anything (CI thresholds, regression tracking across releases), that is the
point at which a tool like promptfoo earns its tree, because a load-bearing
judge is genuinely hard to hand-roll. A reporting judge is not.

## Adding a case

Every `golden/*.json` file is a suite and all of them run by default. Pick the
suite whose connector you are testing (or add a new file — the runner and the
CI schema gate discover it automatically). A case looks like:

```json
{
  "id": "short-kebab-id",
  "question": "asked the way a user would ask it",
  "why": "what failure this case would catch",
  "referenceSql": "SELECT ... AS col FROM ...",
  "column": "col",
  "expectPercent": true,
  "tolerancePct": 1
}
```

Two rules worth keeping:

- **Derive the reporting month** with `MAX(month_key)` rather than hardcoding
  one. The synthetic star is as-of 30-Jun-2026 and will roll.
- **Name the column** rather than trusting position — Genie and the
  deterministic DAX path do not agree on column ordering.

The `why` field is not decoration. A golden case nobody can justify is a case
nobody will fix when it goes red.

## Layout

| Path | What |
|---|---|
| `lib/extract.mjs` | Pulls numbers (and notation violations) out of an answer |
| `lib/reconcile.mjs` | Compares answer against ground truth; owns tolerance |
| `lib/proxyClient.mjs` | Talks to the proxy over its **public** routes only; polls Genie, normalizes rows |
| `lib/grounding.mjs` | Hallucination check — the proxy's groundingVerifier in Roman-scale mode |
| `lib/judge.mjs` | Judge prompt builder + verdict parser (the pure halves) |
| `golden/scm.json` | The original 4 SCM cases (validated baseline) |
| `golden/genie-scm-metricviews.json` | Genie vs its own metric views (14 cases) |
| `golden/pbi-scm-dax.json` | Deterministic DAX vs the warehouse flat views (10 cases) |
| `golden/fm-grounded.json` | FM grounded-narration cases, no warehouse needed (8 cases) |
| `tests/*.test.mjs` | Credential-free tests of the logic above + golden-suite schema gate |
| `run-live.mjs` | The live reconciliation run |
| `run-judge.mjs` | The LLM-as-judge run (reporting-only) |

`proxyClient.mjs` deliberately uses the same routes the browser uses — no
test-only backdoor — so a passing case is evidence about the real request path,
including the server-side scope prefix and governance attestation.
