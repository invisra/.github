import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = {
  publicSurface: path.join(repoRoot, "scripts/validate-api-client-public-surface.mjs"),
  toolingPins: path.join(repoRoot, "scripts/validate-api-client-tooling-pins.mjs"),
  coverage: path.join(repoRoot, "scripts/validate-api-client-coverage.mjs"),
  capabilities: path.join(repoRoot, "scripts/generate-api-client-operation-capabilities.mjs"),
};

function withTempDir(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "invisra-shared-tooling-test-"));
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

function runScript(script, cwd, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, `expected success\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function assertFailure(result, expectedMessage) {
  assert.notEqual(result.status, 0, `expected failure\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, expectedMessage);
}

function baseOperation(overrides = {}) {
  return {
    id: "parts.get",
    family: "parts",
    operation: "get",
    method: "GET",
    path: "/parts/{partNumber}",
    confidence: "official-public",
    classification: "read",
    idempotency: "idempotent",
    retryPolicy: "safe",
    confirmationRequired: false,
    experimental: false,
    typescript: true,
    python: true,
    typescriptSymbol: "getPart",
    pythonSymbol: "get_part",
    ...overrides,
  };
}

test("public surface accepts recursive TypeScript barrels, aliases, type exports, and Python __all__", () => {
  withTempDir((cwd) => {
    write(cwd, "ts/index.ts", 'export * from "./client.js";\nexport { InternalName as PublicAlias } from "./types.js";\n');
    write(cwd, "ts/client.ts", "export class Client {}\nexport type ClientOptions = { token: string };\n");
    write(cwd, "ts/types.ts", "export interface InternalName {}\n");
    write(cwd, "python/pkg/__init__.py", '__all__ = ["Client", "ClientOptions"]\n');
    writeJson(cwd, "surface.json", {
      schemaVersion: 1,
      typescript: {
        entrypoint: "ts/index.ts",
        required: ["Client", "ClientOptions", "PublicAlias"],
      },
      python: {
        entrypoint: "python/pkg/__init__.py",
        required: ["Client", "ClientOptions"],
      },
    });

    assertSuccess(runScript(scripts.publicSurface, cwd, ["--config", "surface.json"]));
  });
});

test("public surface rejects unsupported non-relative TypeScript star exports", () => {
  withTempDir((cwd) => {
    write(cwd, "index.ts", 'export * from "external-package";\n');
    writeJson(cwd, "surface.json", {
      schemaVersion: 1,
      typescript: { entrypoint: "index.ts", required: ["Client"] },
    });

    assertFailure(
      runScript(scripts.publicSurface, cwd, ["--config", "surface.json"]),
      /only relative TypeScript barrel exports are supported/,
    );
  });
});

test("public surface reports missing required symbols", () => {
  withTempDir((cwd) => {
    write(cwd, "index.ts", "export class Client {}\n");
    writeJson(cwd, "surface.json", {
      schemaVersion: 1,
      typescript: { entrypoint: "index.ts", required: ["Client", "Missing"] },
    });

    assertFailure(
      runScript(scripts.publicSurface, cwd, ["--config", "surface.json"]),
      /missing required symbol\(s\): Missing/,
    );
  });
});

test("tooling pin validator supports exact and minimum occurrence contracts", () => {
  withTempDir((cwd) => {
    const refA = "a".repeat(40);
    const refB = "b".repeat(40);
    write(cwd, "workflow.yml", `${refA}\n${refA}\n${refB}\n${refB}\n${refB}\n`);
    writeJson(cwd, "pins.json", {
      schemaVersion: 1,
      pins: [
        { name: "exact-pin", ref: refA, files: [{ path: "workflow.yml", occurrences: 2 }] },
        { name: "minimum-pin", ref: refB, files: [{ path: "workflow.yml", minOccurrences: 2 }] },
      ],
    });

    assertSuccess(runScript(scripts.toolingPins, cwd, ["--config", "pins.json"]));
  });
});

