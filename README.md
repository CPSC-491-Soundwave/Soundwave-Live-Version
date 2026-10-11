# Soundwave

Soundwave is the CPSC 491-05 Fall 2026 capstone implementation of a
responsive, secure, lightweight, self-hostable music-streaming
application.

The repository contains the shared application used by:

- Christian McGowan
- Allison Yu
- Emmanuel De Guzman
- Matthew Choi
- Konner Rigby

**Course:** CPSC 491-05  
**Semester:** Fall 2026

Development is performed on developer branches and integrated into
`main` through peer-reviewed pull requests.

Direct feature pushes to `main` should be avoided.

---

# 1. Current Application Stack

| Area | Technology |
|---|---|
| Backend | Node.js |
| Backend language | JavaScript / ES modules |
| Backend HTTP | Node.js built-in HTTP server |
| Backend tests | Node.js built-in test runner |
| Frontend | React |
| Frontend language | JavaScript / JSX |
| Frontend routing | React Router |
| Frontend build tool | Vite |
| Frontend styling | CSS + shared design tokens |
| Frontend tests | Vitest, React Testing Library, jest-dom, jsdom |
| Database | PostgreSQL |
| PostgreSQL client | `pg` |
| Search indexing | PostgreSQL `pg_trgm` + GIN indexes |
| Password hashing | Argon2id via `argon2` |
| Access tokens | JWT via `jsonwebtoken` |
| Audio playback | Howler |
| Media metadata | `music-metadata` |
| CI | GitHub Actions |
| Packaging | Docker |
| Multi-service packaging | Docker Compose |
| Source control | Git / GitHub |

Tailwind CSS is not currently used.

---

# 2. Current High-Level Architecture

```text
React / Vite Client
        |
        | /auth
        | /account
        | /api
        v
Node.js HTTP Server
        |
        | repositories
        v
PostgreSQL
        |
        +----------------------+
        |                      |
        v                      v
Catalog/Search Data       Internal media_path
                               |
                               v
                        HTTP media streaming
```

The browser communicates with the backend through HTTP APIs only.

The browser does not connect directly to PostgreSQL and does not receive
physical filesystem paths for media.

The canonical cross-feature Track identity is:

```text
tracks.id
```

---

# 3. Local Development Quick Start

The verified local-development path uses:

```text
PostgreSQL
+
Node.js backend
+
Vite client
```

Docker Compose is available for packaging and runtime smoke verification,
but it is not required for the normal direct local-development workflow.

## 3.1 Clone

```bash
cd ~

git clone https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version.git

cd Soundwave-Live-Version
```

Verify:

```bash
git status
git branch --show-current
```

---

## 3.2 Install Dependencies

### Database

```bash
cd database
npm ci
cd ..
```

### Server

```bash
cd server
npm ci
cd ..
```

### Client

```bash
cd client
npm ci
cd ..
```

Do not commit any `node_modules/` directory.

---

# 4. PostgreSQL Configuration

The database tooling uses:

```text
database/.env
database/.env.test
```

These files are local-only and must not be committed.

Example development configuration:

```dotenv
PGHOST=localhost
PGPORT=5432
PGUSER=soundwave_app
PGPASSWORD=<your-local-postgres-password>
PGDATABASE=<your-development-database>
```

Example test configuration:

```dotenv
PGHOST=localhost
PGPORT=5432
PGUSER=soundwave_app
PGPASSWORD=<your-local-postgres-password>
PGDATABASE=<your-test-database>
```

The development and test databases should be separate.

The PostgreSQL role and development database must actually exist on the
local machine; copying `.env` values from another developer does not copy
their PostgreSQL database. Check with:

```bash
sudo -iu postgres psql
```

Inside `psql`, use `\du` to inspect roles and `\l` to inspect databases.
Create only what is missing; do not overwrite another developer's data.
After configuring the role and database, confirm connectivity without
printing the password:

```bash
psql -h localhost -U soundwave_app -d <your-development-database> \
  -c "SELECT current_user, current_database();"
```

Replace `<your-development-database>` with the actual database name
before executing the command. PostgreSQL prompts for the password.

---

# 5. Database Migrations

From:

```bash
cd ~/Soundwave-Live-Version/database
```

run:

```bash
npm run db:migrate
```

The migration runner:

1. creates `schema_migrations` if necessary;
2. reads `.sql` migration files;
3. checks which filenames were previously recorded;
4. skips already-applied migrations;
5. runs each new migration inside a transaction;
6. records successful migrations in `schema_migrations`.

Current migrations include:

```text
20260915_ayu_001_catalog_core.sql
20260916_ayu_002_auth_users.sql
20260924_edg_001_user_preferences.sql
20260927_cmg_001_catalog_search_support.sql
20261008_cmg_001_revoked_access_tokens.sql
20261011_ayu_003_user_favorites.sql
trackMediaPath.sql
```

**Sprint 3 Favorites migration status (Allison Yu):**
`20261011_ayu_003_user_favorites.sql` was authored on October 11 after
the Favorites read API PR was merged. Its presence in this inventory
indicates the intended migration file, **not** that the file was already
merged into `main`, executed locally, or applied in CI. Confirm that the
file exists under `database/migrations/` on the branch being tested,
then run the migration against the intended database and inspect
`schema_migrations` and `public.favorites` before claiming completion.

The new `favorites` relation has `user_id BIGINT` and `track_id BIGINT`
as a composite primary key, plus `created_at TIMESTAMPTZ NOT NULL`
(default `CURRENT_TIMESTAMP`). Both IDs reference existing `users` and
`tracks` records using `ON DELETE CASCADE`. An additional index on
`track_id` supports the reverse foreign-key access pattern. The
cascade-on-delete behavior is an implementation decision; the project
specification does not prescribe an exact Favorites deletion policy.

The `trackMediaPath.sql` migration adds:

```text
tracks.media_path
```

with a nonblank constraint for non-null values.

Running the migration command again should safely skip previously
recorded migrations.

Do not manually delete rows from `schema_migrations` just to force a
migration to run again.

---

# 6. Seed the Development Database

From `database/`:

```bash
npm run db:seed
```

The catalog seed is rerunnable and uses stable fixture identities.

Current shared development fixtures include:

## Artists

| ID | Name |
|---:|---|
| 1001 | Fixture Artist One |
| 1002 | Fixture Artist Two |
| 1003 | Buddha |

## Albums

| ID | Album | Artist |
|---:|---|---:|
| 2001 | Fixture Album Alpha | 1001 |
| 2002 | Fixture Album Beta | 1002 |
| 2003 | No Copyright | 1003 |

## Tracks

| ID | Track | Album | Artist | Duration | Media |
|---:|---|---:|---:|---:|---|
| 3001 | Fixture Track One | 2001 | 1001 | 180000 ms | none |
| 3002 | Fixture Track Two | 2001 | 1001 | 205000 ms | none |
| 3003 | Fixture Track Three | 2002 | 1002 | 195000 ms | none |
| 3004 | Fixture Track Four | 2002 | 1002 | 222000 ms | none |
| 3005 | Kontekst | 2003 | 1003 | 12345 ms | `mediaFiles/test.mp3` |

Track `3005` is the current shared media-backed development fixture.

Production feature logic must not assume a fixture ID always exists.

**Favorites seed note (Allison Yu, Sprint 3):** the shared catalog seed
above does **not** itself prove that `devuser` has Favorites rows. The
new Favorites migration creates the table only; it does not populate
`favorites`. The deterministic Favorites fixture was part of the
Sprint 3 task plan, but its inclusion in the merged repository has not
been confirmed. For a local development-only manual association, use
the documented SQL in Section 23.3, not an untracked table creation.

---

# 7. Verify the Database

