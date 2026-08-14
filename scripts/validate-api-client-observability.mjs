#!/usr/bin/env node
import fs from "node:fs";

const [manifestPath = "api-coverage.json", contractPath = "contracts/api-client-observability-v1.json"] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const errors = [];

if (contract.contractVersion !== 1) errors.push(`Unsupported contract version: ${contract.contractVersion}`);
if (!Array.isArray(manifest.operations)) errors.push("Manifest must contain an operations array.");

const ids = new Set();
for (const [index, operation] of (manifest.operations ?? []).entries()) {
  const label = operation.id ?? `operations[${index}]`;
  for (const field of contract.operationCapability.requiredFields) {
    if (!(field in operation)) errors.push(`${label}: missing required field ${field}`);
  }
  if (typeof operation.id === "string") {
    if (ids.has(operation.id)) errors.push(`${label}: duplicate operation id`);
    ids.add(operation.id);
  }
  if (!contract.operationCapability.classification.includes(operation.classification)) {
    errors.push(`${label}: invalid classification ${operation.classification}`);
  }
  if (!contract.operationCapability.idempotency.includes(operation.idempotency)) {
    errors.push(`${label}: invalid idempotency ${operation.idempotency}`);
  }
  if (!contract.operationCapability.retryPolicy.includes(operation.retryPolicy)) {
    errors.push(`${label}: invalid retryPolicy ${operation.retryPolicy}`);
  }
  if (operation.retryPolicy === "safe" && operation.idempotency !== "idempotent") {
    errors.push(`${label}: retryPolicy=safe requires idempotency=idempotent`);
  }
  if (operation.classification === "consequential") {
    if (operation.confirmationRequired !== true) {
      errors.push(`${label}: consequential operations must require confirmation`);
    }
    if (operation.retryPolicy !== contract.operationCapability.invariants.consequentialDefaultRetryPolicy) {
      errors.push(`${label}: consequential operations must default to retryPolicy=${contract.operationCapability.invariants.consequentialDefaultRetryPolicy}`);
    }
  }
  if ("experimental" in operation && typeof operation.experimental !== "boolean") {
    errors.push(`${label}: experimental must be boolean when present`);
  }
}

if (errors.length) {
  console.error(`Observability contract validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${(manifest.operations ?? []).length} operations against observability contract v${contract.contractVersion}.`);
