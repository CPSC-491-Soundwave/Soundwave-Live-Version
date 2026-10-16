# CM-T31 / SCRUM-210 — Cross-Feature Authorization Decision-Table Review

**Owner:** Christian McGowan

**Prepared:** October 15, 2026

**Status:** Automated cross-feature assertion executed; matrix requires remaining evidence verification and peer review.

**Reference baseline:** `c61ea3f` (`main` at the start of Block 7); changes in a later PR must be checked against the then-current `main`.

## Purpose and boundaries

Apply risk-based equivalence partitioning, authorization decision-table testing, negative HTTP integration testing, and cross-feature regression analysis to shared authentication decisions. This is independent verification of account and media boundaries, **not** a replacement for Christian's feature-level revocation suite, Emmanuel's client login/playback tests, Matthew's streaming tests, or Konner's navigation tests.

**Production role policy:** The protected account/library and media-access endpoints inspected currently allow both `user` and `admin`. An administrator-only policy exists in the authorization test fixture, **not** as a verified production administrator-only endpoint. Do not represent fixture results as browser-level production-admin behavior.

## Environment, fixtures, and reproducibility

- **Automated environment:** Node.js native test runner, in-process Soundwave `createApp` server listening on ephemeral loopback port; no PostgreSQL connection or live credentials.
- **Cross-feature fixture:** a signed `user` JWT from `createTokenService`; a shared in-memory revoked-JTI repository; `createMediaTicketService` with independent test-only signing secret; synthetic track `3005` metadata. The assertion checks stream authorization denial, not successful audio delivery.
- **Related fixtures:** `server/test/request-authorization.test.js` (administrator-only policy) and `server/test/media-access.app.test.js` (temporary synthetic audio, ticket and media-stream checks).
- **Commands executed on October 15:** `cd server && node --test test/cross-feature-authorization.test.js` (1/1 pass), `cd server && npm test` (223/223 pass), `cd server && npm run test:auth` (95/95 pass). The 95 security tests are part of the 223 backend tests, not additional tests.
- **Additional targeted verification on October 15:** `cd server && node --test test/request-authorization.test.js test/search-routes.test.js` (20/20 passing). This verifies the test-only `401`/`403`/`200` role policy and public Search `200` response; no browser session was run.
- **New assertion:** `server/test/cross-feature-authorization.test.js` — `one logout revokes account access, media access, and its issued ticket`.

## Authorization decision table

`Observed` means a passing automated assertion was inspected or executed; `Pending` means this document does not yet have independently confirmed status evidence for that exact row.

| Request or policy | Principal / session partition | Expected HTTP | Actual HTTP / evidence | Assessment |
| --- | --- | --- | --- | --- |
| `GET /auth/me` | Signed, active `user` | `200` | `200` — new cross-feature test before logout | Observed |
| `GET /auth/me` | Same `user`, after `POST /auth/logout` | `401`, Bearer challenge | `401`, `WWW-Authenticate: Bearer` — new cross-feature test | Observed |
| `POST /api/tracks/3005/media-access` | Signed, active `user` | `204`, media cookie | `204`, `Set-Cookie` present — new cross-feature test | Observed |
| `POST /api/tracks/3005/media-access` | Same `user` JWT after logout | `401`, no cookie | `401`, no `Set-Cookie` — new cross-feature test | Observed |
| `GET /api/tracks/3005/stream` | Previously issued cookie, originating session revoked | `401` | `401` — new cross-feature test | Observed |
| `POST /api/tracks/3005/media-access` | Guest, no JWT | `401`, no cookie | `401`, no cookie — `media-access.app.test.js` missing-JWT case | Existing automated coverage |
| `GET /auth/me`, account/library endpoints | Signed, revoked `user` | `401` | `401` — `protected-revocation-routes.test.js` four-route case | Existing automated coverage |
| Administrator-only **test policy** | Signed `user` | `403` | `403`, `{ error: "forbidden" }` - `request-authorization.test.js`, 20/20 targeted auth/Search tests passed | Existing automated coverage verified |
| Administrator-only **test policy** | Signed `admin` | `200` | `200`, principal role `admin` - `request-authorization.test.js`, 20/20 targeted tests passed | Existing automated coverage verified |
| Administrator-only **test policy** | Guest, no JWT | `401` | `401`, `WWW-Authenticate: Bearer` - `request-authorization.test.js`, 20/20 targeted tests passed | Existing automated coverage verified |
| Administrator-only **test policy** | Revoked signed `admin` | `401` | `401` - `request-authorization.test.js`, 20/20 targeted tests passed | Existing automated coverage verified |
| Shared production account/library routes | Signed `admin` | `200` (same allowed role policy as `user`) | Existing `protected-revocation-routes.test.js` admin route test; inspect per-route assertions before recording individual statuses | Pending per-route matrix verification |
| Public search `GET /api/search?q=fixture` | Guest, no Authorization header | `200` | `200` - `search-routes.test.js` grouped contract case, targeted auth/Search tests 20/20 passed | Existing automated coverage verified |
| Protected media stream | Valid media cookie and active source session | `206` for valid Range request | `206` — `media-access.app.test.js` valid-cookie Range test | Existing automated coverage |
| Protected media stream | Signed-in session, revocation store unavailable | `503` | `503` — `media-access.app.test.js` outage case | Existing automated coverage |

**Approved equivalents:** `204` is the media-access success status because it issues a cookie without a response body; `206` is valid partial-content streaming. `503` is the fail-closed behavior for authentication-store outages. A `403` is expected for authenticated principals denied by a narrower role policy, not for a revoked session.

## Targeted negative assertion and result

**Gap identified:** The earlier `protected-revocation-routes.test.js` and `media-access.app.test.js` suites separately verified account/logout and media-cookie behavior. The new test uses the **same actual logout operation and same source session** to verify account denial, inability to issue a new media ticket, and rejection of the previously issued ticket.

**Result, October 15:** new test 1/1 pass; full backend suite 223/223 pass; existing security subset 95/95 pass. `npm test` includes the new test. `npm run test:auth` explicitly lists security test files and does **not** yet include the new cross-feature file; do not claim it does.

## Findings, defects, and ownership

- **Confirmed security defects in executed assertions:** None. This is not proof that every authorization boundary or browser flow is defect-free.
- **Remaining validation item:** Confirm per-route HTTP outcomes for signed `admin` on shared production account/library endpoints; the public Search and test-only admin-policy rows above have now been verified. **Owner:** Christian (review/test evidence). Manual browser and two-role exploration remain pending under CM-T32; feature owners retain implementation responsibility.
- **If a discrepancy is found:** Record method/path, principal role/session state, exact fixture, expected and actual status/body/headers, reproduction command, severity, affected commit/PR, responsible feature owner, Jira link, and retest result. Do not invent a defect ticket.

## Completion evidence and review

- Automated new test: `server/test/cross-feature-authorization.test.js` (one passing test on October 15).
- Baseline backend run: 223/223 passing on October 15; dedicated security subset: 95/95 passing.
- **GitHub PR for Block 7:** Pending creation.
- **Defect links:** None confirmed; update if a defect is found.
- **Teammate review/approval:** Pending; add verified review URL and date.
- **Decision table sign-off:** Pending completion of marked verification items.
