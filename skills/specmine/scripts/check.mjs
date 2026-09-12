#!/usr/bin/env node
// specmine check — deterministic: map changed files to requirements via
// .specs/index.json. Produces the affected-requirements list + NO-SPEC files
// + .specs/check-report.md. The verdict layer (SATISFIED/VIOLATED/STALE_SPEC)
// is judgment — the agent does it after running this script.
// Usage: node check.mjs [dir] [--base <ref>] | [--files a,b,c]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { trackedFiles, sections, REQ_HEADING } from "./shared.mjs";

const argv = process.argv.slice(2);
const val = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flagArgs = new Set(["--base", "--files"]);
const base = val("--base");
const files = val("--files")?.split(",").filter(Boolean);
const root = path.resolve(
  argv.find((a, i) => a !== "--regen-index" && !a.startsWith("--") && !flagArgs.has(argv[i - 1])) || "."
);

function git(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
}

/** ID -> {doc, title, body} from all tracked .specs markdown. */
function requirementMap() {
  const map = new Map();
  const tracked = trackedFiles(root);
  for (const file of walk(path.join(root, ".specs"))) {
    if (tracked !== null && !tracked.has(path.relative(root, file))) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const sec of sections(text)) {
      const m = sec.heading.match(REQ_HEADING);
      if (!m) continue;
      map.set(m[1].toUpperCase(), {
        doc: path.relative(root, file),
        title: sec.heading.replace(REQ_HEADING, "").replace(/^[^A-Za-z0-9(\u201c'\u201c']+/, "").trim(),
      });
    }
  }
  return map;
}

/** Best-effort module guess for an uncovered file: longest matching dir prefix. */
function moduleGuess(index, file) {
  let best = null;
  for (const key of Object.keys(index)) {
    const dir = path.dirname(key);
    if (file.startsWith(dir + "/") && (!best || dir.length > best.length)) best = dir;
  }
  return best;
}

const indexFile = path.join(root, ".specs", "index.json");
if (!fs.existsSync(indexFile)) {
  console.error("specmine: no .specs/index.json — run `npx specmine init`, then scan.");
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(indexFile, "utf8")).fileIndex || {};
const reqs = requirementMap();

// --- changed files ---
let baseRef = "explicit --files";
if (files?.length) {
  var changed = files;
} else {
  const ref = [base, "origin/main", "main", "master"]
    .filter(Boolean)
    .find((c) => git(["rev-parse", "--verify", c]));
  if (!ref) {
    console.error("specmine: no usable base ref — pass --base <ref> or --files a,b,c");
    process.exit(1);
  }
  baseRef = ref;
  const out = git(["diff", "--name-only", `${ref}...HEAD`]);
  if (out === null) {
    console.error(`specmine: git diff ${ref}...HEAD failed — pass --files a,b,c`);
    process.exit(1);
  }
  var changed = out.split("\n").filter(Boolean);
}
if (!changed.length) {
  console.log("specmine check: no changed files. Nothing to do.");
  process.exit(0);
}

// --- map: file -> req ids ---
const affected = new Map(); // id -> [files]
const uncovered = [];
for (const f of changed) {
  const ids = index[f];
  if (ids?.length) {
    for (const id of ids) {
      if (!affected.has(id)) affected.set(id, []);
      affected.get(id).push(f);
    }
  } else {
    uncovered.push(f);
  }
}
const missingDocs = [...affected.keys()].filter((id) => !reqs.has(id));

console.log(`specmine check — base: ${baseRef}, changed: ${changed.length}`);
console.log(`  affected requirements: ${affected.size}`);
console.log(`  no spec coverage:      ${uncovered.length}`);
for (const id of affected.keys()) {
  console.log(`    ${id}  ${reqs.get(id)?.title || "(missing doc!)"}  <- ${affected.get(id).join(", ")}`);
}
for (const f of uncovered) {
  console.log(`    NO-SPEC  ${f}${moduleGuess(index, f) ? `  (near module ${moduleGuess(index, f)})` : ""}`);
}
for (const id of missingDocs) console.error(`  ERROR ${id} in index but not in any doc — run the validate script`);

const lines = [
  `# specmine check report`,
  ``,
  `- date: ${new Date().toISOString()}`,
  `- base: ${baseRef}`,
  `- changed files: ${changed.length}`,
  ``,
  `## Affected requirements`,
  ...(affected.size
    ? [...affected.entries()].map(
        ([id, fs2]) =>
          `- **${id}** ${reqs.get(id)?.title || "(missing doc)"} <- ${fs2.join(", ")}`
      )
    : ["- none"]),
  ``,
  `## No spec coverage`,
  ...(uncovered.length
    ? uncovered.map(
        (f) => `- ${f}${moduleGuess(index, f) ? ` (near module ${moduleGuess(index, f)})` : ""}`
      )
    : ["- none"]),
  ``,
];
fs.writeFileSync(path.join(root, ".specs", "check-report.md"), lines.join("\n"));
console.log(`\nreport: .specs/check-report.md`);
console.log(`next: the agent judges each affected requirement -> SATISFIED / VIOLATED / STALE_SPEC / NOT_AFFECTED`);

process.exit(missingDocs.length ? 1 : 0);
