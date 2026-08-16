# Shared API client contracts

This directory contains versioned build-time contracts used by reusable validation and generation tooling.

- `api-client-conformance-v2.md` — canonical human-readable Conformance v2 behavior.
- `api-client-conformance-v2.json` — machine-readable Conformance v2 vocabulary and retry defaults.
- `api-client-observability-v1.json` — observability metadata and telemetry contract.
- `api-client-coverage-validator-v1.json` — coverage validator invariants.
- `api-client-tooling-pins-v1.json` — immutable shared-tooling pin lock invariants.
- `api-client-public-surface-v1.json` — package-root public API regression invariants.

These contracts describe observable behavior and governance. They do not create a shared runtime dependency for consuming packages.
