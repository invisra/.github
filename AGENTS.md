# AGENTS.md

This repository is the canonical home for shared Invisra GitHub governance, reusable workflows, API-client contracts, schemas, validators, and generators.

## Scope

Keep changes here generic and reusable across repositories. This repository should define shared behavior and tooling boundaries, not vendor-specific implementation details.

- `contracts/` contains canonical schemas, fixtures, and behavioral contracts.
- `scripts/` contains shared generators and validators.
- `tests/` contains tests for shared tooling and contracts.
- `.github/` contains reusable workflows and GitHub configuration.
- `profile/` contains organization profile content.

## Governance rules

- Prefer a contract-first workflow for cross-repository behavior changes: define or update the generic contract here, validate it here, then update consumers in separate pull requests.
- Extend existing contracts, fixtures, schemas, validators, and generators when they already model the behavior. Avoid parallel mechanisms that express the same rule differently.
- Keep contracts focused on observable behavior and build-time governance. Do not create shared runtime dependencies for consumer packages unless that is an explicit architectural decision.
- Preserve backwards compatibility for published/shared contracts unless the change intentionally introduces a new version.
- When a breaking contract change is necessary, version it explicitly and keep migration intent clear.
- Keep reusable workflows and tooling deterministic, reproducible, and suitable for immutable pinning by consumers.
- Generated artifacts must remain reproducible and should be covered by freshness or drift checks where practical.
- Prefer machine-readable contracts plus tests over prose-only policy.

## Repository boundaries

Do not add vendor-specific or consumer-specific fleet state to this repository.

Examples of content that does **not** belong here:

- hardcoded lists of vendor API-client repositories;
- vendor endpoints, credentials, secrets, account identifiers, or operational state;
- per-client release state, publishing state, or package inventory;
- inferred or speculative vendor API behavior presented as authoritative;
- consumer-specific configuration that is not a reusable governance primitive.

If orchestration needs a fleet registry or consumer inventory, keep it in an appropriate dedicated internal/governance location rather than this shared public governance repository.

## API-client guidance

- Treat undocumented, gated, or inferred vendor operations as unverified until supported by authoritative evidence.
- Do not promote speculative routes or payloads into canonical coverage merely for symmetry across clients.
- Safe/read operations may support bounded retry behavior when the contract permits it.
- Mutating or consequential operations must not gain automatic replay merely for parity with read operations.
- Prefer explicit confirmation and unknown-outcome reconciliation semantics for consequential operations where applicable.
- Keep timeout, retry, cancellation, observability, and error behavior aligned with the shared conformance contracts.
- When multiple clients expose the same behavioral rule, prefer adding or extending a shared conformance fixture here before duplicating ad hoc tests across consumers.

## Change discipline

- Keep pull requests focused on one coherent governance or tooling change.
- Update tests whenever changing contracts, schemas, validators, generators, or reusable workflows.
- Avoid unrelated formatting or documentation churn in functional pull requests.
- Do not weaken validation simply to make a consumer implementation pass; determine whether the contract or the consumer is wrong first.
- Do not automatically merge pull requests or publish/release consumer packages unless explicitly requested.
- Do not add secrets, tokens, private keys, credentials, or sensitive operational data to commits, fixtures, examples, logs, or generated artifacts.

## Consumer updates

After a shared change lands here:

1. Pin or consume the canonical shared artifact as appropriate.
2. Update each consumer independently.
3. Preserve each consumer's documented API and vendor-specific safety constraints.
4. Verify its normal CI and shared governance checks.
5. Keep publishing and release work separate unless explicitly part of the task.
