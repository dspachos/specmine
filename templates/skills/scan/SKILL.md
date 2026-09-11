---
name: specmine-scan
description: Extracts specifications and requirements from this codebase into the .specs/ knowledge base. Use when asked to scan or mine specs, extract requirements, build or refresh .specs/, or when specmine check reports NO-SPEC for a module.
---

# specmine scan

You are reverse-engineering a specification out of working code. The output is
`.specs/` — read [`.specs/CONVENTIONS.md`](../../../.specs/CONVENTIONS.md) first
and follow it exactly. Rule zero: **describe what the code DOES, not what it
should do.** You are a forensic archaeologist, not a product manager.

## Ground rules

1. **Enumerate files only via git**: `git ls-files --cached --others --exclude-standard`.
   Never raw `ls`/glob walks — .gitignore'd paths (deps, build output) are out of scope by definition.
2. **Cite or fail**: every behavioral claim carries `path:line` sources. An
   uncited claim is a hallucination until proven otherwise.
3. **One module at a time.** Finish a module (excavate → judge) before starting the next.
4. Read files line-by-line. Never infer behavior from file names or comments alone —
   comments lie; code is the only witness.

## Significance heuristics (survey ordering)

High value: `router|controller|service|schema|validator|policy|middleware|model|migration|handler|config`.
Low/skip: `test|util|mock|fixture|generated|vendor|dist|types` (read selectively, don't excavate).
Files with many importers are integration points — always read those.
**Tests are executable requirements**: harvest `it()`/`test()`/`describe` names as
requirement candidates and cite tests as evidence, but don't excavate test internals line-by-line.

## Phase 0 — preflight

- `.specs/` missing? Tell the user to run `npx specmine init` and stop.
- Read `.specs/index.json`. Respect `modules[].status` — skip `verified` modules
  unless the user names them or asks for a refresh.
- Scope: a module name given by the user, or all `surveyed`/absent modules.

## Phase 1 — survey (fast, breadth-first)

1. Enumerate tracked files (see ground rule 1). Group into modules by directory
   structure and import clustering.
2. Detect: stack (languages, frameworks), entry points (route registration, CLI
   definitions, queue consumers, cron), external boundaries.
3. Write `.specs/overview.md` (Purpose / Stack / Boundaries / Modules / Entry
   points — each module one line with a source citation).
4. Update `index.json.modules` → `status: surveyed`. Present the module list
   with file counts and confirm scope before the heavy phase.

## Phase 2 — excavate (one module, heavy)

1. Read every high/medium-significance file in the module.
2. **Trace 2–5 representative runtime flows** first, numbered steps, citation on
   every step (request → validate → compute → persist → emit). Requirements
   abstracted from a concrete trace hallucinate less.
3. Write requirements into `.specs/requirements/`:
   - functional → `functional/<domain>.md` (`FR-<DOMAIN>-NNN`)
   - business rules (calculations, validations, authz) → `domain-rules.md` (`BR-NNN`)
   - constraints (compliance, environment) → `constraints.md` (`C-NNN`)
   - NFRs found in config/limits → `non-functional.md` (`NFR-<CAT>-NNN`, usually `confidence: inferred`)
   - entities + invariants → `data-model.md`; public surfaces → `api.md`; terms → `glossary.md`
4. End every requirements doc with `## Open Questions` — unresolved behavior,
   each citing where you got stuck. Written-down uncertainty is checkable; guessed uncertainty is a bug.
5. Update `index.json.modules[name]` → `status: excavated`.

## Phase 3 — fidelity self-check (adversarial)

Be a paranoid auditor grading your own excavation. The excavation wants approval; deny it until it earns it.

1. Sample `max(5, 10%)` of the module's citations, weighted toward business rules.
2. Verify each against the actual file at the cited lines (±5 context). Verdicts:
   `EXACT / APPROXIMATE / WRONG_LINES / WRONG_FILE / HALLUCINATION / UNCITED`.
3. Fix every `WRONG_LINES`, `WRONG_FILE`, `UNCITED` — re-cite or delete the claim.
4. Before declaring `HALLUCINATION`, search the whole codebase for the claim —
   it may exist, just miscited.
5. Report an honest score; a perfect 5/5 means you didn't look hard enough.
6. `index.json.modules[name]` → `status: verified` (or `verified_with_warnings`).

## Phase 4 — assemble

1. Rebuild `index.json.fileIndex`: for every requirement, map each cited source
   file → its requirement IDs. Never hand-maintain this.
2. Cross-link docs (data-model entities → governing requirements, api rows → FRs).
3. Run `npx specmine validate`. Fix every error (wrong citations, duplicate IDs,
   broken links, index drift) before finishing.
4. Report to the user: modules scanned, requirements per doc, open questions,
   and anything that needs a human decision.

## Parallelism

If the host supports subagents: one excavator subagent per module (a few at a
time), and always run Phase 3 as a **fresh-context** judge — never let the
excavator's own context grade its own claims.
