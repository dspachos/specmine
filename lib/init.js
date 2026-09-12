import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TPL = new URL("../templates/", import.meta.url);
const AGENTS_MARKER = "<!-- specmine:start -->";

const tplDir = (...parts) => fileURLToPath(new URL(parts.join("/"), TPL));

/** Recursive copy that never overwrites. Returns list of created files. */
function copyTree(src, dst, created = []) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d, created);
    else if (!fs.existsSync(d)) {
      fs.copyFileSync(s, d);
      created.push(d);
    }
  }
  return created;
}

/** Copy a file if absent; report created/skipped. */
function install(src, dst, label) {
  if (fs.existsSync(dst)) {
    console.log(`${label}: already present.`);
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`Installed: ${path.relative(process.cwd(), dst)}`);
  }
}

export async function runInit(root = ".") {
  root = path.resolve(root);

  // 1. Scaffold .specs/ (never overwrite — user edits are sacred)
  if (fs.existsSync(path.join(root, ".specs"))) {
    console.log(".specs/ already exists — keeping it as-is.");
  } else {
    const n = copyTree(tplDir("specs"), path.join(root, ".specs")).length;
    console.log(`Created .specs/ (${n} files).`);
  }

  // 2. The skill: workflows + deterministic scripts
  copyTree(tplDir("skill"), path.join(root, ".claude", "skills", "specmine"))
    .forEach(() => {});
  console.log("Skill installed: .claude/skills/specmine/ (SKILL.md + scripts/)");

  // 3. Slash commands — Claude Code namespaced (/specmine:*), pi flat (/specmine-*)
  const cmds = ["scan", "validate", "index", "check"];
  for (const c of cmds) {
    const src = tplDir("commands", "specmine", `${c}.md`);
    install(src, path.join(root, ".claude", "commands", "specmine", `${c}.md`), `command /specmine:${c}`);
    install(src, path.join(root, ".pi", "prompts", `specmine-${c}.md`), `pi prompt /specmine-${c}`);
  }

  // 4. GitHub Action gate — runs the skill's scripts directly (committed in-repo)
  install(
    tplDir("gha", "specmine.yml"),
    path.join(root, ".github", "workflows", "specmine.yml"),
    "Workflow .github/workflows/specmine.yml"
  );

  // 5. Pointer block in AGENTS.md if present
  const agentsFile = path.join(root, "AGENTS.md");
  if (fs.existsSync(agentsFile) && !fs.readFileSync(agentsFile, "utf8").includes(AGENTS_MARKER)) {
    fs.appendFileSync(
      agentsFile,
      `\n${AGENTS_MARKER}\n## specmine\n\n- \`.specs/\` holds requirements reverse-engineered from this codebase. Read \`.specs/CONVENTIONS.md\` before changing documented behavior.\n- All specmine commands are agent skills/slash commands: /specmine:scan, /specmine:check, /specmine:validate, /specmine:index (deterministic parts run the scripts in .claude/skills/specmine/scripts/).\n- A PR that changes behavior MUST change its spec in the same PR.\n<!-- specmine:end -->\n`
    );
    console.log("AGENTS.md: appended specmine pointer.");
  }

  console.log(`
Next steps:
  1. In your AI agent: /specmine:scan   (or "run specmine scan")
  2. /specmine:validate — must PASS, then commit .specs/
  3. Before a PR: /specmine:check       (accepts a PR number or URL)
`);
}
