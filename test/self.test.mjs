import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, execSync } from "node:child_process";

const SKILL = path.resolve(import.meta.dirname, "..", "skills", "specmine");
const run = (script, args, cwd) =>
  spawnSync("node", [path.join(SKILL, "scripts", script), ...args], { cwd, encoding: "utf8" });

const tmp = () => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "specmine-"));

test("init.mjs bootstraps a repo: .specs, in-repo scripts, commands, prompts, workflow", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# project\n");
  const r = run("init.mjs", [], dir);
  assert.equal(r.status, 0, r.stderr);
  for (const f of [
    ".specs/CONVENTIONS.md",
    ".specs/index.json",
    ".specmine/scripts/validate.mjs",
    ".specmine/scripts/check.mjs",
    ".specmine/scripts/shared.mjs",
    ".claude/commands/specmine/scan.md",
    ".claude/commands/specmine/check.md",
    ".claude/commands/specmine/reconcile.md",
    ".pi/prompts/specmine-validate.md",
    ".github/workflows/specmine.yml",
  ]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  }
  assert.match(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), /specmine:start/);
  // workflow points at the in-repo scripts
  const wf = fs.readFileSync(path.join(dir, ".github/workflows/specmine.yml"), "utf8");
  assert.match(wf, /\.specmine\/scripts\/validate\.mjs/);
  // idempotent: second run keeps .specs and doesn't duplicate
  run("init.mjs", [], dir);
  assert.match(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").match(/specmine:start/g).join(), /specmine:start$/);
});

test("validate.mjs passes on pristine skeleton, catches errors after tampering", () => {
  const dir = tmp();
  assert.equal(run("init.mjs", [], dir).status, 0);
  assert.equal(run("validate.mjs", [], dir).status, 0);

  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth", "tokens.ts"), "x\ny\n");
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-001 — Tokens\n\nTokens MUST expire.\n\n**Sources:** \`src/auth/tokens.ts:1\`\n\n### FR-AUTH-001 — Dup\n\nDup ID.\n\n**Sources:** \`src/auth/tokens.ts:1-99\`, \`src/nope.ts:1\`\n`
  );

  const bad = run("validate.mjs", [], dir);
  assert.equal(bad.status, 1);
  const out = bad.stdout + bad.stderr;
  assert.match(out, /duplicate ID FR-AUTH-001/);
  assert.match(out, /WRONG_FILE — src\/nope\.ts:1/);
  assert.match(out, /WRONG_LINES — src\/auth\/tokens\.ts:1-99/);

  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-001 — Tokens\n\nTokens MUST expire.\n\n**Sources:** \`src/auth/tokens.ts:1-2\`\n`
  );
  const regen = run("validate.mjs", ["--regen-index"], dir);
  assert.equal(regen.status, 0, regen.stderr);
  assert.match(regen.stdout, /regenerated — 1 files, 1 requirement links/);
  const idxFile = path.join(dir, ".specs", "index.json");
  // reconciled map (doc -> date, maintained by the reconcile workflow) survives regen
  const withRec = JSON.parse(fs.readFileSync(idxFile, "utf8"));
  withRec.reconciled = { "docs/adr/012.md": "2026-01-01" };
  fs.writeFileSync(idxFile, JSON.stringify(withRec, null, 2));
  assert.equal(run("validate.mjs", ["--regen-index"], dir).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(idxFile, "utf8")).reconciled, { "docs/adr/012.md": "2026-01-01" });
  const idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
  assert.deepEqual(idx.fileIndex, { "src/auth/tokens.ts": ["FR-AUTH-001"] });
  assert.equal(run("validate.mjs", [], dir).status, 0);
});

test("check.mjs maps changed files to requirements and flags NO-SPEC", () => {
  const dir = tmp();
  assert.equal(run("init.mjs", [], dir).status, 0);
  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth", "tokens.ts"), "x\ny\n");
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-001 — Token expiry\n\nTokens MUST expire after 15 minutes.\n\n**Sources:** \`src/auth/tokens.ts:1\`\n`
  );
  assert.equal(run("validate.mjs", ["--regen-index"], dir).status, 0);

  const r = run("check.mjs", ["--files", "src/auth/tokens.ts,src/unmapped.ts"], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /FR-AUTH-001\s+Token expiry\s+<-/);
  assert.match(r.stdout, /NO-SPEC\s+src\/unmapped\.ts/);
  assert.match(fs.readFileSync(path.join(dir, ".specs", "check-report.md"), "utf8"), /FR-AUTH-001/);
});

test("gitignored spec files are skipped (git ls-files respected)", () => {
  const dir = tmp();
  execSync("git init -q && git config user.email t@t && git config user.name t", { cwd: dir });
  assert.equal(run("init.mjs", [], dir).status, 0);
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
  assert.deepEqual(idx.fileIndex, { "src/auth/tokens.ts": ["FR-AUTH-001"] });
});
