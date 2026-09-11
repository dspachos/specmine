---
name: specmine-check
description: Cross-checks pending code changes (working tree, branch, or PR) against the requirements in .specs/. Use before committing or merging, when reviewing a PR, or when asked whether changes affect documented requirements or specs.
---

# specmine check

Determine whether the current code changes conflict with documented requirements.
Verdict definitions: `.specs/CONVENTIONS.md` → "Check verdicts".

1. **Changed files**: `git diff --name-only <base>...HEAD` (ask the user for
   `<base>` if unclear; default `origin/main`). No git changes? Check the
   working tree (`git status --porcelain`).
2. **Map**: read `.specs/index.json` → `fileIndex`. Each changed file → its
   requirement IDs. Files absent from the index are `NO-SPEC`.
3. **Read only the affected requirement docs** — never the whole knowledge base.
   The index exists precisely to bound this.
4. **Judge each affected requirement** against the actual diff hunks:
   - `SATISFIED` — change is consistent with the requirement
   - `VIOLATED` — change breaks a documented MUST (show the hunk that breaks it)
   - `STALE_SPEC` — change deliberately alters documented behavior; the spec
     must be updated in the same PR (propose the spec edit)
   - `NOT_AFFECTED` — file touched, requirement untouched
5. **NO-SPEC files**: report them and name the nearest module (longest matching
   directory prefix in the index). Suggest `specmine scan <module>` — uncovered
   code is where cross-checking goes blind.
6. Write `.specs/check-report.md` (append or overwrite) and summarize in chat:
   verdict table, then recommended actions in order: fix code → update spec →
   scan uncovered module.

If an ID in the index has no doc, or citations are stale, stop and run
`npx specmine validate` — checking against a rotten index wastes everyone's trust.

Headless equivalent for CI: `npx specmine check --ai` (deterministic mapping +
LLM verdicts via an OpenAI-compatible endpoint; same report file).
