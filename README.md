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

The Favorites route belongs to Allison Yu's catalog work; this change
adds only its revocation guard and associated regression coverage.
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

**Midterm completion status (SCRUM-227, -228, -229, -230; PRs #105,
#109, #110, #123):** The Favorites table, authenticated read API,
React Library/Favorites read interface, deterministic fixtures, and
PostgreSQL-backed integration/CI checks have been implemented. The
original pending-UI note in this README was an earlier Sprint 3
snapshot; the Sprint 3 deliverable identifies PR #110 for the React
interface. SCRUM-211 / PR #131 subsequently verified cross-user HTTP
read isolation against PostgreSQL (8/8 local checks, including a
negative control). The scope remains **read/display only**: a
user-facing add/remove Favorites mutation is not claimed.

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
an actual populated-database upgrade. Keep browser demonstrations and
end-user Favorites mutation claims separate from these automated
checks; no write/unfavorite UI is claimed for Sprint 3.

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

The Favorites read route is still read-only: there is no add/remove
Favorites interaction and no user-editable heart in this sprint.
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

## 23.8 Allison Yu - Sprints 1-3 Jira and pull-request evidence index

| Sprint | Jira issue | Authored deliverable | PR |
|---|---|---|---|
| S1 | SCRUM-7, SCRUM-31 | Catalog migrations, tooling and seed foundation | [#37](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/37), [#39](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/39) |
| S1 | SCRUM-45-48, SCRUM-63-66 | Catalog API, debug UI, boundaries, ERD and README | [#38](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/38), [#40](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/40), [#44](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/44) |
| S2 | SCRUM-155-158 | Artist/Album browse/detail APIs, React UI and tests | [#65](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/65), [#66](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/66), [#67](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/67), [#72](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/72) |
| S2 | SCRUM-123, SCRUM-112 | Migration rerun preflight and schema/fixture CI gate | [#84](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/84), [#94](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/94) |
| S3 | SCRUM-227-230 | Favorites migration, read API, Library UI, deterministic fixture tests | [#105](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/105), [#109](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/109), [#110](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/110), [#123](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/123) |
| S3 | SCRUM-211 | Real HTTP cross-user Favorites isolation matrix | [#131](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/131) |
| S3 | SCRUM-283 | Populated-schema upgrade and preservation rehearsal | [#136](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/136) |

Supplementary README/evidence changes include PRs [#99](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/99) and [#44](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/44).

**Ownership correction:** SCRUM-41 / PR #38 included an
Auth User/Session persistence migration that was originally assigned
to Emmanuel De Guzman. Allison authored that shared migration in
Sprint 1; Emmanuel consumed the shared interface rather than adding a
duplicate migration. This was a coordination/ownership mistake, **not**
a claim that Allison authored Emmanuel's password/JWT/login behavior.
Future work must confirm Jira ownership and interfaces before coding.

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
4. Runs the current migration runner: **five old migrations skipped,
   two Sprint 3 migrations applied**.
5. Inserts Favorites `(user_id=9900201, track_id=3001)` and
   `(user_id=9900201, track_id=3002)` after the upgrade.
6. Reruns the migration runner: **seven skipped, zero applied**.
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

**Recorded result (local disposable PostgreSQL 16):**

```text
five historical migrations applied
five historical skips + two Sprint 3 applies
seven skips on rerun
seven Node test results passed; zero failures
PASS: AY-T32 complete forward-compatibility rehearsal
```

A separate run against the previously prepared local rehearsal database
also passed **7/7**. These are recorded *local* results. The Sprint 3
deliverable links PR #136 and Jira SCRUM-283 is Done; the artifacts
provided here do not independently establish a hosted GitHub Actions
run ID. Verify the workflow on the actual PR/commit before labeling
this exact forward-compatibility check as hosted-CI passed.

**Maintenance note:** The initial preservation suite expects exactly
five original and two Sprint 3 migration filenames. Later legitimate
migrations will require updating the approved migration set/expectations
or making the test version-aware. Do not silently loosen the
historical-preservation assertions to make a new schema pass.

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
│   │   │   ├── media-access.handler.js
│   │   │   └── media-ticket.js
│   │   ├── search
│   │   ├── app.js
│   │   └── server.js
│   └── test
│       ├── media-access.app.test.js
│       └── media-streaming.test.js
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

## 30.10 Media-access `503`: missing `revoked_access_tokens` migration

The observed local development error was:

```text
relation "revoked_access_tokens" does not exist
PostgreSQL code 42P01
```

The media-ticket issuance handler calls Christian's existing
`authorizeRevocableRequest` before issuing anything; every stream
request also checks the source login session's revocation status. A
missing table therefore correctly results in HTTP `503`, not a token
or audio response.

Confirm that `server/.env` and `database/.env` point to the same
**development** database. In that database, verify:

```sql
SELECT current_database(), to_regclass('public.revoked_access_tokens');
```

If the result is `NULL`, use the **already-merged** migration
`database/migrations/20261008_cmg_001_revoked_access_tokens.sql`.
Prefer the tracked migration runner, from `database/`:

```bash
npm run db:migrate
```

Inspect the table **and** migration history afterward:

```sql
SELECT to_regclass('public.revoked_access_tokens');
SELECT * FROM schema_migrations ORDER BY 1;
```

If the runner says `skip` but the physical table is missing, the
recorded migration history and actual schema disagree: **stop** and
coordinate with Christian/database owners before changing history.
Conversely, applying the SQL manually with `psql -f` may create the
table without updating `schema_migrations`, so a later runner could
try to create it again. Do not hand-create replacement tables, reset
migration history, or run schema changes against production or the test
database by accident. After resolving the mismatch, retry `/auth/me`
and the authenticated media-access POST.

## 30.11 Media-ticket startup or playback problems

- `MEDIA_TICKET_SECRET` missing/too short/equal to `JWT_SECRET`:
  the backend fails to start. Generate a separate development key
  (Section 9), keep it in the ignored `server/.env`, and run
  `node --env-file=.env src/server.js`.
- `JWT_SECRET` missing: restore the existing login secret, not a new
  one (Section 9). A shell-level `node -e` check without `--env-file`
  may show both secrets unset even when a separate Node process is
  correctly reading the file.
- `401` on native HTML5 audio: Howler's native request does not add
  the login Bearer header. Verify the frontend first obtained the
  `sw_media` cookie with the authenticated POST, and that the cookie
  matches the track URL, origin and expiry. Do not disable auth.
- `401` after a pause or seek: the media ticket may have expired;
  renew via the authenticated POST before retrying.
- `503` after a token request: inspect backend revocation logs,
  PostgreSQL connectivity and the migration in Section 30.10.
- `403` applies only to an actual role/permission denial. Do not
  infer this status from Howler's generic media error.
- Local development requires cookies usable over local HTTP;
  `NODE_ENV=production` enables `Secure` cookies, which require
  a properly configured HTTPS deployment. Test the browser's
  cookie storage and Vite proxy explicitly.

---

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

node --test test/media-access.app.test.js
node --test test/media-streaming.test.js
npm test
```

For media-ticket changes, additionally verify live cookie issuance
(`204`) and cookie-only Range streaming (`206`) against PostgreSQL,
and obtain Emmanuel's browser playback/renewal evidence. Do not commit
real `MEDIA_TICKET_SECRET` or include response headers containing the
media cookie in review logs.

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

**Allison Yu's authored Database Tests additions:** migration rerun
preflight (SCRUM-123 / PR #84), schema and deterministic-fixture
integrity gate (SCRUM-112 / PR #94), Favorites fixture/PostgreSQL
integration (SCRUM-230 / PR #123), HTTP cross-user isolation matrix
(SCRUM-211 / PR #131), and populated-schema upgrade rehearsal
(SCRUM-283 / PR #136). The last check uses a second disposable
database and historical Git commit; confirm its hosted workflow result
on the reviewed PR before claiming it passed in GitHub Actions.

The existing Database Tests PostgreSQL service uses `postgres:16` and
an isolated `soundwave_allison_test` database for normal integration.
The historical upgrade runner requires a **different empty database**
named `soundwave_ayu_forward_test`. Never direct it at the normal
Database Tests database, which is already migrated and seeded.

CI requirements may expand during later sprints. **Media-ticket
integration needs an additional environment prerequisite:** the server
startup now requires `MEDIA_TICKET_SECRET`, independently signed from
`JWT_SECRET`. Ensure CI jobs or smoke-test services that actually start
`server/src/server.js` receive a securely provided test/deployment
value; unit tests that instantiate `createApp()` without the media
service retain their original Bearer-only behavior. This additional
configuration is a **pending CI verification**, not a claimed passing
CI change. Never print these values in GitHub Actions logs or embed
them in committed workflow files.

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

**Important media limitation:** the earlier passing Compose smoke check
does **not** verify protected `GET /api/tracks/3005/stream` inside the
server container or its new media-ticket cookie path. Ensure the
backend service receives an independent `MEDIA_TICKET_SECRET` (using
Compose's established local ignored environment settings or an
approved deployment secret mechanism) before running it. No updated
Compose check with this secret has been reported.
`server/Dockerfile` was observed building with `WORKDIR /app`
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
- media-ticket signing secrets and media cookies;
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
- protected Bearer streaming merged into `main` (per Christian's
  October 13 verification); Matthew's short-lived media-cookie issuance
  and verification implemented and tested locally, with browser and
  deployment integration still pending;
- client session integration;
- Search-to-Playback orchestration;
- **Allison Yu's authenticated Favorites read API**, schema/migration,
  React Library UI, and deterministic fixture and CI checks (SCRUM-227
  through SCRUM-230; PRs #105, #109, #110 and #123);
- **Allison's HTTP cross-user Favorites disclosure regression**
  (SCRUM-211 / PR #131), recorded 8/8 local checks;
- **Allison's populated-database migration upgrade and preservation
  rehearsal** (SCRUM-283 / PR #136), recorded 7/7 local checks;
- cross-feature regression coverage;
- midterm integration preparation.

### Allison Yu — Sprint 3 Favorites (AY-S3-01 / AY-S3-02 / AY-S3-03)

Allison's Sprint 3 vertical slice spans the `favorites` migration,
principal-scoped PostgreSQL read repository, catalog service and HTTP
handler, React Library Favorites section, deterministic test fixtures,
real HTTP isolation testing, and the populated-schema upgrade rehearsal.
The dedicated PRs are #105 (API), #109 (schema), #110 (client), #123
(fixtures/CI), #131 (disclosure matrix), and #136 (migration upgrade).
Jira SCRUM-227 through SCRUM-231, SCRUM-211, and SCRUM-283 were marked
Done in the supplied midterm board screenshots.

The client reuses existing in-memory session state and the shared
`onSelectTrack(track.id)` playback interface, rather than duplicating
Christian's authorization, Konner's navigation, or teammate-owned
media streaming. The early Favorites UI integration checkpoint recorded
63/63 client tests, clean lint, and successful build; a later *shared
midterm* regression snapshot recorded 100/100 client tests. Allison's
SCRUM-211 tests recorded 8/8 real HTTP isolation checks, while the
SCRUM-283 fresh PostgreSQL upgrade run recorded 7/7 tests. All counts
are attributed to their specific runs, not presumed to be current.

The read UI has no add/remove Favorites mutation. Album artwork where
available, a dedicated Favorites tab, and filled state hearts remain
later-sprint work. See Sections 23.1-23.8 and 27.1 for contracts,
commands, scope, and evidence.

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

Protected media-cookie delivery to native Howler, renewal and
auth-specific player errors remain Emmanuel's separate Sprint 3
frontend integration work. Matthew's backend ticket tests do not yet
prove these browser behaviors.

### Allison Yu - individual delivery across Sprints 1-3

| Sprint | Authored vertical slice | Jira / PR evidence |
|---|---|---|
| S1 (Sep 3-17) | Catalog migration runner, Artists/Albums/Tracks model, deterministic seeds, read API, React catalog-debug view, ERD and setup docs | SCRUM-7, -31, -45 to -48, -63 to -66; PRs #37-40, #44 |
| S2 (Sep 24-Oct 1) | Artist/Album browse and detail API + UI; PostgreSQL migration preflight and schema/fixture integrity CI | SCRUM-155 to -158, -123, -112; PRs #65-67, #72, #84, #94 |
| S3 (Oct 8-15) | Authenticated Favorites schema/read API/React UI, deterministic fixtures, principal-isolation checks and historical upgrade | SCRUM-227 to -231, -211, -283; PRs #99, #105, #109, #110, #123, #131, #136 |

**Sprint 1 verified data/test snapshot:** 2 Artists, 2 Albums, 4
Tracks, 18/18 database tests, and 49/49 server tests. These are
historical Sprint 1 results, not the current seeded catalog size or
test total.

**Recorded failures and corrective work:** The first PostgreSQL
infrastructure PR #32 failed required tests; the corrected work was
submitted via PR #37 after branch-conflict recovery. In Sprint 1,
Allison authored SCRUM-41's Auth User/Session persistence migration
(PR #38) although it had originally been Emmanuel's assignment. This
was an acknowledged ownership overlap; Emmanuel used that shared
persistence interface and continued to own authentication behavior.
Subsequent Jira scoping should be confirmed before work begins.

**Planned, not completed as of the midterm:** Sprint 4 core HTTP Range
/buffering reliability, catalog/media query performance (SCRUM-284)
and media-reference integrity fault injection (SCRUM-215/-216);
Sprint 5 broader Favorites persistence/write flow, fixture integrity
(SCRUM-285, SCRUM-217/-218); Sprint 6 playback statistics and database
release-readiness/restore checks (SCRUM-286, SCRUM-219/-220).
These assignments must be implemented as cross-layer contributions,
not treated as a permanent database-only lane. SCRUM-214 is an older
unresolved forward-compatibility backlog entry and should be reconciled
with completed SCRUM-283, not counted as a second feature.

### Matthew Choi — Sprint 3 media-storage and playback verification

Matthew's SCRUM-168 inspection confirmed that the shared
Track-ID-to-Howler playback path already existed from Sprint 2, avoiding
duplicate implementation. SCRUM-169 adds configurable `MEDIA_ROOT`,
source-relative defaults, validated path containment and regression
tests. SCRUM-170 recorded Track 3005 metadata `200`, Range `206` and
audible playback **before** media authorization was enforced. Christian
subsequently confirmed the protected Bearer stream is merged into
`main`. Matthew's October 13 local media-ticket addition implements a
track-scoped HttpOnly cookie, independent HMAC signing, issuance,
revocation checks and renewal; the **nine new application tests and
all 222 backend tests passed**.

The remaining acceptance work is a live `204` issuance and cookie-only
`206` against the running PostgreSQL-backed server, Emmanuel's
Howler client handoff and audible protected playback including seeks
and renewal, and peer-reviewed PR/CI/Compose verification. Do not
claim those steps completed from automated tests alone. Actual
container-media access remains unverified.

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
