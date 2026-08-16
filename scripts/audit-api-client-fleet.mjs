#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const registryPath = argument("--registry", "contracts/api-client-fleet-v1.json");
const rootPath = path.resolve(argument("--root", ".fleet"));

if (!fs.existsSync(registryPath)) throw new Error(`fleet registry not found: ${registryPath}`);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

if (registry.schemaVersion !== 1) throw new Error("fleet registry schemaVersion must be 1");
if (!registry.baselines?.apiCoverageToolingRef || !/^[0-9a-f]{40}$/.test(registry.baselines.apiCoverageToolingRef)) {
  throw new Error("fleet registry requires a 40-character lowercase apiCoverageToolingRef");
}
if (!Array.isArray(registry.clients) || registry.clients.length === 0) {
  throw new Error("fleet registry clients must be non-empty");
}

const ids = new Set();
const repositories = new Set();
for (const client of registry.clients) {
  validateClientDefinition(client);
  if (ids.has(client.id)) throw new Error(`duplicate fleet client id: ${client.id}`);
  ids.add(client.id);
  if (repositories.has(client.repository)) throw new Error(`duplicate fleet repository: ${client.repository}`);
  repositories.add(client.repository);

  const checkout = path.join(rootPath, client.checkout);
  if (!fs.existsSync(checkout) || !fs.statSync(checkout).isDirectory()) {
    throw new Error(`${client.id}: checkout not found: ${checkout}`);
  }

  for (const requiredPath of client.requiredPaths) {
    assertExists(client.id, checkout, requiredPath);
  }
  assertExists(client.id, checkout, client.typescriptRoot);
  assertExists(client.id, checkout, client.pythonRoot);

  const coverage = readJson(client.id, checkout, "api-coverage.json");
  if (coverage.vendor !== client.vendor) {
    throw new Error(`${client.id}: coverage vendor ${JSON.stringify(coverage.vendor)} does not match registry vendor ${JSON.stringify(client.vendor)}`);
  }

  const coverageConfig = readJson(client.id, checkout, "api-coverage-validator.config.json");
  for (const sourceRoot of coverageConfig.typescriptRoots ?? []) assertExists(client.id, checkout, sourceRoot);
  for (const sourceRoot of coverageConfig.pythonRoots ?? []) assertExists(client.id, checkout, sourceRoot);
  if (!(coverageConfig.typescriptRoots ?? []).some((entry) => sameOrParent(entry, client.typescriptRoot))) {
    throw new Error(`${client.id}: configured TypeScript roots do not cover registry root ${client.typescriptRoot}`);
  }
  if (!(coverageConfig.pythonRoots ?? []).some((entry) => sameOrParent(entry, client.pythonRoot))) {
    throw new Error(`${client.id}: configured Python roots do not cover registry root ${client.pythonRoot}`);
  }

  const publicSurface = readJson(client.id, checkout, "public-api-surface.json");
  if (publicSurface.typescript?.entrypoint) assertExists(client.id, checkout, publicSurface.typescript.entrypoint);
  if (publicSurface.python?.entrypoint) assertExists(client.id, checkout, publicSurface.python.entrypoint);

  const capabilityConfig = readJson(client.id, checkout, "operation-capabilities.config.json");
  assertExists(client.id, checkout, capabilityConfig.manifest ?? "api-coverage.json");
  if (capabilityConfig.typescriptOutput) assertExists(client.id, checkout, capabilityConfig.typescriptOutput);
  if (capabilityConfig.pythonOutput) assertExists(client.id, checkout, capabilityConfig.pythonOutput);

  const pins = readJson(client.id, checkout, "shared-tooling-pins.json");
  const coveragePin = (pins.pins ?? []).find((pin) => pin.name === "api-coverage");
  if (!coveragePin) throw new Error(`${client.id}: shared-tooling-pins.json is missing api-coverage`);
  if (coveragePin.ref !== registry.baselines.apiCoverageToolingRef) {
    throw new Error(`${client.id}: api-coverage pin ${coveragePin.ref} does not match fleet baseline ${registry.baselines.apiCoverageToolingRef}`);
  }

  const coverageWorkflow = fs.readFileSync(path.join(checkout, ".github/workflows/api-coverage.yml"), "utf8");
  const baselineOccurrences = countOccurrences(coverageWorkflow, registry.baselines.apiCoverageToolingRef);
  if (baselineOccurrences < 2) {
    throw new Error(`${client.id}: API coverage workflow must reference fleet tooling baseline at least twice, found ${baselineOccurrences}`);
  }
}

console.log(`Audited ${registry.clients.length} API client(s) against fleet baseline ${registry.baselines.apiCoverageToolingRef}.`);

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function validateClientDefinition(client) {
  for (const key of ["id", "repository", "vendor", "checkout", "typescriptRoot", "pythonRoot"]) {
    if (!client[key] || typeof client[key] !== "string") throw new Error(`fleet client requires string ${key}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(client.id)) throw new Error(`invalid fleet client id: ${client.id}`);
  if (!/^invisra\/[A-Za-z0-9._-]+$/.test(client.repository)) throw new Error(`${client.id}: invalid repository ${client.repository}`);
  if (!Array.isArray(client.requiredPaths) || client.requiredPaths.length === 0) {
    throw new Error(`${client.id}: requiredPaths must be non-empty`);
  }
  if (new Set(client.requiredPaths).size !== client.requiredPaths.length) {
    throw new Error(`${client.id}: requiredPaths contains duplicates`);
  }
}

function assertExists(id, checkout, relativePath) {
  if (!relativePath || typeof relativePath !== "string") throw new Error(`${id}: invalid path ${relativePath}`);
  const resolved = path.resolve(checkout, relativePath);
  const normalizedCheckout = `${path.resolve(checkout)}${path.sep}`;
  if (resolved !== path.resolve(checkout) && !resolved.startsWith(normalizedCheckout)) {
    throw new Error(`${id}: path escapes checkout: ${relativePath}`);
  }
  if (!fs.existsSync(resolved)) throw new Error(`${id}: required path not found: ${relativePath}`);
}

function readJson(id, checkout, relativePath) {
  const fullPath = path.join(checkout, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`${id}: invalid JSON in ${relativePath}: ${error.message}`);
  }
}

function sameOrParent(configured, expected) {
  const normalizedConfigured = configured.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedExpected = expected.replace(/\\/g, "/").replace(/\/$/, "");
  return normalizedExpected === normalizedConfigured || normalizedExpected.startsWith(`${normalizedConfigured}/`);
}

function countOccurrences(source, value) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(value, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + value.length;
  }
}
