# .specs conventions

This directory is a knowledge base of requirements **reverse-engineered from the code**.
It is committed, versioned, and read by AI agents (and humans) before changing behavior.
Rule zero: **describe what the code DOES, not what it should do** — aspirational wishes rot.

## Document map

| Path | Content |
|---|---|
| [overview.md](overview.md) | Purpose, stack, boundaries, module map, entry points |
| [requirements/functional/](requirements/functional/README.md) | One file per domain (`auth.md`, `billing.md`, …) — `FR-<DOMAIN>-NNN` |
| [requirements/non-functional.md](requirements/non-functional.md) | Security, performance, reliability, compliance — `NFR-<CAT>-NNN` (CAT e.g. SEC, PERF, REL) |
| [requirements/domain-rules.md](requirements/domain-rules.md) | Business rules: calculations, validations, workflows — `BR-NNN` |
| [requirements/constraints.md](requirements/constraints.md) | External/compliance/technical constraints — `C-NNN` |
| [data-model.md](data-model.md) | Entities, fields, invariants |
| [api.md](api.md) | Public contracts: endpoints, commands, events |
| [glossary.md](glossary.md) | Domain vocabulary |
| index.json | Generated map: file → requirement IDs, module states. Never hand-edit. |

## Requirement anatomy

```markdown
### FR-AUTH-003 — Reset tokens expire after 15 minutes

Reset tokens MUST expire within 15 minutes of issuance and MUST be single-use.

**Confidence:** verified · **Sources:** `src/auth/tokens.ts:88 #issueToken`, `src/auth/config.ts:12-14`
```

- **Atomic**: one requirement per heading. If a statement needs "and", split it.
- **Checkable wording**: MUST / MUST NOT / SHOULD (RFC 2119). No "should probably".
- **Cite or fail**: every behavioral claim has a `Sources:` line. A requirement
  without sources is a rumor; the validate script flags it.
- **Confidence:** `verified` = read directly in code; `inferred` = deduced from
  config, tests, or infrastructure (NFRs are often `inferred`).

Citation syntax: `path:line`, `path:start-end`, optional symbol anchor `path:42 #functionName`
(the anchor survives line drift; the line makes it human-navigable).

## Linking

Link between documents with relative markdown links, e.g.
`[FR-AUTH-003](requirements/functional/auth.md#fr-auth-003--reset-tokens-expire-after-15-minutes)`.
`validate` checks these resolve.

## Open Questions

Every requirements doc ends with an `## Open Questions` section for behavior you
could not fully resolve — each entry cites where you got stuck:

```markdown
## Open Questions
- What happens when the webhook retries after partial success? (`src/billing/webhook.ts:57` — dispatch is fire-and-forget, no retry state found)
```

Uncertainty that is written down is checkable; uncertainty that is guessed is a bug.

## index.json (generated — do not hand-edit)

```json
{
  "version": 1,
  "generated": "<iso>",
  "by": "specmine scan",
  "fileIndex": { "src/auth/tokens.ts": ["FR-AUTH-003", "BR-012"] },
  "modules": { "auth": { "status": "verified", "lastScan": "<iso>" } }
}
```

`fileIndex` powers the PR cross-check (`specmine check`): changed file → affected
requirement IDs, without reading the whole knowledge base. Regenerate it after
any spec edit (the scan skill does this automatically; `validate` verifies sync).

## Check verdicts (used by `specmine check` and the check skill)

| Verdict | Meaning |
|---|---|
| `SATISFIED` | Change is consistent with the requirement |
| `VIOLATED` | Change breaks a documented MUST |
| `STALE_SPEC` | Change deliberately alters documented behavior — update the spec in the same PR |
| `NOT_AFFECTED` | Touched file, but not this requirement's behavior |
| `NO-SPEC` | Changed file has no requirements at all → scan that module |

## External documents (ADRs, RFCs, design docs)

Documents are **inputs, not references**. Knowledge from decision documents is
absorbed into requirement prose once, via the reconcile workflow — with
conflicts adjudicated by the user at that moment. Requirements do not carry
permanent document citations; they stay self-contained and code-first.
Re-run reconcile whenever a decision document changes.
