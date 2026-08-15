#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const configPath = argument("--config", "api-coverage-validator.config.json");
if (!fs.existsSync(configPath)) throw new Error(`coverage validator config not found: ${configPath}`);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const manifestPath = config.manifest ?? "api-coverage.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const validConfidence = new Set([
  "official-public",
  "public-documented",
  "cross-referenced",
  "inferred-contract",
  "caller-verified",
  "portal-gated",
]);
const validClassification = new Set(["read", "mutation", "consequential", "unknown"]);
const validIdempotency = new Set(["idempotent", "non-idempotent", "unknown"]);
const validRetryPolicy = new Set(["safe", "none", "explicit"]);
const validMethods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

if (manifest.schemaVersion !== 2) throw new Error("api-coverage.json schemaVersion must be 2");
if (config.conformanceVersion && manifest.conformanceVersion !== config.conformanceVersion) {
  throw new Error(`conformanceVersion must be ${config.conformanceVersion}`);
}
if (!manifest.vendor || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.verifiedAt ?? "")) {
  throw new Error("vendor and ISO verifiedAt are required");
}
if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
  throw new Error("at least one verification source is required");
}
if (!Array.isArray(manifest.operations) || manifest.operations.length === 0) {
  throw new Error("operations must be non-empty");
}

const ids = new Set();
const keys = new Set();
for (const op of manifest.operations) {
  for (const key of ["id", "family", "operation", "idempotency", "retryPolicy"]) {
    if (!op[key]) throw new Error(`coverage operation missing ${key}`);
  }
  if (config.requireHttpRoute && (!op.method || !op.path)) {
    throw new Error(`${op.id}: method and path are required`);
  }
  if (op.method != null && !validMethods.has(op.method)) {
    throw new Error(`${op.id}: invalid method ${op.method}`);
  }
  if (typeof op.path === "string" && op.path.includes("*")) {
    throw new Error(`${op.id}: wildcard coverage entries are not allowed`);
  }
  if (String(op.operation).includes("/")) {
    throw new Error(`${op.id}: grouped coverage entries are not allowed`);
  }
  if (typeof op.typescript !== "boolean" || typeof op.python !== "boolean") {
    throw new Error(`${op.id}: language coverage must be boolean`);
  }
  if (!validConfidence.has(op.confidence)) throw new Error(`${op.id}: invalid confidence ${op.confidence}`);
  if (!validClassification.has(op.classification)) throw new Error(`${op.id}: invalid classification ${op.classification}`);
  if (!validIdempotency.has(op.idempotency)) throw new Error(`${op.id}: invalid idempotency ${op.idempotency}`);
  if (!validRetryPolicy.has(op.retryPolicy)) throw new Error(`${op.id}: invalid retryPolicy ${op.retryPolicy}`);
  if (typeof op.confirmationRequired !== "boolean") {
    throw new Error(`${op.id}: confirmationRequired must be boolean`);
  }
  if (op.typescript && !op.typescriptSymbol) throw new Error(`${op.id}: typescriptSymbol is required`);
  if (op.python && !op.pythonSymbol) throw new Error(`${op.id}: pythonSymbol is required`);
  if (op.classification === "consequential" && !op.confirmationRequired) {
    throw new Error(`${op.id}: consequential operations must require confirmation`);
  }
  if (op.classification === "consequential" && op.retryPolicy !== "none") {
    throw new Error(`${op.id}: consequential operations must use retryPolicy none`);
  }
  if (op.retryPolicy === "safe" && op.idempotency !== "idempotent") {
    throw new Error(`${op.id}: safe retry requires idempotent semantics`);
  }
  if (op.classification === "read" && op.confirmationRequired) {
    throw new Error(`${op.id}: read operations cannot require confirmation`);
  }
  if (op.confidence === "inferred-contract" && config.inferredContractGuardSubstring) {
    if (op.experimental !== true) throw new Error(`${op.id}: inferred contracts must be experimental`);
    if (!String(op.guard ?? "").includes(config.inferredContractGuardSubstring)) {
      throw new Error(`${op.id}: inferred contract guard is missing ${config.inferredContractGuardSubstring}`);
    }
  }
  if (ids.has(op.id)) throw new Error(`duplicate operation id: ${op.id}`);
  ids.add(op.id);
  const key = `${op.family}\u0000${op.operation}`;
  if (keys.has(key)) throw new Error(`duplicate coverage entry: ${op.family}/${op.operation}`);
  keys.add(key);
}

const tsSource = readRoots(config.typescriptRoots ?? [], new Set([".ts", ".mts", ".cts"]));
const pySource = readRoots(config.pythonRoots ?? [], new Set([".py"]));
for (const op of manifest.operations) {
  if (op.typescript && !hasTypeScriptMethod(tsSource, op.typescriptSymbol)) {
    throw new Error(`${op.id}: TypeScript symbol ${op.typescriptSymbol} not found in implementation`);
  }
  if (op.python && !hasPythonMethod(pySource, op.pythonSymbol)) {
    throw new Error(`${op.id}: Python symbol ${op.pythonSymbol} not found in implementation`);
  }
}

console.log(`Validated ${manifest.operations.length} ${manifest.vendor} operations (verified ${manifest.verifiedAt}).`);

function readRoots(roots, extensions) {
  if (!Array.isArray(roots) || roots.length === 0) throw new Error("language source roots must be configured");
  const chunks = [];
  const visit = (entryPath) => {
    if (!fs.existsSync(entryPath)) throw new Error(`configured source path not found: ${entryPath}`);
    const stat = fs.statSync(entryPath);
    if (stat.isFile()) {
      if (extensions.has(path.extname(entryPath))) chunks.push(fs.readFileSync(entryPath, "utf8"));
      return;
    }
    for (const entry of fs.readdirSync(entryPath, { withFileTypes: true })) {
      const full = path.join(entryPath, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (extensions.has(path.extname(entry.name))) chunks.push(fs.readFileSync(full, "utf8"));
    }
  };
  for (const root of roots) visit(root);
  return chunks.join("\n");
}

function hasTypeScriptMethod(source, symbol) {
  return new RegExp(`\\b(?:async\\s+)?${escapeRegExp(symbol)}\\s*\\(`).test(source);
}

function hasPythonMethod(source, symbol) {
  return new RegExp(`^\\s*(?:async\\s+)?def\\s+${escapeRegExp(symbol)}\\s*\\(`, "m").test(source);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
