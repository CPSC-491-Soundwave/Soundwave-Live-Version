# Docker Compose Runtime Smoke Test

## Purpose

SCRUM-125 integrates the existing Soundwave Docker Compose smoke test into GitHub Actions so the CI pipeline validates that the containerized application can start and respond at runtime.

## CI Contract

The GitHub Actions runtime smoke job:

- checks out the repository
- creates disposable CI-only environment files
- generates a temporary JWT secret
- runs the existing `scripts/compose-smoke-test.mjs`
- fails the CI job if the smoke test fails

No real local `.env` files or production secrets are committed.

## Runtime Validation

The smoke test verifies:

- Docker Compose services build and start
- the backend `/health` endpoint responds successfully
- the protected `/api/library/recently-added` endpoint is reachable
- an unauthenticated Library request returns `401 Unauthorized`
- the client responds successfully
- Compose services are shut down after validation

## Failure Behavior

Any failed runtime check causes the smoke-test script to exit with a non-zero status, which causes the GitHub Actions job to fail.

## Cleanup

The smoke-test script performs `docker compose down` in its cleanup path so containers and networks are removed after success or failure.

## Security

CI uses disposable runtime values only.

The workflow does not commit or require:

- production JWT secrets
- production database credentials
- local developer `.env` files

The generated JWT secret exists only for the lifetime of the GitHub Actions job.