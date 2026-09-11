import fs from "node:fs";
import path from "node:path";

const TPL = new URL("../templates/", import.meta.url);
const AGENTS_MARKER = "<!-- specmine:start -->";

function tplDir(...parts) {
  return fileURLToPath(new URL(parts.join("/"), TPL));
}
import { fileURLToPath } from "node:url";

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

export async function runInit(root = ".") {
  root = path.resolve(root);

  // 1. Scaffold .specs/ (never overwrite — user edits are sacred)
  const specsDir = path.join(root, ".specs");
  if (fs.existsSync(specsDir)) {
    console.log(".specs/ already exists — keeping it as-is.");
  }
  const createdSpecs = fs.existsSync(specsDir)
    ? []
    : copyTree(tplDir("specs"), specsDir);
  if (createdSpecs.length) console.log(`Created .specs/ (${createdSpecs.length} files).`);

  // 2. Install agent skills (SKILL.md format — Claude Code, pi, and compatible)
  const skills = ["scan", "check"];
  const claudeSkills = path.join(root, ".claude", "skills");
  for (const s of skills) {
    const src = tplDir("skills", s, "SKILL.md");
    const dst = path.join(claudeSkills, `specmine-${s}`, "SKILL.md");
    if (fs.existsSync(dst)) {
      console.log(`Skill specmine-${s}: already installed.`);
    } else {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`Skill installed: ${path.relative(root, dst)}`);
    }
  }

  // 3. Pointer block in AGENTS.md if present
  const agentsFile = path.join(root, "AGENTS.md");
  if (fs.existsSync(agentsFile) && !fs.readFileSync(agentsFile, "utf8").includes(AGENTS_MARKER)) {
    fs.appendFileSync(
      agentsFile,
      `\n${AGENTS_MARKER}\n## specmine\n\n- \`.specs/\` holds requirements reverse-engineered from this codebase. Read \`.specs/CONVENTIONS.md\` before changing documented behavior.\n- Scan: use the \`specmine-scan\` skill (installed under \`.claude/skills/\`).\n- Before a PR: use the \`specmine-check\` skill or run \`npx specmine check --ai\`.\n- Lint specs after any \`.specs/\` edit: \`npx specmine validate\`.\n<!-- specmine:end -->\n`
    );
    console.log("AGENTS.md: appended specmine pointer.");
  }

  console.log(`
Next steps:
  1. In your AI agent: "run specmine scan"  (uses the installed skill)
  2. Lint the result:        npx specmine validate
  3. On a branch/PR:         npx specmine check --ai   (optional, needs endpoint env)
Other agents: copy .claude/skills/specmine-{scan,check} into your agent's skill
directory (e.g. ~/.pi/agent/skills/ for pi, .cursor/rules for Cursor).
`);
}