Inspect the Track schema:

```bash
psql -c '\d tracks'
```

Expected Track columns include:

```text
id
album_id
title
duration_ms
created_at
media_path
```

Inspect media mappings:

```bash
psql -c \
  "SELECT id, title, media_path
   FROM tracks
   ORDER BY id;"
```

The shared development seed should include:

```text
3005 | Kontekst | mediaFiles/test.mp3
```

---

# 8. Server Environment

The backend requires PostgreSQL configuration and a JWT signing secret.

Local server configuration uses:

```text
server/.env
```

Real secrets must never be committed.

Example `server/.env` (local only; replace placeholders, never commit):

```dotenv
PGHOST=localhost
PGPORT=5432
PGUSER=soundwave_app
PGPASSWORD=<your-local-postgres-password>
PGDATABASE=<your-development-database>
JWT_SECRET=<generated-development-only-secret>
# Optional: an absolute directory containing the paths in tracks.media_path
# MEDIA_ROOT=/srv/soundwave/storage
```

Use the same PostgreSQL connection settings in `database/.env` and
`server/.env` when both are used on one machine. `JWT_SECRET` belongs on
the backend only. If omitted, `MEDIA_ROOT` defaults to the repository
root derived from the location of `server/src/app.js`, not the process's
current working directory. `MEDIA_ROOT`, if configured, must be an
absolute path.

Alternatively, from `server/`, the backend can load its own file directly:

```bash
node --env-file=.env src/server.js
```

The verified shared local workflow is to export both database and server
environment files before starting the backend:

```bash
cd ~/Soundwave-Live-Version

set -a
source database/.env
source server/.env
set +a
```

Then:

```bash
cd server
npm start
```

Expected:

```text
Soundwave API listening on http://localhost:8080
```

Leave the backend terminal running.

---

# 9. JWT Startup Requirement

The backend initializes the token service at startup.

If `JWT_SECRET` is missing, startup intentionally fails with an error
similar to:

```text
A valid secretKey string is required to initialize the token service.
```

A temporary local development secret may be generated with:

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
```

Do not print, commit, or reuse real production secrets.

---

# 10. Start the Client

Open another terminal:

```bash
cd ~/Soundwave-Live-Version/client

npm run dev
```

Vite will display the development URL, typically:

```text
http://localhost:5173/
```

Use the port printed by Vite.

The Vite development environment proxies backend paths including:

```text
/auth
/account
/api
/health
```

to the local backend.

---

# 11. Backend Health Verification

With the backend running:

```bash
curl -i http://localhost:8080/health
```

Expected:

```text
HTTP/1.1 200 OK
```

Body:

```json
{"status":"ok"}
```

Unknown routes should return:

```bash
curl -i http://localhost:8080/not-real
```

Expected:

```text
HTTP/1.1 404 Not Found
```

```json
{"error":"not_found"}
```

---

# 12. Catalog API

## 12.1 List Tracks

```bash
curl -i \
  http://localhost:8080/api/catalog/tracks
```

Expected:

```text
HTTP/1.1 200 OK
```

Catalog responses expose stable public Track identities and metadata.

They must not expose:

```text
media_path
filePath
mediaPath
storageKey
streamUrl
```

---

## 12.2 Track Detail

Example:

```bash
curl -i \
  http://localhost:8080/api/catalog/tracks/3005
```

Expected response:

```json
{
  "id": 3005,
  "title": "Kontekst",
  "durationMs": 12345,
  "album": {
    "id": 2003,
    "title": "No Copyright"
  },
  "artist": {
    "id": 1003,
    "name": "Buddha"
  }
}
```

The public response intentionally omits `media_path`.

Current Track-detail behavior:

```text
existing Track      -> 200
missing Track       -> 404 track_not_found
malformed Track ID  -> 400 invalid_track_id
catalog failure     -> 500 catalog_unavailable
```

---

# 13. Artist and Album Catalog

Artist routes:

```text
GET /api/catalog/artists
GET /api/catalog/artists/:id
```

Album routes:

```text
GET /api/catalog/albums
GET /api/catalog/albums/:id
```

Example:

```bash
curl -i http://localhost:8080/api/catalog/artists
curl -i http://localhost:8080/api/catalog/artists/1001

curl -i http://localhost:8080/api/catalog/albums
curl -i http://localhost:8080/api/catalog/albums/2001
```

Valid seeded resources return HTTP `200`.

Malformed IDs return HTTP `400`.

Valid but missing resources return HTTP `404`.

---

# 14. Search API

Current Search endpoint:

```text
GET /api/search?q=<query>&type=<type>
```

Supported types:

```text
all
track
artist
album
```

If `type` is omitted, `all` is used.

Search rules:

- `q` is required;
- whitespace is trimmed;
- query length is 1-100 characters after trimming;
- matching is case-insensitive;
- matching uses parameterized PostgreSQL queries;
- no matches return HTTP `200` with empty grouped arrays.

Example:

```bash
curl -i \
  "http://localhost:8080/api/search?q=Kontekst&type=track"
```

The seeded database should return Track `3005`.

Example response:

```json
{
  "query": "Kontekst",
  "tracks": [
    {
      "id": 3005,
      "title": "Kontekst",
      "durationMs": 12345,
      "album": {
        "id": 2003,
        "title": "No Copyright"
      },
      "artist": {
        "id": 1003,
        "name": "Buddha"
      }
    }
  ],
  "artists": [],
  "albums": []
}
```

Current Search remains catalog discovery and does not expose media
storage details.

Backend Search implementation:

```text
server/src/data/search.repository.js
server/src/search/search.service.js
server/src/search/search.handler.js
```

---

# 15. Media Streaming

Current media endpoint:

```text
GET /api/tracks/:id/stream
```

The route resolves the stable Track ID through the catalog repository and
uses the internal `media_path` to locate the audio resource.

Example:

```bash
curl -s \
  -o /tmp/soundwave-test.mp3 \
  -w "status=%{http_code} bytes=%{size_download}\n" \
  "http://localhost:8080/api/tracks/3005/stream"
```

Expected:

```text
status=200
```

with a non-zero downloaded byte count.

---

## 15.1 HTTP Range Verification

```bash
curl -s \
  -H "Range: bytes=0-999" \
  -D - \
  -o /tmp/soundwave-range.bin \
  "http://localhost:8080/api/tracks/3005/stream"

wc -c /tmp/soundwave-range.bin
```

Expected response headers include:

```text
HTTP/1.1 206 Partial Content
Content-Type: audio/mpeg
Accept-Ranges: bytes
Content-Length: 1000
Content-Range: bytes 0-999/<file-size>
```

Expected downloaded Range size:

```text
1000
```

Automated coverage also verifies:

```text
full-file request       -> 200
valid byte range        -> 206
invalid byte range      -> 416
unknown Track           -> 404
missing media resource  -> 404
```

## 15.2 Sprint 3 configurable media root — Matthew Choi (SCRUM-169)

Sprint 3 retains the existing catalog Track-ID playback contract and
improves the server-side storage location handling. The frontend builds
URLs such as `/api/tracks/3005/stream`; it does not know filesystem paths.

The integration follows:

```text
App.jsx / PlaybackBar.jsx
    -> client/src/playback/playback.js (Howler, html5: true)
    -> GET /api/tracks/:id/stream
    -> catalog.repository.js findTrackById(id)
    -> tracks.media_path (internal only)
    -> validated path under mediaRoot
    -> streamTrackFile() with HTTP Range support
