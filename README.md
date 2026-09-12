<div align="center">

# ⛏️ specmine

**Your AI agent is guessing your product's rules. Mine them instead.**

specmine turns an existing codebase into a citation-backed requirements
knowledge base — `.specs/` — that AI coding agents read before writing code,
and that CI checks every pull request against.

[![skills.sh](https://skills.sh/b/dspachos/specmine)](https://skills.sh/b/dspachos/specmine)
[![CI](https://img.shields.io/github/actions/workflow/status/dspachos/specmine/ci.yml?style=flat-square&label=CI)](https://github.com/dspachos/specmine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/dspachos/specmine?style=social)](https://github.com/dspachos/specmine/stargazers)

[Quick start](#-quick-start) · [Demo](#-see-it-work) · [How it works](#-how-it-works) · [FAQ](#-faq)

</div>

---

Your codebase already contains its requirements — in routing tables, validators,
calculations, and the guards around the dangerous stuff. They're just invisible
to the agent, and to the new hire, and often to you. specmine excavates them
with your AI agent, cites every claim to `path:line`, and then holds every
future PR to them.

No API keys. No model config. No npm dependencies.

## 🎬 See it work

A teammate opens a PR that quietly changes the password-reset TTL:

```text
You: check PR #214 against the specs

specmine check — base: main, changed: 3 files
  affected requirements: 2
    FR-AUTH-003  Reset tokens expire after 15 minutes   ← src/auth/tokens.ts
    FR-AUTH-005  Reset tokens are single-use            ← src/auth/tokens.ts

  ⛔ VIOLATED    FR-AUTH-003 — src/auth/tokens.ts:91 changes expiry 15m → 60m
  ✅ SATISFIED   FR-AUTH-005 — single-use check untouched
  📝 NO-SPEC     src/banner.ts — never scanned; want coverage?

  Fix the code, or update FR-AUTH-003 in the same PR if 60m is the new rule.
  report: .specs/check-report.md
```

The agent didn't guess — it read the requirement, saw the citation, and diffed
the hunk. CI runs the same mapping on every PR, keyless.

## 🚀 Quick start

```bash
cd your-repo
npx skills add dspachos/specmine
```

```text
# in your AI agent (Claude Code, Cursor, pi, Codex, OpenCode, …)
> scan this repo for specs          # ① bootstraps + excavates requirements into .specs/
> check my diff against the specs   # ② before every PR
```

### From zero to a gated repo (end to end)

**1 · Install the skill** — terminal, in your repo:

```bash
npx skills add dspachos/specmine     # pick your agent(s) when prompted
```

**2 · Bootstrap** — in the agent, once. First contact scaffolds everything:

```text
> bootstrap specmine
```

This creates `.specs/`, the in-repo scripts (`.specmine/scripts/`), the CI
workflow, and slash commands (`/specmine:scan` … after a session restart;
`/specmine-scan` in pi; plain language works everywhere). Commit it:

```bash
git add .specs .specmine .github .claude .pi && git commit -m "chore: specmine scaffolding"
```

**3 · Scan** — in the agent, heavy, once per module. It surveys the repo,
shows you the module list, excavates each module into cited requirements, and
adversarially self-checks its own citations:

```text
> /specmine:scan            # or: "scan this repo for specs"
```

Then gate the result before committing:

```bash
node .specmine/scripts/validate.mjs        # must print PASS
git add .specs && git commit -m "specs: initial scan"
```

**3½ · Reconcile (optional)** — have decision documents? ADRs, RFCs, design
docs get cross-checked against the specs once — their rationale is absorbed
into the requirement prose, decided-but-unbuilt items are recorded as
`deferred`, and every doc-vs-code conflict is brought to *you* for a ruling:

```text
> reconcile the specs against docs/adr/
```

Docs are inputs, not references — re-run this whenever a decision doc changes.

**4 · Develop against the specs** — when behavior changes, spec and code move
in the *same PR*. Describe the requirement to the agent:

```text
> new requirement: token TTL must be configurable via settings.
  Add it to the specs and implement it.
```

The agent writes the requirement doc (`FR-AUTH-006 — Token TTL is
configurable`), implements the code, and attaches the `**Sources:**`
citations. Then, in the terminal (or ask the agent to run them):

```bash
node .specmine/scripts/validate.mjs --regen-index   # rebuild index.json from the docs
node .specmine/scripts/validate.mjs                 # must print PASS
```

Open **one PR** containing both the code diff and the spec diff — that
side-by-side is what reviewers (and future agents) will read.

**5 · Check before merge** — in the agent:

```text
> check PR #214 against the specs    # a PR number, a URL, your branch, or your working tree
```

You get the verdict table (`SATISFIED` / `VIOLATED` / `STALE_SPEC` / …) in
chat and in `.specs/check-report.md`. Anything `STALE_SPEC` → update the spec
in the same PR; anything `NO-SPEC` → scan that module for coverage.

**6 · CI takes over** — from now on, every PR touching code or specs runs
`validate` + the diff→requirements mapping keylessly. Specs can't rot quietly.

## ✨ What you get

| | |
|---|---|
| 🔍 **Mined, not imagined** | Requirements extracted from what the code *actually does* — survey → per-module excavation → adversarial self-check |
| 📎 **Every claim cited** | `**Sources:** src/auth/tokens.ts:88` — and a deterministic validator proves each file/line exists |
| 📜 **Absorbs your ADRs** | Decision docs (ADRs, RFCs, design docs) enrich the specs once via *reconcile* — rationale lands in the requirement prose, conflicts come to you, specs stay self-contained |
| 🔎 **Audits the specs themselves** | Contradictions, vague/untestable requirements, duplicates, open-question triage — deterministic candidates + agent judgment, ranked report |
| 🛡️ **Hallucination checks** | The scan grades a sample of its own citations `EXACT / APPROXIMATE / HALLUCINATION` before declaring a module done |
| ⚖️ **PR verdicts** | `SATISFIED` `VIOLATED` `STALE_SPEC` `NOT_AFFECTED` `UNCLEAR` + `NO-SPEC` for uncovered files |
| 🤖 **CI gate, keyless** | Validate + diff→requirement mapping run as plain Node scripts on every PR — no LLM, no secrets |
| 🧩 **75+ agents** | Ships as an [Agent Skills](https://agentskills.io) package via [`npx skills add`](https://github.com/vercel-labs/skills) — zero-dependency Node ≥ 20 |

## 🔧 How it works

```
            ┌─────────────────┐         every PR          ┌─────────────────┐
 codebase ─▶│  agent + skill  │──.specs/──▶ CI scripts ──▶│  spec changes   │
            │  scan (once)    │   markdown + index.json   │  must ride along│
            └─────────────────┘                           └─────────────────┘
             judgment, reading              deterministic: validate, map
```

`.specs/` is ordinary markdown. One requirement per section:

```markdown
### FR-AUTH-003 — Reset tokens expire after 15 minutes

Reset tokens MUST expire 15 minutes after issuance and MUST be single-use.

**Confidence:** verified · **Sources:** `src/auth/tokens.ts:88 #issueResetToken`
```

`index.json` maps every cited file → its requirement IDs, so checking a diff
means reading *only* the affected docs — never the whole knowledge base.
Deterministic work is scripts (`.specmine/scripts/`, committed to your repo);
judgment is the agent's. [CONVENTIONS.md](skills/specmine/specs-tpl/CONVENTIONS.md)
is the full format contract.

**The loop:** ① scan once (heavy, per module) → ② a PR that changes behavior
must change its spec in the same PR → ③ check before merge; CI enforces the floor.

## 🤔 How does it compare?

| | specmine | spec-first tools ([spec-kit](https://github.com/github/spec-kit)…) | docs/README |
|---|---|---|---|
| Source of truth | the **existing** code, mined | the spec, written *before* code | whoever last edited |
| Claims | cited `path:line`, machine-validated | linked to issues | uncited |
| Enforcement | agent verdicts + keyless CI gate | ritual/process | none |
| Best at | brownfield, living repos | greenfield features | aspiration |

Greenfield projects want spec-kit; specmine is for the code you already have.
They compose well.

## ❓ FAQ

**Does specmine call an LLM?** No. The package is deterministic. All reading,
extraction, and verdict judgment happens in *your* agent, on your quota.

**Which agents work?** Any [Agent Skills](https://agentskills.io) host —
Claude Code, Cursor, pi, Codex, OpenCode, and 70+ more via `npx skills add`.

**Which languages?** Any. Citations are `path:line`; the validator is
language-agnostic. It does respect `.gitignore` (enumeration goes through
`git ls-files`).

**What does a scan cost?** The heavy part, once: an agent read-through per
module. Checks afterwards are cheap — the index bounds reading to affected docs.

**What if specs go stale?** `check` returns `STALE_SPEC` — update the spec in
the same PR. `validate` fails CI on dead citations and index drift.

**Can it use our ADRs / design docs?** Yes — one-shot, via *reconcile*. The
agent reads the doc, absorbs rationale into the requirement prose, records
decided-but-unbuilt items as `deferred`, and asks you to adjudicate every
doc-vs-code conflict. Specs stay self-contained (no permanent doc citations).
Re-run whenever a decision document changes.

**How do I know the specs themselves are any good?** `audit`: a deterministic
pass flags duplicates, requirements with no MUST, shared evidence, TODO
markers and coverage gaps; the agent then judges contradictions,
vagueness and impossible constraints, triages the open questions, and hands
you a ranked report (`🔴 conflict · 🟠 incoherent · 🟡 smell · 🔵 info`).

## 🤝 Contributing

1. Fork → branch (`feat/my-feature`)
2. `npm test` must pass (add a test for changed behavior)
3. PR with a description of the behavior change

## 📄 License

MIT © [Dimitris Spachos](https://github.com/dspachos)
