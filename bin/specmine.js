#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runInit } from "../lib/init.js";
import { runValidate } from "../lib/validate.js";
import { runCheck } from "../lib/check.js";

const HELP = `specmine — mine specifications out of a codebase, for AI agents

Usage:
  specmine init [dir]             Scaffold .specs/ knowledge base + install agent skills
  specmine validate [dir]         Lint .specs/: citations, IDs, links, index sync
  specmine check [dir] [options]  Map code changes (diff or --files) to requirements
                                  --base <ref>    git base ref (default origin/main, then main)
                                  --files a,b,c   explicit changed files instead of git
                                  --ai            add LLM verdicts (needs endpoint env vars)
  specmine help                   Show this help

Extraction (scan) is done by your AI agent via the installed skills:
"specmine scan" and "specmine check". This CLI scaffolds, lints
deterministically, and can cross-check PRs headlessly with --ai.

AI endpoint (OpenAI-compatible, optional — used by check --ai):
  AMAZEEAI_BASE_URL / AMAZEEAI_API_KEY      or
  SPECMINE_BASE_URL / SPECMINE_API_KEY / SPECMINE_MODEL
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      base: { type: "string" },
      files: { type: "string" },
      ai: { type: "boolean" },
    },
    args: process.argv.slice(2),
  });
  const [cmd, dir = "."] = positionals;

  try {
    if (cmd === "init") await runInit(dir);
    else if (cmd === "validate") await runValidate(dir);
    else if (cmd === "check")
      process.exitCode = await runCheck(dir, {
        base: values.base,
        files: values.files?.split(",").map((f) => f.trim()).filter(Boolean),
        ai: values.ai,
      });
    else console.log(HELP);
  } catch (err) {
    console.error(`specmine: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