```

`server/src/server.js` passes `mediaRoot: process.env.MEDIA_ROOT` into
`createApp()`. `server/src/app.js` supplies a source-location-derived
default when the environment variable is absent. The previous
`path.resolve(process.cwd(), "..")` assumption has been removed.

For the default repository layout:

```text
Default media root: <repository-root>/
Database media_path: mediaFiles/test.mp3
Resolved audio file: <repository-root>/mediaFiles/test.mp3
```

For external storage, set an absolute `MEDIA_ROOT` in `server/.env` and
keep database `media_path` entries relative to that root. For example,
`MEDIA_ROOT=/srv/soundwave/storage` with
`media_path=mediaFiles/test.mp3` resolves to
`/srv/soundwave/storage/mediaFiles/test.mp3`.

The new resolver rejects empty, absolute, or escaping database paths;
uses real filesystem paths to detect symlinks pointing outside the root;
and returns HTTP `404` rather than serving a rejected or missing file.
The existing plain-text missing-file response (`Audio file not found`)
is intentionally preserved for API compatibility. These checks are a
path-validation boundary, not a substitute for the still-pending media
authorization policy. Deployments should keep the media directory and
its parent directories protected against untrusted filesystem writes.

## 15.3 Sprint 3 media-root regression tests — Matthew Choi

`server/test/media-streaming.test.js` retains the original five HTTP
streaming tests and adds five focused cases:

| Test | Expected behavior |
|---|---|
| Custom absolute `mediaRoot` and relative track media path | `200`; byte-range request `206` |
| Database `../` traversal outside the root | `404` with original text response |
| Absolute database `media_path` | `404` |
| Symlink resolving outside the media root | `404` |
| Relative `mediaRoot` supplied to `createApp()` | `TypeError` |

The new cases use temporary synthetic fixtures, not unlicensed music.
The developer reported the focused streaming and complete backend tests
passing after these additions. Re-run against the current checkout
before committing, because total counts may change when teammate
changes merge:

```bash
cd server
node --test test/media-streaming.test.js
npm test
```

A successful run must report `fail 0`.

## 15.4 Sprint 3 local playback verification — Matthew Choi (SCRUM-170)

The following was verified on the developer's local PostgreSQL +
Node.js + React/Vite setup after the media-root change:

| Verification | Observed result |
|---|---|
| `GET /api/catalog/tracks/3005` | `200`, `Kontekst` / `Buddha` / `No Copyright` |
| `GET /api/tracks/3005/stream` with `Range: bytes=0-999` | `206 Partial Content` |
| Open `/albums/2003` and select Track 3005 | Real audio played in the shared PlaybackBar |

Reproduce the API checks:

```bash
curl -i http://localhost:8080/api/catalog/tracks/3005
curl -sS -o /dev/null \
  -w 'HTTP %{http_code}, bytes %{size_download}\n' \
  -H 'Range: bytes=0-999' \
  http://localhost:8080/api/tracks/3005/stream
```

The second command should report `HTTP 206, bytes 1000` for the seeded
fixture. Open `http://localhost:5173/albums/2003` (or the Vite port
shown in the console) to select and play the track. Inspect the browser
Network panel for metadata `200` and media `200`/`206` requests. Verify
Play, Pause, and Volume separately before claiming those controls
passed a new manual run.

Track `3005` must use audio covered by `mediaFiles/license.txt` or
another documented public-domain, Creative Commons, or owned fixture.
The current seed/API displays `durationMs: 12345`; confirm that the seed
value matches the actual audio metadata before making duration-accuracy
claims in a graded demo.

These checks prove **direct local playback**, not media accessibility
inside Docker Compose. Container audio remains a separate verification.

---

# 16. Important Sprint 3 Media/Auth Boundary

The current Search-to-Playback happy path is operational.

However, the current media route should not yet be treated as the final
Sprint 3 protected-media authorization boundary.

Sprint 3 backend logout and JWT revocation are implemented for the four
protected routes documented in Section 20. Remaining integration work:

- protected media authorization;
- authenticated client failure handling;
- client consumer behavior for `401` and `403`.

Do not duplicate those implementations in unrelated feature work.

---

# 17. Client Routes

Current client routes include:

```text
/
 /search
 /library
 /login
 /profile
 /artists
 /artists/:id
 /albums
 /albums/:id
 /catalog-debug
```

---

# 18. Shared Playback Architecture

The application has one shared playback state in `App.jsx`.

Conceptually:

```text
Feature page
    |
    | onSelectTrack(track.id)
    v
App.jsx selectedTrackId
    |
    v
PlaybackBar
    |
    +--> GET /api/catalog/tracks/:id
    |
    v
loadTrack(track.id)
    |
    v
Howler
    |
    v
GET /api/tracks/:id/stream
```

Feature pages should reuse this seam rather than create separate players.

---

# 19. Sprint 3 Search-to-Playback Integration — Emmanuel De Guzman

Sprint 3 extends the existing public Search interface into the shared
client playback path.

Implementation:

```text
client/src/App.jsx
client/src/pages/Search.jsx
client/src/pages/Search.test.jsx
client/src/App.search-playback.test.jsx
```

Search now receives:

```text
onSelectTrack
```

from `App.jsx`.

Each Track search result exposes an explicit Play action.

Selecting a result forwards the stable Track ID:

```text
Search result
    ↓
onSelectTrack(track.id)
    ↓
App.jsx selectedTrackId
    ↓
PlaybackBar
```

The Search page does not directly:

- resolve filesystem media paths;
- create a second audio player;
- call PostgreSQL;
- implement a new media endpoint;
- implement token revocation;
- implement protected-media authorization.

Those responsibilities remain in their existing subsystems.

---

## 19.1 Search-to-Playback Automated Verification

`Search.test.jsx` verifies that the Search Track action invokes the
selection callback with the stable Track ID.

Example contract:

```text
Play Fixture Track One
    ↓
onSelectTrack(3001)
```

Cross-component integration coverage is located at:

```text
client/src/App.search-playback.test.jsx
```

That test verifies:

```text
Search API result
    ↓
Play Track
    ↓
App selectedTrackId
    ↓
PlaybackBar
    ↓
GET /api/catalog/tracks/3005
    ↓
loadTrack(3005)
```

---

## 19.2 Search-to-Playback Browser Verification

With PostgreSQL, backend, and frontend running:

1. open `/search`;
2. search for `Kontekst`;
3. verify Track `3005` appears;
4. click the Track's `Play` action;
5. verify the PlaybackBar changes from `Nothing Playing`;
6. verify the PlaybackBar displays:
   - `Kontekst`;
   - `Buddha`;
   - `No Copyright`;
7. click the PlaybackBar Play control;
8. verify audio plays.

This happy-path integration has been manually verified.

---

# 20. Sprint 3 JWT Logout and Session Revocation — Christian McGowan

## 20.1 PostgreSQL revocation persistence

The foundational revocation migration and repository merged in PR #101:

```text
database/migrations/20261008_cmg_001_revoked_access_tokens.sql
server/src/data/token-revocation.repository.js
```

`revoked_access_tokens` stores each JWT UUID identifier (`jti`), the
associated user, token expiration, and revocation timestamp. Raw JWTs
and signing secrets are not stored. The repository exposes:

```text
revokeToken({ jti, userId, expiresAt })
isTokenRevoked(jti)
```

## 20.2 JWT issuance and logout API

The Sprint 3 backend issues JWT access tokens with independent UUID v4
`jti` claims. Token expiration remains two hours. The logout endpoint:

```http
POST /auth/logout
Authorization: Bearer <access-token>
```

| Situation | HTTP response |
|---|---|
| A valid active token is revoked | `204 No Content` |
| Missing, invalid, expired, legacy or already-revoked token | `401 Unauthorized` |
| PostgreSQL revocation lookup or write fails | `503 Service Unavailable` |

Logout revokes the presented token only. Other sessions for the same
user remain active until independently revoked or expired. Tokens
issued before `jti` support are rejected at the revocation-aware
boundary; clients must log in again to obtain a current token.

