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
        | /api (including authenticated playback history)
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
                        Protected HTTP media streaming

Native browser audio obtains a short-lived, track-scoped media cookie
from an authenticated POST request before requesting the stream. CLI
clients can continue to use the existing Bearer JWT for streaming.
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
20261029_mchoi_001_playback_events.sql
trackMediaPath.sql
```

**Sprint 3 Favorites migration status (Allison Yu, SCRUM-227 / PR #109):**
The `20261011_ayu_003_user_favorites.sql` migration is part of the
reviewed Favorites implementation. In addition to normal migration
reruns, the later SCRUM-283 rehearsal verified the physical table,
historical data preservation, and two `favorites` associations in an
isolated PostgreSQL 16 database. Those upgrade assertions do not by
themselves prove browser playback or production deployment. Section
23 documents the API and client; Section 27.1 documents the upgrade
rehearsal.

The new `favorites` relation has `user_id BIGINT` and `track_id BIGINT`
as a composite primary key, plus `created_at TIMESTAMPTZ NOT NULL`
(default `CURRENT_TIMESTAMP`). Both IDs reference existing `users` and
`tracks` records using `ON DELETE CASCADE`. An additional index on
`track_id` supports the reverse foreign-key access pattern. The
cascade-on-delete behavior is an implementation decision; the project
specification does not prescribe an exact Favorites deletion policy.

**Sprint 4 PlaybackEvent migration (Matthew Choi, SCRUM-295):**
`20261029_mchoi_001_playback_events.sql` creates the
`playback_events` relation and preserves the existing catalog/auth
schema. Each record has a server-generated `id`, client-supplied UUID
`client_event_id`, authenticated `user_id`, existing `track_id`,
`event_type`, client occurrence time `occurred_at`, and server receipt
time `received_at`. Both foreign keys use `ON DELETE RESTRICT` (a
provisional implementation decision); `(user_id, client_event_id)` is
unique to make retries idempotent per account. Indexes support user-
scoped chronological history and track lookups. The migration does **not**
enforce JWT authorization by itself; the API must do that. Exact event
vocabulary, timestamp policy, and deletion semantics remain subject to
team approval. Section 27.2 describes the API and local evidence.

The `trackMediaPath.sql` migration adds:

```text
tracks.media_path
```

with a nonblank constraint for non-null values.

The `20261008_cmg_001_revoked_access_tokens.sql` migration is a
**prerequisite for protected media** as well as logout. Every authorized
Range request checks the originating session's JWT identifier (`jti`).
Without `revoked_access_tokens`, the server fails closed with HTTP `503`
(for example, PostgreSQL error `42P01`). Apply the already-tracked
migration against the **same development database used by `server/.env`**.
Check without changing data:

```sql
SELECT current_database(), to_regclass('public.revoked_access_tokens');
```

The table should resolve to `revoked_access_tokens`; `NULL` means the
relation is missing from that schema. Do not hand-create a replacement.

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
`favorites`. Sprint 5 write endpoints operate against this existing table
without a new migration. The deterministic Favorites fixture was part of the
Sprint 3 task plan, but its inclusion in the merged repository has not
been confirmed. For a local development-only manual association, the historical SQL
fixture is documented in Section 23.3. **After SCRUM-355, prefer the
authenticated Favorites PUT API** (Section 23.9) when testing user-facing
mutation behavior, so the write path and authorization are exercised.

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

The backend requires PostgreSQL configuration, the login-JWT signing
secret, and a **different media-ticket signing secret**. The two keys
are independent and must not be committed.

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
JWT_SECRET=<existing-login-jwt-secret>
MEDIA_TICKET_SECRET=<independently-generated-media-secret-at-least-32-bytes>
# NODE_ENV=production enables Secure media cookies for HTTPS deployment
NODE_ENV=development
# Optional: an absolute directory containing the paths in tracks.media_path
# MEDIA_ROOT=/srv/soundwave/storage
```

Use the same PostgreSQL connection settings in `database/.env` and
`server/.env` when both are used on one machine. Both signing secrets
belong on the backend only. `MEDIA_TICKET_SECRET` must contain at least
32 UTF-8 bytes and must **not** equal `JWT_SECRET`; otherwise startup
intentionally fails. The default media-ticket lifetime is 300 seconds
(five minutes), capped by the issuing login JWT's remaining lifetime.
`NODE_ENV=production` enables the `Secure` attribute; local HTTP testing
uses `NODE_ENV=development`. Production must use HTTPS.

If omitted, `MEDIA_ROOT` defaults to the repository root derived from
the location of `server/src/app.js`, not the process's current working
directory. `MEDIA_ROOT`, if configured, must be an absolute path.

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

# 9. JWT and Media-Ticket Startup Requirements

The backend initializes both the login JWT service and the independent
media-ticket service at startup. `JWT_SECRET` must remain the team's
existing login signing key. Do **not** replace it just to fix startup:
that invalidates previously issued login tokens.

If `JWT_SECRET` is missing, startup fails with an error similar to:

```text
A valid secretKey string is required to initialize the token service.
```

If `MEDIA_TICKET_SECRET` is missing, too short, or the same as the login
key, startup also fails. For local testing, generate a new *independent*
media signing key and store it in the ignored `server/.env`:

```bash
node -e 'console.log(require("node:crypto").randomBytes(48).toString("hex"))'
```

Do not share the generated value in logs, chats, screenshots or PRs.
From `server/`, start with the file explicitly loaded:

```bash
node --env-file=.env src/server.js
```

A plain `node src/server.js` does not read `.env` by itself. The alternate
`set -a; source ...; set +a` startup in Section 8 works when the files
have valid shell-compatible assignments. Exported variables affect only
their shell and its child processes. If port `8080` is already in use,
stop the previously running Soundwave process rather than starting
a second instance (see Section 30.6).

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

# 15. Protected Media Streaming

Current streaming endpoint:

```text
GET /api/tracks/:id/stream
```

**This endpoint is protected.** It accepts either (1) the existing
non-revoked login JWT supplied in an `Authorization: Bearer` header, or
(2) a valid, short-lived `sw_media` cookie issued specifically for the
requested Track. All valid requests check session revocation **before**
catalog and filesystem access. Requests without authorization return
`401`, not audio bytes. An unavailable revocation database returns
`503`, not a public-stream fallback.

The route resolves stable `tracks.id` through the catalog repository,
then uses the internal `media_path` to locate and stream audio. The
media file path is never returned to the client.

Authorized stream responses preserve:

| Request / condition | Result |
|---|---|
| Full authorized stream | `200 OK` |
| Valid byte range | `206 Partial Content` |
| Invalid or unsatisfiable Range | `416 Range Not Satisfiable` |
| Missing or invalid login/media credential, or revoked session | `401 Unauthorized` |
| Revocation infrastructure unavailable | `503 Service Unavailable` |
| Unknown Track or missing/unusable media | `404 Not Found` |

Responses include `Cache-Control: private, no-store` and
`Vary: Authorization, Cookie` on the streaming route, preventing shared
cache reuse of credential-scoped audio. No ordinary login JWT may be
placed in a URL. The `403` status is reserved for an actual role or
permission policy that denies an otherwise authenticated principal;
the current streaming policy allows `user` and `admin`.

## 15.1 Authenticated HTTP Range Verification

Obtain a **fresh** login token and keep it in the `SW_TOKEN` shell
variable using Section 15.5. Do not paste the token into your command
history or into this README. The following request keeps the token out
of the displayed command-line arguments:

```bash
printf 'header = "Authorization: Bearer %s"\n' "$SW_TOKEN" | \
  curl -sS --config - \
    -H 'Range: bytes=0-999' \
    -o /tmp/soundwave-range.bin \
    -w 'HTTP %{http_code}, bytes %{size_download}\n' \
    http://localhost:8080/api/tracks/3005/stream
wc -c /tmp/soundwave-range.bin
```

Expected with a valid, non-revoked login token and seeded Track 3005:

```text
HTTP 206, bytes 1000
1000 /tmp/soundwave-range.bin
```

The HTTP response includes `Content-Type: audio/mpeg`,
`Accept-Ranges: bytes`, `Content-Length: 1000`, and
`Content-Range: bytes 0-999/<file-size>`. The exact total file size may
vary with the rights-cleared fixture. Without a token or media cookie,
the same request must return HTTP `401`.

Automated regression tests additionally cover full `200`, invalid
Range `416`, unknown Track `404`, and missing/unsafe media-path `404`.

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
is intentionally preserved for API compatibility. These filesystem
checks complement, rather than replace, the protected media
authorization boundary described in Sections 15 and 15.5. Deployments
should protect the media directory and its parent directories against
untrusted filesystem writes.

## 15.3 Sprint 3 media-root regression tests — Matthew Choi

