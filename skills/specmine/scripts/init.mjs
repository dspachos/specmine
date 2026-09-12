#!/usr/bin/env node
// specmine init — bootstraps THIS repo (cwd) for specmine.
// Run from the repo root by the agent on first contact:
//   node <skill-dir>/scripts/init.mjs
// Idempotent: .specs/ and user-editable files are never overwritten;
// .specmine/scripts/ is refreshed (it's generated tooling, committed for CI).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url))); // skills/specmine/
const root = process.cwd();
const AGENTS_MARKER = "<!-- specmine:start -->";

function copyTree(src, dst, { overwrite = false } = {}) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d, { overwrite });
    else if (overwrite || !fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}

function install(src, dst, label) {
  if (fs.existsSync(dst)) return console.log(`${label}: already present.`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`Installed: ${path.relative(root, dst)}`);
}

// 1. .specs/ knowledge base skeleton (user edits — never overwrite)
if (fs.existsSync(path.join(root, ".specs"))) {
  console.log(".specs/ already exists — keeping it as-is.");
} else {
  copyTree(path.join(SKILL_DIR, "specs-tpl"), path.join(root, ".specs"));
  console.log("Created .specs/ (knowledge base skeleton + CONVENTIONS.md).");
}

// 2. In-repo scripts — the one shared path for every agent AND CI
copyTree(path.join(SKILL_DIR, "scripts"), path.join(root, ".specmine", "scripts"), {
  overwrite: true,
});
console.log("Scripts: .specmine/scripts/ (validate.mjs, check.mjs, shared.mjs) — commit these; CI runs them.");

// 3. CI gate
install(
  path.join(SKILL_DIR, "gha-specmine.yml"),
  path.join(root, ".github", "workflows", "specmine.yml"),
  "Workflow .github/workflows/specmine.yml"
);

// 4. Slash commands — host-specific niceties (the skill itself is the portable interface)
for (const c of ["scan", "validate", "index", "check"]) {
  const src = path.join(SKILL_DIR, "commands", `${c}.md`);
  install(src, path.join(root, ".claude", "commands", "specmine", `${c}.md`), `command /specmine:${c}`);
  install(src, path.join(root, ".pi", "prompts", `specmine-${c}.md`), `pi prompt /specmine-${c}`);
}

// 5. AGENTS.md pointer
const agentsFile = path.join(root, "AGENTS.md");
if (fs.existsSync(agentsFile) && !fs.readFileSync(agentsFile, "utf8").includes(AGENTS_MARKER)) {
  fs.appendFileSync(
    agentsFile,
    `\n${AGENTS_MARKER}\n## specmine\n\n- \`.specs/\` holds requirements reverse-engineered from this codebase. Read \`.specs/CONVENTIONS.md\` before changing documented behavior.\n- Deterministic tooling lives in \`.specmine/scripts/\` (validate / check). A PR that changes behavior MUST change its spec in the same PR.\n- Refresh scaffolding: \`node <skill-dir>/scripts/init.mjs\` (idempotent).\n<!-- specmine:end -->\n`
  );
  console.log("AGENTS.md: appended specmine pointer.");
}

console.log(`
Done. Next:
  1. "scan this repo for specs" (specmine scan workflow) — then commit .specs/
  2. .specmine/scripts/validate.mjs must PASS before committing specs
  3. Before any PR: "check my changes against the specs"
`);
