import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sections, REQ_HEADING } from "./validate.js";
import { chatJson } from "./llm.js";
import { trackedFiles } from "./fsutil.js";

const VERDICTS = ["SATISFIED", "VIOLATED", "STALE_SPEC", "NOT_AFFECTED", "UNCLEAR"];
const CHECK_PROMPT = fileURLToPath(new URL("../templates/prompts/check-ai.md", import.meta.url));

function git(root, args) {
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
function requirementMap(root) {
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
        title: sec.heading.replace(REQ_HEADING, "").replace(/^[—–:\-]\s*/, "").trim(),
        body: sec.body.replace(/\*\*Sources?\*\*:?.*$/im, "").trim().slice(0, 700),
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

export async function runCheck(root = ".", { base, files, ai } = {}) {
  root = path.resolve(root);
  const indexFile = path.join(root, ".specs", "index.json");
  if (!fs.existsSync(indexFile)) {
    console.error("specmine: no .specs/index.json — run `npx specmine init`, then the scan skill.");
    process.exitCode = 1;
    return;
  }
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8")).fileIndex || {};
  const reqs = requirementMap(root);

  // --- changed files ---
  let baseRef = "explicit --files";
  let hunkText = null;
  if (files?.length) {
    var changed = files;
  } else {
    const candidates = [base, "origin/main", "main", "master"].filter(Boolean);
    const ref = candidates.find((c) => git(root, ["rev-parse", "--verify", c]));
    if (!ref) {
      console.error("specmine: no usable base ref — pass --base <ref> or --files a,b,c");
      process.exitCode = 1;
      return;
    }
    baseRef = ref;
    const out = git(root, ["diff", "--name-only", `${ref}...HEAD`]);
    if (out === null) {
      console.error(`specmine: git diff ${ref}...HEAD failed — pass --files a,b,c`);
      process.exitCode = 1;
      return;
    }
    var changed = out.split("\n").filter(Boolean);
  }
  if (!changed.length) {
    console.log("specmine check: no changed files. Nothing to do.");
    return 0;
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
    console.log(`    ${id}  ${reqs.get(id)?.title || "(missing doc!)"}  ← ${affected.get(id).join(", ")}`);
  }
  for (const f of uncovered) {
    console.log(`    NO-SPEC  ${f}${moduleGuess(index, f) ? `  (near module ${moduleGuess(index, f)})` : ""}`);
  }
  for (const id of missingDocs) console.error(`  ERROR ${id} in index but not in any doc — run validate`);

  // --- optional AI verdicts ---
  let verdicts = [];
  if (ai) {
    if (baseRef === "explicit --files") {
      console.error("specmine: --ai needs git hunks — use --base instead of --files");
      process.exitCode = 1;
      return;
    }
    const diff = git(root, ["diff", `${baseRef}...HEAD`, "--", ...changed]) || "";
    hunkText = diff.slice(0, 64_000);
    const prompt = fs
      .readFileSync(CHECK_PROMPT, "utf8")
      .replace("{{FILES}}", changed.join("\n"))
      .replace("{{DIFF}}", hunkText || "(diff unavailable)");
    const ids = [...affected.keys()].filter((id) => reqs.has(id));
    for (let i = 0; i < ids.length; i += 12) {
      const batch = ids.slice(i, i + 12);
      const reqText = batch
        .map((id) => `### ${id} — ${reqs.get(id).title}\n${reqs.get(id).body}\n(touched by: ${affected.get(id).join(", ")})`)
        .join("\n\n");
      process.stderr.write(`specmine: judging ${batch.length} requirements…\n`);
      const out = await chatJson([{ role: "user", content: prompt.replace("{{REQUIREMENTS}}", reqText) }]);
      verdicts.push(...(out.verdicts || []));
    }
    for (const v of verdicts) {
      const tag = VERDICTS.includes(v.verdict) ? v.verdict : "UNCLEAR";
      v.verdict = tag;
      console.log(`  [${tag}] ${v.id}: ${v.evidence || ""}${v.action ? ` → ${v.action}` : ""}`);
    }
  }

  // --- report ---
  const lines = [
    `# specmine check report`,
    ``,
    `- date: ${new Date().toISOString()}`,
    `- base: ${baseRef}`,
    `- changed files: ${changed.length}`,
    ``,
    `## Affected requirements`,
    ...(affected.size
      ? [...affected.entries()].map(([id, fs2]) => {
          const v = verdicts.find((x) => x.id === id);
          return `- **${id}** ${reqs.get(id)?.title || "(missing doc)"} ← ${fs2.join(", ")}` +
            (v ? `\n  - verdict: **${v.verdict}** — ${v.evidence || ""}${v.action ? ` (action: ${v.action})` : ""}` : "");
        })
      : ["- none"]),
    ``,
    `## No spec coverage`,
    ...(uncovered.length
      ? uncovered.map((f) => `- ${f}${moduleGuess(index, f) ? ` (near module ${moduleGuess(index, f)})` : ""}`)
      : ["- none"]),
    ``,
  ];
  if (verdicts.length) {
    lines.push(
      `## Actions`,
      ...verdicts
        .filter((v) => v.verdict === "VIOLATED" || v.verdict === "STALE_SPEC")
        .map((v) => `- ${v.id}: ${v.action || v.evidence || v.verdict}`),
      ``
    );
  }
  fs.writeFileSync(path.join(root, ".specs", "check-report.md"), lines.join("\n"));
  console.log(`\nreport: .specs/check-report.md`);

  const violations = verdicts.filter((v) => v.verdict === "VIOLATED").length;
  if (violations) {
    console.error(`specmine check: ${violations} VIOLATED requirement(s).`);
    process.exitCode = 1;
  }
  return violations ? 1 : 0;
}