`server/test/media-streaming.test.js` retains the original HTTP
streaming cases, adds five media-root cases, and now also tests
revocation-aware Bearer authorization (15 focused cases total):

| Test | Expected behavior |
|---|---|
| Custom absolute `mediaRoot` and relative track media path | `200`; byte-range request `206` |
| Database `../` traversal outside the root | `404` with original text response |
| Absolute database `media_path` | `404` |
| Symlink resolving outside the media root | `404` |
| Relative `mediaRoot` supplied to `createApp()` | `TypeError` |

The new cases use temporary synthetic fixtures, not unlicensed music.
Further negative cases verify no token, invalid and expired JWTs,
revoked sessions, and revocation-store failures. The developer
reported all **15 media-streaming tests passing** and all **222 backend
tests passing** after adding the separate nine-test media-access
application suite. Re-run against the current checkout before
committing, because counts may change when teammate changes merge:

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

The table above is a **historical pre-protection checkpoint**, not
proof that the currently protected Howler player can stream without
a credential. To reproduce current backend behavior, obtain a fresh
JWT and use the authenticated Range command in Section 15.1, or use
a scoped media cookie as documented in Section 15.5. An anonymous
stream request now correctly returns `401`.

After Emmanuel's frontend credential handoff is integrated, open
`http://localhost:5173/albums/2003` (or the Vite port shown), select
Track 3005, and confirm audible playback, seek/Range (`206`), Play,
Pause and Volume. Browser Network errors `401`, `403` or `503` need
separate inspection; Howler's generic media load error does not expose
the precise HTTP status. **Current protected browser playback has not
been verified by the backend test run.**

Track `3005` must use audio covered by `mediaFiles/license.txt` or
another documented public-domain, Creative Commons, or owned fixture.
The current seed/API displays `durationMs: 12345`; confirm that the seed
value matches the actual audio metadata before making duration-accuracy
claims in a graded demo.

These historical checks documented **direct local playback before the
new credential requirement**; they do not verify protected browser
playback or media accessibility inside Docker Compose. Container audio
remains a separate verification.

## 15.5 Sprint 3 track-scoped media tickets — Matthew Choi

The backend now includes these Matthew-owned modules:

```text
server/src/media/media-ticket.js
server/src/media/media-access.handler.js
server/test/media-access.app.test.js
```

`server/src/server.js` creates a dedicated media-ticket service using
`MEDIA_TICKET_SECRET`; `server/src/app.js` wires its issuance endpoint
and streaming authorization. Christian's shared JWT and revocation
modules remain unchanged. The ticket is a **two-part HMAC-SHA256
media-only credential, not a login JWT**. It is signed with a different
key, bound to one Track ID, a user, and the source login-session `jti`,
and is valid for **at most 300 seconds** (and never longer than the
remaining login JWT lifetime). Requests check source-session revocation
on every stream and Range request.

| Step | API contract |
|---|---|
| Issue or renew ticket | `POST /api/tracks/:id/media-access` with a current `Authorization: Bearer <login JWT>` |
| Issuance success | `204 No Content`, `Set-Cookie: sw_media=...` |
| Cookie properties | `HttpOnly`, `SameSite=Lax`, `Path=/api/tracks/:id/stream`, `Max-Age` up to 300 seconds; `Secure` in production HTTPS |
| Native playback/seek | `GET /api/tracks/:id/stream`; browser sends the path-matching cookie automatically |
| Existing API clients | Bearer-authenticated `GET /stream` continues working without a media cookie |
| Error classification | Invalid, expired or revoked: `401`; revocation database unavailable: `503`; `403` only for an actual permission denial |

A present but invalid `Authorization` header cannot bypass Bearer checks
by falling back to a valid cookie. Media cookies are not accepted on
ordinary authenticated API routes such as `/auth/me`. Issuance and
streaming requests do **not** expose `media_path`. Credential issuance
requires an existing Track with a media-path mapping; a missing Track
or path returns `404`.

### Live HTTP smoke test (Linux/macOS terminal)

Run these in a second shell while PostgreSQL and the backend are
running with both signing secrets loaded. Use a real development
Soundwave account. **Do not print or share the login JWT, cookie jar,
credentials or complete response headers containing `Set-Cookie`.**

First, request a login token without putting the password in history:

```bash
read -r -p 'Soundwave username: ' SW_USER
read -r -s -p 'Soundwave password: ' SW_PASS; printf '\n'
LOGIN_RESPONSE="$(
  SW_USER="$SW_USER" SW_PASS="$SW_PASS" node -e '
    process.stdout.write(JSON.stringify({
      username: process.env.SW_USER,
      password: process.env.SW_PASS
    }));
  ' | curl -fsS -H 'Content-Type: application/json' \
    --data-binary @- http://localhost:8080/auth/login
)"
unset SW_PASS
SW_TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | node -e '
  let input = "";
  process.stdin.on("data", x => input += x);
  process.stdin.on("end", () => {
    const reply = JSON.parse(input);
    process.stdout.write(reply.accessToken ?? reply.token ?? "");
  });
')"
unset LOGIN_RESPONSE
test -n "$SW_TOKEN" && echo 'Login token captured'
```

If login fails or no token was captured, stop; verify `/auth/login`
and the test account instead of sending an empty Bearer header.
Create a private cookie jar, issue the media credential, and verify
only the response status:

```bash
umask 077
COOKIE_JAR="$(mktemp)"
printf 'header = "Authorization: Bearer %s"\n' "$SW_TOKEN" | \
  curl -sS --config - -X POST -c "$COOKIE_JAR" \
    -o /dev/null -w 'Media access HTTP %{http_code}\n' \
    http://localhost:8080/api/tracks/3005/media-access
grep -q 'sw_media' "$COOKIE_JAR" && echo 'Media cookie saved'
```

Expected: `Media access HTTP 204` and `Media cookie saved`. The
server response is `401` without a current login token. Next, exercise
the **cookie-only** native-audio path with a Range request:

```bash
curl -sS -b "$COOKIE_JAR" \
  -H 'Range: bytes=0-999' -o /dev/null \
  -w 'Stream HTTP %{http_code}\nDownloaded bytes: %{size_download}\n' \
  http://localhost:8080/api/tracks/3005/stream
```

Expected with the seeded rights-cleared media fixture:

```text
Stream HTTP 206
Downloaded bytes: 1000
```

The cookie expires within five minutes, so perform the stream request
promptly. To renew, repeat the same authenticated `POST`; it replaces
the path-scoped media cookie. A later seek or new Range request after
expiry will need renewal. Logging out the issuing session invalidates
the corresponding media ticket even before its expiry. Clean up:

```bash
rm -f "$COOKIE_JAR"
unset COOKIE_JAR SW_TOKEN SW_USER
```

These commands confirm the **live HTTP backend only**. They are not
evidence of Firefox storing cookies via Vite or Howler actually playing
audio; Emmanuel owns the client-side issuance, renewal, error UX and
Search-to-Play tests. A native HTML5 `<audio>` element does not expose
HTTP `401`/`503` directly to Howler, so client auth-specific error UX
must use the observable issuance/renewal HTTP responses.

## 15.6 Sprint 3 media-ticket automated evidence

From `server/`:

```bash
node --test test/media-access.app.test.js
node --test test/media-streaming.test.js
npm test
```

**Matthew's reported local checkout (October 13, 2026):**

| Verification | Observed outcome |
|---|---|
| `media-access.app.test.js` | **9 passed, 0 failed** |
| `media-streaming.test.js` | **15 passed, 0 failed** |
| Complete server `npm test` | **222 passed, 0 failed** |

The nine media-access application tests verify issuance, cookie-based
`206`, existing Bearer `206`, unauthenticated issuance `401`, wrong-track
`401`, source-session revocation `401`, database outage `503`, ticket
renewal, Bearer precedence, and exclusion of media cookies from
`/auth/me`. They use a temporary synthetic audio fixture, not a live
PostgreSQL database or real browser. A successful suite is **not**
proof of deployed secrets, actual `204`/`206` live responses, browser
seeking, or CI/Docker readiness. Record those separately before merge.

---

# 16. Important Sprint 3 Media/Auth Boundary

The protected streaming **backend** is implemented: Matthew's route
checks Christian's revocation-aware Bearer authentication or a valid
track-scoped media cookie before accessing the catalog and filesystem.
Automated streaming and media-ticket tests passed (Section 15.6).

The **browser-to-media integration is not yet complete**: Howler with
`html5: true` does not attach the login Bearer header automatically.
Emmanuel owns acquiring or renewing the media cookie via the new POST
endpoint before playback, and implementing observable `401`/`403`/`503`
UX. Matthew owns ticket issuance/verification and protected Range
behavior; Christian reviews JWT/session-revocation requirements.

