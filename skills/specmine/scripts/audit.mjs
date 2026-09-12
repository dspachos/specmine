#!/usr/bin/env node
// specmine audit — deterministic layer of the specs×specs coherence audit.
// Finds structural smells and *candidates* (pairs/flags) for the agent's
// judgment layer. Writes .specs/audit-facts.json; exit 0 (it's a report,
// not a gate). The agent workflow then judges and writes audit-report.md.
// Usage: node audit.mjs [dir]
import fs from "node:fs";
import path from "node:path";
import { trackedFiles, sections, REQ_HEADING } from "./shared.mjs";

const root = path.resolve(process.argv[2] || ".");
const specsDir = path.join(root, ".specs");
if (!fs.existsSync(specsDir)) {
  console.error("specmine: no .specs/ here — bootstrap the skill first.");
  process.exit(1);
}

const RFC2119 = /\b(must( not)?|shall( not)?|should( not)?|may)\b/i;
const MARKERS = /\b(TODO|TBD|FIXME|XXX)\b/;
const SOURCES_LINE = /\*\*Sources?:?\*\*:?\s*([^\n]+)/i;
const CONFIDENCE = /\*\*Confidence:?\*\*:?\s*(verified|inferred|deferred)/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".md") && path.basename(p) !== "check-report.md" && path.basename(p) !== "audit-report.md")
      out.push(p);
  }
  return out;
}
const norm = (s) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));
const jaccard = (a, b) => {
  const A = norm(a), B = norm(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
};

const findings = [];
const reqs = []; // {id, doc, heading, body, sources}
const openQuestions = [];

const tracked = trackedFiles(root);
for (const file of walk(specsDir)) {
  if (tracked !== null && !tracked.has(path.relative(root, file))) continue;
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8").replace(/^```[\s\S]*?^```/gm, "");
  for (const sec of sections(text)) {
    const m = sec.heading.match(REQ_HEADING);
    if (!m) continue;
    const id = m[1].toUpperCase();
    const sources = sec.body.match(SOURCES_LINE)?.[1] || "";
    reqs.push({ id, doc: rel, heading: sec.heading, body: sec.body.trim(), sources });
    if (!RFC2119.test(sec.body))
      findings.push({ severity: "SMELL", kind: "NORMATIVE", ids: [id], detail: "no RFC 2119 verb (MUST/SHOULD/MAY) — unverifiable as written" });
    if (!sources)
      findings.push({ severity: "SMELL", kind: "UNCITED", ids: [id], detail: "no Sources line" });
    if (MARKERS.test(sec.body))
      findings.push({ severity: "SMELL", kind: "MARKER", ids: [id], detail: `contains ${sec.body.match(MARKERS)[0]}` });
  }
  const oq = text.match(/## Open Questions([\s\S]*?)(?=\n## |\n$|$)/);
  const items = (oq?.[1] || "").split("\n").filter((l) => l.trim().startsWith("- ")).length;
  if (items) openQuestions.push({ doc: rel, count: items });
}

// candidate: near-duplicate bodies (same requirement, two IDs)
for (let i = 0; i < reqs.length; i++)
  for (let j = i + 1; j < reqs.length; j++)
    if (jaccard(reqs[i].body, reqs[j].body) >= 0.75)
      findings.push({
        severity: "CANDIDATE",
        kind: "DUP_BODY",
        ids: [reqs[i].id, reqs[j].id],
        detail: `near-duplicate requirements (${reqs[i].doc} / ${reqs[j].doc}) — merge or differentiate`,
      });

// candidate: identical evidence (same file+lines) — overlap or conflict fingerprint
const byEvidence = new Map();
for (const r of reqs)
  for (const part of r.sources.split(/[,;·]/)) {
    const key = part.replace(/[`*]/g, "").trim();
    if (!key) continue;
    if (!byEvidence.has(key)) byEvidence.set(key, []);
    byEvidence.get(key).push(r.id);
  }
for (const [ev, ids] of byEvidence)
  if (ids.length > 1)
    findings.push({
      severity: "CANDIDATE",
      kind: "SHARED_EVIDENCE",
      ids: [...new Set(ids)],
      detail: `all cite \`${ev}\` — verify they state compatible claims`,
    });

// coverage + confidence hotspots
const index = fs.existsSync(path.join(specsDir, "index.json"))
  ? JSON.parse(fs.readFileSync(path.join(specsDir, "index.json"), "utf8"))
  : {};
for (const [mod, st] of Object.entries(index.modules || {}))
  if (st.status !== "verified")
    findings.push({ severity: "INFO", kind: "COVERAGE", ids: [], detail: `module "${mod}" is ${st.status}` });
const inferred = reqs.filter((r) => /inferred/i.test(r.body));
if (reqs.length && inferred.length / reqs.length > 0.5)
  findings.push({
    severity: "INFO",
    kind: "INFERRED_HOTSPOT",
    ids: inferred.map((r) => r.id),
    detail: `${inferred.length}/${reqs.length} requirements are confidence: inferred`,
  });

fs.writeFileSync(
  path.join(specsDir, "audit-facts.json"),
  JSON.stringify({ generated: new Date().toISOString(), requirements: reqs.length, findings, openQuestions }, null, 2) + "\n"
);

const order = { CANDIDATE: 0, SMELL: 1, INFO: 2 };
const sorted = findings.sort((a, b) => order[a.severity] - order[b.severity]);
console.log(
  `specmine audit (deterministic layer): ${reqs.length} requirements — ` +
    `${sorted.filter((f) => f.severity === "CANDIDATE").length} candidates, ` +
    `${sorted.filter((f) => f.severity === "SMELL").length} smells, ` +
    `${sorted.filter((f) => f.severity === "INFO").length} info`
);
for (const f of sorted)
  console.log(`  ${f.severity === "CANDIDATE" ? "?" : f.severity === "SMELL" ? "!" : "-"} [${f.kind}] ${f.ids.join(", ") || "—"}: ${f.detail}`);
for (const oq of openQuestions)
  console.log(`  ? [OPEN_QUESTIONS] ${oq.doc}: ${oq.count} unresolved — triage needed`);
console.log(`facts: .specs/audit-facts.json`);
console.log(`next: the agent judges candidates (contradiction/overlap/vagueness) -> .specs/audit-report.md`);