test("tooling pin validator rejects duplicate names", () => {
  withTempDir((cwd) => {
    const ref = "c".repeat(40);
    write(cwd, "workflow.yml", `${ref}\n`);
    writeJson(cwd, "pins.json", {
      schemaVersion: 1,
      pins: [
        { name: "same", ref, files: ["workflow.yml"] },
        { name: "same", ref, files: ["workflow.yml"] },
      ],
    });

    assertFailure(runScript(scripts.toolingPins, cwd, ["--config", "pins.json"]), /duplicate tooling pin name/);
  });
});

test("tooling pin validator rejects malformed SHAs and missing files", () => {
  withTempDir((cwd) => {
    writeJson(cwd, "bad-sha.json", {
      schemaVersion: 1,
      pins: [{ name: "bad", ref: "ABC", files: ["missing.yml"] }],
    });
    assertFailure(
      runScript(scripts.toolingPins, cwd, ["--config", "bad-sha.json"]),
      /40-character lowercase commit SHA/,
    );

    writeJson(cwd, "missing-file.json", {
      schemaVersion: 1,
      pins: [{ name: "missing", ref: "d".repeat(40), files: ["missing.yml"] }],
    });
    assertFailure(
      runScript(scripts.toolingPins, cwd, ["--config", "missing-file.json"]),
      /file not found/,
    );
  });
});

test("coverage validator accepts canonical Conformance v2 manifests", () => {
  withTempDir((cwd) => {
    write(cwd, "ts/client.ts", "export class Client { async getPart() {} }\n");
    write(cwd, "python/client.py", "class Client:\n    def get_part(self):\n        pass\n");
    writeJson(cwd, "api-coverage.json", {
      schemaVersion: 2,
      conformanceVersion: "2.0",
      vendor: "fixture",
      verifiedAt: "2026-08-16",
      sources: ["fixture"],
      operations: [baseOperation()],
    });
    writeJson(cwd, "validator.json", {
      manifest: "api-coverage.json",
      conformanceVersion: "2.0",
      requireHttpRoute: true,
      typescriptRoots: ["ts"],
      pythonRoots: ["python"],
    });

    assertSuccess(runScript(scripts.coverage, cwd, ["--config", "validator.json"]));
  });
});

test("coverage validator rejects non-canonical conformance versions", () => {
  withTempDir((cwd) => {
    write(cwd, "ts/client.ts", "function getPart() {}\n");
    write(cwd, "python/client.py", "def get_part():\n    pass\n");
    writeJson(cwd, "api-coverage.json", {
      schemaVersion: 2,
      conformanceVersion: "2.0",
      vendor: "fixture",
      verifiedAt: "2026-08-16",
      sources: ["fixture"],
      operations: [baseOperation()],
    });
    writeJson(cwd, "validator.json", {
      manifest: "api-coverage.json",
      conformanceVersion: "2.1",
      requireHttpRoute: true,
      typescriptRoots: ["ts"],
      pythonRoots: ["python"],
    });

    assertFailure(
      runScript(scripts.coverage, cwd, ["--config", "validator.json"]),
      /validator conformanceVersion must match canonical contract 2\.0/,
    );
  });
});

test("coverage validator enforces consequential confirmation and retry safety", () => {
  withTempDir((cwd) => {
    write(cwd, "ts/client.ts", "function submitOrder() {}\n");
    write(cwd, "python/client.py", "def submit_order():\n    pass\n");
    writeJson(cwd, "api-coverage.json", {
      schemaVersion: 2,
      conformanceVersion: "2.0",
      vendor: "fixture",
      verifiedAt: "2026-08-16",
      sources: ["fixture"],
      operations: [
        baseOperation({
          id: "orders.submit",
          family: "orders",
          operation: "submit",
          method: "POST",
          path: "/orders",
          classification: "consequential",
          idempotency: "non-idempotent",
          retryPolicy: "none",
          confirmationRequired: false,
          typescriptSymbol: "submitOrder",
          pythonSymbol: "submit_order",
        }),
      ],
    });
    writeJson(cwd, "validator.json", {
      manifest: "api-coverage.json",
      conformanceVersion: "2.0",
      requireHttpRoute: true,
      typescriptRoots: ["ts"],
      pythonRoots: ["python"],
    });

    assertFailure(
      runScript(scripts.coverage, cwd, ["--config", "validator.json"]),
      /consequential operations must require confirmation/,
    );
  });
});

