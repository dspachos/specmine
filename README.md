# specmine

Mine the specifications out of a codebase into a linked `.specs/` knowledge
base — so your AI agent can develop against real requirements instead of
guessing, and cross-check every PR against them.

**The CLI installs. The agent works.** `specmine init` scaffolds everything and
gets out of the way: no API keys, no model config, no LLM in the package. All
specmine commands are agent skills; the deterministic parts (lint, index
rebuild, diff mapping) are zero-dependency Node scripts shipped *inside the
skill folder* and committed to your repo — your agent, your teammates' agents,
and CI all run the exact same scripts.

## Quickstart

```bash
cd your-repo
npx github:dspachos/specmine init
```

Then, in your AI agent (Claude Code, pi, or any Agent Skills host):

```text
> /specmine:scan          # extract requirements from the code (heavy, once)
> /specmine:validate      # lint: citations, IDs, links, index sync — must PASS
> /specmine:check 123     # cross-check PR #123 (or your current diff) vs specs
```

Natural language works too — the skill triggers on *"scan this repo for
requirements"*, *"check my diff against the specs"*, *"check PR #123"*.

## Commands

| Command | What happens |
|---|---|
| `/specmine:scan` | survey the repo → excavate modules one by one → adversarial fidelity self-check → cited requirements in `.specs/` |
| `/specmine:validate` | deterministic lint: every citation points at a real file/line, IDs unique, links alive, index in sync (exit 1 = broken) |
| `/specmine:index` | regenerate `.specs/index.json` from the docs after any spec edit — never hand-edit it |
| `/specmine:check` | scripts map the diff (branch, working tree, PR number, or PR URL) to affected requirements; the agent then judges each one |

`check` verdicts: `SATISFIED` · `VIOLATED` · `STALE_SPEC` (behavior changed on
purpose — spec must move in the same PR) · `NOT_AFFECTED` · `UNCLEAR`, plus
`NO-SPEC` for changed files no requirement covers.

The scripts are plain Node ≥ 20 and run anywhere (that's what CI does):

```bash
node .claude/skills/specmine/scripts/validate.mjs                # lint
node .claude/skills/specmine/scripts/validate.mjs --regen-index  # rebuild index
node .claude/skills/specmine/scripts/check.mjs --base origin/main
node .claude/skills/specmine/scripts/check.mjs --files src/a.ts,src/b.ts
```

## What lands in your repo

```text
.specs/                          knowledge base skeleton + CONVENTIONS.md (the format contract)
.claude/skills/specmine/         SKILL.md + scripts/{validate,check,shared}.mjs
.claude/commands/specmine/       the four slash commands (Claude Code)
.pi/prompts/                     the same commands, flat names (/specmine-scan …)
.github/workflows/specmine.yml   CI gate: validate + check mapping, keyless
```

`.specs/` is ordinary markdown. A requirement looks like:

```markdown
### FR-AUTH-003 — Reset tokens expire after 15 minutes

Reset tokens MUST expire 15 minutes after issuance and MUST be single-use.

**Confidence:** verified · **Sources:** `src/auth/tokens.ts:88 #issueResetToken`
```

Atomic, ID'd, RFC-2119 wording, every claim cited `path:line`. An uncited
claim is a rumor: the validator proves each citation exists on disk, and the
scan skill's adversarial phase samples its own citations and grades them
`EXACT / APPROXIMATE / HALLUCINATION` before declaring a module done.

## The loop

1. **Scan once** (heavy, per module) → `.specs/` now records what the code
   *actually does* — including the open questions nobody could answer.
2. **Develop** — a PR that changes behavior **must** change its spec in the
   same PR: edit the requirement → `/specmine:index` → `/specmine:validate`.
3. **Gate** — `/specmine:check` before merging (branch, PR number, or URL);
   CI runs validate + the deterministic mapping on every PR touching code or
   specs.

## Why this shape

- **Scripts over prose for the deterministic parts.** An agent grading its own
  citations has a conflict of interest; `validate.mjs` doesn't. And a script
  committed in-repo runs identically in every agent and in CI, forever.
- **Judgment stays with the agent.** Whether a hunk *violates* a requirement is
  reading comprehension with repo context — that's the agent's job, bounded to
  just the affected docs via `index.json`.
- **`.specs/` is for humans too.** Plain markdown, stable IDs, reviewable
  diffs: the spec change is visible in the same PR as the code change.

## Requirements

- Node ≥ 20 (for the scripts; no npm dependencies)
- An AI agent supporting the [Agent Skills standard](https://agentskills.io)
  (Claude Code, pi, …); pi users get flat prompts in `.pi/prompts/` and can
  also invoke the skill directly via `/skill:specmine`.
- git — file enumeration goes through `git ls-files`, so `.gitignore` is
  respected by definition.

## License

MIT
