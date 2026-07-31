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

## Two things get checked

**The magnitude.** Does the number the connector asserts match what the
warehouse holds, within a stated tolerance?

**The notation.** Does the answer obey the Roman scale locked in `0c7d293` —
`M` = thousand, `MM` = million, `B` = billion, `K` forbidden? This is enforced
by *guidance*, not code, which means nothing in the build can currently catch a
regression. The DEC-UNITS defect was exactly this failure: one screen showed
"854.42 K tCO2e" from the model beside "854.42 M" from our own formatter — the
same number reading 1000× apart. A notation violation fails the run even when
the magnitude agreed, because it already shipped once.

## Running it

The pure logic is credential-free and runs anywhere, including CI:

```powershell
cd evals
npm test          # 23 tests, no proxy, no creds, no spend
```

The live reconciliation costs real money — one model round-trip plus one
warehouse query per case:

```powershell
# proxy must be up:  cd proxy; $env:PORT=7000; node server.js
cd evals
npm run live
npm run live -- --case otif-weighted-latest
npm run live -- --profile genie-scm-poc --verbose
```

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

If **LLM-as-judge** assertions are ever wanted — "is this explanation coherent",
"does this cite its source" — that is the point at which a tool like promptfoo
earns its tree, because judging is genuinely hard to hand-roll. Numeric
reconciliation is not.

## Adding a case

Add to `golden/scm.json`:

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
| `lib/proxyClient.mjs` | Talks to the proxy over its **public** routes only |
| `golden/scm.json` | The cases |
| `tests/*.test.mjs` | Credential-free tests of the logic above |
| `run-live.mjs` | The live run |

`proxyClient.mjs` deliberately uses the same routes the browser uses — no
test-only backdoor — so a passing case is evidence about the real request path,
including the server-side scope prefix and governance attestation.
