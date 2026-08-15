# Invisra API client conformance contract

Version: 2.0

This package follows the common behavioral contract for Invisra API clients. The contract defines externally observable behavior and machine-readable operation metadata, not a shared runtime dependency.

## Request lifecycle events

Clients that expose request events use these phases:

- `request`: emitted before the transport is invoked, with outcome `not-sent`.
- `response`: emitted for a successful HTTP response, with outcome `known`.
- `error`: emitted for a non-success HTTP response with outcome `known`, or for a transport failure with outcome `unknown`.
- `retry`: emitted before a repeated attempt, with outcome `unknown`.

Every event includes the client identifier, uppercase HTTP method, sanitized URL, and a one-based attempt number. Response and transport-completion events include elapsed duration when available. HTTP responses include status when available.

Observer callbacks are diagnostic only. An exception raised by an observer must never alter request behavior.

## URL privacy

URLs exposed through events or errors must omit query strings and fragments. Headers, credentials, request bodies, and response bodies are never included in lifecycle events.

## Operation safety metadata

Every covered operation declares semantic safety independently from its HTTP method:

- `classification`: `read`, `mutation`, `consequential`, or `unknown`.
- `idempotency`: `idempotent`, `non-idempotent`, or `unknown`.
- `retryPolicy`: `safe`, `none`, or `explicit`.
- `confirmationRequired`: whether the client must receive explicit caller acknowledgement before sending the request.

HTTP method remains part of the upstream contract, but it is not by itself sufficient to determine whether an operation may be retried. A read-only operation may be exposed through `POST`, while a superficially safe transport shape can still represent vendor-defined side effects.

A `safe` retry policy is valid only for semantically idempotent operations. `explicit` is reserved for operations that may be retried only under a vendor-specific guarantee or explicit caller policy. `none` means the general retry mechanism must not repeat the operation.

## Retry behavior

Automatic general retries are governed by the operation's semantic retry policy. Retryable HTTP statuses are `429`, `502`, `503`, and `504`; implementations may also retry transient transport failures when the operation is eligible for automatic retry.

When richer operation metadata is unavailable, clients may conservatively fall back to HTTP safe methods (`GET`, `HEAD`, and `OPTIONS`). Mutations with unknown or non-idempotent semantics are never automatically retried by the general retry policy.

Attempt counts are one-based and represent the actual transport attempt. `Retry-After` is honored when supplied by the upstream service.

## Consequential and confirmed operations

Operations that can create real orders, manufacturing jobs, subscriptions, or similarly consequential external state must be classified accordingly and require explicit confirmation. A client may also require confirmation for non-consequential mutations when an accidental request would still create meaningful account state.

A missing confirmation fails before sending a network request.

When a non-retryable mutation may have been transmitted but no response was received, the client raises an unknown-outcome error where the implementation can identify that condition. Callers must reconcile upstream state before retrying.

## API coverage manifest

Schema version 2 requires each operation to have a stable `id`, one operation per manifest entry, semantic safety metadata, and language symbols for every implementation marked present.

CI validates that declared TypeScript and Python symbols exist. This is a minimum parity guarantee: it prevents the manifest from claiming a language implementation that has disappeared or been renamed without an accompanying manifest change. Behavioral parity remains covered by conformance and fixture tests.

## Errors

Structured API errors should preserve, when available: HTTP status, request identifier, retryability, retry delay, sanitized URL, attempt count, and original cause. Deliberate validation or confirmation failures are not retryable.

## Compatibility

Endpoint models, authentication, and transport adapters remain project-specific. Conformance does not require identical method names or a shared base class across TypeScript and Python. Shared specifications, fixtures, validators, generators, and CI are preferred over a mandatory shared runtime dependency.
