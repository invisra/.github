# Invisra Labs organization profile

This repository contains the GitHub organization profile content for Invisra Labs.

GitHub renders the organization profile from [`profile/README.md`](profile/README.md). Local SVG assets for the rendered profile live in [`profile/assets/`](profile/assets/).

## Reusable workflows

Organization-wide reusable GitHub Actions workflows live in `.github/workflows/`.

### API client coverage

`api-client-coverage.yml` standardizes validation of the `api-coverage.json` operation registry used by Invisra vendor API clients. Calling repositories retain their own event/path filters and invoke the shared workflow with `uses: invisra/.github/.github/workflows/api-client-coverage.yml@<ref>`.

Inputs:

- `node-version` — Node.js version used by the validator; defaults to `24`.
- `validator-path` — repository-relative validator path; defaults to `scripts/validate-api-coverage.mjs`.
- `run-drift` — additionally invokes the validator with `--drift`; defaults to `false`.

### API client observability

`api-client-observability.yml` validates the semantic operation metadata used by runtime capability registries and verifies that each caller's generated registries are fresh. The versioned machine-readable contract lives at `contracts/api-client-observability-v1.json`.

Contract v1 standardizes:

- lifecycle phases and outcomes;
- operation classification, idempotency, retry policy, confidence, confirmation, and experimental metadata;
- flat telemetry attribute names such as `invisra.operation.id`, `invisra.operation.retry_policy`, and `invisra.request.outcome`;
- invariants including `retryPolicy: safe` requiring an idempotent operation and consequential operations requiring confirmation with no automatic retry by default.

The workflow checks out this repository separately, so published client packages have no runtime dependency on it. Callers pass `contract-ref` explicitly and should pin both the workflow `uses:` ref and `contract-ref` to the same reviewed commit SHA.

The same checkout also supplies `scripts/generate-api-client-operation-capabilities.mjs`, the shared build-time generator for TypeScript and Python operation capability registries. Each client provides an `operation-capabilities.config.json` file containing repository-specific paths and, when needed, route-matching exceptions. For example:

```json
{
  "manifest": "api-coverage.json",
  "typescriptOutput": "typescript/src/operation-capabilities.ts",
  "pythonOutput": "python/src/vendor_client/operation_capabilities.py",
  "slashSpanningOperationIds": ["assets.get-image"]
}
```

The generator derives the full runtime registry from the manifest, includes null-path capabilities for explicit lookup while excluding them from automatic URL matching, supports placeholders embedded anywhere in a path segment, and selects the most-specific matching route. By default placeholders match one path segment. `slashSpanningOperationIds` explicitly identifies operations whose placeholder values may contain `/`, for APIs that model a nested resource path inside one template parameter. Generated packages remain completely self-contained.

Observability workflow inputs:

- `node-version` — Node.js version used by validation/generation; defaults to `24`.
- `manifest-path` — API coverage manifest; defaults to `api-coverage.json`.
- `generator-config-path` — shared generator config; defaults to `operation-capabilities.config.json`.

### API reference generation

`scripts/generate-api-client-reference.mjs` centralizes the build-time generation of `docs/api-reference.md` from each client's authoritative `api-coverage.json`. Calling repositories keep a tiny pinned bootstrap plus `api-reference.config.json`; published packages and generated documentation have no runtime dependency on this repository.

Example configuration:

```json
{
  "manifest": "api-coverage.json",
  "output": "docs/api-reference.md",
  "profile": "standard"
}
```

Supported profiles preserve the vendor-specific presentation already used by the four clients:

- `standard` — compact operation/HTTP/symbol/semantics table used by McMaster-Carr;
- `digikey` — separates verified/public and experimental/inferred operations and includes guard metadata;
- `jlcpcb` — includes source confidence and caller-supplied path semantics;
- `mouser` — includes deprecation status and Swagger/model-governance notes.

The generator supports `--check` for byte-for-byte freshness validation, so repositories can keep generated Markdown checked in while removing duplicated rendering logic.

Callers should pin reusable workflows, shared generators, contract references, and local bootstraps to stable tags or commit SHAs rather than tracking an unreviewed branch.
