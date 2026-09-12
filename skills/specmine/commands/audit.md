---
description: Audit the specs themselves — conflicts, incoherence, smells, open-question triage, with a report
---
Load the `specmine` skill and execute its **audit** workflow.

Run `node .specmine/scripts/audit.mjs` first (deterministic layer), then judge
the candidates and a sample, triage open questions, and present the ranked
report (🔴 CONFLICT · 🟠 INCOHERENT · 🟡 SMELL · 🔵 INFO). Write
`.specs/audit-report.md`. Propose fixes — apply nothing without my approval.
