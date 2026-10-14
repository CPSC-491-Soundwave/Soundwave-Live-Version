
# SCRUM-181 — Compose Runtime Failure Testing

## Purpose

Provide repeatable negative-path integration tests for the Soundwave Docker Compose runtime smoke test.

These tests verify that runtime failures are detected and reported rather than incorrectly accepted as successful application startup.

## Scope

The failure-test harness covers:

1. Backend permanently unavailable.
2. Client permanently unavailable.
3. Incorrect backend health response.
4. Docker Compose startup/image-pull failure.

## Testing Methodologies

- Automated integration testing
- Negative-path testing
- Controlled fault injection
- Runtime regression testing

## Running the Tests

From the Soundwave repository root:

```bash
node scripts/compose-failure-tests.mjs
```

Requirements:

- Docker Desktop running
- Node.js installed
- Docker Compose available
- Local test-only `database/.env`
- Local test-only `server/.env`

The server environment must provide valid test-only JWT and media-ticket secrets.

## Expected Results

Each deliberately broken runtime scenario must:

- Cause the existing smoke test to fail.
- Produce a nonzero exit code.
- Report the expected failure condition.
- Attempt to collect Compose diagnostics.
- Clean up temporary Compose resources.

The harness reports PASS when the expected failure is correctly detected and cleanup succeeds.

## Isolation

The harness uses a dedicated Compose project name and temporary override files.

It does not modify application source files or the shared GitHub Actions workflow.

Temporary containers, networks, and volumes are removed after testing.

Do not run multiple copies of the harness concurrently using the same Compose project name.

## CI Integration

This script is intentionally opt-in.

It is not added to `.github/workflows/ci.yml` and does not introduce new required GitHub Actions checks.

Future CI integration requires team coordination.

## Jira

SCRUM-181:
https://491group1.atlassian.net/browse/SCRUM-181

Parent Story SCRUM-174:
https://491group1.atlassian.net/browse/SCRUM-174

## Ownership

Konner Rigby — Sprint 3 Compose runtime failure testing.

This contribution does not change teammate-owned authentication, database, media streaming, or application functionality.