The authenticated Range backend tests must not be presented as proof
of protected audible playback. Verify real browser playback and seeking
before the October 22 midterm. Do not disable authorization to make
the player appear to work. See Sections 15.5 and 15.6.

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

The Favorites route belongs to Allison Yu's catalog work; **Christian's
Sprint 3 change** added the GET revocation guard and regression coverage.
**Allison's Sprint 5 SCRUM-355 change** also subjects PUT and DELETE
Favorites mutations to that already-existing shared guard; it does not
change Christian's middleware.
An already-revoked token receives `401`; a failed revocation lookup
fails closed with `503` rather than bypassing authentication.

Public catalog discovery, Search, and `/health` are unchanged.
**Historical scope note:** Christian's original Block 2 protected the
four routes above, not media streaming. Subsequently, Matthew added
revocation-aware protection to `GET /api/tracks/:id/stream`, plus an
independent media-cookie path (Sections 15 and 15.5). Both paths now
check original-session revocation on authorized streaming requests.
Client handling of expired sessions and auth-specific media errors is
still owned by Emmanuel's frontend integration.

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
client contract; Allison Yu retains catalog, Library and Favorites
handlers; Matthew Choi owns the Sprint 3 streaming/media-ticket work;
Konner Rigby retains shared client/CI ownership. **At the time of
Christian's Block 3**, that change did not add media-stream
authorization. Matthew's subsequent media changes are documented in
Section 15; they do not revalidate a user's changed role against
PostgreSQL on every request, implement login-token refresh, or finish
client-side handling for expired sessions and `401`/`403`.

## 20.6 Dedicated Security Regression Gate (SCRUM-207 / SCRUM-208)

The existing GitHub Actions **Authentication Security** job invokes
`npm run test:auth` from `server/`. SCRUM-207 extends this dedicated command
from six foundational test files to fourteen security regression test files.
All these files were already exercised by the full `npm test` suite; this
change makes their coverage explicit in the dedicated security check.

| Security test group | Files | Verified regression areas |
|---|---:|---|
| Authentication foundation | 6 | Login, password hashing, JWT issuance/verification, `/auth/me` |
| Logout and revocation storage | 3 | Token-specific logout, independent sessions, revocation repository errors |
| Authorization | 3 | Explicit roles, 401/403, forged role headers, policy failure |
| Revocation enforcement | 2 | Protected routes, revoked/invalid JWTs, fail-closed errors |

The fourteen files are defined explicitly in `server/package.json` under
`test:auth`. From the repository root, run:

```bash
cd server
npm run test:auth
npm test
```

**Local verification on October 14, 2026:** the expanded dedicated security
command passed **95/95 tests**; the full backend suite passed **222/222**.
The suites overlap; these totals must not be added together. CI verification
for this Block 5 change is pending its own pull request and review.

The documented authentication/authorization response distinctions remain:

- `401 Unauthorized`: missing, invalid, expired, or revoked access token.
- `403 Forbidden`: authenticated principal lacking an explicitly permitted role.
- `503 Service Unavailable`: fail-closed revocation lookup failure; existing
  configuration failures may also map to `503` as explained in Section 20.5.

The current production routes in Section 20.5 permit both `user` and `admin`.
The administrator-only and `403` role cases are verified by test-only policy
fixtures, not by introducing a new production administrator endpoint.

**Scope and limitations:** this dedicated Node test command does not replace
PostgreSQL-backed logout integration, Database Tests, frontend/browser session
checks, or Matthew Choi's media-access regression tests. Broader cross-feature
authorization scenarios and contract-change verification are reserved for
SCRUM-210 and SCRUM-213. No secrets, raw JWTs, or user credentials should be
included in test logs or CI artifacts.

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

# 23. Library — Recently Added and Favorites

The current Library flow uses:

```text
GET /api/library/recently-added
```

The route requires Bearer authentication.

Allison Yu's Favorites read route is `GET /api/library/favorites`. It
returns the authenticated user's Favorites. **Sprint 5 / SCRUM-355** adds
protected `PUT` and `DELETE /api/library/favorites/:trackId` to save or
remove associations in PostgreSQL. Both Library read routes and the
new Favorites write routes use the existing revocation-aware authorization
boundary described in Section 20; see Section 23.9 for the new API contract.

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

