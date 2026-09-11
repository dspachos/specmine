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