## 20.3 Guarded routes and feature ownership

Persistent revocation is checked before these existing HTTP handlers:

```text
GET /auth/me
GET /account/profile
GET /api/library/recently-added
GET /api/library/favorites
```

The Favorites route belongs to Allison Yu's catalog work; this change
adds only its revocation guard and associated regression coverage.
An already-revoked token receives `401`; a failed revocation lookup
fails closed with `503` rather than bypassing authentication.

Public catalog discovery, Search, and `/health` are unchanged. The
media stream (`GET /api/tracks/:id/stream`) is NOT protected by this
revocation guard: Matthew Choi's storage-path hardening is separate from
future protected-media authorization. Client handling of expired
sessions and `401`/`403` remains separate integration work.

This milestone does not query the database to refresh a user's role on
every request; role-change enforcement is tracked independently.

## 20.4 Verification and CI

Implementation and test files:

```text
server/src/auth/token.js
server/src/auth/revocation-auth.js
server/src/auth/logout.js
server/src/app.js
server/src/server.js
server/test/revocation-auth.test.js
server/test/logout.test.js
server/test/logout-routes.test.js
server/test/protected-revocation-routes.test.js
server/integration/postgres-logout.check.mjs
```

Reproduce the checks from the indicated package directory:

```bash
cd server
npm test
node --env-file=../database/.env.test --test integration/postgres-logout.check.mjs

cd ../database
npm run test:integrity
npm run test:db
```

The separate HTTP/PostgreSQL test creates a temporary test user, logs
in twice, revokes one JWT, verifies the persisted row through a second
database connection, checks all four guarded routes, and removes its
temporary records. Only run it with a dedicated PostgreSQL test DB.

At local Block 2 verification: 188 backend tests, 34 database tests,
2 database integrity tests, and the HTTP/PostgreSQL integration test
passed. The existing GitHub Actions Database Tests job runs the HTTP
PostgreSQL logout check after database setup. Block 2 passed hosted
CI and peer review and merged into main through PR #107. Coordinate
the `jti` and legacy-token re-login contract with client consumers.

## 20.5 Role-Based HTTP Authorization (Sprint 3 Block 3)

Christian McGowan's Block 3 refactors the four existing protected HTTP
routes to use a reusable authenticated-and-authorized request boundary.
The policy consumes a verified server-side principal; it does not accept
roles or user identifiers supplied in HTTP headers, query parameters,
or request bodies.

Implementation files:

```text
server/src/auth/authorization.js
server/src/auth/request-authorization.js
server/src/app.js
```

`evaluateRoleAccess(principal, allowedRoles)` returns `allowed`,
`unauthenticated`, or `forbidden`. `enforceRoleAccess(...)` maps an
invalid/missing principal to `401 Unauthorized` and a valid principal
without the required role to `403 Forbidden`. The request boundary
`authorizeRevocableRequest(...)` validates the signed access token,
checks its `jti` against PostgreSQL-backed revocation, then evaluates
explicit allowed roles before a protected handler may continue. A
revocation repository failure fails closed with `503 Service Unavailable`; the current adapter
also returns `503` for authorization
configuration errors, which must be addressed separately before any
more specific error classification is claimed.

Existing production route policies remain unchanged:

| Protected GET route | Allowed roles |
|---|---|
| `/auth/me` | `user`, `admin` |
| `/account/profile` | `user`, `admin` |
| `/api/library/recently-added` | `user`, `admin` |
| `/api/library/favorites` | `user`, `admin` |

There is NO administrator-only production endpoint in this Block 3
change. The admin-only policy and resulting `403` are verified using
a temporary HTTP test server, not a newly created Soundwave API route.
Both existing production roles are still permitted on all four routes.

New automated coverage:

```text
server/test/authorization.test.js
server/test/authorization-http.test.js
server/test/request-authorization.test.js
server/test/protected-revocation-routes.test.js
```

Tests cover explicit permitted roles, forbidden access, missing and
invalid principals, fabricated role headers, JWT revocation, and
fail-closed behavior when PostgreSQL revocation checks fail. Additional
real-application coverage verifies both signed roles and administrator
logout. The separate HTTP/PostgreSQL test verifies that revocation is
persisted and enforced across the four existing routes.

Verified locally during Block 3 implementation:

```bash
cd server
npm test
# 208 tests passed, 0 failed

node --env-file=../database/.env.test --test integration/postgres-logout.check.mjs
# 1 real PostgreSQL integration test passed, 0 failed
```

The PostgreSQL integration command requires the dedicated test database
and the `database/.env.test` configuration. Block 3 changes remain
subject to a new pull request, hosted CI, and teammate approval.

Ownership and limitations: Emmanuel De Guzman retains the login/JWT
contract; Allison Yu retains catalog, Library and Favorites handlers;
Matthew Choi retains streaming and future media authorization; Konner
Rigby retains shared client/CI ownership. This Block 3 change does not
add media-stream authorization, revalidate a user's changed role
against PostgreSQL on every request, implement token refresh, or
implement client-side handling for expired sessions and `401`/`403`.

---

# 21. Authentication Foundation

The Sprint 1 authentication spike established:

- Argon2id password hashing;
- password verification;
- JWT access-token creation;
- JWT access-token verification;
- Bearer request authentication;
- supported role validation;
- login endpoint behavior;
- `/auth/me`.

Authentication source:

```text
server/src/auth/auth.js
server/src/auth/hasher.js
server/src/auth/login.js
server/src/auth/me.js
server/src/auth/token.js
```

Persistence:

```text
server/src/data/auth-user.repository.js
```

Passwords must never be stored as plaintext.

JWT signing secrets must never be committed.

---

# 22. Account Profile

Current account-profile implementation includes:

```text
server/src/account/profile.js
server/src/data/account-profile.repository.js
client/src/pages/Profile.jsx
client/src/pages/Profile.test.jsx
```

The client consumes authenticated account-profile data using the
application access token.

---

# 23. Library Recently Added

The current Library flow uses:

```text
GET /api/library/recently-added
```

The route requires Bearer authentication.

Allison Yu's Favorites route is `GET /api/library/favorites`. It
returns the authenticated user's favorites. Both Library routes
use the revocation enforcement described in Section 20.

Client flow:

```text
Library
    ↓
onSelectTrack(track.id)
    ↓
App selectedTrackId
    ↓
PlaybackBar
```

The Library reuses the shared Track identity and player rather than
creating a competing playback implementation.

## 23.1 Sprint 3 authenticated Favorites read path — Allison Yu

**Implementation status:** Allison's Favorites read API pull request
was reported merged. The separate `favorites` table migration was
subsequently authored on October 11; its application and reviewed merge
remain to be verified. A live authenticated read from local PostgreSQL
is therefore **not yet confirmed**.

The API is:

```http
GET /api/library/favorites
Authorization: Bearer <current-access-token>
```

It reuses the existing catalog and authorization infrastructure:

```text
Authenticated HTTP request
    -> app.js shared JWT/jti, revocation, and role guard
    -> catalog.handler.js: GET /api/library/favorites
    -> catalog.service.js: listFavoritesForPrincipal(principal.userId)
    -> catalog.repository.js: listFavoritesForPrincipal(userId)
    -> favorites.repository.js: parameterized SELECT ... WHERE f.user_id = $1
    -> PostgreSQL favorites JOIN tracks JOIN albums JOIN artists
```

The **server-verified principal**, not a user ID supplied in the URL or
request body, determines which favorites are returned. Authorization
and revocation policies for this route are maintained in the shared
application boundary (Section 20), not reimplemented in Favorites.
Both `user` and `admin` are currently allowed by the shared policy.

