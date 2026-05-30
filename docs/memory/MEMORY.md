# PulsePlay Project Memory

This directory is the repo-local memory for PulsePlay. It is the source of truth for durable project continuity that should travel with the repository.

Use this split:

- `project_state.md` records the latest branch, validation, shipped work, and honest current limitations.
- `feature_*.md` files preserve architecture decisions and feature-specific context that future agents should not rediscover from scratch.
- `feedback_*.md` files capture explicit collaboration corrections from Rajesh.

External per-user memory directories such as `.claude` or `.Codex` can exist as local caches, but they are optional mirrors. They should not be treated as canonical project state.

Update this directory along with [docs/HANDOVER.md](../HANDOVER.md) and [docs/AGENDA.md](../AGENDA.md) before ending meaningful work.
