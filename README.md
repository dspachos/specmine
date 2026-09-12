# specmine

Mine the specifications out of a codebase into a linked `.specs/` knowledge
base — so your AI agent can develop against real requirements instead of
guessing, and cross-check every PR against them.

**One install command. The skill does the rest.** specmine ships as an
[Agent Skills](https://agentskills.io) package — no CLI of its own, no API
keys, no model config. The skill carries everything: workflows, deterministic
scripts, templates, even the CI gate. First contact bootstraps your repo.

## Install

```bash
cd your-repo
npx skills add dspachos/specmine
```

Then, in your AI agent (Claude Code, Cursor, pi, Codex, OpenCode, … — any of
the 75+ agents `skills` supports):

```text
> scan this repo for specs       # bootstraps .specs/, then extracts requirements
> check my diff against the specs
> check PR #123 against the specs
```

First run scaffolds `.specs/`, the in-repo scripts, the CI gate, and slash
commands where the host supports them.

## What the skill gives you

| Ask for | What happens |
|---|---|
| **scan** | survey the repo → excavate modules one by one → adversarial fidelity self-check → cited requirements in `.specs/` |
| **validate** | deterministic lint: every citation points at a real file/line, IDs unique, links alive, index in sync (exit 1 = broken) |
| **index** | regenerate `.specs/index.json` from the docs after any spec edit — never hand-edit it |
| **check** | scripts map the diff (branch, working tree, PR number/URL) to affected requirements; the agent then judges each one |

`check` verdicts: `SATISFIED` · `VIOLATED` · `STALE_SPEC` (behavior changed on
purpose — the spec must move in the same PR) · `NOT_AFFECTED` · `UNCLEAR`,
plus `NO-SPEC` for changed files no requirement covers.

Slash commands where the host has them (`/specmine:scan` … in Claude Code,
`/specmine-scan` in pi); everywhere else, plain language works.

## What lands in your repo

```text
.specs/                knowledge base: ordinary markdown, one requirement per section
.specmine/scripts/     validate.mjs, check.mjs — zero-dep Node ≥20, committed for CI
.github/workflows/…    CI gate: validate + check mapping on every PR, keyless
.claude/, .pi/…        slash commands (host-specific niceties; the skill is the interface)
```

A requirement looks like:

```markdown
### FR-AUTH-003 — Reset tokens expire after 15 minutes

Reset tokens MUST expire 15 minutes after issuance and MUST be single-use.

**Confidence:** verified · **Sources:** `src/auth/tokens.ts:88 #issueResetToken`
```

Atomic, ID'd, RFC-2119 wording, every claim cited `path:line`. An uncited
claim is a rumor: `validate.mjs` proves each citation exists on disk, and the
scan's adversarial phase samples its own citations and grades them
`EXACT / APPROXIMATE / HALLUCINATION` before declaring a module done.

## The loop

1. **Scan once** (heavy, per module) → `.specs/` records what the code
   *actually does* — including the open questions nobody could answer.
2. **Develop** — a PR that changes behavior **must** change its spec in the
   same PR: edit the requirement → regenerate the index → validate must pass.
3. **Gate** — check before merging (branch, PR number, or URL); CI runs
   validate + the deterministic mapping on every PR touching code or specs.

## Why this shape

- **Scripts over prose for the deterministic parts.** An agent grading its own
  citations has a conflict of interest; `validate.mjs` doesn't. The scripts
  live in your repo at `.specmine/scripts/`, so every agent and CI run the
  exact same code, forever.
- **Judgment stays with the agent.** Whether a hunk *violates* a requirement
  is reading comprehension with repo context — the agent's job, bounded to
  just the affected docs via `index.json`.
- **`.specs/` is for humans too.** Plain markdown, stable IDs, reviewable
  diffs: the spec change is visible in the same PR as the code change.

## Refresh / update

```bash
npx skills update specmine        # pull the latest skill
node <skill-dir>/scripts/init.mjs # re-run bootstrap (idempotent; .specs/ untouched)
```

## Requirements

- Node ≥ 20 (for the scripts; no npm dependencies)
- An AI agent supporting the [Agent Skills standard](https://agentskills.io)
- git — file enumeration goes through `git ls-files`, so `.gitignore` is
  respected by definition

## License

MIT
