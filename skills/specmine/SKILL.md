---
name: specmine
description: Mines specs from code into .specs/ and cross-checks changes against them. Use when asked to scan/mine specs or extract requirements (specmine scan), to check a diff/branch/PR against documented requirements (specmine check), or to validate/lint .specs/ or regenerate its index. Deterministic work runs via scripts/ — never hand-simulate it.
---

# specmine

`.specs/` is the requirements knowledge base for this repo. Read
[`.specs/CONVENTIONS.md`](../../../.specs/CONVENTIONS.md) before writing or
judging anything in it.

## Bootstrap

If `.specs/` or `.specmine/scripts/` is missing, run this skill's init script
from the repo root first (idempotent, never overwrites user edits):

```bash
node <this skill's directory>/scripts/init.mjs
```

It scaffolds `.specs/`, copies the scripts to `.specmine/scripts/` (the single
in-repo path shared by every agent and CI), installs the CI gate and optional
slash commands. If the skill was installed via `npx skills add`, the agent
knows its own directory — use that path.

## Scripts (deterministic — always run these, never re-implement)

Run from the repo root (after bootstrap):

```bash
node .specmine/scripts/validate.mjs [dir] [--regen-index]
node .specmine/scripts/check.mjs [dir] [--base <ref>|--files a,b,c]
```

- `validate.mjs` — lint: citations (file/line exist), unique IDs, cross-doc
  links, index sync. Exit 1 = fix errors before proceeding.
- `validate.mjs --regen-index` (= `/specmine:index`) — rebuild
  `index.json.fileIndex` from the docs after any `.specs/` edit. Never
  hand-edit that map.
- `check.mjs` — deterministic diff→requirements mapping: affected IDs,
  NO-SPEC files, writes `.specs/check-report.md`. Produces facts, not verdicts.

## Workflow: check (diff / branch / PR vs specs)

Trigger: "check my diff/changes against the specs", `/specmine:check`, a PR
number/URL, "does this change break any requirements".

1. Resolve the target:
   - PR number/URL → `gh pr checkout <n>` (or `git fetch origin pull/<n>/head && git checkout FETCH_HEAD`), base = the PR's base branch.
   - Current work → base default `origin/main`; no git changes → check the working tree (`git status --porcelain`) via `--files`.
2. Run `check.mjs` with the right `--base` (or `--files`).
3. Read **only** the affected requirement docs (the index exists to bound this
   — never read the whole knowledge base). If an index ID has no doc, or
   validate errors appear, stop: checking against a rotten index is worthless.
4. Judge each affected requirement against the actual diff hunks — verdicts
   defined in `.specs/CONVENTIONS.md` ("Check verdicts"):
   - `SATISFIED` — change is consistent with the requirement
   - `VIOLATED` — change breaks a documented MUST (show the hunk that breaks it)
   - `STALE_SPEC` — change deliberately alters documented behavior; propose the
     spec edit to include in the same PR
   - `NOT_AFFECTED` — file touched, requirement untouched
   - `UNCLEAR` — cannot decide from the diff; say what's missing
5. NO-SPEC files: report with the nearest module; suggest scanning it.
6. Present the verdict table in chat; append a "## Verdicts" section to
   `.specs/check-report.md`. Recommended actions in order:
   fix code → update spec (same PR) → scan uncovered module.

## Workflow: reconcile (external documents × specs)

Trigger: "reconcile specs against docs/adr/…", "cross-check our ADRs/RFCs/design
docs with the specs", or automatically offered at the end of a scan when
decision documents exist (docs/, adr/, rfcs/, design/ — ADRs, RFCs, PRDs,
decision records).

Model: documents are **inputs, not references**. Their knowledge is absorbed
into the spec prose once; specs stay self-contained and code-first afterwards.
No permanent doc citations are created.

1. Read the document (or directory). Extract its decisions/claims: rules,
   constraints, rationale, rejected alternatives, dates/status if present.
