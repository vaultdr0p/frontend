#!/usr/bin/env node
/**
 * Lints the TypeScript sources this branch changes.
 *
 * Why not simply `eslint src`: this repository's `import/order` rule predates
 * most of its code, and `eslint src --max-warnings 0` currently reports ~450
 * pre-existing violations in files no feature branch touches. So the project's
 * actual policy is "lint what you touch" — enforced by lint-staged on commit
 * and by the `lint-changed` CI job on pull requests, both of which lint only
 * changed files.
 *
 * This script is the local equivalent of that CI job, so `yarn lint` answers
 * the question a contributor cares about ("is *my* code clean?") instead of
 * always failing. `yarn lint:all` still runs the repo-wide check, which is
 * where the legacy debt shows up.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = process.env.LINT_BASE_REF ?? "develop";

const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

const candidates = new Set([
  // Committed on this branch relative to the base.
  ...git(["diff", "--name-only", "--diff-filter=ACMR", `${BASE}...HEAD`]),
  // Uncommitted edits, so the gate matches the tree about to be pushed.
  ...git(["diff", "--name-only", "--diff-filter=ACMR"]),
  ...git(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]),
  // New files not yet added.
  ...git(["ls-files", "--others", "--exclude-standard"]),
]);

const files = [...candidates]
  .filter((file) => /^src\/.*\.tsx?$/.test(file))
  // Generated bindings are not hand-maintained, matching the CI job.
  .filter((file) => !file.startsWith("src/contracts/"))
  // A path can be listed and then deleted; there is nothing left to lint.
  .filter((file) => existsSync(file));

if (files.length === 0) {
  console.log("No changed TypeScript source files; nothing to lint.");
  process.exit(0);
}

console.log(`Linting ${files.length} changed file(s):`);
for (const file of files) {
  console.log(`  ${file}`);
}

try {
  execFileSync("npx", ["eslint", "--max-warnings", "0", ...files], { stdio: "inherit" });
} catch {
  process.exit(1);
}
