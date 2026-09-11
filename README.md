# specmine

Mine specifications and requirements out of an existing codebase into a linked
`.specs/` knowledge base — so AI agents work from what the system *actually
does*, and every PR can be cross-checked against it.

```
code ──(specmine scan, run by your agent)──▶ .specs/   ◀──(read before changes)
                                             │
 PR diff ──(specmine check)──────────────────┴──▶ SATISFIED / VIOLATED / STALE_SPEC / NO-SPEC
```

## Quickstart

```bash
npx specmine init        # scaffold .specs/ + install agent skills (.claude/skills/)
```

Then, in your AI agent (Claude Code, pi, or any SKILL.md-compatible host):

> run specmine scan

That's the heavy lift: your agent surveys the repo, excavates modules
one at a time, writes atomic requirements **every one cited to `file:line`**,
self-audits a sample of its own citations, and regenerates `.specs/index.json`.

```bash
npx specmine validate    # deterministic lint: citations, IDs, links, index sync
npx specmine check       # diff → affected requirements (no AI, no keys)
npx specmine check --ai  # + LLM verdicts, headless (CI-ready)
```

Commit `.specs/` — it's a versioned artifact. Review spec diffs in PRs like code.

## What lands in `.specs/`

```
.specs/
├── CONVENTIONS.md             # the format contract (read this first)
├── overview.md                # purpose, stack, boundaries, module map
├── requirements/
│   ├── functional/<domain>.md # FR-AUTH-003 …
│   ├── non-functional.md      # NFR-SEC-001 … (confidence: inferred)
│   ├── domain-rules.md        # BR-012 … business logic a rewrite must not lose
│   └── constraints.md         # C-001 … regulatory/contractual/technical
├── data-model.md              # entities + invariants
├── api.md                     # public contracts and side effects
├── glossary.md
└── index.json                 # generated file→requirement map (powers check)
```

Every requirement is atomic, MUST/SHOULD-worded, and cited:

```markdown
### FR-AUTH-003 — Reset tokens expire after 15 minutes

Reset tokens MUST expire within 15 minutes of issuance and MUST be single-use.

**Confidence:** verified · **Sources:** `src/auth/tokens.ts:88 #issueToken`
```

The `#symbol` anchor survives line drift; `validate` checks files and line
ranges deterministically; the scan skill's fidelity judge samples citations
semantically (`EXACT / APPROXIMATE / WRONG_LINES / WRONG_FILE / HALLUCINATION`).

## Why a skill does the scanning (and the CLI doesn't)

The CLI is deliberately dumb: scaffolding + deterministic linting, zero
dependencies, zero API keys. Context management for reading a whole codebase is
exactly what coding agents already do well — so scanning runs *in your agent*,
with your model, your tools, your subagents. The one place headless AI pays for
itself is `check --ai`: the diff plus affected requirement docs fits in a single
completion, so the PR gate runs in CI without an agent.

## AI endpoint for `check --ai` (any OpenAI-compatible API)

```bash
export AMAZEEAI_BASE_URL=https://…/v1
export AMAZEEAI_API_KEY=…
export SPECMINE_MODEL=<model-id>   # list: curl -H "Authorization: Bearer $KEY" $BASE_URL/models
# or fully generic: SPECMINE_BASE_URL / SPECMINE_API_KEY
```

Exit code 1 on any `VIOLATED` requirement — usable as a merge gate.
Report lands in `.specs/check-report.md` (consider gitignoring it).

## Other agents

Skills are plain `SKILL.md` — copy `.claude/skills/specmine-{scan,check}` into
your host's skill directory (e.g. `~/.pi/agent/skills/` for pi). File
enumeration inside the skills uses `git ls-files`, so `.gitignore` is always
respected.

## Credits & prior art

- [dds](https://github.com/lucasacoutinho/dds) — citation-first extraction and
  the adversarial fidelity-judge pattern; ours is a leaner cousin.
- [spec-gen](https://github.com/mhenke/spec-gen) — significance-scoring
  heuristics (embedded in our survey prompt, not as code).
- [spec-kit](https://github.com/github/spec-kit) — proof that versioned
  markdown specs are a workable source of truth (ours go the other direction).

Status: early. The check verdicts are advisory — treat them as a very well
read reviewer, not a compiler.