**Midterm completion status (SCRUM-227, -228, -229, -230; PRs #105,
#109, #110, #123):** The Favorites table, authenticated read API,
React Library/Favorites read interface, deterministic fixtures, and
PostgreSQL-backed integration/CI checks have been implemented. The
original pending-UI note in this README was an earlier Sprint 3
snapshot; the Sprint 3 deliverable identifies PR #110 for the React
interface. SCRUM-211 / PR #131 subsequently verified cross-user HTTP
read isolation against PostgreSQL (8/8 local checks, including a
negative control). **At the Sprint 3 midterm**, the completed feature
was read/display only. Sprint 5 later added backend write endpoints
(SCRUM-355); see Section 23.9. No interactive frontend heart-button
write behavior is claimed by SCRUM-355.

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
returned. **This GET endpoint remains a read operation** and its response
shape has not changed. The subsequent Sprint 5 PUT/DELETE mutations are
documented separately in Section 23.9.

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
`401 Unauthorized`. To verify independent sessions, log in a second time **before** logging
out the first token, and confirm the second session can still read
Favorites. Section 20 documents the shared revocation contract in full.
The above smoke test verifies **the existing GET only**. Run the Sprint 5
write/read/delete sequence in Section 23.9 for SCRUM-355.

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

**Later local regression verification (Allison):** After merging the
shared role-authorization and Favorites migration changes, Allison
reported running `npm test` in `server/`: **208 passed, 0 failed**.
She also reported `npm run test:db` (**34 passed, 0 failed**) and
`npm run test:integrity` (**2 passed, 0 failed**) from `database/`.
The database test counts do not constitute a dedicated live Favorites
schema/integration test; retain the separate SQL/API verification below.

**Updated Sprint 3 verification:** The original early-October dev
failure, `relation "favorites" does not exist`, was addressed by the
tracked migration. SCRUM-230 / PR #123 added deterministic fixture and
PostgreSQL-backed CI coverage. SCRUM-211 / PR #131 added a real HTTP
cross-user Favorites disclosure matrix; the recorded local run was
**8/8 passing**, and its associated full server run was **222/222**
passing. The matrix tests authenticated principal isolation rather than
relying on mocked repository data alone. SCRUM-283 / PR #136 separately
verified preserved historical records plus two new Favorites rows after
an actual populated-database upgrade. Keep browser demonstrations and end-user Favorites mutation claims
separate from these automated checks: Sprint 3 did not include a
write/unfavorite UI. The subsequent backend-only write implementation
and independently observed PostgreSQL mutations are documented in
Section 23.9.

## 23.6 Sprint 3 Favorites React client — Allison Yu (AY-S3-03)

**Midterm status:** The authored Favorites React UI and regression
tests are recorded in SCRUM-229 / PR #110. The code reuses the
existing Library route, in-memory `accessToken`, and
`onSelectTrack(track.id)` callback. It does **not** add authentication
storage, a second player, or a new Library route. The 63-test result
below is the earlier component-integration checkpoint, not a final
repository-wide test count.

Files introduced or modified for this frontend vertical slice:

```text
client/src/components/FavoritesSection.jsx
client/src/components/FavoritesSection.css
client/src/components/FavoritesSection.test.jsx
client/src/pages/Library.jsx
client/src/pages/Library.test.jsx
client/src/pages/Library.favorites-integration.test.jsx
client/src/App.navigation.test.jsx
```

After login, use the existing Sidebar **Library** link (do not hard
refresh after logging in, since current session state is in memory).
`Library.jsx` displays Recently Added and a separate Favorite Tracks
section. Both read paths reuse the bearer token supplied by `App.jsx`:

```text
App (existing accessToken)
  -> Library(accessToken, onSelectTrack)
       -> GET /api/library/recently-added
       -> FavoritesSection(accessToken, onSelectTrack)
            -> GET /api/library/favorites
                 -> render saved tracks
                 -> onSelectTrack(track.id)
                      -> App selectedTrackId -> shared PlaybackBar
```

`FavoritesSection` handles loading, no-session, empty-library, HTTP 401,
HTTP 403, HTTP 503, other failures, and Retry states. Requests are
aborted on cleanup and stale request results are not shown when the
token or retry state changes. `401` displays a sign-in-again message;
it does **not** change the shared session/logout implementation.
Track selection passes the canonical `tracks.id`; successful selection
alone does not prove that an MP3 is available for streaming.

### User interface and design scope

The component's dedicated CSS follows the CPSC 490 Soundwave roadmap's
UX references (Figure UXA3 color palette, Figure UXAD song card, and
Library/Songs page mockups). It uses a navy/slate surface with purple
accent, Inter/sans-serif text, compact cards, a responsive two-column
layout on wider screens, and a single-column layout on narrow screens.
The track title, artist, album, and duration are drawn from the read
API. The card selects the track; the heart graphic is currently only
presentational and does not make a write request. Where artwork is not
in the API payload, the component shows a placeholder rather than
inventing a cover URL.

**Decisions recorded for future implementation only (not implemented
in this PR):**

1. Some tracks will have album artwork; display it where a safe artwork
   URL is actually returned, retaining a fallback for other tracks.
2. Favorites will eventually be navigable under its own Library tab;
   it currently remains a section inside Library.
3. A favorited track should show a **filled heart**; the current
   implementation has not yet made this state-indicator update.

**Sprint 3 frontend scope:** the Library Favorites section remains a
read/display interface with no working add/remove heart control. The
Sprint 5 backend now supports Favorites writes (Section 23.9), but
that alone does not implement the React write interaction.
The PDF's larger tabbed Library search and playlist UI is future work,
not part of this focused Favorites integration.

### React verification

From `client/`:

```powershell
npx vitest run src/components/FavoritesSection.test.jsx src/pages/Library.test.jsx src/pages/Library.favorites-integration.test.jsx
npx vitest run src/App.navigation.test.jsx
npm run test:run
npm run lint
npm run build
```

**Last fully pasted logs (before the final PDF-inspired styling pass):**

| Check | Result |
|---|---|
| Favorites component | 5/5 passed |
| Existing Library behavior | 8/8 passed |
| Library/Favorites integration | 3/3 passed |
| Focused Favorites + Library suites | 16/16 passed |
| Shared navigation | 9/9 passed, including authenticated Favorites request |
| Complete client regression suite | **63/63 passed across 15 test files** |
| ESLint | Passed, no reported errors |
| Vite production build | Passed |

The navigation fixture was extended to respond to the new Favorites
request and assert that it uses the existing Bearer token. The original
Library unit tests isolate Recently Added by mocking the Favorites
component, while the separate cross-component tests render the real
Favorites component and verify both endpoints, track selection, and
independent failures. This prevents one section's fixtures from
accidentally satisfying another section's assertions.

These counts are the recorded Favorites-integration checkpoint.
The later midterm team report records **100/100 passing** client tests
and successful lint/build for the shared application; those are
repository-wide outcomes, not tests individually authored by Allison.
Always run the commands on the PR's current commit and report its
actual totals. Mocked UI tests do not independently prove audible
playback or a user-specific browser session against live PostgreSQL.

## 23.7 Favorites isolation regression - Allison Yu (SCRUM-211 / PR #131)

The dedicated read-side HTTP isolation matrix tests the **real
PostgreSQL-backed** Favorites boundary, not merely frontend mocks:
requests with distinct authenticated principals must return only each
principal's saved Tracks, and unauthenticated requests must fail
closed. An intentional oracle negative control verifies that the test
can detect a disclosure mistake.

Run in a **dedicated migrated and seeded test database** (never the
shared development or production database). The integration script is
located in `server/integration/postgres-favorites-isolation.check.mjs`.
From the repository root, on WSL/Linux:

```bash
cd server
node --env-file=../database/.env.test --test integration/postgres-favorites-isolation.check.mjs
```

On Windows PowerShell, from `server/`, the same Node command works when
your local `../database/.env.test` targets the isolated test database:

```powershell
node --env-file=../database/.env.test --test integration/postgres-favorites-isolation.check.mjs
```

**Recorded Allison checkpoint:** eight checks passed, zero failed;
`cd server && npm test` also passed **222/222** at that checkout.
These numbers are evidence from the Sprint 3 run, not fixed expected
counts for all future commits. The script is also included in the
shared Database Tests GitHub Actions job recorded in the midterm
workflow.

## 23.8 Allison Yu - Jira and pull-request evidence index

| Sprint | Jira issue | Authored deliverable | PR |
|---|---|---|---|
| S1 | SCRUM-7, SCRUM-31 | Catalog migrations, tooling and seed foundation | [#37](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/37), [#39](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/39) |
| S1 | SCRUM-45-48, SCRUM-63-66 | Catalog API, debug UI, boundaries, ERD and README | [#38](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/38), [#40](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/40), [#44](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/44) |
| S2 | SCRUM-155-158 | Artist/Album browse/detail APIs, React UI and tests | [#65](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/65), [#66](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/66), [#67](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/67), [#72](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/72) |
| S2 | SCRUM-123, SCRUM-112 | Migration rerun preflight and schema/fixture CI gate | [#84](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/84), [#94](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/94) |
| S3 | SCRUM-227-230 | Favorites migration, read API, Library UI, deterministic fixture tests | [#105](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/105), [#109](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/109), [#110](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/110), [#123](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/123) |
| S3 | SCRUM-211 | Real HTTP cross-user Favorites isolation matrix | [#131](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/131) |
| S3 | SCRUM-283 | Populated-schema upgrade and preservation rehearsal | [#136](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/136) |
| S5 | [SCRUM-355](https://491group1.atlassian.net/browse/SCRUM-355) | Authenticated Favorites PUT/DELETE API, PostgreSQL persistence, regression tests, manual live evidence | **PR pending peer review; number not yet recorded** |

Supplementary README/evidence changes include PRs [#99](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/99) and [#44](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/44).

**Ownership correction:** SCRUM-41 / PR #38 included an
Auth User/Session persistence migration that was originally assigned
to Emmanuel De Guzman. Allison authored that shared migration in
Sprint 1; Emmanuel consumed the shared interface rather than adding a
duplicate migration. This was a coordination/ownership mistake, **not**
a claim that Allison authored Emmanuel's password/JWT/login behavior.
Future work must confirm Jira ownership and interfaces before coding.

## 23.9 Sprint 5 authenticated Favorites mutations — Allison Yu (SCRUM-355)

**Local implementation and verification checkpoint: November 17, 2026.**
SCRUM-355 extends Allison's Sprint 3 Favorites read path with API-level
writes to the **existing** `favorites` table. The work is implemented
and tested locally, but a GitHub PR number, peer approval, hosted CI
result, and merge into `main` have **not been supplied**. Do not describe
this work as merged or deployed until that evidence exists.

### HTTP contract and authorization

| Method / route | Behavior | Success |
|---|---|---|
| `GET /api/library/favorites` | List the authenticated account's Favorites; same response format as Sprint 3 | `200 OK` with array |
| `PUT /api/library/favorites/:trackId` | Save an existing Track for the authenticated account | `204 No Content` |
| `DELETE /api/library/favorites/:trackId` | Remove the authenticated account's association, if present | `204 No Content` |

- The Track identity is the existing catalog `tracks.id` (positive,
  safe integer), never a media filepath. No request-body user ID, query
  string or user-supplied header chooses the Favorites owner.
- `server/src/app.js` passes the principal from the existing
  `authorizeRevocableRequest` guard into `catalog.handler.js` for write
  requests. Authentication, signed-role handling and PostgreSQL-backed
  token revocation remain in the shared middleware owned by Christian.
  Both current roles (`user` and `admin`) are accepted.
- `favorites.repository.js` uses parameterized statements scoped by
  `user_id` **and** `track_id`. Its INSERT checks for an existing Track
  and uses `ON CONFLICT (user_id, track_id) DO NOTHING`; DELETE uses a
  user-scoped `WHERE` clause. The existing composite primary key and
  foreign keys enforce referential integrity and uniqueness. Duplicate
  PUT and DELETE requests are intentionally idempotent.
- No new migration, reset, schema-history change, auth middleware
  rewrite, UI mutation, streaming handler or queue change was needed.
  Keep `20261011_ayu_003_user_favorites.sql` unchanged.

| Condition | Observed / implemented response |
|---|---|
| Valid authenticated add or remove | `204 No Content` (including repeated request) |
| Malformed/zero/unsafe Track ID | `400 Bad Request`, `invalid_track_id` |
| Existing-valid-ID lookup missing on PUT | `404 Not Found`, `track_not_found` |
| Missing, invalid or revoked token | `401 Unauthorized` |
| Revocation store unavailable | `503 Service Unavailable` (shared guard fails closed) |
| Authorized Favorites persistence/service failure | `500`, `library_unavailable` (generic client error) |

A service/storage error is intentionally not presented as a successful
write. The generic `500` contract is not proof that production logging
cannot contain sensitive exception details; review logging separately.
This feature does **not** create a new write button in the React
Favorites section. The existing heart artwork is still presentational;
frontend write controls require a separate implementation and tests.

### Files affected by SCRUM-355

```text
server/src/data/favorites.repository.js
server/src/data/catalog.repository.js
server/src/catalog/catalog.service.js
server/src/catalog/catalog.handler.js
server/src/app.js
server/test/catalog-favorites.repository.test.js
server/test/catalog-favorites-routes.test.js
README.md
```

The catalog service's existing artist/album detail field aliases were
corrected after an initial full-suite regression identified four
failures. Those corrections are necessary to preserve prior catalog
response contracts. `server/src/server.js`, applied SQL migrations,
client components, and shared JWT middleware were not changed for this
ticket. Review the actual Git diff before confirming the final file
list or ownership boundaries in the pull request.

### Automated test evidence (local, November 17, 2026)

From `server/`:

```powershell
node --test test/catalog-favorites.repository.test.js
node --test test/catalog-favorites-routes.test.js
node --test test/catalog-artists.service.test.js
node --test test/catalog-albums.service.test.js
node --test test/catalog-media-contract.test.js
npm test
```

From `database/` (existing **isolated test** database configured in
`.env.test`; do not point test scripts at development/production):

```powershell
npm run test:db
npm run test:integrity
```

| Check | User-provided local result |
|---|---|
| Favorites repository tests | **6/6 passed** |
| Favorites HTTP route tests (mocked account data) | **12/12 passed** |
| Artist service, album service, catalog media contract | **4/4 each passed** after field-alias corrections |
| Complete server `npm test` | **312/312 passed, 0 failed** |
| Existing database integration `npm run test:db` | **36/36 passed, 0 failed** |
| Existing database integrity `npm run test:integrity` | **2/2 passed, 0 failed** |

The focused HTTP tests use a mocked Favorites store and test both
principals, client-forged identities, idempotence, revoked tokens, and
controlled failure handling. The database integration suite verifies
existing schema/fixtures, not a dedicated new production-path write
integration. A **separate live HTTP/PostgreSQL manual test**, described
below, provides the observed mutation evidence. Do not combine suite
counts as though they represent independent tests.

### Reproduce an authenticated API write smoke test (Windows PowerShell)

Start the backend with `server/.env` against a **development** database
containing the tracked Favorites migration and catalog seed. Use two
separate PowerShell terminals; keep the backend running in the first:

```powershell
cd server
node --env-file=.env src/server.js
```

In the second terminal, set the URL **in that session** and log in using
an existing local test account. Never display or commit password or JWT
values. The shown `devuser` is an example from the documented local
run, not a built-in guaranteed account:

```powershell
$baseUrl = 'http://localhost:8080'
curl.exe -i "$baseUrl/health"          # Expect 200

$securePassword = Read-Host 'devuser password' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
$loginBody = @{ username = 'devuser'; password = $plainPassword } | ConvertTo-Json
try {
    $login = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/login" `
        -ContentType 'application/json' -Body $loginBody -ErrorAction Stop
} finally {
    Remove-Variable plainPassword, loginBody, securePassword -ErrorAction SilentlyContinue
}
if (-not $login.accessToken) { throw 'Login returned no accessToken; stop.' }
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$baseUrl/auth/me" -Headers $headers
```

Avoid wrapping `Invoke-RestMethod` JSON arrays directly in `@(...)` for
subsequent `id` access: Windows PowerShell can retain an outer nested
array. Obtain the response with `Invoke-WebRequest`, parse its JSON,
and enumerate objects explicitly:

```powershell
$beforeResponse = Invoke-WebRequest -Uri "$baseUrl/api/library/favorites" `
    -Headers $headers -UseBasicParsing -ErrorAction Stop
$before = @()
foreach ($item in (ConvertFrom-Json -InputObject $beforeResponse.Content)) {
    if ($null -ne $item) { $before += $item }
}
$beforeIds = @($before | ForEach-Object { [long]$_.id })
$before | Select-Object id, title

$catalogResponse = Invoke-WebRequest -Uri "$baseUrl/api/catalog/tracks" `
    -UseBasicParsing -ErrorAction Stop
$catalogRows = @()
foreach ($item in (ConvertFrom-Json -InputObject $catalogResponse.Content)) {
    if ($null -ne $item) { $catalogRows += $item }
}
$candidate = $null
foreach ($track in $catalogRows) {
    if ($beforeIds -notcontains [long]$track.id) {
        $candidate = $track
        break
    }
}
if ($null -eq $candidate) { throw 'No unfavorited Track; stop safely.' }
$trackId = [long]$candidate.id
if ($trackId -le 0) { throw 'Invalid Track ID; stop.' }
Write-Host "Testing existing Track $trackId ($($candidate.title))"
```

Next execute PUT twice, then GET; expect two `204` responses and
exactly one **new** favorite. Stop before DELETE if you still need a
PostgreSQL insertion screenshot:

```powershell
$put1 = Invoke-WebRequest -Method Put -Uri "$baseUrl/api/library/favorites/$trackId" `
    -Headers $headers -UseBasicParsing -ErrorAction Stop
$put2 = Invoke-WebRequest -Method Put -Uri "$baseUrl/api/library/favorites/$trackId" `
    -Headers $headers -UseBasicParsing -ErrorAction Stop
Write-Host "PUT status: $($put1.StatusCode) / repeated PUT: $($put2.StatusCode)"

$afterResponse = Invoke-WebRequest -Uri "$baseUrl/api/library/favorites" `
    -Headers $headers -UseBasicParsing -ErrorAction Stop
$afterAdd = @()
foreach ($item in (ConvertFrom-Json -InputObject $afterResponse.Content)) {
    if ($null -ne $item) { $afterAdd += $item }
}
$matches = @($afterAdd | Where-Object { [long]$_.id -eq $trackId })
if ($put1.StatusCode -ne 204 -or $put2.StatusCode -ne 204 -or
    $matches.Count -ne 1 -or $afterAdd.Count -ne ($before.Count + 1)) {
    throw 'Favorites add verification failed; stop and investigate.'
}
Write-Host 'PASS: added once and retrieved via authenticated GET.'
```

In the **same development database** used by the backend, inspect
persistence in pgAdmin/`psql` with the actual principal and Track IDs
(the following IDs are from Allison's November 17 manual checkpoint):

```sql
SELECT u.username, f.user_id, f.track_id, t.title,
       COUNT(*) AS association_count
FROM favorites AS f
JOIN users AS u ON u.id = f.user_id
JOIN tracks AS t ON t.id = f.track_id
WHERE f.user_id = 7 AND f.track_id = 3002
GROUP BY u.username, f.user_id, f.track_id, t.title;
```

After saving evidence, remove the same Favorite using the original
PowerShell session:

```powershell
$del1 = Invoke-WebRequest -Method Delete -Uri "$baseUrl/api/library/favorites/$trackId" `
    -Headers $headers -UseBasicParsing -ErrorAction Stop
$del2 = Invoke-WebRequest -Method Delete -Uri "$baseUrl/api/library/favorites/$trackId" `
    -Headers $headers -UseBasicParsing -ErrorAction Stop
$finalResponse = Invoke-WebRequest -Uri "$baseUrl/api/library/favorites" `
    -Headers $headers -UseBasicParsing -ErrorAction Stop
$afterDelete = @()
foreach ($item in (ConvertFrom-Json -InputObject $finalResponse.Content)) {
    if ($null -ne $item) { $afterDelete += $item }
}
$afterDeleteIds = @($afterDelete | ForEach-Object { [long]$_.id })
$missing = @($beforeIds | Where-Object { $_ -notin $afterDeleteIds })
$extra = @($afterDeleteIds | Where-Object { $_ -notin $beforeIds })
if ($del1.StatusCode -ne 204 -or $del2.StatusCode -ne 204 -or
    $missing.Count -ne 0 -or $extra.Count -ne 0 -or
    $afterDelete.Count -ne $before.Count) {
    throw 'Favorites delete/restoration verification failed.'
}
Write-Host 'PASS: repeated DELETE idempotent; initial Favorites restored.'
Remove-Variable headers, login -ErrorAction SilentlyContinue
```

A final PostgreSQL read can confirm the deleted association is absent:

```sql
SELECT user_id, track_id, created_at
FROM favorites
WHERE user_id = 7 AND track_id = 3002;
-- Expected after DELETE: zero rows.
```

For live unauthorized checks, send PUT and DELETE **without** the
`Authorization` header; each should return `401`:

```powershell
foreach ($method in @('PUT', 'DELETE')) {
    try {
        $unexpected = Invoke-WebRequest -Method $method `
            -Uri "$baseUrl/api/library/favorites/$trackId" `
            -UseBasicParsing -ErrorAction Stop
        throw "FAIL: Anonymous $method unexpectedly returned $($unexpected.StatusCode)"
    } catch [System.Net.WebException] {
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -ne 401) { throw "FAIL: Anonymous $method returned $status, expected 401" }
        Write-Host "PASS: Anonymous $method rejected with 401"
    }
}
```

Use the current existing Track ID and do not supply `$headers` for
this negative test. Do not modify another user's data as a shortcut
to isolation evidence. Capture only statuses, not token values.

### Observed manual results and limits (November 17, 2026)

| Step | Observed result |
|---|---|
| `/health`, `/auth/login`, `/auth/me` | Health `200`; `devuser` authenticated as user ID **7**, role `user` |
| Pre-test `GET /api/library/favorites` | `200`: Tracks **3005 (Kontekst)** and **3001 (Fixture Track One)** |
| Target Track | **3002 (Fixture Track Two)**, present in catalog and initially absent from Favorites |
| PUT and repeated PUT for `/3002` | **204**, **204** |
| GET after addition | `200`: 3002, 3005, 3001; **3002 shown once** |
| pgAdmin insertion query | Matching row for `devuser` / user **7** / Track **3002** visibly returned; count column partly clipped in screenshot |
| DELETE and repeated DELETE for `/3002` | **204**, **204** |
| GET after deletion | `200`: original 3005 and 3001; PowerShell baseline comparison **PASS** |
| pgAdmin deletion query | Zero matching user 7 / Track 3002 rows |
| Anonymous PUT and DELETE for `/3002` | Both **401 Unauthorized** |

The manual test is evidence of real **single-account** HTTP persistence,
idempotence, cleanup and anonymous-write denial. It is **not** a live
two-account write-isolation test. A second live test account was not
available; cross-user mutation boundaries are covered by the new mocked
HTTP tests and user-scoped SQL, while separate Sprint 3 real-PostgreSQL
GET isolation evidence remains documented in Section 23.7. The
SCRUM-355 pull request and hosted CI are pending verification.

**Review/ownership boundary:** Allison authored this Library/Favorites
vertical slice; it consumes Christian McGowan's shared authentication
guard rather than changing the JWT middleware. It does not implement
Emmanuel's Search or client auth handling, Matthew's media player and
streaming, Konner's queue/navigation, or any teammates' account work.
The roadmap defines the Playlist/Library use case; Favorites is an
implemented subset, **not** evidence of complete playlist creation.

---

## 23.10 Sprint 5 Favorites UI and synchronized track hearts — Allison Yu (SCRUM-362)

**Local verification checkpoint: November 17, 2026 (Pacific time).**

SCRUM-362 adds interactive track Favorites in three existing client surfaces:

- **Library:** Recently Added hearts and the Favorite Tracks section.
- **Playback Bar:** a heart beside the selected playable Track.
- **Album Detail:** a heart for every song in an album's track list.

Filled purple hearts indicate saved tracks; outlined hearts indicate unsaved
tracks. All views use canonical catalog `tracks.id` values. Saved state comes
from the authenticated backend, not from speculative local storage.

### Authenticated Favorites contract

| Method and endpoint | Purpose | Success |
|---|---|---|
| `GET /api/library/favorites` | List the principal's saved tracks | `200` with JSON array |
| `PUT /api/library/favorites/:trackId` | Save an individual track | `204 No Content` |
| `DELETE /api/library/favorites/:trackId` | Remove an individual track | `204 No Content` |

All requests pass `Authorization: Bearer <access token>`. The client neither
submits an owner user ID nor connects to PostgreSQL directly. SCRUM-362
**consumes** the authenticated write API from SCRUM-355; it does not add
backend routes or schema migrations.

### Shared refresh contract

```text
App.jsx
  favoritesVersion (incrementing revision)
  handleFavoritesChanged()
       |---- Library.jsx ---> Recently Added + FavoritesSection.jsx
       |---- PlaybackBar.jsx ---> PlaybackFavoriteButton.jsx
       `---- AlbumDetail.jsx ---> album song-row hearts
```

A successful PUT or DELETE notifies App via `onFavoritesChanged`, increments
`favoritesVersion`, and makes mounted views re-request Favorites. Each view
also maintains a local read revision for its own refresh/retry flow. A GET
never triggers the callback, so notifications do not cause an infinite
refresh loop. No route navigation is required to update the visible hearts.

### Library and Playback Bar

Library's Recently Added and Favorite Tracks controls remain independent of
Track selection. The Playback Bar renders `PlaybackFavoriteButton.jsx` only
when `enableFavoriteControl` is enabled and a playable Track has loaded.
The optional prop keeps direct player tests' preexisting API request counts.
Favorites writes do not call play/pause, seeking, queue navigation, audio
load, or transport diagnostics. The shared player and queue contracts are
preserved.

### Album Detail

Each album song row has a Favorite heart beside its separate Play button.
The view requests the Favorites collection **once per refresh**, not once per
song. Heart clicks use the song's canonical Track ID and do not select or
play that song. `AlbumCard.jsx` and Artist/Album browse card components are
unchanged: the existing Favorites API represents **tracks**, not albums.

### Authentication, errors, and concurrency

- Guest Album Detail hearts are disabled; the guest view does not issue a
  protected Favorites GET.
- GET, PUT and DELETE include the current access token in Bearer headers.
- Failed writes show controlled feedback without claiming a successful
  state change; a fresh GET confirms a successful mutation.
- Pending writes block duplicate heart clicks.
- In-flight requests use AbortController and stale-response safeguards.
- A Favorite toggle does not modify playback or queue state.

### Client files added or modified by SCRUM-362

```text
client/src/App.jsx
client/src/App.favorites-sync.test.jsx
client/src/components/PlaybackBar.jsx
client/src/components/PlaybackBar.css
client/src/components/PlaybackFavoriteButton.jsx
client/src/components/PlaybackBar.favorite.test.jsx
client/src/pages/Library.jsx
client/src/pages/AlbumDetail.jsx
client/src/pages/AlbumDetail.favorites.test.jsx
client/src/pages/ArtistAlbumDetail.css
README.md
```

No Favorite-specific changes are required in `FavoritesSection.jsx`, server
route handlers, PostgreSQL migrations, the streaming engine, or the queue.

### Automated verification (local checkpoint)

From `client/`:

```bash
npx vitest run src/components/PlaybackBar.favorite.test.jsx
npx vitest run src/App.favorites-sync.test.jsx
npx vitest run src/pages/AlbumDetail.favorites.test.jsx
npx vitest run src/pages/AlbumDetail.test.jsx
npm run test:run
npm run lint
npm run build
```

| Verification | Recorded result |
|---|---|
| Playback Bar Favorites | 4/4 passed |
| App cross-view synchronization | 2/2 passed |
| Album Detail Favorites | 6/6 passed |
| Existing Album Detail regression | 4/4 passed |
| Full client suite | **244/244**, 46/46 files passed |
| ESLint | Passed, zero errors |
| Vite production build | Passed |

These are **local working-tree** results, not claims of hosted GitHub
Actions, peer-reviewed approval, deployment, or merge.

### Manual browser verification

The following behavior was confirmed in local browser testing:

1. Favorite and unfavorite a selected Track from the Playback Bar.
2. While Library stays open, both Recently Added hearts and the Favorite
   Tracks list update after Playback Bar changes.
3. Favorite and unfavorite a song in Album Detail.
4. Album Detail and the Playback Bar synchronize their hearts without
   leaving the album page.
5. Favorite and Play buttons remain separate controls.

To reproduce, sign in, select a Track from Library, and toggle the Playback
Bar heart while Library remains open. Open the Track's album and repeat from
the Album Detail song row. Use Network inspection to check GET/PUT/DELETE;
never expose the Bearer token in screenshots, Jira tickets, or logs.

### Ownership, scope, and status

**Primary author:** Allison Yu. SCRUM-362 covers her authored Favorites UI,
synchronization tests, and documentation. It consumes SCRUM-355 backend
operations, existing shared player/transport behavior, media authorization,
and App-level queue navigation without claiming ownership of those other
areas. It does not implement album-wide Favorites or playlist management.

Sprint 5 ends **November 19, 2026** under the CPSC 491 six-sprint syllabus,
which overrides the CPSC 490 roadmap for schedule and course process. The
roadmap continues to define product scope. The historical Sprint 3 notes
above remain historical checkpoints; this section records newer UI behavior.

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

Last fully pasted local frontend regression result (before the
subsequent PDF-inspired CSS/JSX styling change):

```text
Test Files: 15 passed
Tests:      63 passed
Failures:   0
ESLint:     PASS
Build:      PASS
```

Rerun all three commands on the final working tree before its PR; the
numbers above are a recorded checkpoint, not a promise of a newer run.

Current client coverage includes:
- Search;
- Search Track selection;
- Search → App → PlaybackBar integration;
- Library and authenticated Favorites read states;
- cross-component Library/Favorites loading and selection;
- authenticated Favorites navigation token propagation;
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
  Choi, Sprint 3);
- protected Bearer streaming, ticket issuance, cookie-authenticated
  Range behavior, expiration, renewal and session revocation.

**Current Allison Sprint 5 local result (SCRUM-355, November 17):**
`npm test` passed **312/312**, zero failures. The focused Favorites
repository tests passed **6/6** and focused Favorites route tests passed
**12/12**. `database/npm run test:db` passed **36/36**, while
`npm run test:integrity` passed **2/2**. The live PostgreSQL-backed
PUT/DELETE verification and evidence are recorded in Section 23.9.
These are local results, **not** proof of a completed PR or passing hosted
GitHub Actions job. Previous test totals below remain historical.

Earlier Sprint 3 baselines grew as work merged. Allison verified
**163/163** server tests at the initial Favorites read-API checkpoint,
and subsequently reported rerunning the backend suite at **208/208**
after shared role authorization and the Favorites migration merge.
This verifies the backend automated suite at that local checkout, not
a browser-to-PostgreSQL Favorites happy path. Rerun on later shared
changes and record actual counts. The focused Favorites test files are
listed in Section 23.5.

Matthew's most recent reported local server run (October 13, 2026)
finished at **222/222 passing, zero failures**, including nine new
`media-access.app.test.js` cases. That evidence is local and does not
prove the live PostgreSQL/browser/deployment paths. Earlier checkpoint
counts are retained above as historical team evidence.

The durable requirement is:

```text
fail 0
```

Test totals may increase as Sprint 3 work is merged.

**Matthew Choi, Sprint 4 (SCRUM-296 / CC6.1):** The focused
PlaybackEvent repository, handler, and application-route suites passed
**20/20** locally. The expanded `npm run test:auth` command passed
**107/107** locally. The simulated `database unavailable` and revocation
outage logs are deliberate negative-test fixtures; the suites still
finished with zero failures. One CC6.3 role-demotion assessment test
reports a known policy gap despite a passing characterization assertion;
this is not evidence of complete SOC 2 compliance. The full `npm test`
result for this particular Sprint 4 checkout and hosted CI are not yet
confirmed.

```bash
cd server
node --test \
  test/playback-events.repository.test.js \
  test/playback-events.handler.test.js \
  test/playback-events.routes.test.js
npm run test:auth
npm test
```

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

**Sprint 4 local database regression checkpoint (Matthew Choi):** After
applying all current migrations and loading the catalog seed into the
isolated `soundwave_allison_test` database, `npm run test:db` passed
**36/36, zero failures**. In a separately isolated, initially empty
`soundwave_ayu_forward_test` database, AY-T32's historical forward-migration bootstrap successfully applied
the new PlaybackEvent migration and preserved historical schema
definitions (zero removed objects, zero changed definitions). These
are local results, not confirmation of hosted GitHub Actions.

Example using an existing, isolated, correctly provisioned test database
with the seed fixtures expected by the suite:

```bash
cd database
PGDATABASE=soundwave_allison_test npm run db:migrate:test
PGDATABASE=soundwave_allison_test npm run db:seed:test
PGDATABASE=soundwave_allison_test npm run test:db
```

Do not use these commands to reset or alter a shared or production
database. The database tests explicitly expect the database name
`soundwave_allison_test` and PostgreSQL role `soundwave_app` in the
current fixture suite. `PGDATABASE` in `server/.env` is a separate
setting and must match the target database used for live API checks.

## 27.1 Populated-schema forward migration - SCRUM-283 / PR #136

The ordinary migration/seed checks above test the **current schema**.
They do not show that pre-Sprint-3 data survives a later migration.
Allison's SCRUM-283 rehearsal adds that separate verification.

**What the automated bootstrap does**

1. Connects to an **empty, disposable PostgreSQL** database named
   `soundwave_ayu_forward_test`; refuses to proceed when it is not
   empty or is the wrong database.
2. Retrieves the five historical migration SQL files from Git commit
   `731d674` (October 1, 2026), applies them, seeds the historical
   catalog and inserts one deterministic test account.
3. Captures `ayu_forward_audit` snapshots of historical migration
   records, original table row counts/JSONB values, and a password-hash
   equality fingerprint. The fingerprint is **test-only**, not the
   application's password-hashing mechanism.
4. Runs the current migration runner: **five historical migrations
   skipped; three newer migrations applied** (two Sprint 3 migrations
   plus `20261029_mchoi_001_playback_events.sql` in Sprint 4).
5. Inserts Favorites `(user_id=9900201, track_id=3001)` and
   `(user_id=9900201, track_id=3002)` after the upgrade.
6. Reruns the migration runner: **eight skipped, zero applied**
   when the PlaybackEvent migration is included.
7. Verifies preservation of historical records, user authentication
   state, catalog joins, Favorites joins, and a negative control that
   detects a changed Track inside a transaction and rolls it back.

**Version-controlled files**

```text
database/test/fixtures/20261015_ayu_forward_upgrade_baseline.sql
database/test/fixtures/20261015_ayu_forward_upgrade_snapshot.sql
database/test/forward-migration-bootstrap.mjs
database/test/forward-migration-preservation.test.js
```

**Safety prerequisites**

- Use PostgreSQL 16 in a **new disposable instance** (or another
  independently provisioned empty instance). Never point this command
  at the existing developer database, the normal CI test database, or
  the previously populated rehearsal database.
- Database name must be exactly `soundwave_ayu_forward_test`, as
  enforced by the runner and tests. The bootstrap does not delete or
  reset a database; a second run against the same populated instance
  is intentionally rejected.
- Git commit `731d674` must be reachable (`git cat-file -t 731d674`
  prints `commit`). CI checkout requires enough history for `git show`.
- Install dependencies first (`cd database && npm ci`). Use test-only
  PostgreSQL credentials; never commit `.env` files or passwords.

**Repeat locally on Windows PowerShell with an independently created
empty PostgreSQL 16 instance:**

```powershell
# Open PowerShell at YOUR normal Soundwave repository root, not
# the historical worktree or inside an existing database/ directory.
git cat-file -t 731d674
Set-Location .\database
npm ci
node --check .\test\forward-migration-bootstrap.mjs
node --check .\test\forward-migration-preservation.test.js

# This external file must target ONLY the fresh test instance.
# It is not committed. See PGHOST/PGPORT/PGUSER/PGDATABASE below.
$forwardCiEnv = Join-Path $env:TEMP 'soundwave-ayu-forward-ci.env'
Test-Path $forwardCiEnv
node --env-file="$forwardCiEnv" -e "if(process.env.PGDATABASE !== 'soundwave_ayu_forward_test') throw Error('Unsafe database target'); console.log('Target:', process.env.PGDATABASE)"
node --env-file="$forwardCiEnv" .\test\forward-migration-bootstrap.mjs
```

`Test-Path` must print `True`. The external environment file needs
`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and
`PGDATABASE=soundwave_ayu_forward_test`, all pointing to the **empty
isolated instance**. The database name check alone is not sufficient:
also verify the port/host identify the disposable instance. Do not
reuse the file for the normal development database.

**WSL/Linux alternative after provisioning a fresh, isolated instance:**

```bash
cd ~/Soundwave-Live-Version/database
npm ci
# Load your local-only, test-instance configuration; do not print it.
set -a; source /path/to/your/isolated-forward-test.env; set +a
test "$PGDATABASE" = 'soundwave_ayu_forward_test' || { echo 'Wrong DB target'; exit 1; }
node test/forward-migration-bootstrap.mjs
```

**Recorded original Sprint 3 result (local disposable PostgreSQL 16):**

```text
five historical migrations applied
five historical skips + two Sprint 3 applies
seven skips on rerun
seven Node test results passed; zero failures
PASS: AY-T32 complete forward-compatibility rehearsal
```

A separate run against the previously prepared local rehearsal database
also passed **7/7** at that Sprint 3 checkpoint. These are recorded
*local* results, not today's migration-count expectations. In Sprint 4,
Matthew updated the approved `NEW_MIGRATIONS` list and both apply/skip
count assertions to accommodate the PlaybackEvent migration. His later
local rerun passed after the changes; its schema comparison showed
**83 before, 133 after, 50 added, zero removed and zero changed**. The
later modifications do not retroactively change Allison's Sprint 3
reported test counts. The Sprint 3
deliverable links PR #136 and Jira SCRUM-283 is Done; the artifacts
provided here do not independently establish a hosted GitHub Actions
run ID. Verify the workflow on the actual PR/commit before labeling
this exact forward-compatibility check as hosted-CI passed.

**Maintenance note:** AY-T32 currently expects five historical
migrations and three approved newer migrations, including Matthew's
PlaybackEvent migration. Its first-run and rerun count checks should
derive from the explicit migration lists. Any future legitimate new
migration must be reviewed and added to the approved list; do not
disable the count assertions or weaken historical preservation checks.

## 27.2 Sprint 4 authenticated PlaybackEvent API — Matthew Choi (SCRUM-295 / SCRUM-296)

**Implementation status:** The PostgreSQL model, authenticated HTTP
handler, and user-scoped repository are implemented and tested locally.
This is a backend event-history feature, not proof that the React player
emits events yet; frontend hookup is tracked separately under SCRUM-297.
The exact route names and event vocabulary are a provisional team
contract pending frontend/API agreement.

**Implementation files**

```text
database/migrations/20261029_mchoi_001_playback_events.sql
server/src/data/playback-events.repository.js
server/src/playback/playback-events.handler.js
server/src/app.js
server/src/server.js
server/test/playback-events.repository.test.js
server/test/playback-events.handler.test.js
server/test/playback-events.routes.test.js
```

**HTTP endpoints** (Bearer JWT required, with token revocation checked
before event storage access):

| Method and route | Outcome |
|---|---|
| `POST /api/playback-events` | `201 Created` for a new event; `200 OK` with `replayed: true` for an identical retry |
| `GET /api/playback-events?limit=10` | `200 OK`, `{ "events": [...] }` for the authenticated user only |

The POST body accepts **only** these fields:

```json
{
  "clientEventId": "d88892fc-4cdd-47e3-8d75-d282863f2ab5",
  "trackId": 3005,
  "eventType": "play",
  "occurredAt": "2026-11-04T02:15:04.000Z"
}
```

The sample UUID/time above is illustrative; generate a fresh UUID for
each new logical event. A retry must reuse **the same** UUID, track,
event type, and occurrence time. The server derives `user_id` from the
verified JWT principal, **not** from the body, headers, query string,
or a supplied user identifier; unexpected JSON keys are rejected. The
server generates `received_at`. `eventType` currently allows a nonblank
string of at most 128 characters; `play` is a tested example, **not**
evidence that a final enum of playback-event types was agreed.

History defaults to `limit=50`, permits 1–100, and orders by
`occurred_at DESC, id DESC`. It does not return other users' events.
The `(user_id, client_event_id)` uniqueness constraint prevents
additional rows from an identical retry; reusing the same UUID with
changed event content returns `409` rather than silently overwriting.

| Condition | HTTP status / response |
|---|---|
| Missing, invalid, expired or revoked JWT | `401 Unauthorized` |
| Valid JWT with disallowed role (if policy changes) | `403 Forbidden` via the shared guard |
| New valid event | `201 Created`, `{ "event": {...}, "replayed": false }` |
| Identical event retry | `200 OK`, `{ "event": {...}, "replayed": true }` |
| Own event history | `200 OK`, `{ "events": [...] }` |
| Unexpected/forged JSON keys, malformed payload or invalid limit | `400 Bad Request` |
| Existing UUID with different event data | `409 Conflict`, `client_event_id_conflict` |
| Missing referenced Track | `404 Not Found`, `track_not_found` |
| JSON body above 16 KiB | `413 Payload Too Large` |
| Unsupported POST content type | `415 Unsupported Media Type` |
| Unavailable revocation lookup or event repository | `503 Service Unavailable` (fail closed) |

The authenticated endpoints use `Cache-Control: private, no-store` and
`Vary: Authorization`. The current GET implementation does not expose
`user_id` as a client-selectable filter.

### Manual HTTP verification (Linux/macOS)

Start the backend with `server/.env` against the **same migrated
development database** as `database/.env` (Sections 5 and 8). Use a
current test-user JWT in `SW_TOKEN` as described in Section 15.5; do
not paste the token, passwords, or database URLs into Git or Jira. If
checking only the unauthenticated boundary, no token is required:

```bash
curl -i -w '\n' http://localhost:8080/api/playback-events
# Expected: 401 Unauthorized
```

Once authenticated, prepare an event with an existing, seeded Track
(e.g., `3005` where available). Using curl's standard-input config
keeps the JWT out of visible command arguments:

```bash
TRACK_ID=3005
EVENT_ID=$(node -p 'crypto.randomUUID()')
OCCURRED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BODY=$(printf '{"clientEventId":"%s","trackId":%s,"eventType":"play","occurredAt":"%s"}' \
  "$EVENT_ID" "$TRACK_ID" "$OCCURRED_AT")
printf 'header = "Authorization: Bearer %s"\n' "$SW_TOKEN" | \
  curl -sS -i --config - -H 'Content-Type: application/json' \
    -X POST --data-binary "$BODY" \
    http://localhost:8080/api/playback-events
# Expected: 201 Created
```

Read the same account's history, then repeat the identical POST **without
regenerating** `EVENT_ID`, `OCCURRED_AT`, or `BODY`:

```bash
printf 'header = "Authorization: Bearer %s"\n' "$SW_TOKEN" | \
  curl -sS -i --config - \
    'http://localhost:8080/api/playback-events?limit=10'
# Expected: 200 OK; event appears in "events"

printf 'header = "Authorization: Bearer %s"\n' "$SW_TOKEN" | \
  curl -sS -i --config - -H 'Content-Type: application/json' \
    -X POST --data-binary "$BODY" \
    http://localhost:8080/api/playback-events
# Expected: 200 OK; "replayed": true
```

For a stronger authorization result, use a *different* test account and
an isolated test database to verify the first user's event is not in
the second user's GET response; measure row counts before and after
rejected writes. Neither of these **real-database** negative checks has
been reported as completed yet. The three automated route suites do
cover these boundaries using mocked storage.

### Verification recorded on November 3, 2026 (local environment)

| Test / observation | Result | Boundary |
|---|---|---|
| `server/test/playback-events.{repository,handler,routes}.test.js` | **20/20 passing** | Mocked storage, handlers, and HTTP routes |
| `server/npm run test:auth` | **107/107 passing** | Existing auth and role-policy regression; one CC6.3 assessment gap remains |
| `database/npm run test:db`, isolated `soundwave_allison_test` | **36/36 passing** | PostgreSQL catalog/auth/Favorites regression |
| Historical forward-migration bootstrap | **Passed locally** | Upgraded schema retained historical definitions |
| Live unauthenticated GET | **401 Unauthorized** | HTTP boundary only; no independent DB-count check |
| Live `/auth/me` with current JWT | **200 OK** | JWT accepted |
| Live event POST, seeded Track `3005` | **201 Created** | PostgreSQL-backed insertion |
| Live authenticated history GET | **200 OK** | Owner's event returned (user-reported) |
| Live identical-event retry | **200 OK** | Idempotent response (user-reported) |

The local development server initially returned `503 storage_unavailable`
because its active database lacked `playback_events`. Applying the
migration to the **server's actual database** resolved this. A separate
existing-table/missing-migration-history mismatch for
`revoked_access_tokens` had to be validated and reconciled before the
runner could apply newer migrations (see Section 30.12). The successful
201 response confirms a live write; a separate PostgreSQL-count check,
per-user negative test, hosted CI, and peer-reviewed merge are still
outstanding. The passing tests alone do **not** constitute SOC 2
certification or prove the frontend submits events.

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
  -w 'Anonymous stream HTTP %{http_code}\n' \
  -H 'Range: bytes=0-999' \
  http://localhost:8080/api/tracks/3005/stream
```

Expected: catalog `200`; **anonymous media `401`**. To verify
authorized `206` and exactly 1,000 bytes, use the authenticated Bearer
or cookie-based smoke test in Sections 15.1 and 15.5. Unauthenticated
`206` is now a security regression, not a successful media check.
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

Historical album-to-playback proof (SCRUM-170, verified **before**
streaming protection): selecting Track `3005` in `/albums/2003` showed
`Kontekst` / `Buddha` / `No Copyright` and played the audio. With the
protected stream, **repeat this test after Emmanuel's cookie handoff**:
confirm the media-access POST succeeds `204`, native media returns
`200` or `206`, playback is audible, seeking succeeds, and subsequent
requests work after ticket renewal. This newer browser check is pending.

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
│       ├── App.navigation.test.jsx
│       ├── components
│       │   ├── AlbumCard.jsx
│       │   ├── AlbumCard.test.jsx
│       │   ├── ArtistCard.jsx
│       │   ├── ArtistCard.test.jsx
│       │   ├── FavoritesSection.css
│       │   ├── FavoritesSection.jsx
│       │   ├── FavoritesSection.test.jsx
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
│       │   ├── Library.favorites-integration.test.jsx
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
│   │   ├── 20261029_mchoi_001_playback_events.sql
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
│   │   │   └── playback-events.repository.js
│   │   ├── playback
│   │   │   └── playback-events.handler.js
│   │   ├── media
│   │   │   ├── media-access.handler.js
│   │   │   └── media-ticket.js
│   │   ├── search
│   │   ├── app.js
│   │   └── server.js
│   └── test
│       ├── media-access.app.test.js
│       ├── media-streaming.test.js
│       ├── playback-events.repository.test.js
│       ├── playback-events.handler.test.js
│       └── playback-events.routes.test.js
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
