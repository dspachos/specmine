---
description: Cross-check external decision documents (ADRs/RFCs/design docs) against .specs/ — absorb, flag conflicts, ask
argument-hint: "<doc path or docs/ directory — default: detect decision docs>"
---
Load the `specmine` skill (.claude/skills/specmine/SKILL.md or wherever installed) and execute its **reconcile** workflow.

Target: ${ARGUMENTS:-auto-detect decision documents (docs/, adr/, rfcs/, design/) not yet reconciled}

Documents are inputs, not references: absorb their knowledge into the spec
prose, bring every conflict to me for adjudication, and record the run in
index.json (`reconciled`).
