
# SCRUM-185 — Docker Compose Cleanup Verification

## Purpose

Verify that Soundwave's Docker Compose runtime testing environment removes disposable containers, networks, and volumes after testing.

## Testing Scope

This work extends the runtime failure-testing coverage established under SCRUM-181.

SCRUM-181 focuses on detecting and reporting failures.

SCRUM-185 focuses on Docker resource cleanup, isolation, and repeatability.

## Testing Methodologies

- Automated integration testing
- Resource lifecycle verification
- Negative-path testing
- Regression testing
- Repeatability testing

## Test Scenarios

### 1. Successful Startup Cleanup

Start the Soundwave CI Compose stack.

Verify that the backend becomes healthy.

Record Compose container, network, and volume identifiers.

Stop the stack using Docker Compose cleanup commands.

Verify that recorded resources are removed.

### 2. Backend Failure Cleanup

Start the Compose stack with an intentionally unavailable backend.

Verify that the backend does not become ready.

Record the resources associated with the test project.

Run cleanup and verify resource removal.

### 3. Repeated Startup Cleanup

Start the stack again after the previous cleanup.

Verify successful startup and readiness.

Confirm that cleanup succeeds again without leftover resources.

## Running the Tests

From the repository root:

```bash
node scripts/compose-cleanup-tests.mjs
```

## Requirements

- Node.js
- Docker Desktop
- Docker Compose
- Disposable local database environment configuration
- Test-only backend authentication secrets

## Resource Isolation

The test harness creates a uniquely named Docker Compose project.

Resource verification uses Docker Compose project labels and recorded resource identifiers.

The script does not intentionally modify or remove unrelated Docker projects.

Temporary Compose override files are removed after execution.

## Expected Results

Each scenario should report PASS when its expected startup or failure condition is observed and cleanup succeeds.

The test should verify:

- Containers removed
- Compose networks removed
- Project-labeled volumes removed
- No remaining project-labeled resources
- Repeated startup and cleanup succeed

The test does not require a new GitHub Actions job.

## CI Integration

This script is manually triggered.

It is not added to the existing GitHub Actions workflow and does not introduce new required pull request checks.

## Jira

SCRUM-185:
https://491group1.atlassian.net/browse/SCRUM-185

Parent Story SCRUM-174:
https://491group1.atlassian.net/browse/SCRUM-174

## Ownership

Konner Rigby — Sprint 3 Docker Compose cleanup verification.

This work does not modify teammate-owned frontend, backend, authentication, media, or database implementation.
