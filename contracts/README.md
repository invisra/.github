# Shared API client contracts

This directory contains versioned build-time contracts used by reusable validation and generation tooling.

- `api-client-conformance-v2.md` — canonical human-readable Conformance v2 behavior.
- `api-client-conformance-v2.json` — machine-readable Conformance v2 vocabulary and retry defaults.
- `api-client-observability-v1.json` — observability metadata and telemetry contract.
- `api-client-coverage-validator-v1.json` — coverage validator invariants.
- `api-client-tooling-pins-v1.json` — immutable shared-tooling pin lock invariants.
- `api-client-public-surface-v1.json` — package-root public API regression invariants.
- `api-client-fleet-v1.json` — canonical registry of governed vendor clients, package/source roots, required governance files, vendor identities, and fleet-wide tooling baselines.
- `api-coverage-v2.schema.json` — structural schema for `api-coverage.json` manifests.
- `api-coverage-validator-config-v1.schema.json` — structural schema for shared coverage-validator configuration.
- `public-api-surface-v1.schema.json` — structural schema for package public-surface contracts.
- `shared-tooling-pins-v1.schema.json` — structural schema for immutable shared-tooling pin locks.
- `operation-capabilities-config-v1.schema.json` — structural schema for capability-generator configuration.

The reusable coverage workflow runs structural schema validation before semantic validation or code generation. Structural schemas catch malformed types, unknown keys, invalid enums/patterns, and missing required fields; the existing semantic validators remain authoritative for cross-field rules such as consequential-operation confirmation, safe-retry semantics, source-symbol presence, and canonical Conformance version checks.

The fleet audit checks the registered clients as a group. It verifies that each checkout has the expected governance files and source roots, that referenced config paths exist, that coverage vendor identity matches the registry, and that the shared API-coverage pin/workflow match the fleet baseline. It intentionally does not yet require identical package-CI or observability pin layouts where the clients still differ.

These contracts describe observable behavior and governance. They do not create a shared runtime dependency for consuming packages.
