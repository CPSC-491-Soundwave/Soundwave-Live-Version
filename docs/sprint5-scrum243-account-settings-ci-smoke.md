# SCRUM-243 — Isolated Account Settings PostgreSQL/HTTP CI Smoke

- **Owner:** Christian McGowan
- **Project:** Soundwave / CPSC 491-05 / Sprint 5, November 19, 2026
- **Jira:** SCRUM-243
- **Status:** Prepared for implementation and GitHub Actions verification; not yet executed in CI
- **Implementation scope:** `.github/workflows/scrum243-account-settings-smoke.yml` and this report.

## Purpose and independent test oracle

Run the existing, production-app-backed `server/scripts/scrum358-postgres-http-smoke.mjs` within its **own GitHub Actions job** using its **own PostgreSQL 16 service** and database `soundwave_scrum243_test`. Test code exercises real HTTP requests to a locally bound instance of the Soundwave Node application and actual PostgreSQL state. It is not a Playwright/browser GUI test, and does not claim full front-end UI end-to-end automation.

Unlike the standard Database Tests job, this workflow verifies that the **Account Settings API and authentication/persistence contract** complete together using a dedicated disposable service. It reuses existing approved migrations and the SCRUM-358 smoke harness instead of authoring a competing account-profile implementation or duplicating the entire server test suite.

## Test execution design

| Phase | Expected outcome | Evidence |
|---|---|---|
| Trigger | Run on PRs targeting `main` and pushes to `main`. | GitHub Actions workflow event and SHA |
| Isolation | Job-local PostgreSQL 16 service, fixed test-only credentials, exact database name `soundwave_scrum243_test`. | Exact `current_database()`/`current_user` check |
| Schema | Existing ordered migrations apply to that dedicated database, not a developer's local DB. | `npm run db:migrate:test` step |
| Fail-closed guard | Providing `soundwave_wrong_test` as the expected database fails before writes. | Guard step and log |
| Authentication | Disposable user signs in using real `POST /auth/login`. | Smoke stdout |
| Account Settings | `GET /account/profile`, successful `PATCH /account/profile`, and fresh persisted `GET`. | Smoke stdout and PostgreSQL assertions |
| Negative paths | Duplicate username, forbidden identity/role input, constraint rollback and revoked-token denial. | Smoke stdout and assertions |
| Cleanup | Outer test transaction rolls back, temporary accounts absent, server/connection closed. | Post-run cleanup assertions |
| Auditability | Upload isolated smoke/guard logs for each GitHub Actions run. | Workflow artifact |

## Data safety and scope boundaries

- The GitHub-hosted job's PostgreSQL service is ephemeral and not connected to any development, staging, or production database.
- Environment variables in the workflow are dedicated *test-only* values, not reusable application or deployment credentials.
- The harness verifies the exact expected database name before inserting rows and performs an outer `ROLLBACK` even after normal test execution.
- The harness generates disposable usernames and passwords and does not print credentials or JWT access tokens to the normal PASS log.
- The workflow's existence is **not** evidence that it has passed on GitHub. Record the run URL, commit SHA, job result, reviewed PR, and any defects below after execution.
- Distinct ownership: SCRUM-223 owns the invalid-input/authorization matrix, SCRUM-224 owns manual accessibility, existing shared CI owns broad database and client tests; SCRUM-243 owns CI isolation and the integrated Account Settings HTTP+PostgreSQL smoke.

## Verification record — fill after executing

| Evidence field | Actual |
|---|---|
| Implementation commit SHA | PENDING |
| Pull request URL and reviewer | PENDING |
| GitHub Actions workflow URL | PENDING |
| GitHub Actions job result and run attempt | NOT RUN |
| Exact database identifier from CI | EXPECTED `soundwave_scrum243_test`; verify in job log |
| Incorrect-database guard | NOT RUN |
| HTTP login/get/patch/refresh contract | NOT RUN |
| Negative and revoked-token handling | NOT RUN |
| Rollback and temporary-user cleanup | NOT RUN |
| CI log artifact downloaded/inspected | NOT RUN |
| Defects / severity / owner / retest | None confirmed before CI execution; record any actual failure |
| Peer review and merge into `main` | PENDING |

**Acceptance boundary:** Mark SCRUM-243 Done only after the dedicated workflow passes on a real PR run, a reviewer approves, and the change is merged. A local YAML syntax check or reuse of previous SCRUM-358 manual logs is not sufficient.
