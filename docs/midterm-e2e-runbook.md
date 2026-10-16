# Soundwave Sprint 3 Midterm E2E Runbook

**Course:** CPSC 491-05  
**Project:** Soundwave  
**Author:** Emmanuel De Guzman  
**Sprint:** Sprint 3  
**Sprint Dates:** October 8-15, 2026  
**Midterm Demo:** October 22, 2026  

---

## 1. Purpose

This runbook provides a reproducible procedure for verifying Emmanuel De Guzman's Sprint 3 authenticated Search-to-Play vertical slice before the CPSC 491 midterm demo.

The primary end-to-end path is:

```text
Authenticated login
-> Search
-> stable Track ID
-> App selected Track state
-> shared PlaybackBar
-> protected media-access preparation
-> protected stream
-> audible browser playback
```

The runbook also verifies a no-session failure path to confirm that the client fails closed instead of attempting protected playback without an authenticated session.

This document is intended to be executable by another teammate without requiring undocumented setup knowledge from Emmanuel.

---

## 2. Scope and Ownership Boundaries

### Emmanuel De Guzman

This runbook verifies work in the following Sprint 3 Jira items:

- SCRUM-161 — Define authenticated Search-to-Play integration contract
- SCRUM-162 — Implement authenticated Search-to-Play orchestration
- SCRUM-163 — Handle session and protected-playback failure states
- SCRUM-164 — Add authenticated Search-to-Play integration tests
- SCRUM-165 — Midterm E2E runbook, sprint artifact draft, and evidence ledger
- SCRUM-166 — CI: Add Search-to-Play regression check

Emmanuel's verification scope includes:

- Search result selection using the stable Track ID
- client handoff from Search through App state to PlaybackBar
- protected-media preparation before native playback
- consumer handling of authentication/media failure states
- automated Search-to-Play regression coverage
- real-browser Search-to-Play verification

### Shared teammate-owned contracts

This runbook consumes but does not claim ownership of:

**Christian McGowan**
- JWT authentication
- token expiration/revocation
- backend authorization behavior
- logout/session revocation

**Matthew Choi**
- protected-media authorization
- media-access credential issuance
- protected stream validation
- HTTP Range/media protocol behavior

**Konner Rigby**
- shared route/session navigation behavior
- client route/session continuity

**Allison Yu**
- database migration/data integrity behavior
- catalog/favorites persistence boundaries

Applying an already-merged teammate migration to a local database is environment reconciliation, not authored implementation work.

---

## 3. Security Rules for This Runbook

Never commit or paste any of the following into GitHub, Jira, screenshots, Google Docs, or ChatGPT:

- plaintext passwords
- JWT values
- media credential/cookie values
- `JWT_SECRET`
- `MEDIA_TICKET_SECRET`
- PostgreSQL passwords
- private keys
- reusable authentication credentials

Runtime secrets should be generated locally and should not be stored in repository files.

Safe evidence includes:

- HTTP status codes
- request paths
- request methods
- whether an Authorization header is present
- whether a browser-managed credential was established
- `Content-Type`
- `Range` / `Content-Range`
- test counts
- pass/fail results

---

## 4. Preconditions

Before starting the E2E run:

- repository is available locally
- PostgreSQL is running
- `database/.env` contains the local PostgreSQL connection configuration
- required database migrations have been applied
- catalog data required for Search is present
- at least one valid local user exists
- server dependencies are installed
- client dependencies are installed
- Track `3005` / `Kontekst` is available for manual verification

---

## 5. Verify Repository State

From the repository root:

```bash
cd ~/Soundwave-Live-Version

git status --short
git branch --show-current
git log --oneline -5
```

Expected:

```text
Working tree is clean.
Current branch is the intended development/review branch.
Recent Sprint 3 commits are visible.
```

Do not begin the verification from a working tree containing unrelated uncommitted changes.

---

## 6. Verify Database Migration State

From the database directory:

```bash
cd ~/Soundwave-Live-Version/database

node --env-file=.env --input-type=module <<'NODE'
import pg from "pg";

const client = new pg.Client();
await client.connect();

const result = await client.query(`
  SELECT
    to_regclass('public.users') AS users,
    to_regclass('public.revoked_access_tokens') AS revoked_access_tokens
