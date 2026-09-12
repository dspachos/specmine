---
description: Cross-check changes or a PR against the requirements in .specs/
argument-hint: "[PR number | PR URL | base ref — default: current diff vs origin/main]"
---
Load the `specmine` skill (.claude/skills/specmine/SKILL.md) and execute its **check** workflow.

Target: ${ARGUMENTS:-current working tree / branch vs origin/main}

Deterministic mapping first (`check.mjs`), then judge each affected requirement
(SATISFIED / VIOLATED / STALE_SPEC / NOT_AFFECTED / UNCLEAR), present the
verdict table, and propose spec edits for anything STALE_SPEC.
