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

The workflow checks out the contract repository separately, so published client packages have no runtime dependency on this repository. Callers pass `contract-ref` explicitly and should pin both the workflow `uses:` ref and `contract-ref` to the same reviewed commit SHA.

Other inputs:

- `node-version` — Node.js version used by the validator; defaults to `24`.
- `manifest-path` — API coverage manifest; defaults to `api-coverage.json`.
- `generator-path` — operation capability generator; defaults to `scripts/generate-operation-capabilities.mjs`.

Callers should pin reusable workflows and contract references to stable tags or commit SHAs rather than tracking an unreviewed branch.