`);

console.log(result.rows[0]);

await client.end();
NODE
```

Expected:

```text
users: users
revoked_access_tokens: revoked_access_tokens
```

If `revoked_access_tokens` is missing, apply the repository's already-merged migrations:

```bash
cd ~/Soundwave-Live-Version/database
npm run db:migrate
```

Do not manually recreate the table.

The revocation migration is teammate-authored shared functionality. Applying it locally is environment reconciliation only.

---

## 7. Optional: Verify Migration History

```bash
cd ~/Soundwave-Live-Version/database

node --env-file=.env --input-type=module <<'NODE'
import pg from "pg";

const client = new pg.Client();
await client.connect();

const result = await client.query(`
  SELECT filename
  FROM schema_migrations
  ORDER BY filename
`);

console.table(result.rows);

await client.end();
NODE
```

The migration history should include the current Sprint 3 migrations required by the application.

---

## 8. Optional: Create or Reset a Local Test User

Soundwave currently uses login but does not require adding a product registration feature for this E2E test.

If no usable local test account exists, create or reset a local-only account using the project's existing Argon2 password helper.

Set a temporary password without placing it directly in shell history:

```bash
read -s -p "Local Soundwave test password: " DEV_PASSWORD
echo
export DEV_PASSWORD
```

Then:

```bash
cd ~/Soundwave-Live-Version/database

node --env-file=.env --input-type=module <<'NODE'
import pg from "pg";
import { hash_password } from "../server/src/auth/hasher.js";

const username = "soundwave_e2e";
const password = process.env.DEV_PASSWORD;

if (!password) {
  throw new Error("DEV_PASSWORD is not set.");
}

const passwordHash = await hash_password(password);

const client = new pg.Client();
await client.connect();

try {
  const result = await client.query(
    `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (username)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
      RETURNING id, username, role
    `,
    [
      username,
      passwordHash,
      "user"
    ]
  );

  console.log(result.rows[0]);
} finally {
  await client.end();
}
NODE
```

Expected:

```text
username: soundwave_e2e
role: user
```

After account preparation:

```bash
unset DEV_PASSWORD
```

Do not commit the local test password or generated password hash.

---

## 9. Configure Server Runtime Secrets

Open the terminal that will run the Soundwave server.

```bash
cd ~/Soundwave-Live-Version/server

export JWT_SECRET="$(openssl rand -hex 32)"
export MEDIA_TICKET_SECRET="$(openssl rand -hex 32)"
```

Verify that both variables exist without printing their values:

```bash
printf 'JWT_SECRET: %s chars\n' "${#JWT_SECRET}"
printf 'MEDIA_TICKET_SECRET: %s chars\n' "${#MEDIA_TICKET_SECRET}"
```

Expected:

```text
JWT_SECRET: 64 chars
MEDIA_TICKET_SECRET: 64 chars
```

Do not print the secret values.

---

## 10. Start the Backend

From the server directory:

```bash
cd ~/Soundwave-Live-Version/server

node --env-file=../database/.env src/server.js
```

Expected startup:

```text
Soundwave API listening on http://localhost:8080
```

Leave this terminal running during the E2E test so backend errors remain visible.

---

## 11. Verify Backend Health

In a second terminal:

```bash
curl -i http://localhost:8080/health
```

Expected:

```text
HTTP/1.1 200 OK
```

and a healthy response body.

### Checkpoint

| Check | Expected | Actual | Result |
|---|---|---|---|
| Backend starts | Success |  |  |
| `/health` | HTTP 200 |  |  |

Stop if the backend does not start or `/health` is not healthy.

---

## 12. Run Automated Search-to-Play Regression Verification

Before manual E2E verification, run the focused tests.

```bash
cd ~/Soundwave-Live-Version/client

npx vitest run src/components/PlaybackBar.test.jsx
```

Expected:

```text
12 tests passed
0 failed
```

Run the App-level integration suite:

```bash
npx vitest run src/App.search-playback.test.jsx
```

Expected:

```text
6 tests passed
0 failed
```

Run both focused suites together:

```bash
npx vitest run \
  src/components/PlaybackBar.test.jsx \
  src/App.search-playback.test.jsx
```

Expected:

```text
18 focused tests passed
0 failed
```

Run the full client regression checks:

```bash
npm test -- --run
npm run lint
npm run build
```

Expected:

```text
Full client test suite passes.
Lint passes with 0 errors.
Production build succeeds.
```

### Automated Verification Record

| Verification | Expected | Actual | Result |
|---|---|---|---|
| PlaybackBar focused suite | 12/12 |  |  |
| App Search-to-Play suite | 6/6 |  |  |
| Combined focused suites | 18/18 |  |  |
| Full client suite | PASS |  |  |
| Client lint | PASS |  |  |
| Client build | PASS |  |  |

---

## 13. Start the Client

In another terminal:

```bash
cd ~/Soundwave-Live-Version/client

npm run dev
```

Use the exact local URL printed by Vite.

Typically:

```text
http://localhost:5173/
```

---

## 14. Prepare Browser DevTools

Open the Soundwave client in the browser.

Open:

```text
DevTools -> Network
```

Enable:

```text
Preserve log
Disable cache
```

Clear the Network log before each major verification step.

Do not copy or expose JWT or cookie values.

---

# 15. Manual E2E Test A — Authenticated Search-to-Play

## Objective

Verify that a real authenticated user can:

```text
Login
-> Search
-> select Kontekst
-> obtain protected media access
-> stream protected media
-> hear audio
```

---

## 15.1 Login

Navigate to the Login page.

Authenticate using the local test account.

### Expected

- login succeeds
- client establishes authenticated session
- no authentication error is displayed

### Network verification

Find:

```text
POST /auth/login
```

Expected:

```text
2xx
```

If the application performs a current-user request, verify it also succeeds.

### Record

| Check | Expected | Actual | Result |
|---|---|---|---|
| Login request | 2xx |  |  |
| Client authenticated | Yes |  |  |
| Authentication error | None |  |  |

---

## 15.2 Search for the Seeded Track

Navigate to Search.

Search for:

```text
Kontekst
```

Expected result includes:

```text
Kontekst
Buddha
No Copyright
```

The Search result should represent the stable Track identity used by the playback flow.

### Record

| Check | Expected | Actual | Result |
|---|---|---|---|
| Search succeeds | Yes |  |  |
| Track title | Kontekst |  |  |
| Stable Track ID | 3005 |  |  |

Clear the Network log before selecting Play.

---

## 15.3 Select Play

Select:

```text
Play Kontekst
```

The expected client orchestration is:

```text
Search result
-> Track ID 3005
-> App selectedTrackId
-> PlaybackBar
-> metadata request
-> media-access request
-> protected stream
```

---

## 15.4 Verify Track Metadata Request

Find:

```text
GET /api/catalog/tracks/3005
```

Expected:

```text
HTTP 200
```

The response should contain safe Track metadata and must not expose a filesystem media path to the client.

### Record

| Check | Expected | Actual | Result |
|---|---|---|---|
| Metadata method | GET |  |  |
| Metadata status | 200 |  |  |
| Sensitive media path exposed | No |  |  |

---

## 15.5 Verify Protected Media-Access Request

Find:

```text
POST /api/tracks/3005/media-access
```

Expected:

```text
HTTP 204
```

Request headers should contain an Authorization header using the current login session.

Do not record the Authorization value.

The successful response should establish the browser-managed media authorization needed by the native media request.

### Record

| Check | Expected | Actual | Result |
|---|---|---|---|
| Media-access method | POST |  |  |
| Media-access status | 204 |  |  |
| Authorization header present | Yes |  |  |
| Credential value recorded | No |  |  |

---

## 15.6 Verify Protected Stream Request

Find:

```text
GET /api/tracks/3005/stream
```

Inspect whether the browser sent a `Range` header.

### Expected behavior

If the request includes a Range header:

```text
206 Partial Content
```

