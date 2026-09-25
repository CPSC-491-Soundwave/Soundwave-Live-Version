# Sprint 2 Technical Baseline and Integration Boundaries

**Project:** Soundwave
**Course:** CPSC 491-05
**Developer:** Christian McGowan
**Sprint:** Sprint 2 - Catalog + API
**Date:** September 24, 2026

## Purpose

This document records Christian McGowan's verified technical starting point for Sprint 2 and the integration boundaries that will govern the Catalog Search and Filtering implementation.

The goal is to establish a reproducible pre-implementation baseline before search code, database query support, frontend search behavior, or Sprint 2 CI/CD changes are introduced.

## Sprint 2 Ownership

Christian's primary Sprint 2 feature is:

- Catalog search and filtering

Christian's secondary Sprint 2 role is:

- Test lead

Christian's individual CI/CD responsibility is:

- Build identity/version metadata
- CI orchestration and build traceability

The search implementation will remain separate from adjacent teammate-owned features including artist/album detail browsing, account/profile read behavior, track detail/media metadata, and library/recently-added browsing.

## Pre-Implementation Git Baseline

At the beginning of Sprint 2, `christian-dev` was synchronized with the accepted team `main` branch before feature development began.

Verified starting commit:

`40426a64f17207359d68eea638f7d2224f566e26`

The working tree was clean before Sprint 2 implementation.

## Server Baseline

The existing Node.js backend test suite was executed before Sprint 2 changes.

Result:

- Tests: 49
- Passed: 49
- Failed: 0
- Suites: 12

Existing coverage includes:

- Backend health behavior
- Authentication
- Token validation
- Password hashing
- Catalog HTTP behavior
- Catalog/media identity boundaries
- Controlled backend error behavior

## Client Baseline

The existing React/Vite client verification was executed before Sprint 2 changes.

Results:

- Vitest test files: 2 passed
- Client tests: 3 passed
- Client tests failed: 0
- ESLint: PASS
- Vite production build: PASS
- Production build modules transformed: 38

The current Search page is only a placeholder and does not yet contain Sprint 2 search functionality.

## Database Baseline

The PostgreSQL migration, seed, and integration-test workflow was verified before Sprint 2 implementation.

Current migrations:

- `20260915_ayu_001_catalog_core.sql`
- `20260916_ayu_002_auth_users.sql`

Migration rerun behavior:

- Existing migrations are safely skipped when already applied.
- Later schema changes must use new forward-only migration files.
- Existing applied migrations will not be modified for Sprint 2 search.

Database test result:

- Tests: 18
- Passed: 18
- Failed: 0

The deterministic catalog contains artists, albums, and tracks that can be used as repeatable search fixtures.

## Catalog Search Data Boundary

The existing catalog schema provides:

- `artists.name`
- `albums.title`
- `tracks.title`
- `tracks.duration_ms`
- relational artist/album/track identifiers

Sprint 2 search-specific query or index support will be introduced only through a new feature-owned migration if required.

The existing Sprint 1 catalog migrations will not be edited.

## Authentication Boundary

The existing authentication subsystem exposes a trusted principal through `authenticateRequest()`.

The reusable principal contract is:

```text
{
  userId,
  role
}

Supported roles are currently:

user
admin

Search code will consume the established authentication/principal contract if visibility rules require authentication.

Search will not create a second JWT parser, alternate authentication mechanism, or client-supplied identity contract.

Media and Track Identity Boundary

The established stable cross-feature track identity is:

tracks.id

Search results may expose the stable catalog track ID and safe catalog metadata.

Search results must not expose media-storage implementation details such as:

filesystem paths
media paths
storage keys
raw media bytes
server-local file locations

Search is responsible for identifying playable tracks, not serving media bytes.

Frontend Ownership Boundary

The /search React route already exists.

Christian owns Sprint 2 implementation of the Search page and search-specific presentation behavior.

Existing shared client infrastructure should be consumed rather than replaced, including:

Sidebar
PlaybackBar
application shell
React Router structure
shared design tokens
global application styles

Search-specific components or styles may be introduced without taking ownership of unrelated shared shell behavior.

Existing CI Baseline

The existing GitHub Actions workflow runs on:

pull requests targeting main
pushes to main

Current required jobs are:

Server Tests
Client Lint
Client Build

The Sprint 2 CI/CD baseline currently does not provide:

a unique Soundwave build identifier
build-info.json
uploaded build metadata
durable build-to-commit traceability metadata

Christian's Sprint 2 CI/CD work will add build identity and traceability without removing or renaming existing required checks unless the team explicitly agrees to a workflow change.

Infrastructure Baseline

The current Docker Compose configuration was validated before Sprint 2 implementation.

Verified behavior:

Server Docker image builds successfully.
Client Docker image builds successfully.
Backend /health responds successfully from the Compose environment.
Client becomes reachable from the Compose environment.
Compose smoke-test cleanup succeeds.

The current smoke test proves application startup but does not currently prove a containerized database-backed catalog request.

Known Pre-Existing Technical Notes

The following observations existed before Christian's Sprint 2 implementation:

The local host development environment uses Node.js 20.20.1.
Current Docker images use Node.js 22.
@testing-library/jest-dom 7.0.1 reports a Node >=22 engine requirement during local Node 20 installation, although the current client test suite and production build pass.
Local PostgreSQL readiness currently reports port 5433.
The Compose server configuration currently references PostgreSQL port 5432.

These items are recorded as baseline observations and should not be attributed to later Sprint 2 search changes unless modified by a Sprint 2 work item.

Sprint 2 Regression Rule

A Sprint 2 change should not be considered complete if it causes previously passing baseline verification to fail.

At minimum, relevant changes should preserve:

Server tests: zero failures
Client tests: zero failures
Client lint: pass
Client production build: pass
Database integration tests: zero failures

Additional Sprint 2 tests will be added on top of this baseline.

Next Implementation Step

After this baseline is merged, Christian's next search work will define the Sprint 2 search API contract, query validation rules, result grouping, filter behavior, response boundaries, and acceptance tests before implementation begins.
