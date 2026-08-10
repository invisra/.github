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

Callers should pin a stable tag or commit SHA once the reusable workflow is established rather than tracking an unreviewed branch.