and the response should include:

```text
Content-Range
Content-Type: audio/mpeg
```

If the request does not include a Range header, a successful full-file `200` response may be valid.

The primary login JWT must not appear in the stream URL.

### Record

| Check | Expected | Actual | Result |
|---|---|---|---|
| Stream request succeeds | Yes |  |  |
| Range header present | Record |  |  |
| Status if Range present | 206 |  |  |
| Content-Range if 206 | Present |  |  |
| Content-Type | audio/mpeg |  |  |
| Primary JWT visible in URL | No |  |  |

---

## 15.7 Verify Real Playback

Verify the PlaybackBar displays:

```text
Kontekst
Buddha
No Copyright
```

Confirm:

- audio is actually audible
- Pause stops playback
- Play resumes playback
- the UI remains usable

### Record

| Check | Expected | Actual | Result |
|---|---|---|---|
| Track metadata displayed | Yes |  |  |
| Audio audible | Yes |  |  |
| Pause works | Yes |  |  |
| Play/resume works | Yes |  |  |

### Authenticated E2E Result

```text
Result: ____________________
```

---

# 16. Manual E2E Test B — No-Session Failure Path

## Objective

Verify that a user without an active client session cannot initiate protected playback.

This test verifies consumer-side fail-closed behavior without forging credentials or manipulating authentication internals.

---

## 16.1 Remove the In-Memory Client Session

Pause playback.

Perform a full browser refresh.

Because the current client access token is maintained in application state, the previous in-memory client session should no longer be present.

Do not log in again.

---

## 16.2 Search Again

Navigate to Search.

Search for:

```text
Kontekst
```

Clear the Network log.

Select:

```text
Play Kontekst
```

---

## 16.3 Expected Client Result

Expected UI:

```text
Playback unavailable
Please log in to play this track.
```

Expected network behavior:

```text
No POST /api/tracks/3005/media-access
No GET /api/tracks/3005/stream
```

The client should stop before protected-media preparation because there is no active access token.

### Record

| Check | Expected | Actual | Result |
|---|---|---|---|
| Login-required message shown | Yes |  |  |
| Media-access request sent | No |  |  |
| Stream request sent | No |  |  |
| Unauthorized audio plays | No |  |  |

### No-Session E2E Result

```text
Result: ____________________
```

---

# 17. Final Browser / Server Health Check

After the manual verification, check:

```text
DevTools -> Console
```

Record whether unexpected runtime errors occurred.

Also inspect the backend terminal for unexpected exceptions.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Unexpected client console errors | None |  |  |
| Unexpected backend exceptions | None |  |  |

Do not treat expected controlled authentication failures as unexpected exceptions.

---

# 18. Troubleshooting

## 18.1 Server Fails Because JWT Secret Is Missing

### Symptom

```text
A valid secretKey string is required to initialize the token service.
```

### Resolution

```bash
cd ~/Soundwave-Live-Version/server

export JWT_SECRET="$(openssl rand -hex 32)"
export MEDIA_TICKET_SECRET="$(openssl rand -hex 32)"
```

Then restart:

```bash
node --env-file=../database/.env src/server.js
```

---

## 18.2 Authenticated Requests Return 503 Because Revocation Table Is Missing

### Symptom

Backend reports:

```text
relation "revoked_access_tokens" does not exist
```

### Resolution

Use the repository migration mechanism:

```bash
cd ~/Soundwave-Live-Version/database

npm run db:migrate
```

Do not manually create the table.

The migration is teammate-authored shared functionality; applying it locally is environment reconciliation.

---

## 18.3 Login Fails

Verify:

1. local user exists
2. stored password hash uses the project's Argon2 helper
3. entered password matches the stored hash
4. backend is running with current runtime secrets
5. database environment is loaded by the server

Do not weaken login validation or replace Argon2 solely to make the E2E test pass.

---

## 18.4 Media-Access Fails

Record only safe information:

```text
request path
request method
HTTP status
safe response body
backend error text
```

Do not expose:

```text
Authorization value
JWT
media cookie
runtime secrets
password
```

