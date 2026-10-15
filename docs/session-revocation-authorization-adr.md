# ADR: Persistent JWT Revocation and Role-Based HTTP Authorization

- **Decision record:** Soundwave Sprint 3 / SCRUM-208 (CM-S3-06)
- **Status:** Proposed for teammate review; the underlying implementation is already merged
- **Recorded:** 2026-10-14
- **Owner:** Christian McGowan
- **Related work:** SCRUM-203, SCRUM-204, SCRUM-205, SCRUM-206, SCRUM-207, SCRUM-208
- **Implementation authority:** Source files and tests cited below; see README Sections 20 and 20.6

## 1. Context and requirements

Soundwave uses signed JWT access tokens for authenticated HTTP requests. Sprint 3
needed immediate revocation of an individual signed-in session on logout and a
consistent way to reject invalid, expired, legacy, or revoked credentials across
protected routes. The application also needed explicit authorization decisions
for `user` and `admin` principals without trusting client-supplied role headers.

A stateless JWT remains cryptographically verifiable until expiration even after
logout unless the server checks additional state. The decision therefore needed
to balance targeted logout, restart-safe revocation, implementation complexity,
PostgreSQL availability, and reuse of existing HTTP and CI infrastructure.

## 2. Decision and rationale

**Selected:** Retain HS256 JWT access tokens with a two-hour expiration and a
unique UUID v4 `jti`; record revoked `jti` values in PostgreSQL. On each request
through the shared revocation-aware authorization boundary, validate the Bearer
credential, verify its signed claims, reject unsupported or legacy claims, check
PostgreSQL for revocation, and then evaluate a route's explicit role allow-list.
Do not authorize when the revocation check fails.

This permits per-token logout while leaving other sessions intact. Database
storage makes revocation visible across HTTP requests, connections, and server
restarts rather than relying on process memory. It reuses the project's existing
PostgreSQL dependency and preserves the previously established JWT login contract.
The tradeoff is an additional database lookup on protected requests and a
fail-closed availability dependency on the revocation store.

### 2.1 Issuance and persistent data

`server/src/auth/token.js` issues HS256 JWTs with `sub` (normalized user ID),
`role` (`user` or `admin`), `exp` (two-hour lifetime), and unique UUID v4 `jti`.
`server/src/auth/revocation-auth.js` accepts only well-formed Bearer tokens with
valid verified claims and an unexpired `exp`; tokens without a valid UUID v4
`jti` must reauthenticate.

The migration `database/migrations/20261008_cmg_001_revoked_access_tokens.sql`
creates `revoked_access_tokens` with a UUID `jti` primary key, `user_id` foreign
key, `expires_at`, and `revoked_at`; it also indexes `expires_at`. No raw JWT or
signing secret is stored in this table. The repository uses parameterized SQL
and `ON CONFLICT (jti) DO NOTHING` for insertion; a revocation is considered
active when a matching row has `expires_at > NOW()`. The index supports later
cleanup, but a scheduled cleanup job is **not** established by these files.

## 3. Alternatives considered

| Approach | Benefits | Limitations and why not selected |
|---|---|---|
| **Selected: JWT plus PostgreSQL `jti` revocation** | Targeted logout; cross-process persistence; leverages current JWT and database | Database read per protected request; availability depends on revocation store |
| Short-lived JWTs without server-side revocation | Simple, stateless validation; no revocation query | Logout cannot immediately invalidate a stolen or previously issued token; it remains usable until expiration |
| Server-side opaque session IDs with a session table | Centralized expiration, invalidation, and mutable server-side session state | Requires changing the existing JWT client/API contract, issuing and looking up opaque IDs, and migrating existing login consumers |

No claim is made that a full implementation or benchmark of the alternatives
was performed; the tradeoffs explain the design choice against requirements.

## 4. Session lifecycle and observable HTTP behavior

1. **Guest:** No valid token; protected resources return `401 Unauthorized`.
2. **Active:** Login issues a signed token; the shared gate checks signature,
   allowed claim structure, `jti`, expiration, and revocation before authorization.
3. **Authorized:** A verified, nonrevoked principal passes a route's explicit
   `allowedRoles` policy and the handler may proceed.
4. **Forbidden:** A verified principal without an allowed role is denied with
   `403 Forbidden`; a valid token is not automatically logged out.
5. **Revoked:** `POST /auth/logout` validates the presented session and records
   its `jti`; subsequent protected requests with that token are denied `401`.
   Independently issued tokens are not automatically revoked.
6. **Expired, malformed, or legacy:** Invalid credentials (including JWTs
   lacking a valid UUID v4 `jti`) are denied `401`. A user must log in again.
7. **Infrastructure unavailable:** Revocation-store failures and certain
   authorization configuration errors stop processing and return `503`, rather
   than treating the request as authorized.

For `POST /auth/logout`, the implemented successful result is `204 No Content`;
missing/invalid/already-revoked credentials return `401`. Concurrent duplicate
revocation attempts may still yield a `204` after both requests passed their
initial authentication check; this is tested behavior, not a guarantee that
all concurrent duplicates return `401`. Persistent storage errors propagate to
the HTTP layer for a controlled failure response.

The frontend session-status UI from SCRUM-206 displays verified role identity,
handles successful logout and expired/revoked-session feedback, and rechecks
identity on focus, visibility changes, and a periodic interval. It is not a
real-time server push channel. Refreshing the in-memory client state does not
restore a previous login automatically.

## 5. Role policy and shared integration contract