test("capability generator emits typed empty slash-spanning Python sets", () => {
  withTempDir((cwd) => {
    writeJson(cwd, "api-coverage.json", {
      schemaVersion: 2,
      operations: [baseOperation()],
    });
    writeJson(cwd, "generator.json", {
      manifest: "api-coverage.json",
      typescriptOutput: "generated/operation-capabilities.ts",
      pythonOutput: "generated/operation_capabilities.py",
    });

    assertSuccess(runScript(scripts.capabilities, cwd, ["--config", "generator.json"]));
    const python = fs.readFileSync(path.join(cwd, "generated/operation_capabilities.py"), "utf8");
    assert.match(python, /_SLASH_SPANNING_OPERATION_IDS: frozenset\[str\] = frozenset\(\(\)\)/);
    assertSuccess(runScript(scripts.capabilities, cwd, ["--config", "generator.json", "--check"]));
  });
});

test("capability generator emits slash-spanning IDs and generalized route matching", () => {
  withTempDir((cwd) => {
    writeJson(cwd, "api-coverage.json", {
      schemaVersion: 2,
      operations: [
        baseOperation({
          id: "assets.get",
          family: "assets",
          operation: "get",
          path: "/assets/{assetPath}",
        }),
      ],
    });
    writeJson(cwd, "generator.json", {
      manifest: "api-coverage.json",
      typescriptOutput: "generated/operation-capabilities.ts",
      pythonOutput: "generated/operation_capabilities.py",
      slashSpanningOperationIds: ["assets.get"],
    });

    assertSuccess(runScript(scripts.capabilities, cwd, ["--config", "generator.json"]));
    const typescript = fs.readFileSync(path.join(cwd, "generated/operation-capabilities.ts"), "utf8");
    const python = fs.readFileSync(path.join(cwd, "generated/operation_capabilities.py"), "utf8");
    assert.match(typescript, /new Set<string>\(\["assets\.get"\]\)/);
    assert.match(typescript, /allowSlash \? "\.\+\?" : "\[\^\/\]\+"/);
    assert.match(python, /frozenset\(\("assets\.get",\)\)/);
    assert.match(python, /placeholder_pattern = r"\.\+\?" if allow_slash else r"\[\^\/\]\+"/);
  });
});

test("capability generator rejects unknown slash-spanning operation IDs", () => {
  withTempDir((cwd) => {
    writeJson(cwd, "api-coverage.json", {
      schemaVersion: 2,
      operations: [baseOperation()],
    });
    writeJson(cwd, "generator.json", {
      manifest: "api-coverage.json",
      typescriptOutput: "generated/operation-capabilities.ts",
      pythonOutput: "generated/operation_capabilities.py",
      slashSpanningOperationIds: ["missing.operation"],
    });

    assertFailure(
      runScript(scripts.capabilities, cwd, ["--config", "generator.json"]),
      /references unknown operation: missing\.operation/,
    );
  });
});

test("capability generator handles nullable paths without matching them", () => {
  withTempDir((cwd) => {
    writeJson(cwd, "api-coverage.json", {
      schemaVersion: 2,
      operations: [baseOperation({ id: "balance.get", family: "balance", operation: "get", method: null, path: null })],
    });
    writeJson(cwd, "generator.json", {
      manifest: "api-coverage.json",
      typescriptOutput: "generated/operation-capabilities.ts",
      pythonOutput: "generated/operation_capabilities.py",
    });

    assertSuccess(runScript(scripts.capabilities, cwd, ["--config", "generator.json"]));
    const typescript = fs.readFileSync(path.join(cwd, "generated/operation-capabilities.ts"), "utf8");
    const python = fs.readFileSync(path.join(cwd, "generated/operation_capabilities.py"), "utf8");
    assert.match(typescript, /path: string \| null/);
    assert.match(typescript, /capability\.path !== null/);
    assert.match(python, /path: str \| None/);
    assert.match(python, /if capability\.path is not None/);
  });
});
