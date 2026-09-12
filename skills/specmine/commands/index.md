---
description: Regenerate .specs/index.json from the requirement docs (deterministic script)
argument-hint: "[dir — default: repo root]"
---
Regenerate the file→requirements index, then lint:

    node .specmine/scripts/validate.mjs ${ARGUMENTS:.} --regen-index
    node .specmine/scripts/validate.mjs ${ARGUMENTS:.}

Report both outputs. Never hand-edit `index.json.fileIndex`.
