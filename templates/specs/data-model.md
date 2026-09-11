# Data model

<!-- Entities, fields, relationships, and — most valuable — invariants
(e.g. "an invoice line's total MUST equal qty × unit price").
Link each entity to the requirements that govern it.

## Example entity format

## User

| Field | Type | Notes | Evidence |
|---|---|---|---|
| email | string | unique, lowercase-normalized | `src/db/schema.sql:12` |

Invariants:
- Email MUST be unique across accounts. (`src/db/schema.sql:14`, `src/users/create.ts:31`)

Governing requirements: [FR-AUTH-002](requirements/functional/auth.md)
-->

_None extracted yet._