`authenticateRequestWithRevocation(request, tokenService,
tokenRevocationRepository)` returns either `null` (invalid, expired, legacy,
or revoked token) or this server-verified principal:

```js
{ userId: string, role: 'user' | 'admin', jti: string, exp: number }
```

A revocation repository error propagates instead of yielding an authorized
principal. `evaluateRoleAccess(principal, allowedRoles)` requires a nonempty
explicit list of supported roles and returns `allowed`, `forbidden`, or
`unauthenticated`. `enforceRoleAccess(...)` writes the appropriate `401` or
`403` response for denied requests.

Route integrations call
`authorizeRevocableRequest(request, response, { tokenService,
tokenRevocationRepository, allowedRoles })`. It returns the verified principal
on success and `null` after writing a denial (`401`, `403`, or a fail-closed
`503`). **Callers must stop processing on `null`.** Untrusted client headers,
query parameters, and request bodies cannot grant a role.

| Principal | Shared protected routes with `['user', 'admin']` | Test-only admin policy with `['admin']` |
|---|---|---|
| Guest / invalid / revoked | `401` | `401` |
| Verified `user` | Allowed | `403` |
| Verified `admin` | Allowed | Allowed |

At the time of this ADR, the four feature routes described in README Section
20.5 (`/auth/me`, `/account/profile`, `/api/library/recently-added`, and
`/api/library/favorites`) accept both roles. There is no admin-only production
route established by Block 3; admin-only authorization is exercised through
isolated HTTP test policies. Do not infer privileged production operations
from the presence of an administrator role in the UI.

Teammate boundaries: Allison owns Favorites/catalog behavior; Emmanuel owns
login/player UX; Matthew owns media-stream authorization and media tickets;
Konner owns shared navigation and general CI. Christian owns the shared JWT,
revocation and role boundary and its feature-level security regressions.
Media-specific integration and playback behavior have their own tests and
contracts; this ADR does not redefine them.

## 6. Security consequences, limitations, and deferred work

- **Database availability:** Fail closed with `503` when revocation cannot be
  checked. This protects access at the expense of availability during outages.
- **Role freshness:** Authorization uses the role from a verified JWT; it does
  not re-query PostgreSQL to apply a changed user role on every request. Any
  requirement for immediate role downgrade requires additional design work.
- **Expiry and cleanup:** Revocation lookup considers expiration, but the
  inspected repository and migration do not schedule deletion of old records.
- **Token lifetime:** A two-hour signed access token must be protected by the
  client. Revocation reduces the window after logout but is not token rotation
  or an automatic refresh-token design.
- **Legacy token migration:** Tokens lacking the UUID v4 `jti` are rejected;
  existing clients must authenticate again rather than bypass the new guard.
- **Error semantics:** `401` means no accepted authentication; `403` means
  valid authentication with insufficient role permission; `503` indicates the
  shared authentication/authorization service could not make a safe decision.
  Current authorization configuration errors can also map to `503`.
- **Coverage boundaries:** No assertion is made here that every future media or
  cross-feature route uses identical policy. Media contracts remain Matthew's;
  cross-feature authorization checks are planned under SCRUM-210/SCRUM-213.

## 7. Test methodology, reproduction, and evidence

Use the project's existing required GitHub Actions checks rather than creating
an additional workflow. The `Authentication Security` job executes the
`server/package.json` script `npm run test:auth`. Under SCRUM-207 it explicitly
selects 14 existing test files, including authentication, logout, revocation,
authorization, protected HTTP routes, and revocation repository regressions.

From the repository root:

```bash
cd server
npm run test:auth
npm test
```

As observed locally during Block 5 on 2026-10-14: `test:auth` passed 95/95
and the full backend test suite passed 222/222. They overlap: 95 must not be
added to 222. Frontend baseline was 93/93 with lint/build passing. These
results establish **local** success, not hosted CI success for this ADR's PR.

To exercise real PostgreSQL persistence using a **disposable, dedicated test
database** with its migrations and fixtures already configured, the existing
GitHub Actions Database Tests job runs:

```bash
cd server
node --env-file=../database/.env.test --test integration/postgres-logout.check.mjs
```

**Data-safety warning:** Do not run that integration command against a shared
or persistent development database. The integration script creates/removes
temporary test records; confirm test DB isolation before reproducing locally.
This integration test was not rerun locally as part of the current Block 5
verification. The GitHub Actions job must be checked on the submitted PR.

Expected regression failures: a failed security test makes `npm run test:auth`
return a nonzero exit code; the existing Authentication Security job then
fails. Branch protection must enforce that job as a required check for the
failure to block merging. Confirm this in the new PR checks and repository
rules; do not infer it from test execution alone.

Feature-level tests for active, revoked, invalid, expired, `user`, and `admin`
cases are selected by the dedicated script. Larger independently composed
cross-feature scenario matrices remain the responsibility of SCRUM-210 and
SCRUM-213. README Sections 20 and 20.6 provide test-file mapping, status
contracts, and historical background.

## 8. Decision review and follow-up

**Peer-review request:** At least one teammate should review this ADR alongside
the combined SCRUM-207/SCRUM-208 PR, explicitly checking the alternatives,
role/HTTP contracts, integration boundaries, and limitations. Link the merged
PR, passing Authentication Security and Database Tests checks, and reviewer
comments as completion evidence. Until reviewed and CI-verified, this ADR is a
proposal recording an already implemented architecture, not a completed
SCRUM-208 review milestone.