A successful response is an array (empty if the authenticated account
has no favorites). An example shape, using illustrative data, is:

```json
[
  {
    "id": 3001,
    "title": "Example Track",
    "durationMs": 180000,
    "favoritedAt": "2026-10-11T12:00:00.000Z",
    "album": { "id": 2001, "title": "Example Album" },
    "artist": { "id": 1001, "name": "Example Artist" }
  }
]
```

The `id` field is the canonical `tracks.id`. Filesystem paths such as
`media_path`, `storage_path`, and `file_path` are not selected or
returned. The current endpoint is **read-only**; a Favorites write or
unfavorite API is not established by this implementation.

| Condition | Expected response |
|---|---|
| Active JWT, allowed role, working database | `200 OK` with an array |
| No token, invalid/expired token, or revoked JWT | `401 Unauthorized` |
| Revocation infrastructure unavailable | `503 Service Unavailable` (shared fail-closed guard) |
| Favorites repository/service failure after authorization | `500 Internal Server Error`, `{"error":"library_unavailable"}` |

The shared `403 Forbidden` behavior is tested with an administrator-only
test policy, but this production Favorites route currently permits
both `user` and `admin`; do not describe `403` as its usual user-role
response. Media-stream credential transport is an unrelated, still
separate integration boundary.

## 23.2 Favorites migration and schema verification

Place the authored file in the version-controlled migration directory:

```text
database/migrations/20261011_ayu_003_user_favorites.sql
```

From a **PowerShell terminal** at the repository root, first verify
the file and the intended development environment:

```powershell
Test-Path .\database\migrations\20261011_ayu_003_user_favorites.sql
Select-String -Path .\database\.env -Pattern '^PGDATABASE='
cd database
npm run db:migrate
cd ..
```

Check that `PGDATABASE` refers to the intended **development** database,
not the test database. A successful migration should create the table
and record the filename in `schema_migrations`; a subsequent migration
run should skip it. Do not manually modify `schema_migrations` or run
an untracked `CREATE TABLE` command as a workaround.

For Allison's documented local database (adjust host, user, and database
name to match your own configuration):

```powershell
psql -h localhost -U soundwave_app -d soundwave_allison_dev
```

Within `psql`:

```sql
SELECT current_database(), current_user;
SELECT to_regclass('public.favorites') AS favorites_table;
SELECT * FROM schema_migrations ORDER BY 1;
SELECT user_id, track_id, created_at
FROM favorites ORDER BY user_id, track_id;
```

The relation check should return `favorites`, not `NULL`. If the
migration runner succeeds against a different database from the
backend, the live API may still fail, so keep the settings in
`database/.env` and `server/.env` aligned.

## 23.3 Local development-only Favorites data

With the migration successfully applied and an existing `devuser` login,
inspect the current data in the **development database**:

```sql
SELECT u.id AS user_id, u.username,
       f.track_id, t.title AS track_title, f.created_at AS favorited_at
FROM favorites AS f
JOIN users AS u ON u.id = f.user_id
JOIN tracks AS t ON t.id = f.track_id
WHERE u.username = 'devuser'
ORDER BY f.track_id;
```

Zero rows are valid when no favorites have been saved. For a controlled
local demonstration only, this statement inserts **one association**
using an existing development user and existing track, if available:

```sql
INSERT INTO favorites (user_id, track_id)
SELECT u.id, t.id
FROM users AS u
CROSS JOIN (
    SELECT id FROM tracks ORDER BY id LIMIT 1
) AS t
WHERE u.username = 'devuser'
ON CONFLICT (user_id, track_id) DO NOTHING
RETURNING user_id, track_id;
```

Do not run this fixture SQL against production or shared hosted data.
The migration itself intentionally has **no automatic Favorites seed**.

## 23.4 PowerShell authentication and Favorites smoke test

Use Soundwave's existing `devuser` account and a **fresh** login token.
The merged revocation guard rejects legacy tokens without the required
signed UUID `jti`. Start the backend in a separate terminal using your
own ignored `server/.env`, with matching PostgreSQL settings:

```powershell
cd server
node --env-file=.env src/server.js
```

In a **second PowerShell terminal**, set the base URL and verify the
health and unauthenticated boundary:

```powershell
$baseUrl = 'http://localhost:8080'
curl.exe -i "$baseUrl/health"
curl.exe -i "$baseUrl/api/library/favorites"
```

Expected: health `200` with `{"status":"ok"}`; unauthenticated
Favorites `401` with `WWW-Authenticate: Bearer`.

Log in without placing the plaintext password in shell history:

```powershell
$securePassword = Read-Host 'devuser password' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
$loginPayload = @{ username = 'devuser'; password = $plainPassword } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/login" -ContentType 'application/json' -Body $loginPayload
Remove-Variable plainPassword, loginPayload, securePassword
$accessToken = $login.accessToken
if ([string]::IsNullOrWhiteSpace($accessToken)) { throw 'Login did not return accessToken' }
$me = Invoke-RestMethod -Uri "$baseUrl/auth/me" -Headers @{ Authorization = "Bearer $accessToken" }
$favoritesResponse = Invoke-WebRequest -Uri "$baseUrl/api/library/favorites" -Headers @{ Authorization = "Bearer $accessToken" } -UseBasicParsing
$favoritesResponse.StatusCode
$favoritesResponse.Content
```

Expected: `/auth/me` succeeds, Favorites returns `200`, and its Track
IDs match Section 23.3's SQL results. If there are no Favorites rows,
`[]` is a valid response, but a nonempty development association makes
the database-to-API demonstration stronger. Never print, screenshot,
or commit `$accessToken` or the JWT secret.

Optional revocation verification, after the authenticated read succeeds:

```powershell
curl.exe -i -X POST "$baseUrl/auth/logout" -H "Authorization: Bearer $accessToken"
curl.exe -i "$baseUrl/api/library/favorites" -H "Authorization: Bearer $accessToken"
Remove-Variable accessToken, login, me, favoritesResponse -ErrorAction SilentlyContinue
```

Expected: logout `204 No Content`; reuse of that revoked token returns
`401 Unauthorized`. To verify independent sessions, log in a second
time **before** logging out the first token, and confirm the second
session can still read Favorites. Section 20 documents the shared
revocation contract in full.

## 23.5 Automated verification and current evidence

New/extended authored backend files:

```text
server/src/data/favorites.repository.js
server/src/data/catalog.repository.js
server/src/catalog/catalog.service.js
server/src/catalog/catalog.handler.js
server/test/favorites.repository.test.js
server/test/catalog-favorites.repository.test.js
server/test/catalog-favorites.service.test.js
server/test/catalog-favorites-routes.test.js
```

From `server/`:

```bash
node --test test/favorites.repository.test.js
node --test test/catalog-favorites.repository.test.js
node --test test/catalog-favorites.service.test.js
node --test test/catalog-favorites-routes.test.js
npm test
```

**Allison's verified pre-auth-hardening checkpoint:** 163 server tests
passed and 0 failed after adding the Favorites HTTP route coverage.
The focused Favorites tests cover principal-scoped parameter binding,
row mapping, invalid IDs, unauthenticated requests, separate mocked
principals, controlled error responses, and preservation of the public
catalog. The HTTP tests use mocked data; they **do not** independently
prove a live Favorites query against PostgreSQL.

**Later merged authentication baseline (teammate-reported):** Christian
reported 208 backend tests passed and 0 failed after the role-policy
work. That total is **not** an Allison rerun of the latest merged
checkout. Run `npm test` again locally after synchronizing with `main`;
report the actual current test count instead of copying either baseline.

