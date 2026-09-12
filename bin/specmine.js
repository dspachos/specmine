#!/usr/bin/env node
import { runInit } from "../lib/init.js";

const HELP = `specmine — spec-mining scaffolder for AI agents

Usage:
  specmine init [dir]    Scaffold .specs/, install the specmine skill
                         (with deterministic scripts), slash commands, and CI gate

Everything else is agent-side, via the installed skill:
  /specmine:scan        extract requirements from code (survey → excavate → judge)
  /specmine:check       cross-check a diff/branch/PR against .specs/
  /specmine:validate    lint .specs/ (citations, IDs, links, index sync)
  /specmine:index       regenerate .specs/index.json

Deterministic parts run scripts inside .claude/skills/specmine/scripts/ —
committed to your repo, so CI uses the same scripts keylessly.
`;

const [cmd = "help", dir = "."] = process.argv.slice(2);

if (cmd === "init") await runInit(dir);
else console.log(HELP);
