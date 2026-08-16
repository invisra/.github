import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repoRoot, "scripts/validate-json-schema.mjs");
const schemas = (name) => path.join(repoRoot, "contracts", name);

function withTempDir(run) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "invisra-schema-test-"));
  try { return run(cwd); } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

function validate(cwd, schema, value) {
  const instance = path.join(cwd, "instance.json");
  fs.writeFileSync(instance, `${JSON.stringify(value, null, 2)}\n`);
  return spawnSync(process.execPath, [validator, "--schema", schemas(schema), "--instance", instance], {
    cwd,
    encoding: "utf8",
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function assertFailure(result, pattern) {
  assert.notEqual(result.status, 0, `expected schema failure\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

test("coverage schema accepts the v2 fleet shape and rejects invalid methods", () => {
  withTempDir((cwd) => {
    const manifest = {
      schemaVersion: 2,
      conformanceVersion: "2.0",
      vendor: "fixture",
      verifiedAt: "2026-08-16",
      sources: [{ kind: "official-docs", url: "https://example.test" }],
      operations: [{
        id: "parts.get", family: "parts", operation: "get", method: "GET", path: "/parts/{id}",
        typescript: true, python: true, confidence: "official-public", classification: "read",
        idempotency: "idempotent", retryPolicy: "safe", confirmationRequired: false,
        typescriptSymbol: "getPart", pythonSymbol: "get_part"
      }]
    };
    assertSuccess(validate(cwd, "api-coverage-v2.schema.json", manifest));
    manifest.operations[0].method = "FETCH";
    assertFailure(validate(cwd, "api-coverage-v2.schema.json", manifest), /must be one of/);
  });
});

test("coverage validator config schema rejects unknown keys and empty roots", () => {
  withTempDir((cwd) => {
    const config = { typescriptRoots: ["ts/src"], pythonRoots: ["python/src"], conformanceVersion: "2.0" };
    assertSuccess(validate(cwd, "api-coverage-validator-config-v1.schema.json", config));
    assertFailure(validate(cwd, "api-coverage-validator-config-v1.schema.json", { ...config, typo: true }), /unexpected property typo/);
    assertFailure(validate(cwd, "api-coverage-validator-config-v1.schema.json", { ...config, pythonRoots: [] }), /at least 1 item/);
  });
});

test("public surface schema validates symbol names and uniqueness", () => {
  withTempDir((cwd) => {
    const surface = { schemaVersion: 1, typescript: { entrypoint: "ts/index.ts", required: ["Client", "ApiError"] } };
    assertSuccess(validate(cwd, "public-api-surface-v1.schema.json", surface));
    assertFailure(validate(cwd, "public-api-surface-v1.schema.json", { schemaVersion: 1, typescript: { entrypoint: "ts/index.ts", required: ["bad-name!"] } }), /must match/);
    assertFailure(validate(cwd, "public-api-surface-v1.schema.json", { schemaVersion: 1, typescript: { entrypoint: "ts/index.ts", required: ["Client", "Client"] } }), /items must be unique/);
  });
});

test("tooling pin schema validates immutable refs and occurrence descriptors", () => {
  withTempDir((cwd) => {
    const pins = { schemaVersion: 1, pins: [{ name: "coverage", ref: "a".repeat(40), files: [{ path: ".github/workflows/api-coverage.yml", occurrences: 2 }] }] };
    assertSuccess(validate(cwd, "shared-tooling-pins-v1.schema.json", pins));
    assertFailure(validate(cwd, "shared-tooling-pins-v1.schema.json", { schemaVersion: 1, pins: [{ name: "coverage", ref: "ABC", files: ["workflow.yml"] }] }), /must match/);
    assertFailure(validate(cwd, "shared-tooling-pins-v1.schema.json", { schemaVersion: 1, pins: [{ name: "coverage", ref: "a".repeat(40), files: [{ path: "workflow.yml", occurrences: 0 }] }] }), /must be >= 1/);
  });
});

test("capability generator config schema supports slash-spanning IDs and rejects misspelled keys", () => {
  withTempDir((cwd) => {
    const config = {
      manifest: "api-coverage.json",
      typescriptOutput: "ts/src/operationCapabilities.ts",
      pythonOutput: "python/src/pkg/operation_capabilities.py",
      slashSpanningOperationIds: ["assets.get"]
    };
    assertSuccess(validate(cwd, "operation-capabilities-config-v1.schema.json", config));
    assertFailure(validate(cwd, "operation-capabilities-config-v1.schema.json", { ...config, slashSpanningOperationId: ["assets.get"] }), /unexpected property slashSpanningOperationId/);
  });
});
