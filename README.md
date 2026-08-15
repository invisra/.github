# Invisra Labs organization profile

This repository contains the GitHub organization profile content for Invisra Labs, along with reusable GitHub Actions workflows and build-time tooling shared across Invisra projects.

GitHub renders the organization profile from [`profile/README.md`](profile/README.md). Local assets used by the profile live in [`profile/assets/`](profile/assets/).

## Reusable workflows

Organization-wide reusable workflows live in `.github/workflows/`.

### API coverage

`api-client-coverage.yml` validates an `api-coverage.json` operation registry and can optionally run a repository-provided drift check.

Inputs:

- `node-version` — Node.js version; defaults to `24`.
- `validator-path` — repository-relative validator path.
- `run-drift` — optionally runs drift validation.

### API observability

`api-client-observability.yml` validates operation semantics and generated capability metadata against the versioned contract in `contracts/api-client-observability-v1.json`.

The contract covers lifecycle metadata, operation classification, idempotency, retry policy, confidence, confirmation requirements, experimental status, and shared telemetry attribute names.

The workflow uses this repository only at build time. Consuming packages remain self-contained and do not gain a runtime dependency on this repository.

## Shared generators

### Operation capabilities

`scripts/generate-api-client-operation-capabilities.mjs` generates TypeScript and Python operation-capability registries from `api-coverage.json`.

Configuration can specify manifest/output paths and, when necessary, explicit route-matching exceptions such as placeholders that may span `/` characters. Null-path operations remain available for explicit lookup but are excluded from automatic URL matching.

### API reference

`scripts/generate-api-client-reference.mjs` generates Markdown API reference documentation from `api-coverage.json`.

A small JSON config selects the manifest, output path, and presentation profile. Multiple profiles are supported for projects that need different combinations of operation status, confidence, guard, deprecation, or governance details.

Both generators support freshness checks so generated artifacts can remain checked in while their implementation stays centralized.

## Pinning

Consumers should pin reusable workflows, contracts, and shared generators to reviewed tags or commit SHAs rather than tracking an unreviewed branch.