**Observed live HTTP checks from Allison's earlier local run:**
`GET /health` returned `200`; an unauthenticated
`GET /api/library/favorites` returned `401` and
`WWW-Authenticate: Bearer`. A subsequent real SQL query in
`soundwave_allison_dev` failed with `relation "favorites" does not
exist`, revealing the missing migration. The October 11 migration file
was then authored, but successful application and authenticated
PostgreSQL retrieval have **not yet been evidenced**.

**Remaining AY-S3-01 / AY-S3-02 evidence:** confirm application of the
migration in both the intended development and dedicated test DB;
complete the deterministic fixture/seed task or document its agreed
scope; perform a fresh login and match Favorites Track IDs to real
PostgreSQL rows; verify revoked-token denial after logout; rerun the
latest merged regression suite; and merge the migration/README change
through peer review. Do not mark these steps passed before obtaining
the actual logs.

---

# 24. Artist / Album Browsing

Current browse/detail implementation includes:

```text
client/src/components/ArtistCard.jsx
client/src/components/AlbumCard.jsx

client/src/pages/Artists.jsx
client/src/pages/ArtistDetail.jsx
client/src/pages/Albums.jsx
client/src/pages/AlbumDetail.jsx
```

Related backend paths use the existing catalog repository, service, and
handler.

Album Detail also uses the shared:

```text
onSelectTrack(track.id)
```

playback seam.

---

# 25. Client Verification

From:

```bash
cd ~/Soundwave-Live-Version/client
```

run:

```bash
npm test -- --run
npm run lint
npm run build
```

Current verified local Sprint 3 branch result:

```text
Test Files: 12 passed
Tests:      45 passed
Failures:   0
ESLint:     PASS
Build:      PASS
```

Current client coverage includes:

- Search;
- Search Track selection;
- Search → App → PlaybackBar integration;
- Library;
- Profile;
- Artist browse/detail;
- Album browse/detail;
- ArtistCard;
- AlbumCard;
- Sidebar;
- PlaybackBar.

Playback coverage includes:

- empty state;
- metadata retrieval;
- metadata display;
- Play/Pause;
- volume;
- controlled metadata failure;
- unloading/cleanup.

---

# 26. Server Verification

From:

```bash
cd ~/Soundwave-Live-Version/server
```

run:

```bash
npm test
```

The server suite covers areas including:

- authentication;
- password hashing;
- tokens;
- `/health`;
- account profile;
- catalog;
- Artist/Album browse-detail;
- Search;
- Track detail;
- catalog/media isolation;
- HTTP media streaming;
- metadata;
- Track persistence;
- configurable media-root streaming and path rejection tests (Matthew
  Choi, Sprint 3).

Earlier Sprint 3 baselines grew as work merged: Allison verified
**163/163** server tests at the Favorites read-API checkpoint, while
Christian subsequently reported **208/208** after shared role
authorization. These are historical, differently timed checkpoints;
**neither should be treated as proof of the latest local checkout**.
Rerun `npm test` after synchronizing with `main` and record the actual
result. The repository/service/HTTP Favorites test files are listed in
Section 23.5.

The durable requirement is:

```text
fail 0
```

Test totals may increase as Sprint 3 work is merged.

---

# 27. Database Test Verification

From:

```bash
cd ~/Soundwave-Live-Version/database
```

run:

```bash
npm run db:migrate:test
npm run db:migrate:test
npm run db:seed:test
npm run test:integrity
npm run test:db
```

The repeated migration run verifies that already-applied migrations are
safely skipped.

The test database must be separate from the development database.

---

# 28. Full Local Verification Sequence

## Database

```bash
cd ~/Soundwave-Live-Version/database

npm run db:migrate
npm run db:seed
```

## Backend

```bash
cd ~/Soundwave-Live-Version

set -a
source database/.env
source server/.env
set +a

cd server
npm start
```

Expected:

```text
Soundwave API listening on http://localhost:8080
```

## Backend health

In another terminal:

```bash
curl -i http://localhost:8080/health
```

## Client

```bash
cd ~/Soundwave-Live-Version/client

npm run dev
```

Open the Vite URL.

## Media endpoint verification (Matthew Choi, Sprint 3)

With the backend running against a migrated and seeded database:

```bash
curl -i http://localhost:8080/api/catalog/tracks/3005
curl -sS -o /dev/null \
  -w 'HTTP %{http_code}, bytes %{size_download}\n' \
  -H 'Range: bytes=0-999' \
  http://localhost:8080/api/tracks/3005/stream
```

Expected results: catalog `200`, media `206` with 1,000 bytes.
A `catalog_unavailable` response indicates that the catalog database
lookup failed; check the server log and PostgreSQL configuration before
investigating audio playback.

## Browser happy-path checks

Verify:

```text
/search
/artists
/artists/1001
/albums
/albums/2001
/albums/2003
/library
/profile
```

Album-to-playback proof (SCRUM-170, locally verified): select Track
`3005` in `/albums/2003`, check that the shared PlaybackBar shows
`Kontekst` / `Buddha` / `No Copyright`, and confirm actual audio plays.
Check the Network panel for metadata `200` and streaming `200` or `206`.

Search-to-playback proof:

```text
Search "Kontekst"
    ↓
Play
    ↓
PlaybackBar displays Kontekst
    ↓
PlaybackBar displays Buddha • No Copyright
    ↓
Play audio
```

---

# 29. Repository Structure

Generated output, `node_modules/`, `.git/`, and local `.env` files are
omitted below.

```text
.
├── client
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   └── src
│       ├── App.css
│       ├── App.jsx
│       ├── App.search-playback.test.jsx
│       ├── components
│       │   ├── AlbumCard.jsx
│       │   ├── AlbumCard.test.jsx
│       │   ├── ArtistCard.jsx
│       │   ├── ArtistCard.test.jsx
│       │   ├── PlaybackBar.css
│       │   ├── PlaybackBar.jsx
│       │   ├── PlaybackBar.test.jsx
│       │   ├── Sidebar.css
│       │   ├── Sidebar.jsx
│       │   └── Sidebar.test.jsx
│       ├── pages
│       │   ├── AlbumDetail.jsx
│       │   ├── AlbumDetail.test.jsx
│       │   ├── Albums.jsx
│       │   ├── Albums.test.jsx
│       │   ├── ArtistDetail.jsx
│       │   ├── ArtistDetail.test.jsx
│       │   ├── Artists.jsx
│       │   ├── Artists.test.jsx
│       │   ├── CatalogDebug.jsx
│       │   ├── Home.jsx
│       │   ├── Library.jsx
│       │   ├── Library.test.jsx
│       │   ├── Login.jsx
│       │   ├── Profile.jsx
│       │   ├── Profile.test.jsx
│       │   ├── Search.css
│       │   ├── Search.jsx
│       │   └── Search.test.jsx
│       ├── playback
│       │   └── playback.js
│       ├── styles
│       └── test
│           └── setup.js
│
├── database
│   ├── migrate.js
│   ├── package.json
│   ├── migrations
│   │   ├── 20260915_ayu_001_catalog_core.sql
│   │   ├── 20260916_ayu_002_auth_users.sql
│   │   ├── 20260924_edg_001_user_preferences.sql
│   │   ├── 20260927_cmg_001_catalog_search_support.sql
│   │   ├── 20261008_cmg_001_revoked_access_tokens.sql
│   │   ├── 20261011_ayu_003_user_favorites.sql
│   │   └── trackMediaPath.sql
│   ├── seed.js
│   ├── seeds
│   │   └── 20260915_ayu_catalog_seed.sql
│   └── test
│
├── docs
│
├── mediaFiles
│   ├── license.txt
│   └── test.mp3
│
├── scripts
│   ├── compose-smoke-test.mjs
│   └── generate-build-info.mjs
│
├── server
│   ├── Dockerfile
│   ├── package.json
│   ├── src
│   │   ├── account
│   │   ├── auth
│   │   ├── catalog
│   │   ├── data
│   │   ├── media
│   │   ├── search
│   │   ├── app.js
│   │   └── server.js
│   └── test
│
├── compose.yml
├── CONTRIBUTING.md
└── README.md
```

