#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const configPath = argument("--config", "operation-capabilities.config.json");
const check = process.argv.includes("--check");

if (!fs.existsSync(configPath)) {
  console.error(`Capability generator config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const manifestPath = config.manifest ?? "api-coverage.json";
const tsPath = config.typescriptOutput;
const pyPath = config.pythonOutput;

if (!tsPath || !pyPath) {
  console.error("Config must define typescriptOutput and pythonOutput.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const capabilities = manifest.operations.map((operation) => ({
  id: operation.id,
  method: operation.method,
  path: operation.path ?? null,
  confidence: operation.confidence,
  classification: operation.classification,
  idempotency: operation.idempotency,
  retryPolicy: operation.retryPolicy,
  confirmationRequired: operation.confirmationRequired,
  experimental: Boolean(operation.experimental),
}));
const nullablePaths = capabilities.some((capability) => capability.path === null);

const tsRows = capabilities.map((capability) => `  ${JSON.stringify(capability)},`).join("\n");
const pyRows = capabilities
  .map(
    (capability) =>
      `    OperationCapability(${JSON.stringify(capability.id)}, ${JSON.stringify(capability.method)}, ${capability.path === null ? "None" : JSON.stringify(capability.path)}, ${JSON.stringify(capability.confidence)}, ${JSON.stringify(capability.classification)}, ${JSON.stringify(capability.idempotency)}, ${JSON.stringify(capability.retryPolicy)}, ${capability.confirmationRequired ? "True" : "False"}, ${capability.experimental ? "True" : "False"}),`,
  )
  .join("\n");

const tsPathType = nullablePaths ? "string | null" : "string";
const ts = `/** Generated operation capability registry derived from ${manifestPath}. Do not edit manually. */
export type OperationClassification = "read" | "mutation" | "consequential" | "unknown";
export type OperationIdempotency = "idempotent" | "non-idempotent" | "unknown";
export type OperationRetryPolicy = "safe" | "none" | "explicit";

export interface OperationCapability {
  id: string;
  method: string;
  path: ${tsPathType};
  confidence: string;
  classification: OperationClassification;
  idempotency: OperationIdempotency;
  retryPolicy: OperationRetryPolicy;
  confirmationRequired: boolean;
  experimental: boolean;
}

export const OPERATION_CAPABILITIES: readonly OperationCapability[] = Object.freeze([
${tsRows}
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\\${}()|[\\]\\\\]/g, "\\\\$&");
}

function pathMatches(template: string, actual: string): boolean {
  const pattern = `^${"${template"}
    .split(/(\\{[^}]+\\})/g)
    .map((part) => (part.startsWith("{") && part.endsWith("}") ? "[^/]+" : escapeRegExp(part)))
    .join("")}$`;
  return new RegExp(pattern).test(actual);
}

function routeSpecificity(template: string): number {
  return template.replace(/\\{[^}]+\\}/g, "").length;
}

export function getOperationCapability(id: string): OperationCapability | undefined {
  return OPERATION_CAPABILITIES.find((capability) => capability.id === id);
}

export function findOperationCapability(
  method: string,
  path: string,
): OperationCapability | undefined {
  const normalizedMethod = method.toUpperCase();
  return OPERATION_CAPABILITIES.filter(
    (capability) =>
      capability.path !== null &&
      capability.method === normalizedMethod &&
      pathMatches(capability.path, path),
  ).sort(
    (left, right) =>
      routeSpecificity(right.path ?? "") - routeSpecificity(left.path ?? ""),
  )[0];
}

export function operationCapabilityAttributes(
  capability: OperationCapability,
): Readonly<Record<string, string | boolean>> {
  return Object.freeze({
    "invisra.operation.id": capability.id,
    "invisra.operation.classification": capability.classification,
    "invisra.operation.idempotency": capability.idempotency,
    "invisra.operation.retry_policy": capability.retryPolicy,
    "invisra.operation.confidence": capability.confidence,
    "invisra.operation.confirmation_required": capability.confirmationRequired,
    "invisra.operation.experimental": capability.experimental,
  });
}
`;

const pyPathType = nullablePaths ? "str | None" : "str";
const py = `\"\"\"Generated operation capability registry derived from ${manifestPath}. Do not edit manually.\"\"\"

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

OperationClassification = Literal[\"read\", \"mutation\", \"consequential\", \"unknown\"]
OperationIdempotency = Literal[\"idempotent\", \"non-idempotent\", \"unknown\"]
OperationRetryPolicy = Literal[\"safe\", \"none\", \"explicit\"]


@dataclass(frozen=True, slots=True)
class OperationCapability:
    id: str
    method: str
    path: ${pyPathType}
    confidence: str
    classification: OperationClassification
    idempotency: OperationIdempotency
    retry_policy: OperationRetryPolicy
    confirmation_required: bool
    experimental: bool


OPERATION_CAPABILITIES: tuple[OperationCapability, ...] = (
${pyRows}
)


def _path_matches(template: str, actual: str) -> bool:
    pieces = re.split(r\"(\\{[^}]+\\})\", template)
    pattern = \"\".join(
        r\"[^/]+\" if piece.startswith(\"{\") and piece.endswith(\"}\") else re.escape(piece)
        for piece in pieces
    )
    return re.fullmatch(pattern, actual) is not None


def _route_specificity(template: str) -> int:
    return len(re.sub(r\"\\{[^}]+\\}\", \"\", template))


def get_operation_capability(operation_id: str) -> OperationCapability | None:
    return next(
        (capability for capability in OPERATION_CAPABILITIES if capability.id == operation_id),
        None,
    )


def find_operation_capability(method: str, path: str) -> OperationCapability | None:
    normalized_method = method.upper()
    matches = [
        capability
        for capability in OPERATION_CAPABILITIES
        if capability.path is not None
        and capability.method == normalized_method
        and _path_matches(capability.path, path)
    ]
    return max(
        matches,
        key=lambda capability: _route_specificity(capability.path or \"\"),
        default=None,
    )


def operation_capability_attributes(
    capability: OperationCapability,
) -> dict[str, str | bool]:
    return {
        \"invisra.operation.id\": capability.id,
        \"invisra.operation.classification\": capability.classification,
        \"invisra.operation.idempotency\": capability.idempotency,
        \"invisra.operation.retry_policy\": capability.retry_policy,
        \"invisra.operation.confidence\": capability.confidence,
        \"invisra.operation.confirmation_required\": capability.confirmation_required,
        \"invisra.operation.experimental\": capability.experimental,
    }
`;

const outputs = [
  [tsPath, ts],
  [pyPath, py],
];

let stale = false;
for (const [outputPath, expected] of outputs) {
  if (check) {
    const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (actual !== expected) {
      console.error(`${outputPath} is stale. Run the shared capability generator.`);
      stale = true;
    }
    continue;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected);
  console.log(`Generated ${outputPath}.`);
}

if (stale) process.exit(1);
if (check) console.log("Generated operation capability registries are up to date.");
