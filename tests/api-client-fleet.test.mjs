import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditScript = path.join(repoRoot, "scripts/audit-api-client-fleet.mjs");
const baseline = "f".repeat(40);

function withTempDir(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "invisra-fleet-test-"));
  try {
    return run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function write(directory, relativePath, content) {
  const fullPath = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

function writeJson(directory, relativePath, value) {
  return write(directory, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(cwd, overrides = {}) {
  const checkout = path.join(cwd, ".fleet", "fixture");
  const client = {
    id: "fixture",
    repository: "invisra/fixture-api-client",
    vendor: "Fixture",
    checkout: "fixture",
    typescriptRoot: "ts/src",
    pythonRoot: "python/src",
    requiredPaths: [
      ".github/workflows/api-coverage.yml",
      "api-coverage.json",
      "api-coverage-validator.config.json",
      "public-api-surface.json",
      "shared-tooling-pins.json",
      "operation-capabilities.config.json",
      "conformance.config.json",
      "conformance-fixtures.config.json",
    ],
    ...overrides.client,
  };
  writeJson(cwd, "registry.json", {
    schemaVersion: 1,
    baselines: { apiCoverageToolingRef: baseline },
    clients: [client],
    ...overrides.registry,
  });
  write(checkout, ".github/workflows/api-coverage.yml", `${baseline}\n${baseline}\n`);
  writeJson(checkout, "api-coverage.json", { schemaVersion: 2, vendor: "Fixture", operations: [] });
  writeJson(checkout, "api-coverage-validator.config.json", {
    typescriptRoots: ["ts/src"],
    pythonRoots: ["python/src"],
  });
  write(checkout, "ts/src/index.ts", "export {};\n");
  write(checkout, "python/src/pkg/__init__.py", "__all__ = []\n");
  writeJson(checkout, "public-api-surface.json", {
    schemaVersion: 1,
    typescript: { entrypoint: "ts/src/index.ts", required: ["Client"] },
    python: { entrypoint: "python/src/pkg/__init__.py", required: ["Client"] },
  });
  write(checkout, "ts/src/operationCapabilities.ts", "export {};\n");
  write(checkout, "python/src/operation_capabilities.py", "# generated\n");
  writeJson(checkout, "operation-capabilities.config.json", {
    manifest: "api-coverage.json",
    typescriptOutput: "ts/src/operationCapabilities.ts",
    pythonOutput: "python/src/operation_capabilities.py",
  });
  writeJson(checkout, "shared-tooling-pins.json", {
    schemaVersion: 1,
    pins: [{ name: "api-coverage", ref: baseline, files: [".github/workflows/api-coverage.yml"] }],
  });
  writeJson(checkout, "conformance.config.json", {});
  writeJson(checkout, "conformance-fixtures.config.json", {});
  return checkout;
}

function run(cwd) {
  return spawnSync(process.execPath, [auditScript, "--registry", "registry.json", "--root", ".fleet"], {
    cwd,
    encoding: "utf8",
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, `expected success\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function assertFailure(result, pattern) {
  assert.notEqual(result.status, 0, `expected failure\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

test("fleet audit accepts a client aligned to the fleet baseline", () => {
  withTempDir((cwd) => {
    fixture(cwd);
    assertSuccess(run(cwd));
  });
});

test("fleet audit rejects stale API coverage pins", () => {
  withTempDir((cwd) => {
    const checkout = fixture(cwd);
    writeJson(checkout, "shared-tooling-pins.json", {
      schemaVersion: 1,
      pins: [{ name: "api-coverage", ref: "a".repeat(40), files: [".github/workflows/api-coverage.yml"] }],
    });
    assertFailure(run(cwd), /does not match fleet baseline/);
  });
});

test("fleet audit rejects vendor identity drift", () => {
  withTempDir((cwd) => {
    const checkout = fixture(cwd);
    writeJson(checkout, "api-coverage.json", { schemaVersion: 2, vendor: "Other", operations: [] });
    assertFailure(run(cwd), /does not match registry vendor/);
  });
});

test("fleet audit rejects missing governance files", () => {
  withTempDir((cwd) => {
    const checkout = fixture(cwd);
    fs.rmSync(path.join(checkout, "public-api-surface.json"));
    assertFailure(run(cwd), /required path not found: public-api-surface\.json/);
  });
});

test("fleet audit rejects source-root drift", () => {
  withTempDir((cwd) => {
    const checkout = fixture(cwd);
    writeJson(checkout, "api-coverage-validator.config.json", {
      typescriptRoots: ["ts/other"],
      pythonRoots: ["python/src"],
    });
    write(checkout, "ts/other/index.ts", "export {};\n");
    assertFailure(run(cwd), /configured TypeScript roots do not cover registry root/);
  });
});

test("fleet audit rejects paths that escape a checkout", () => {
  withTempDir((cwd) => {
    fixture(cwd, { client: { requiredPaths: ["../outside"] } });
    write(cwd, ".fleet/outside", "outside\n");
    assertFailure(run(cwd), /path escapes checkout/);
  });
});
