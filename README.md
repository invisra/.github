# Invisra Labs organization profile

This repository contains the GitHub organization profile content for Invisra Labs, along with reusable GitHub Actions workflows and build-time tooling shared across Invisra projects.

GitHub renders the organization profile from [`profile/README.md`](profile/README.md). Local assets used by the profile live in [`profile/assets/`](profile/assets/).

## Reusable workflows

Organization-wide reusable workflows live in `.github/workflows/`.

### API coverage

`api-client-coverage.yml` validates an `api-coverage.json` operation registry with the shared build-time validator in `scripts/validate-api-client-coverage.mjs`. Projects provide a small JSON config describing source roots and any stricter manifest requirements, while upstream drift checks remain repository-specific.

The workflow can also verify checked-in API reference documentation, generated operation-capability registries, conformance documentation, and Conformance v2 transport fixtures against the shared sources. A repository-provided drift validator can optionally run after shared semantic, parity, and freshness validation succeeds.

### API package CI

`api-client-package-ci.yml` provides the common Node/npm and Python package validation pipeline used by dual-package API clients: dependency installation and audit, lint/typecheck/tests, examples, package builds, and installed-artifact smoke tests. Repository-specific paths, package names, install extras, and test commands are supplied as workflow inputs.

Clients with materially different build systems or monorepo/code-generation requirements should keep their package CI local rather than forcing those differences into the reusable workflow.

### API observability

`api-client-observability.yml` validates operation semantics and generated capability metadata against the versioned contract in `contracts/api-client-observability-v1.json`.

The contract covers lifecycle metadata, operation classification, idempotency, retry policy, confidence, confirmation requirements, experimental status, and shared telemetry attribute names.

The workflows use this repository only at build time. Consuming packages remain self-contained and do not gain a runtime dependency on this repository.

## Shared contracts and generators

### Conformance

`contracts/api-client-conformance-v2.md` is the canonical human-readable Conformance v2 contract. `scripts/generate-api-client-conformance.mjs` copies that contract into checked-in project documentation and can append project-specific sections through a small JSON config.

`contracts/api-client-conformance-v2-transport-fixtures.json` defines shared transport-level conformance vectors for lifecycle vocabulary, observable URL privacy, observer isolation and immutability, structured API-error metadata, timeout retryability, caller cancellation, semantic retry policy, explicit confirmation, and unknown outcomes. Semantic retry vectors define retryable statuses and expected attempts for safe versus non-retrying operations without prescribing a vendor-specific HTTP method. Confirmation vectors require guarded operations to fail before transport when acknowledgement is absent. Unknown-outcome vectors require a transmitted non-retryable mutation that loses its response to surface an unknown outcome after exactly one attempt and direct callers to reconcile upstream state before retrying. `scripts/sync-api-client-conformance-fixtures.mjs` copies the fixture dataset into client repositories so language-specific tests remain deterministic and offline while sharing one source of expected behavior.

### Operation capabilities

`scripts/generate-api-client-operation-capabilities.mjs` generates TypeScript and Python operation-capability registries from `api-coverage.json`.

Configuration can specify manifest/output paths and, when necessary, explicit route-matching exceptions such as placeholders that may span `/` characters. Null-path operations remain available for explicit lookup but are excluded from automatic URL matching.

### API reference

`scripts/generate-api-client-reference.mjs` generates Markdown API reference documentation from `api-coverage.json`.

A small JSON config selects the manifest, output path, and presentation profile. Multiple profiles are supported for projects that need different combinations of operation status, confidence, guard, deprecation, or governance details.

The generators support freshness checks so generated artifacts can remain checked in while their implementation stays centralized.

## Pinning

Consumers should pin reusable workflows, contracts, validators, and shared generators to reviewed tags or commit SHAs rather than tracking an unreviewed branch.
