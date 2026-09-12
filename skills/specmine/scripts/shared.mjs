// Shared helpers for specmine skill scripts. Zero dependencies, node >= 20.
// GENERATED — copied into repos at .specmine/scripts/ by init.mjs. Local edits
// are overwritten on refresh: fix upstream at github.com/dspachos/specmine and
// re-run init. 
import { spawnSync } from "node:child_process";

/**
 * Files git considers part of the repo (tracked + untracked, excluding
 * .gitignore'd). Returns null outside a git repo — callers fall back to
 * walking. Never parse .gitignore by hand; git already did.
 */
export function trackedFiles(root) {
  const r = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" }
  );
  if (r.status !== 0) return null;
  return new Set(r.stdout.split("\n").filter(Boolean));
}

export const REQ_HEADING = /^((?:FR|NFR)-[A-Z0-9]+-\d+|(?:BR|C)-\d+)\b/i;

/** Yields {heading, body} for each '### ' section of a markdown doc. */
export function* sections(text) {
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("### ")) {
      if (current) yield current;
      current = { heading: line.slice(4).trim(), body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) yield current;
}
