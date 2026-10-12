#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = { config: "" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--config") args.config = argv[++i] ?? "";
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.config) throw new Error("--config is required");
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const { config: configPath } = parseArgs(process.argv);
const config = readJson(configPath);
if (config.schemaVersion !== 1) throw new Error("config schemaVersion must be 1");

const fixturesDir = config.fixturesDir ?? "fixtures";
const excludedFiles = new Set(config.excludedFiles ?? ["conformance-v2-transport.json"]);
const minimumNotesLength = config.minimumNotesLength ?? 12;
const sensitiveHeaderPattern = new RegExp(
  config.sensitiveHeaderPattern ?? "authorization|api[-_]?key|secret|token|cookie",
  "i",
);

if (typeof config.vendor !== "string" || config.vendor.trim() === "") {
  throw new Error("config vendor is required");
}
if (!Number.isInteger(minimumNotesLength) || minimumNotesLength < 1) {
  throw new Error("minimumNotesLength must be a positive integer");
}
if (!fs.existsSync(fixturesDir) || !fs.statSync(fixturesDir).isDirectory()) {
  throw new Error(`${fixturesDir}: fixture directory not found`);
}

let operationById = null;
if (config.manifest) {
  const manifest = readJson(config.manifest);
  operationById = new Map((manifest.operations ?? []).map((operation) => [operation.id, operation]));
}

const files = fs
  .readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !excludedFiles.has(entry.name))
  .map((entry) => entry.name)
  .sort();

if (files.length === 0) {
  throw new Error(`${fixturesDir}: at least one contract fixture is required`);
}

for (const fileName of files) {
  const fixturePath = path.join(fixturesDir, fileName);
  const fixture = readJson(fixturePath);

  if (fixture.fixtureVersion !== 1) {
    throw new Error(`${fixturePath}: fixtureVersion must be 1`);
  }
  if (fixture.vendor !== config.vendor) {
    throw new Error(`${fixturePath}: vendor must be ${config.vendor}`);
  }
  if (typeof fixture.endpoint !== "string" || fixture.endpoint.trim() === "") {
    throw new Error(`${fixturePath}: endpoint is required`);
  }

  if (config.requireOperationId && (typeof fixture.operationId !== "string" || fixture.operationId.trim() === "")) {
    throw new Error(`${fixturePath}: operationId is required`);
  }
  if (fixture.operationId != null) {
    if (typeof fixture.operationId !== "string" || fixture.operationId.trim() === "") {
      throw new Error(`${fixturePath}: operationId must be a non-empty string`);
    }
    if (operationById) {
      const operation = operationById.get(fixture.operationId);
      if (!operation) throw new Error(`${fixturePath}: unknown operationId ${fixture.operationId}`);
      if (operation.experimental || operation.confidence === "inferred-contract") {
        throw new Error(
          `${fixturePath}: fixtures may not target experimental/inferred operation ${fixture.operationId}`,
        );
      }
    }
  }

  const provenance = fixture.provenance;
  if (!isObject(provenance)) throw new Error(`${fixturePath}: provenance object is required`);
  if (!new Set(["synthetic", "recorded"]).has(provenance.source)) {
    throw new Error(`${fixturePath}: provenance.source must be synthetic or recorded`);
  }
  if (typeof provenance.recorded !== "boolean" || typeof provenance.sanitized !== "boolean") {
    throw new Error(`${fixturePath}: provenance recorded/sanitized flags must be boolean`);
  }
  if (provenance.source === "synthetic" && provenance.recorded) {
    throw new Error(`${fixturePath}: synthetic fixtures must set recorded=false`);
  }
  if (provenance.source === "recorded" && !provenance.recorded) {
    throw new Error(`${fixturePath}: recorded fixtures must set recorded=true`);
  }
  if (provenance.recorded && !provenance.sanitized) {
    throw new Error(`${fixturePath}: recorded fixtures must be sanitized before commit`);
  }
  if (typeof provenance.notes !== "string" || provenance.notes.trim().length < minimumNotesLength) {
    throw new Error(
      `${fixturePath}: provenance.notes must contain at least ${minimumNotesLength} characters`,
    );
  }

  if (!isObject(fixture.cases) || Object.keys(fixture.cases).length === 0) {
    throw new Error(`${fixturePath}: cases must be a non-empty object`);
  }

  for (const [caseName, testCase] of Object.entries(fixture.cases)) {
    const casePath = `${fixturePath}:${caseName}`;
    if (!isObject(testCase)) throw new Error(`${casePath}: case must be an object`);
    if (!Number.isInteger(testCase.status) || testCase.status < 100 || testCase.status > 599) {
      throw new Error(`${casePath}: status must be a valid HTTP status`);
    }
    if (!isObject(testCase.headers)) throw new Error(`${casePath}: headers object is required`);
    for (const [header, value] of Object.entries(testCase.headers)) {
      if (header !== header.toLowerCase()) {
        throw new Error(`${casePath}: header names must be lowercase`);
      }
      if (typeof value !== "string") {
        throw new Error(`${casePath}: header values must be strings`);
      }
      if (sensitiveHeaderPattern.test(header)) {
        throw new Error(`${casePath}: sensitive authentication/session headers must not be committed`);
      }
    }
    if (!Object.hasOwn(testCase, "body")) {
      throw new Error(`${casePath}: body is required, use null for an empty body`);
    }
  }
}

console.log(
  `Validated ${files.length} ${config.vendor} contract fixture${files.length === 1 ? "" : "s"}.`,
);
