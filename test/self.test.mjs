import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runInit } from "../lib/init.js";

const PKG = path.resolve(import.meta.dirname, "..");
const SCRIPTS = path.join(PKG, "templates", "skill", "scripts");
const run = (script, args, cwd) =>
  spawnSync("node", [path.join(SCRIPTS, script), ...args], { cwd, encoding: "utf8" });

function tmp() {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "specmine-"));
  return dir;
}
import { execSync } from "node:child_process";

function reset() {
  process.exitCode = 0;
  const orig = { log: console.log, err: console.error, warn: console.warn };
  console.log = console.error = console.warn = () => {};
  return () => {
    console.log = orig.log;
    console.error = orig.err;
    console.warn = orig.warn;
  };
}

test("init scaffolds .specs/, skill+scripts, slash commands, pi prompts, workflow", async () => {
  const dir = tmp();
  const un = reset();
  await runInit(dir);
  un();
  for (const f of [
    ".specs/CONVENTIONS.md",
    ".specs/index.json",
    ".claude/skills/specmine/SKILL.md",
    ".claude/skills/specmine/scripts/validate.mjs",
    ".claude/skills/specmine/scripts/check.mjs",
    ".claude/skills/specmine/scripts/shared.mjs",
    ".claude/commands/specmine/scan.md",
    ".claude/commands/specmine/index.md",
    ".claude/commands/specmine/validate.md",
    ".claude/commands/specmine/check.md",
    ".pi/prompts/specmine-check.md",
    ".github/workflows/specmine.yml",
  ]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  }
});

test("validate script passes on pristine skeleton, catches errors after tampering", async () => {
  const dir = tmp();
  const un = reset();
  await runInit(dir);
  un();

  const pristine = run("validate.mjs", [], dir);
  assert.equal(pristine.status, 0, pristine.stderr);

  // craft a real requirement + break things
  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth", "tokens.ts"), "x\ny\n");
  const reqFile = path.join(dir, ".specs", "requirements", "functional", "auth.md");
  fs.writeFileSync(
    reqFile,
    `### FR-AUTH-001 — Tokens\n\nTokens MUST expire.\n\n**Sources:** \`src/auth/tokens.ts:1\`\n\n### FR-AUTH-001 — Dup\n\nDup ID.\n\n**Sources:** \`src/auth/tokens.ts:1-99\`, \`src/nope.ts:1\`\n`
  );

  const bad = run("validate.mjs", [], dir);
  assert.equal(bad.status, 1);
  const out = bad.stdout + bad.stderr;
  assert.match(out, /duplicate ID FR-AUTH-001/);
  assert.match(out, /WRONG_FILE — src\/nope\.ts:1/);
  assert.match(out, /WRONG_LINES — src\/auth\/tokens\.ts:1-99/);

  // repair: dedupe + fix citations, then regenerate index
  fs.writeFileSync(
    reqFile,
    `### FR-AUTH-001 — Tokens\n\nTokens MUST expire.\n\n**Sources:** \`src/auth/tokens.ts:1-2\`\n`
  );
  const regen = run("validate.mjs", ["--regen-index"], dir);
  assert.equal(regen.status, 0, regen.stderr);
  assert.match(regen.stdout, /regenerated — 1 files, 1 requirement links/);
  const idx = JSON.parse(fs.readFileSync(path.join(dir, ".specs", "index.json"), "utf8"));
  assert.deepEqual(idx.fileIndex, { "src/auth/tokens.ts": ["FR-AUTH-001"] });
  assert.equal(run("validate.mjs", [], dir).status, 0);
});

test("check script maps changed files to requirements and flags NO-SPEC", async () => {
  const dir = tmp();
  const un = reset();
  await runInit(dir);
  un();

  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth", "tokens.ts"), "x\ny\n");
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-001 — Token expiry\n\nTokens MUST expire after 15 minutes.\n\n**Sources:** \`src/auth/tokens.ts:1\`\n`
  );
  assert.equal(run("validate.mjs", ["--regen-index"], dir).status, 0);

  const r = run("check.mjs", ["--files", "src/auth/tokens.ts,src/unmapped.ts"], dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /FR-AUTH-001\s+Token expiry\s+<-/);
  assert.match(r.stdout, /NO-SPEC\s+src\/unmapped\.ts/);
  const report = fs.readFileSync(path.join(dir, ".specs", "check-report.md"), "utf8");
  assert.match(report, /FR-AUTH-001/);
  assert.match(report, /src\/unmapped\.ts/);
});

test("gitignored spec files are skipped (git ls-files respected)", async () => {
  const dir = tmp();
  execSync("git init -q && git config user.email t@t && git config user.name t", { cwd: dir });
  const un = reset();
  await runInit(dir);
  un();

  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth", "tokens.ts"), "x\ny\n");
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-001 — Tokens\n\nTracked.\n\n**Sources:** \`src/auth/tokens.ts:1\`\n`
  );
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "ignored.md"),
    `### FR-AUTH-002 — Ignored\n\nMust not enter the index.\n\n**Sources:** \`src/auth/tokens.ts:1\`\n`
  );
  fs.writeFileSync(path.join(dir, ".gitignore"), ".specs/requirements/functional/ignored.md\n");
  execSync("git add -A", { cwd: dir });

  assert.equal(run("validate.mjs", ["--regen-index"], dir).status, 0);
  const idx = JSON.parse(fs.readFileSync(path.join(dir, ".specs", "index.json"), "utf8"));
  assert.deepEqual(idx.fileIndex, { "src/auth/tokens.ts": ["FR-AUTH-001"] }); // no FR-AUTH-002
});
