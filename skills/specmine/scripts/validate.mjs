#!/usr/bin/env node
// specmine validate — deterministic lint of .specs/: citation file/line
// existence, unique IDs, cross-doc links, index.json sync.
// Usage: node validate.mjs [dir] [--regen-index]
// Exit 0 = PASS, 1 = errors. With --regen-index, rewrites index.json.fileIndex
// from the docs (only valid citations enter it) before checking sync.
import fs from "node:fs";
import path from "node:path";
import { trackedFiles, sections, REQ_HEADING } from "./shared.mjs";

const args = process.argv.slice(2);
const regen = args.includes("--regen-index");
const root = path.resolve(args.find((a) => !a.startsWith("--")) || ".");

const LOOKS_LIKE_REQ = /^(?:FR|NFR|BR|C)-/i;
const SOURCES_LINE = /\*\*Sources?:?\*\*:?\s*([^\n]+)/i; // may sit mid-line after **Confidence:**
const BRACKET_CITATION = /\[([^\[\]]+?):(\d+)(?:-(\d+))?\](?!\()/g;
const MD_LINK = /\[[^\]]*\]\(([^)\s]+)(#[^)\s]*)?\)/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function parseCitation(part) {
  const clean = part.replace(/[`*]/g, "").trim();
  const m = clean.match(/^(.+?):(\d+)(?:-(\d+))?(?:\s+#(\S+))?$/);
  if (!m) return null;
  return { file: m[1].replace(/^\.\//, ""), start: +m[2], end: +(m[3] || m[2]) };
}

function slug(h) {
  return h.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

const specsDir = path.join(root, ".specs");
if (!fs.existsSync(specsDir)) {
  console.error("specmine: no .specs/ here — run `npx specmine init` first.");
  process.exit(1);
}

const errors = [];
const warnings = [];
const ids = new Map(); // id -> [docPath]
const rebuilt = new Map(); // file -> Set(id) — what index.json should say
const lineCounts = new Map();
const stats = { docs: 0, requirements: 0, citations: 0, links: 0 };

const lineCount = (abs) => {
  if (!lineCounts.has(abs)) {
    lineCounts.set(abs, fs.readFileSync(abs, "utf8").split("\n").length);
  }
  return lineCounts.get(abs);
};

const checkCitation = (c, where, id) => {
  if (!c) {
    warnings.push(`${where}: unparseable citation part`);
    return;
  }
  stats.citations++;
  const abs = path.join(root, c.file);
  if (!fs.existsSync(abs)) {
    errors.push(`${where}: WRONG_FILE — ${c.file}:${c.start} (file not found)`);
    return;
  }
  if (c.end > lineCount(abs)) {
    errors.push(`${where}: WRONG_LINES — ${c.file}:${c.start}-${c.end} exceeds ${lineCount(abs)} lines`);
    return;
  }
  if (id) {
    if (!rebuilt.has(c.file)) rebuilt.set(c.file, new Set());
    rebuilt.get(c.file).add(id);
  }
};

const tracked = trackedFiles(root); // null outside git — then we lint everything
const mdFiles = walk(specsDir).filter(
  (f) =>
    f.endsWith(".md") &&
    (tracked === null || tracked.has(path.relative(root, f)))
);
stats.docs = mdFiles.length;

for (const file of mdFiles) {
  const raw = fs.readFileSync(file, "utf8");
  // Two views: citations live in prose (backticked paths are REAL citations),
  // while example links live in fences/comments/inline-code and must not lint.
  const noFence = raw
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const noCode = noFence.replace(/`[^`\n]*`/g, "");
  const text = noFence;
  const rel = path.relative(root, file);

  for (const sec of sections(text)) {
    const idMatch = sec.heading.match(REQ_HEADING);
    if (!idMatch) {
      if (LOOKS_LIKE_REQ.test(sec.heading)) {
        errors.push(`${rel}: malformed requirement ID in "${sec.heading}"`);
      }
      continue;
    }
    stats.requirements++;
    const id = idMatch[1].toUpperCase();
    if (!ids.has(id)) ids.set(id, []);
    ids.get(id).push(rel);

    const src = sec.body.match(SOURCES_LINE);
    if (!src) {
      warnings.push(`${rel}: ${id} has no **Sources:** line (uncited)`);
    } else {
      for (const part of src[1].split(/[,;·]/)) {
        checkCitation(parseCitation(part), `${rel} ${id}`, id);
      }
    }
    for (const m of sec.body.matchAll(BRACKET_CITATION)) {
      checkCitation(
        parseCitation(`${m[1]}:${m[2]}${m[3] ? `-${m[3]}` : ""}`),
        `${rel} ${id}`,
        id
      );
    }
  }

  // Cross-doc markdown links (code view — ignore examples)
  for (const m of noCode.matchAll(MD_LINK)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    stats.links++;
    const abs = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(abs)) {
      errors.push(`${rel}: BROKEN_LINK — [${target}]`);
      continue;
    }
    if (m[2] && target.startsWith(".specs/")) {
      const headings = new Set(
        fs
          .readFileSync(abs, "utf8")
          .split("\n")
          .filter((l) => /^#{1,4}\s/.test(l))
          .map((l) => slug(l.replace(/^#+\s*/, "")))
      );
      const anchor = m[2].slice(1).toLowerCase();
      if (!headings.has(anchor) && !headings.has(decodeURIComponent(anchor))) {
        warnings.push(`${rel}: BROKEN_ANCHOR — [${target}${m[2]}]`);
      }
    }
  }
}

for (const [id, docs] of ids) {
  if (docs.length > 1) errors.push(`duplicate ID ${id} in ${docs.join(", ")}`);
}

// index.json: regenerate on demand, then check sync
const indexFile = path.join(specsDir, "index.json");
if (regen) {
  const prev = fs.existsSync(indexFile)
    ? (() => {
        try {
          return JSON.parse(fs.readFileSync(indexFile, "utf8"));
        } catch {
          return {};
        }
      })()
    : {};
  const fileIndex = Object.fromEntries(
    [...rebuilt.entries()].sort().map(([f, is]) => [f, [...is].sort()])
  );
  fs.writeFileSync(
    indexFile,
    JSON.stringify(
      {
        version: 1,
        generated: new Date().toISOString(),
        by: "specmine index",
        fileIndex,
        modules: prev.modules ?? {},
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    `specmine index: regenerated — ${Object.keys(fileIndex).length} files, ` +
      `${Object.values(fileIndex).reduce((n, v) => n + v.length, 0)} requirement links`
  );
}
if (!fs.existsSync(indexFile)) {
  errors.push(".specs/index.json missing — run `npx specmine init`");
} else {
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  } catch {
    errors.push(".specs/index.json is not valid JSON");
  }
  if (index) {
    const stored = new Map(Object.entries(index.fileIndex || {}));
    const allFiles = new Set([...stored.keys(), ...rebuilt.keys()]);
    for (const f of allFiles) {
      const have = new Set(stored.get(f) || []);
      const want = rebuilt.get(f) || new Set();
      const missing = [...want].filter((id) => !have.has(id));
      const stale = [...have].filter((id) => !want.has(id));
      if (missing.length) errors.push(`index.json: missing ${f} -> ${missing.join(", ")}`);
      if (stale.length) errors.push(`index.json: stale ${f} -> ${stale.join(", ")}`);
    }
  }
}

console.log(
  `specmine validate: ${stats.docs} docs, ${stats.requirements} requirements, ` +
    `${stats.citations} citations, ${stats.links} links — ` +
    `${errors.length} errors, ${warnings.length} warnings`
);
for (const e of errors) console.error(`  ERROR ${e}`);
for (const w of warnings.slice(0, 20)) console.warn(`  warn  ${w}`);
if (warnings.length > 20) console.warn(`  ... and ${warnings.length - 20} more warnings`);
if (!errors.length) console.log("PASS");
process.exit(errors.length ? 1 : 0);
