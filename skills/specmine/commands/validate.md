---
description: Lint .specs/ — citations, IDs, links, index sync (deterministic script)
argument-hint: "[dir — default: repo root]"
---
Run the deterministic validator and report the result verbatim:

    node .specmine/scripts/validate.mjs ${ARGUMENTS:.}

If there are errors, list each with a one-line explanation of the fix. Do not edit `.specs/` without my approval.
