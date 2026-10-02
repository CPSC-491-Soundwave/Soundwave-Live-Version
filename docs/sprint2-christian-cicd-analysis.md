# Soundwave Sprint 2 CI/CD Analysis and Results

**Owner:** Christian McGowan  
**Course:** CPSC 491-05  
**Sprint:** Sprint 2  
**Assigned CI/CD focus:** Build versioning and CI orchestration

## Purpose

This document records the Sprint 2 CI/CD baseline, identified gaps, implemented improvements, hosted verification evidence, remaining risks, and later-sprint recommendations for Christian McGowan's individual CI/CD responsibility.

## Sprint 2 Starting CI Baseline

At the beginning of Sprint 2, the shared GitHub Actions workflow already provided:

    Server Tests
    Client Lint
    Client Build

The repository also used peer-reviewed pull requests and protected `main`.

Important local verification existed for database, packaging, media, and integration behavior, but not all of that verification was represented as a stable CI gate.

## Gap Analysis

### Build identity/versioning

Beginning-of-sprint state:

- no shared Soundwave build-version convention;
- no human-readable build identity;
- no machine-readable build metadata.

Sprint 2 result:

- added `s2.<run_number>+<short_sha>`;
- added `build-info.json`;
- added direct workflow output and environment export.

### Database CI

Beginning-of-sprint state:

- PostgreSQL migration/seed/integration verification existed locally;
- database verification was not a normal GitHub Actions gate.

Sprint 2 result:

- added PostgreSQL-backed `Database Tests`;
- CI applies migrations;
- CI seeds deterministic fixtures;
- CI runs database integration tests.

### Client test CI

Beginning-of-sprint state:

- client lint and build ran in CI;
- the Vitest suite was not a normal CI gate.

Sprint 2 result:

- added `Client Tests`;
- Search UI regression tests and teammate client tests now run automatically.

### Artifact and traceability

Beginning-of-sprint state:

- CI provided pass/fail status;
- a successful main build was not represented by a durable metadata artifact.

Sprint 2 result:

- added Build Metadata job;
- added `artifacts/build-info.json`;
- added 30-day main-branch artifact retention;
- tied workflow runs directly to commit SHA and build version.

### Workflow consumption

Beginning-of-sprint state:

- no shared build-version value was available for later CI jobs.

Sprint 2 result:

- Build Metadata exposes the build identity as job output `version`;
- Build Metadata exposes `SOUNDWAVE_BUILD_VERSION` to later job steps;
- the export is verified against the generated metadata.

## Current Shared CI Checks

Sprint 2 shared CI currently includes:

    Authentication Security
    Build Metadata
    Client Build
    Client Lint
    Client Tests
    Database Tests
    Server Tests

Existing checks were preserved rather than removed or renamed to make Christian's work pass.

## Build Identity Contract

Format:

    s2.<run_number>+<short_sha>

Example verified main build:

    s2.147+78ed45f

This identifies:

- Sprint/version convention;
- GitHub Actions run number;
- originating Git revision.

## build-info.json

Generated metadata contains:

- `version`;
- `commitSha`;
- `shortSha`;
- `runNumber`;
- `runId`;
- `branch`;
- `eventName`;
- `generatedAtUtc`.

The metadata intentionally does not contain secrets, passwords, tokens, private keys, or application user information.

## Main-Branch Artifact Evidence

A successful hosted `main` workflow run verified:

    Run number: 147
    Version: s2.147+78ed45f
    Branch: main
    Event: push

The Build Metadata job successfully uploaded:

    soundwave-build-info-147.zip

The uploaded artifact contained the generated build metadata and mapped the workflow run back to the exact main-branch revision.

## Build Export Evidence

The final Sprint 2 CI refinement exposes the generated version through:

    Build Metadata job output:
    version

and:

    SOUNDWAVE_BUILD_VERSION

Hosted verification after merge produced:

    Build version export verified: s2.149+c2f90e3

The `Verify build metadata exports` workflow step passed successfully.

This allows later CI orchestration to consume the build identity without reparsing the artifact.

## Current Verification Baseline

After later teammate Sprint 2 integrations were merged:

    Database: 31 passed, 0 failed
    Server:   125 passed, 0 failed
    Client:    25 passed, 0 failed
    Client lint: PASS
    Client build: PASS

This replaced the earlier Sprint 2 verification totals of 30 database and 111 server tests.

## Security and Secret Handling

CI uses disposable/test-only configuration where required.

The build metadata contract does not read or publish:

- JWT secrets;
- PostgreSQL passwords;
- authentication tokens;
- API credentials;
- private keys;
- user data.

Main-branch artifact publication contains build provenance only.

## Jira Work Items

Christian's individual CI/CD tickets:

    SCRUM-146 - CI/CD: Add unique build version metadata
    SCRUM-147 - CI/CD: Document build/version contract

SCRUM-146 acceptance evidence includes:

- generated unique build identity;
- generated `build-info.json`;
- successful main-branch artifact upload;
- direct workflow output;
- `SOUNDWAVE_BUILD_VERSION`;
- hosted export verification.

SCRUM-147 acceptance evidence includes:

- documented version format;
- trigger behavior;
- artifact naming;
- traceability;
- debugging/rollback use;
- security boundary;
- workflow export interface.

## Definition of Done Evidence

Christian's CI/CD implementation:

- ran successfully in GitHub Actions;
- was delivered through peer-reviewed pull requests;
- was merged into `main`;
- preserved existing team CI jobs;
- can be demonstrated with specific hosted workflow runs and build IDs.

## Remaining CI/CD Gaps

Sprint 2 does not attempt to finish all possible CI/CD work.

Remaining normal-pipeline improvements include:

### Dependency/security automation

The current local client install reports:

- a Node-engine mismatch warning for `@testing-library/jest-dom` 7.0.1 under Node 20;
- one high-severity npm dependency vulnerability.

A later security/dependency work item should evaluate these without silently changing dependency ownership during Sprint 2 closure.

### Media-specific CI

Media persistence and playback behavior exist, but media-specific regression checks can become a clearer standalone CI gate in a later sprint.

### Container CI

Docker Compose and image behavior have local smoke coverage, but container verification is not yet a required shared CI gate.

### Coverage/trend visibility

The repository does not yet publish a common coverage/reporting summary across packages.

### End-to-end orchestration

A later sprint can add a stable application-level smoke/e2e workflow once the major account, library, playback, and UI seams stabilize.

### Release/tag promotion

The current build identity provides traceability but does not itself implement release tagging, deployment, rollback automation, or version promotion.

## Later-Sprint Direction

Planned follow-up direction remains:

- Sprint 3: coverage/report aggregation and concise CI summaries;
- Sprint 4: reliability-oriented test grouping;
- Sprint 5: optional end-to-end smoke orchestration;
- Sprint 6: review artifact retention, release flow, and tag/version promotion.

These are future enhancements and are not required to close Christian's Sprint 2 implementation.
