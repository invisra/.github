import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(repoRoot, ".github", "workflows");
const immutableRef = /^[0-9a-f]{40}$/;

test("shared workflows pin external actions to immutable commit SHAs", () => {
  const violations = [];

  for (const name of fs.readdirSync(workflowsDir).filter((entry) => /\.ya?ml$/.test(entry))) {
    const file = path.join(workflowsDir, name);
    const content = fs.readFileSync(file, "utf8");

    for (const match of content.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
      const target = match[1];
      if (target.startsWith("./")) continue;

      const separator = target.lastIndexOf("@");
      if (separator < 1) {
        violations.push(`${name}: missing ref for ${target}`);
        continue;
      }

      const action = target.slice(0, separator);
      const ref = target.slice(separator + 1);
      if (!immutableRef.test(ref)) {
        violations.push(`${name}: ${action} uses mutable ref ${ref}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});


test("client workflow lint enforces immutable external action refs", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", "api-client-workflow-lint.yml"),
    "utf8",
  );

  assert.match(workflow, /Require immutable external action refs/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
});
