# specmine

Mine specifications out of a codebase into a linked `.specs/` knowledge base —
then let your AI agent consult it and cross-check every change against it.

**Philosophy: the CLI installs, the agent works.** `npx specmine init`
scaffolds everything and gets out of the way. All specmine commands are agent
skills/slash commands; the deterministic parts (lint, index, diff mapping) are
zero-dependency Node scripts shipped *inside the skill folder* and committed to
your repo — so your agent, your teammates' agents, and CI all run the exact
same scripts.

## Install

```bash
cd your-repo
npx github:dspachos/specmine init
```

Creates:

```
.specs/                            knowledge base skeleton + format contract
.claude/skills/specmine/           the skill: SKILL.md + scripts/{validate,check,shared}.mjs
.claude/commands/specmine/         /specmine:scan /specmine:validate /specmine:index /specmine:check
.pi/prompts/                       same commands, flat names for pi (/specmine-scan …)
.github/workflows/specmine.yml     CI gate running the same scripts, keyless
```

## Use (in your AI agent)

| Command | What happens |
|---|---|
| `/specmine:scan` | survey → excavate modules one by one → adversarial fidelity self-check → cited requirements in `.specs/` |
| `/specmine:validate` | lint: citation file/lines exist, unique IDs, cross-doc links, index sync (exit 1 = broken) |
| `/specmine:index` | regenerate `.specs/index.json` from the docs after any spec edit |
| `/specmine:check` | deterministic diff→requirement mapping via the scripts, then the agent judges: SATISFIED / VIOLATED / STALE_SPEC / NOT_AFFECTED / UNCLEAR + NO-SPEC |

Natural language works too — the skill triggers on *"scan this repo for
requirements"*, *"check my diff against the specs"*, *"check PR #123"*.

Scripts are also directly runnable (that's what CI does):

```bash
node .claude/skills/specmine/scripts/validate.mjs            # lint
node .claude/skills/specmine/scripts/validate.mjs --regen-index
node .claude/skills/specmine/scripts/check.mjs --base origin/main
node .claude/skills/specmine/scripts/check.mjs --files src/a.ts,src/b.ts
```

## The loop

1. **Scan once** (heavy) → `.specs/` holds what the code *actually does*, every
   claim cited `path:line`.
2. **Develop**: a PR that changes behavior **must** change its spec in the same
   PR. Edit the requirement doc → `/specmine:index` → `/specmine:validate`.
3. **Gate**: before merging, `/specmine:check` (works on your branch, a PR
   number, or a PR URL). CI runs validate + the deterministic mapping on every
   PR touching code or specs.

## Why citations everywhere

An uncited claim in `.specs/` is a rumor. The validator proves every citation
points at a real file and line range; the scan skill's adversarial phase
samples its own citations and grades them `EXACT / APPROXIMATE / HALLUCINATION`.
Trust, but verify — deterministically where possible, judgmentately where not.

## Requirements

- Node ≥ 20 (scripts only; no npm dependencies)
- An AI agent that supports the Agent Skills standard (Claude Code, pi, …) —
  skills live in `.claude/skills/`, pi users can `/skill:specmine` or use the
  flat prompts installed to `.pi/prompts/`.
- git (file enumeration respects .gitignore via `git ls-files`)
