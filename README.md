# Invisra Labs organization profile

This repository contains the GitHub organization profile content for Invisra Labs, along with reusable GitHub Actions workflows and build-time tooling shared across Invisra projects.

GitHub renders the organization profile from [`profile/README.md`](profile/README.md). Local assets used by the profile live in [`profile/assets/`](profile/assets/).

## Reusable workflows

Organization-wide reusable workflows live in `.github/workflows/`.

### API coverage

`api-client-coverage.yml` validates an `api-coverage.json` operation registry with the shared build-time validator in `scripts/validate-api-client-coverage.mjs`. Projects provide a small JSON config describing source roots and any stricter manifest requirements, while upstream drift checks remain repository-specific.

The workflow can also verify checked-in API reference documentation, generated operation-capability registries, and conformance documentation against the shared generators. A repository-provided drift validator can optionally run after shared semantic, parity, and freshness validation succeeds.

### API observability

`api-client-observability.yml` validates operation semantics and generated capability metadata against the versioned contract in `contracts/api-client-observability-v1.json`.

The contract covers lifecycle metadata, operation classification, idempotency, retry policy, confidence, confirmation requirements, experimental status, and shared telemetry attribute names.

The workflows use this repository only at build time. Consuming packages remain self-contained and do not gain a runtime dependency on this repository.

## Shared contracts and generators

### Conformance

`contracts/api-client-conformance-v2.md` is the canonical human-readable Conformance v2 contract. `scripts/generate-api-client-conformance.mjs` copies that contract into checked-in project documentation and can append project-specific sections through a small JSON config.

### Operation capabilities

`scripts/generate-api-client-operation-capabilities.mjs` generates TypeScript and Python operation-capability registries from `api-coverage.json`.

Configuration can specify manifest/output paths and, when necessary, explicit route-matching exceptions such as placeholders that may span `/` characters. Null-path operations remain available for explicit lookup but are excluded from automatic URL matching.

### API reference

`scripts/generate-api-client-reference.mjs` generates Markdown API reference documentation from `api-coverage.json`.

A small JSON config selects the manifest, output path, and presentation profile. Multiple profiles are supported for projects that need different combinations of operation status, confidence, guard, deprecation, or governance details.

The generators support freshness checks so generated artifacts can remain checked in while their implementation stays centralized.

## Pinning

Consumers should pin reusable workflows, contracts, validators, and shared generators to reviewed tags or commit SHAs rather than tracking an unreviewed branch.