Stop and diagnose the actual producer/consumer contract instead of bypassing protected playback.

---

# 19. Sprint 3 Evidence Ledger

| Jira | Emmanuel Artifact / Result | PR / Evidence |
|---|---|---|
| SCRUM-161 | Authenticated Search-to-Play producer/consumer contract | https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/106 |
| SCRUM-162 | Search selection -> stable Track ID -> shared PlaybackBar orchestration | https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/103 |
| SCRUM-163 | Controlled media failure handling and protected-media preparation | https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/106 and https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/119 |
| SCRUM-164 | Search-to-Play integration and protected-media failure regression coverage | https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/111 and https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/119 |
| SCRUM-165 | Midterm E2E runbook, final manual verification, evidence ledger | `docs/midterm-e2e-runbook.md` + Sprint 3 Manual Verification Google Doc |
| SCRUM-166 | Focused Search-to-Play CI regression | Add final PR/check link after completion |

---

# 20. Sprint 3 Automated Evidence Summary

Current focused regression evidence:

```text
PlaybackBar focused tests:
12/12 passed

App Search-to-Play integration tests:
6/6 passed

Combined focused suites:
18/18 passed

Full client regression:
passed

Client lint:
passed

Client production build:
passed
```

SCRUM-166 will add the final CI enforcement evidence.

---

# 21. Final Manual Verification Summary

Complete this section after the final Sprint 3 run.

```text
Date:
October 15, 2026

Backend health:
____________________

Authenticated login:
____________________

Search "Kontekst":
____________________

Metadata request:
____________________

Protected media-access:
____________________

Protected stream:
____________________

Audible playback:
____________________

Pause/resume:
____________________

No-session login-required behavior:
____________________

No-session media-access prevented:
____________________

No-session stream prevented:
____________________

Unexpected browser errors:
____________________

Unexpected backend errors:
____________________

Overall Result:
PASS / FAIL
```

---

# 22. Midterm Demo Sequence

If called on to demonstrate the Sprint 3 path, use this order:

1. Confirm the application is running.
2. Show the authenticated session.
3. Navigate to Search.
4. Search for `Kontekst`.
5. Identify the returned Track.
6. Select `Play Kontekst`.
7. Show the Track metadata in PlaybackBar.
8. Demonstrate audible protected playback.
9. Pause playback.
10. Resume playback.
11. Briefly explain the integration path:

```text
Search stable Track ID
-> App selectedTrackId
-> PlaybackBar
-> protected media-access
-> native protected stream
```

12. If asked about failure handling, explain:

```text
401 -> invalidate active session / require login
403 -> preserve session / access denied
503 -> preserve session / temporary auth failure
native media failure -> controlled playback failure
```

13. If asked about automated evidence, show the focused Search-to-Play tests and CI result.

---

# 23. Definition of Done for SCRUM-165

SCRUM-165 is complete when:

- [ ] this runbook exists in the shared repository
- [ ] another teammate can follow the documented setup without undocumented commands
- [ ] environment prerequisites are documented without secrets
- [ ] automated regression commands are documented
- [ ] authenticated Login -> Search -> protected playback succeeds in a real browser
- [ ] no-session playback fails closed
- [ ] expected-versus-actual results are recorded
- [ ] the Sprint 3 evidence ledger is current
- [ ] SCRUM-161 through SCRUM-166 are traceable to real artifacts
- [ ] the midterm demo sequence is executable without relying on memory
- [ ] manual verification evidence is also recorded in the professor-countable Google Doc
- [ ] no teammate-owned implementation is claimed as Emmanuel-authored work
- [ ] the documentation change goes through peer review before merge

---

## Ownership Note

This runbook verifies Emmanuel De Guzman's authenticated Search-to-Play consumer slice.

It does not claim authorship of teammate-owned authentication, token-revocation, media-ticket, Range/protocol, database-integrity, or route/session-navigation implementations.

The CPSC 491-05 syllabus controls the Sprint 3 deadline and midterm process. The earlier CPSC 490 roadmap assumed a longer implementation sequence, but the actual course requires the demonstrable Sprint 3 path to be complete by October 15.