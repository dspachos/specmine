import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runInit } from "../lib/init.js";
import { runValidate } from "../lib/validate.js";
import { runCheck } from "../lib/check.js";
import { llmConfig } from "../lib/llm.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "specmine-"));
const reset = () => {
  process.exitCode = 0;
};

test("init scaffolds .specs/ and installs skills", async () => {
  const dir = tmp();
  await runInit(dir);
  reset();
  for (const f of ["CONVENTIONS.md", "overview.md", "index.json", "requirements/functional/README.md"]) {
    assert.ok(fs.existsSync(path.join(dir, ".specs", f)), f);
  }
  assert.ok(fs.existsSync(path.join(dir, ".claude", "skills", "specmine-scan", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(dir, ".claude", "skills", "specmine-check", "SKILL.md")));
  // idempotent: second init must not clobber
  fs.writeFileSync(path.join(dir, ".specs", "overview.md"), "# hand-edited\n");
  await runInit(dir);
  reset();
  assert.equal(fs.readFileSync(path.join(dir, ".specs", "overview.md"), "utf8"), "# hand-edited\n");
});

test("validate passes on pristine skeleton", async () => {
  const dir = tmp();
  await runInit(dir);
  reset();
  const r = await runValidate(dir);
  reset();
  assert.equal(r.code, 0, r.errors.join("; "));
});

test("validate catches dup IDs, WRONG_FILE, WRONG_LINES, BROKEN_LINK, index drift", async () => {
  const dir = tmp();
  await runInit(dir);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "line1\nline2\n");
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-001 — First

System MUST do one.

**Sources:** \`src/a.ts:1\`

### FR-AUTH-001 — Duplicate

**Sources:** \`src/a.ts:1\`

### FR-AUTH-002 — Bad file

**Sources:** \`src/nope.ts:1\`

### FR-AUTH-003 — Over range

**Sources:** \`src/a.ts:1-99\`

### FR-AUTH-004 — Broken link

See [missing](nope.md).

**Sources:** \`src/a.ts:2\`
`
  );
  const r = await runValidate(dir);
  reset();
  const errs = r.errors.join("\n");
  assert.match(errs, /duplicate ID FR-AUTH-001/);
  assert.match(errs, /WRONG_FILE/);
  assert.match(errs, /WRONG_LINES/);
  assert.match(errs, /BROKEN_LINK/);
  assert.match(errs, /index\.json: missing src\/a\.ts/);
  assert.equal(r.code, 1);

  // repair the index -> index errors disappear, real errors remain
  fs.writeFileSync(
    path.join(dir, ".specs", "index.json"),
    JSON.stringify({
      version: 1,
      generated: null,
      by: "test",
      fileIndex: { "src/a.ts": ["FR-AUTH-001", "FR-AUTH-004"] }, // only VALID citations belong in the index
      modules: {},
    })
  );
  const r2 = await runValidate(dir);
  reset();
  assert.doesNotMatch(r2.errors.join("\n"), /index\.json/);
});

test("check maps changed files to requirements and flags NO-SPEC", async () => {
  const dir = tmp();
  await runInit(dir);
  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth", "tokens.ts"), "x\n");
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-003 — Tokens

Tokens MUST expire.

**Sources:** \`src/auth/tokens.ts:1\`
`
  );
  fs.writeFileSync(
    path.join(dir, ".specs", "index.json"),
    JSON.stringify({ version: 1, fileIndex: { "src/auth/tokens.ts": ["FR-AUTH-003"] }, modules: {} })
  );
  const code = await runCheck(dir, {
    files: ["src/auth/tokens.ts", "src/newthing.ts"],
    ai: false,
  });
  reset();
  assert.equal(code, 0);
  const report = fs.readFileSync(path.join(dir, ".specs", "check-report.md"), "utf8");
  assert.match(report, /FR-AUTH-003/);
  assert.match(report, /NO-SPEC|No spec coverage/);
});

test("gitignored spec files are skipped (git ls-files respected)", async () => {
  const dir = tmp();
  await runInit(dir);
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.writeFileSync(path.join(dir, ".gitignore"), ".specs/ignored.md\n");
  fs.writeFileSync(path.join(dir, ".specs", "ignored.md"), `### FR-XX-001 — ignored\n\n**Sources:** \`nope.ts:1\`\n`);
  fs.writeFileSync(
    path.join(dir, ".specs", "requirements", "functional", "auth.md"),
    `### FR-AUTH-001 — a\n\n**Sources:** \`nope.ts:1\`\n`
  );
  const r = await runValidate(dir);
  reset();
  const errs = r.errors.join("\n");
  assert.doesNotMatch(errs, /ignored\.md/, "gitignored file must be skipped");
  assert.match(errs, /auth\.md.*WRONG_FILE/, "tracked file must still be linted");
});

test("llm config errors helpfully when unset", () => {
  const saved = { ...process.env };
  delete process.env.SPECMINE_BASE_URL;
  delete process.env.AMAZEEAI_BASE_URL;
  delete process.env.SPECMINE_API_KEY;
  delete process.env.AMAZEEAI_API_KEY;
  delete process.env.SPECMINE_MODEL;
  assert.throws(() => llmConfig(), /SPECMINE_MODEL/);
  Object.assign(process.env, saved);
});