The exact tree continues to evolve as Sprint 3 work is merged.

---

# 30. Troubleshooting

## 30.0 `catalog_unavailable`: missing PostgreSQL role or tables

A catalog response like:

```json
{"error":"catalog_unavailable"}
```

means the server's catalog query failed. Read the **backend terminal's**
`Catalog request failed:` message rather than inferring the cause from
the HTTP response alone.

- `role "soundwave_app" does not exist`: inspect local roles with
  `sudo -iu postgres psql` followed by `\du`. Create the role only if
  absent and set its password locally; ensure `server/.env` and
  `database/.env` use valid credentials. An example database name from a
  teammate's README does not copy their database to this machine.
- `relation "tracks" does not exist`: the configured development database
  lacks the schema. Run `npm run db:migrate` and then `npm run db:seed`
  from `database/`; do not hand-create the catalog tables.
- `database "..." does not exist` or `password authentication failed`:
  verify the actual local database, account, and environment values.

Validate Track 3005 without exposing credentials:

```bash
psql -h localhost -U soundwave_app -d <your-development-database> \
  -c "SELECT id, title, media_path FROM tracks WHERE id = 3005;"
```

Replace the placeholder before running it. Keep credentials and JWT
secrets out of logs, chat, screenshots, and committed files; rotate any
secret that has been exposed.

---

## 30.1 JWT secret missing

Error:

```text
A valid secretKey string is required to initialize the token service.
```

Fix:

```bash
set -a
source server/.env
set +a
```

or set a development-only JWT secret before starting the server.

---

## 30.2 PostgreSQL SCRAM password error

Example:

```text
SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
```

The server does not have a usable PostgreSQL password in its environment.

Verified local startup:

```bash
cd ~/Soundwave-Live-Version

set -a
source database/.env
source server/.env
set +a

cd server
npm start
```

---

## 30.3 `media_path` column does not exist

Example backend error:

```text
column t.media_path does not exist
```

The local database schema is behind the current repository.

Run:

```bash
cd ~/Soundwave-Live-Version/database

npm run db:migrate
npm run db:seed
```

Verify:

```bash
psql -c '\d tracks'
```

The table should contain:

```text
media_path
```

Then verify:

```bash
psql -c \
  "SELECT id, title, media_path
   FROM tracks
   ORDER BY id;"
```

Track `3005` should contain:

```text
mediaFiles/test.mp3
```

Do not remove `t.media_path` from the catalog repository to hide a stale
local schema problem.

---

## 30.4 Search returns no results

A valid empty result is not an API error.

Example:

```json
{
  "query": "unknown",
  "tracks": [],
  "artists": [],
  "albums": []
}
```

If the seeded `Kontekst` Track is unexpectedly missing:

1. verify PostgreSQL is running;
2. run current migrations;
3. rerun the catalog seed;
4. verify `/api/catalog/tracks`;
5. retry `/api/search?q=Kontekst&type=track`.

---

## 30.5 Vite cannot resolve `howler`

If the repository already declares Howler but local `node_modules` is
stale:

```bash
cd client
npm install
npm run build
```

For a fresh clone, prefer:

```bash
npm ci
```

Do not add or remove package declarations unless the tracked
`package.json` actually requires a dependency change.

---

## 30.6 Port 8080 already in use

Check:

```bash
ps aux | grep "[n]ode"
```

Stop the old backend process with:

```text
Ctrl+C
```

or run on another port if needed.

---

## 30.7 `npm` cannot find `package.json`

Check:

```bash
pwd
```

Commands must be executed from the correct package directory:

```text
Soundwave-Live-Version/client
Soundwave-Live-Version/server
Soundwave-Live-Version/database
```

---


## 30.8 Favorites reports `relation "favorites" does not exist`

The error means the backend's connected database cannot find the
`favorites` relation in its search path. It is a **database schema
prerequisite**, not evidence that the `SELECT` syntax or the Bearer
identity filter is wrong.

Check the local checkout for
`database/migrations/20261011_ayu_003_user_favorites.sql` and ensure it
is committed through the reviewed migration PR. Confirm the intended
development DB in `database/.env`, then run from `database/`:

```bash
npm run db:migrate
```

In `psql`, using that same database:

```sql
SELECT current_database(), current_schema(), current_setting('search_path');
SELECT to_regclass('public.favorites');
SELECT * FROM schema_migrations ORDER BY 1;
```

If the file is not present in the repo, create/review the missing
migration in source control first. **Do not** hand-create the table,
remove migration-history rows, or claim that a successful
`db:migrate:test` also migrated the development database. A correctly
migrated but empty table returns `(0 rows)` instead of a relation error;
Section 23.3 shows how to add one local-only Favorites association.

## 30.9 Favorites authentication errors after session hardening

- `401` without a token is expected; obtain a new JWT from `/auth/login`.
- Legacy JWTs without a valid signed UUID `jti`, expired JWTs, and
  revoked JWTs also receive `401` on protected routes.
- `503` can mean a required PostgreSQL revocation lookup failed and the
  shared guard correctly failed closed. Inspect the server logs and
  test-database configuration; do not bypass the revocation guard.
- `500` with `{"error":"library_unavailable"}` after successful
  authorization may indicate a Favorites schema, connection, or query
  failure. Compare the backend's active `PGDATABASE` with the database
  migrated and inspected in `psql`.

# 31. Git Workflow

Course implementation must reach `main` through peer-reviewed pull
requests.

## Inspect current branch

```bash
git branch --show-current
git status
```

## Synchronize before major work

```bash
git fetch origin
git merge origin/main
```

Resolve conflicts carefully.

Do not overwrite teammate work blindly.

## Inspect changes

```bash
git status
git --no-pager diff
git diff --check
```

## Stage only task-related files

```bash
git add <files>
```

Inspect:

```bash
git status
git --no-pager diff --cached
git diff --cached --check
```

## Commit

Example:

```bash
git commit -m "feat(search): wire track selection into shared playback"
```

## Push

```bash
git push origin <your-development-branch>
```

## Pull request

PRs should:

1. target `main`;
2. explain what changed;
3. explain how it was tested;
4. reference the Jira issue;
5. request teammate review;
6. wait for required CI;
7. merge only after approval.

---

# 32. Pull Request Verification Checklist

Before opening a client-related PR:

```bash
cd ~/Soundwave-Live-Version/client

npm test -- --run
npm run lint
npm run build
```

Before opening a backend-related PR:

```bash
cd ~/Soundwave-Live-Version/server

npm test
```

Before opening a database-related PR:

```bash
cd ~/Soundwave-Live-Version/database

npm run db:migrate:test
npm run db:migrate:test
npm run db:seed:test
npm run test:integrity
npm run test:db
```

Then from the repository root:

```bash
git status
git diff --check
```

After staging:

```bash
git status
git diff --cached --stat
git diff --cached --check
git --no-pager diff --cached
```

Only commit files that belong to the intended change.

---

# 33. GitHub Actions

Current shared CI includes checks such as:

```text
Server Tests
Client Tests
Client Lint
Client Build
Database Tests
Authentication Security
Build Metadata
Docker Packaging
Compose Runtime Smoke Test
```

CI requirements may expand during later sprints.

Christian McGowan extended the existing Database Tests job to
install server dependencies and execute the PostgreSQL-backed
HTTP logout integration check after the database suite:

```bash
node --env-file=../database/.env.test --test integration/postgres-logout.check.mjs
```

This uses the job's migrated and seeded test database; it does
not create a separate workflow or replace Compose smoke checks.

The project also uses build metadata for traceability.

Generated metadata must never contain:

- JWT secrets;
- database passwords;
- private keys;
- authentication tokens;
- user credentials.

---

# 34. Docker / Compose Packaging

Docker and Docker Compose remain supported for packaging and runtime
verification. In the local Sprint 3 smoke run, both images built and
the backend health, unauthenticated protected-Library boundary, client
availability, and Compose cleanup checks all passed. The initial
`buildx` missing-plugin warning did not prevent building with the
classic builder.

**Important media limitation:** the passing Compose smoke check does
**not** verify `GET /api/tracks/3005/stream` inside the server
container. `server/Dockerfile` was observed building with `WORKDIR /app`
and `COPY . .` from the server context. For an app module located at
`/app/src/app.js`, the source-relative default media root resolves to
`/`, not the repository's host-side `mediaFiles/` directory. Container
media access and the confinement root therefore remain **unverified**.
Before treating container playback as ready, inspect `compose.yml` and
`server/Dockerfile`, provide an appropriately restricted media mount,
configure an absolute container-side `MEDIA_ROOT`, and verify HTTP `206`
against the running container. Prefer read-only mounting of rights-cleared
fixtures for development demonstrations rather than copying a music
library into the image. Do not claim that the current smoke test covers
container audio.

Packaging files include:

```text
client/Dockerfile
server/Dockerfile
compose.yml
scripts/compose-smoke-test.mjs
```

Verify Docker:

```bash
docker --version
docker compose version
```

Start the stack:

```bash
docker compose up --build
```

Stop:

```bash
docker compose down
```

Run the automated smoke check:

```bash
node scripts/compose-smoke-test.mjs
```

The direct PostgreSQL + Node + Vite workflow documented earlier remains
the normal local-development path.

Compose reads the local `database/.env` and `server/.env` files in the
current project configuration. If the smoke test reports an `env file
.../database/.env not found` error, create the ignored file with valid
*local* configuration; creating a file by itself does not provision a
PostgreSQL role or database. When `docker compose` is unknown or the
Docker socket is unavailable, confirm installation of the Compose
plugin and availability of Docker Engine before troubleshooting Soundwave.

## 34.1 Client dependency audit note (Sprint 3 local environment)

The local `client/` audit reported two high-severity transitive issues:
`brace-expansion` via ESLint/minimatch and `source-map-js` via
jsdom/Vite/PostCSS. The production-only `npm audit --omit=dev` reported
zero vulnerabilities. `npm audit fix --dry-run` proposed patch updates
`brace-expansion` `5.0.9` -> `5.0.12` and `source-map-js` `1.2.1` ->
`1.2.2`; a dry run **does not install** these fixes. Treat dependency
updates as a separate reviewed change, verify `npm audit`, client tests,
lint, and build afterward, and do not claim remediation until committed
and verified.

---

# 35. Environment and Secret Rules

Never commit:

- `.env` files containing real values;
- database passwords;
- JWT signing secrets;
- access tokens;
- private keys;
- API keys;
- authentication passwords;
- personal credentials.

Do not expose secrets in:

- logs;
- screenshots;
- Jira;
- README examples;
- tests;
- pull-request descriptions.

Use placeholders in documentation.

---

# 36. Current Development Status

## Sprint 1 foundation

Established areas include:

- repository workflow;
- backend skeleton;
- PostgreSQL catalog;
- authentication spike;
- media streaming spike;
- React/Vite client shell;
- Docker packaging;
- automated tests.

## Sprint 2 integration

Sprint 2 expanded the foundation with:

- PostgreSQL-backed catalog Search;
- Artist browse/detail;
- Album browse/detail;
- account profile;
- authenticated recently-added Library;
- integrated PlaybackBar;
- Track metadata/detail;
- real HTTP audio streaming;
- database CI hardening;
- client test CI;
- build metadata;
- Docker/Compose CI.

## Sprint 3 current work

Current Sprint 3 work includes:

- JWT revocation persistence foundation;
- session/auth hardening integration;
- protected-media integration (the authorization credential boundary
  remains separately owned/unverified, not a completed protected stream);
- client session integration;
- Search-to-Playback orchestration;
- **Allison Yu's merged, authenticated Favorites read API**;
- **Allison's October 11 Favorites table migration, authored but not yet
  verified as applied or merged**;
- cross-feature regression coverage;
- midterm integration preparation.

### Allison Yu — Sprint 3 Favorites (AY-S3-01 / AY-S3-02)

Allison authored the Favorites database model and read vertical slice:
parameterized per-user SQL, catalog repository wiring, catalog service
mapping, and the protected `GET /api/library/favorites` HTTP route with
unit and HTTP tests. Her API PR was reported merged; at that checkpoint
**163 backend tests passed**. The endpoint reuses Christian's shared
JWT/role/revocation enforcement, and media streaming remains Matthew's
boundary. Allison subsequently discovered that her development database
had no `favorites` table (`relation "favorites" does not exist`) and
authored `20261011_ayu_003_user_favorites.sql` to supply the missing
schema. The new migration still requires successful execution,
consistent CI/test-database verification, and peer-reviewed merge before
it can be marked complete.

The live authenticated PostgreSQL Favorites response remains pending;
previous confirmed live responses were health `200` and unauthenticated
Favorites `401`. The planned next vertical-slice step is the React
Favorites read state (AY-S3-03) after the live backend contract is
verified; no completed Favorites UI should be inferred here. See
Sections 23.1–23.5 for schema, API, tests, and the PowerShell procedure.

Emmanuel's current Sprint 3 Search-to-Playback happy path is implemented
and verified through:

```text
Search
    ↓
stable Track ID
    ↓
App shared selectedTrackId
    ↓
PlaybackBar
    ↓
Track metadata
    ↓
Howler
    ↓
HTTP media stream
```

Authenticated failure handling and final protected-media behavior remain
separate Sprint 3 integration work.

### Matthew Choi — Sprint 3 media-storage and playback verification

Matthew's SCRUM-168 inspection confirmed that the shared
Track-ID-to-Howler playback path already existed from Sprint 2, avoiding
duplicate implementation. SCRUM-169 adds the configurable `MEDIA_ROOT`,
source-relative default, validated path containment, and dedicated
regression tests. The existing backend tests and new cases passed
locally. SCRUM-170 confirmed PostgreSQL Track 3005 metadata `200`, media
Range `206`, and audible playback in the React application. SCRUM-169
remains pending container-media verification, peer-reviewed PR, and
passing integration checks before merge; SCRUM-170's local acceptance
checks have been demonstrated. Media authentication is a separate
Sprint 3 integration boundary, not solved by filesystem path checks.

The CPSC 490 roadmap assumed a longer streaming timeline, but the CPSC
491 syllabus governs the six-sprint calendar. Its midterm demonstration
is October 22, immediately after Sprint 3 (October 8-15), so an actual
playback path must remain demonstrable by October 15 rather than being
deferred to the dedicated streaming sprint. Use only rights-cleared
audio in the midterm and final demonstrations.

---

# 37. Project Direction

Soundwave is being implemented as a secure, responsive, lightweight,
self-hostable music-streaming application.

The current repository is an incremental shared implementation.

New features should:

- reuse existing stable contracts where practical;
- preserve the shared Track identity;
- avoid exposing physical media paths;
- keep the client separated from PostgreSQL;
- use automated verification;
- use peer-reviewed pull requests;
- avoid duplicating another feature owner's implementation;
- remain attributable to the developer who authored the change.

The repository will continue to evolve through the remaining CPSC 491
sprints.