2. Match each claim to existing requirements (by topic, not ID guessing).
3. Four outcomes per claim — **conflicts always go to the user, never silently resolved**:
   - **Enrich** — doc adds rationale/constraint the spec lacks → write it into
     the requirement body as plain prose (e.g. "Rationale: 15m TTL is a
     brute-force mitigation, decided 2024-03"). The spec is now self-contained.
   - **Confirm** — doc agrees with spec → nothing to change (note confidence).
   - **Conflict** — doc says X, code/spec says Y → ASK the user which is
     authoritative. Then either update the spec (doc wins) or keep code-truth
     and note the doc is outdated (suggest updating the doc too).
   - **Gap** — doc decides something no code implements → ask the user: record
     under "## Decided, not implemented" in the relevant doc with
     `Confidence: deferred`, or skip.
4. Record the run: set `reconciled["<docPath>"] = <iso-date>` in
   `index.json` so future recons know the last-covered state. Reconcile is
   idempotent per doc — re-running after the doc changes re-checks and asks
   only about new conflicts.

Re-run whenever a decision document changes: "reconcile specs against
docs/adr/012.md".

## Workflow: audit (specs × specs coherence)

Trigger: "audit the specs", "/specmine:audit", or after a scan when the user
wants a quality pass.

1. Run `node .specmine/scripts/audit.mjs` — deterministic smells + candidates
   land in `.specs/audit-facts.json`.
2. Judge every **candidate** (DUP_BODY, SHARED_EVIDENCE): read both
   requirements. Classify: OVERLAP (merge), **CONTRADICTION** (both cannot
   hold), or DISTINCT (fine).
3. Sample `max(10, 10%)` of requirements for the judgment-only classes:
   - **INCOHERENT** — vague or untestable ("should be fast", no observable
     behavior), internally impossible (max < default), or referencing
     undefined terms
   - **CONTRADICTION** across docs (A says MUST 15m, B implies 60m) — search
     sibling docs in the same domain before concluding
4. Triage every **open question**: blocking (stops correct implementation or
   review) vs informational (documentation debt).
5. Write `.specs/audit-report.md` and present it: summary counts, then
   findings ranked 🔴 CONFLICT · 🟠 INCOHERENT · 🟡 SMELL · 🔵 INFO, each
   with requirement IDs, one-line evidence, and a suggested fix. Propose
   fixes but apply none without approval.

## Workflow: scan (extract specs from code)

You are reverse-engineering a specification out of working code. Rule zero:
**describe what the code DOES, not what it should do.** Forensic archaeologist,
not product manager.

Ground rules:
1. Enumerate files only via `git ls-files --cached --others --exclude-standard`.
   .gitignore'd paths are out of scope by definition.
2. **Cite or fail**: every behavioral claim carries `path:line` sources. An
   uncited claim is a hallucination until proven otherwise.
3. One module at a time: excavate → judge → next.
4. Read code line-by-line; comments lie, code is the only witness.
5. External decision documents (ADRs, RFCs, design docs) are handled by the
   **reconcile** workflow after excavation — never mixed into excavation
   itself. At the end of Phase 4, if decision docs exist, offer to reconcile.

Significance for survey ordering — high: `router|controller|service|schema|
validator|policy|middleware|model|migration|handler|config`; low/skip:
`test|util|mock|fixture|generated|vendor|dist` (tests: harvest `it()`/`test()`
names as requirement candidates and cite them as evidence, don't excavate
internals).

**Phase 0 — preflight.** Run the bootstrap above if needed. Read
`index.json.modules`; skip `verified` modules unless the user names them or
asks for a refresh.

**Phase 1 — survey (fast, breadth-first).** Group tracked files into modules
by directory + import clustering; detect stack, entry points, external
boundaries. Write `.specs/overview.md` (Purpose / Stack / Boundaries / Modules
/ Entry points — each module one line, cited). Mark modules `surveyed` in
`index.json.modules`. **Present the module list and confirm scope before the
heavy phase.**

**Phase 2 — excavate (one module, heavy).** Read every high/medium-significance
file. Trace 2–5 representative runtime flows first (numbered steps, citation
on every step) — requirements abstracted from a concrete trace hallucinate
less. Write to `.specs/requirements/`: functional → `functional/<domain>.md`
(`FR-<DOMAIN>-NNN`); business rules → `domain-rules.md` (`BR-NNN`);
constraints → `constraints.md` (`C-NNN`); NFRs from config/limits →
`non-functional.md` (`NFR-<CAT>-NNN`, usually `confidence: inferred`);
entities+invariants → `data-model.md`; public surfaces → `api.md`; terms →
`glossary.md`. End every requirements doc with `## Open Questions` — each
citing where you got stuck. Written-down uncertainty is checkable. Mark module
`excavated`.

**Phase 3 — fidelity self-check (adversarial).** Be a paranoid auditor grading
your own excavation; deny approval until it earns it. Sample `max(5, 10%)` of
the module's citations, weighted toward business rules. Verify each against
the cited lines (±5 context): `EXACT / APPROXIMATE / WRONG_LINES / WRONG_FILE /
HALLUCINATION / UNCITED`. Fix every WRONG_LINES/WRONG_FILE/UNCITED. Before
declaring HALLUCINATION, search the whole codebase — it may exist, just
miscited. Report an honest score (a perfect 5/5 means you didn't look hard
enough). Mark module `verified` (or `verified_with_warnings`).

**Phase 4 — assemble.** Cross-link docs (data-model entities → governing
requirements, api rows → FRs). Run `validate.mjs --regen-index`, then
`validate.mjs` — fix every error before finishing. Report: modules scanned,
requirements per doc, open questions, anything needing a human decision.

If the host supports subagents: one excavator per module (a few at a time),
and always run Phase 3 as a **fresh-context** judge — the excavator's own
context must never grade its own claims.
