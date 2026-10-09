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
trackMediaPath.sql
```

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

Example:

```dotenv
JWT_SECRET=<development-only-secret>
```

Depending on local setup, PostgreSQL variables may also be present in
`server/.env`.

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

---

# 16. Important Sprint 3 Media/Auth Boundary

The current Search-to-Playback happy path is operational.

However, the current media route should not yet be treated as the final
Sprint 3 protected-media authorization boundary.

Sprint 3 work is still integrating:

- revocation-aware authentication;
- session invalidation behavior;
- protected media authorization;
- authenticated client failure handling;
- consumer behavior for `401` and `403`.

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

# 20. Sprint 3 Session Revocation Persistence — Christian McGowan

Sprint 3 introduces PostgreSQL-backed persistence for revoked JWT access
token identifiers.

Current foundation includes:

```text
database/migrations/20261008_cmg_001_revoked_access_tokens.sql
server/src/data/token-revocation.repository.js
```

The revocation table stores:

- JWT identifier (`jti`);
- user identity;
- expiration timestamp;
- revocation timestamp.

Raw access tokens and JWT signing secrets are not stored.

Repository behavior includes:

```text
revokeToken({ jti, userId, expiresAt })
isTokenRevoked(jti)
```

Revocation persistence is infrastructure only.

Remaining Sprint 3 integration includes items such as:

- JWT `jti` issuance;
- logout/revocation HTTP behavior;
- revocation-aware protected routes;
- legacy-token handling;
- client session feedback.

A revocation record alone does not invalidate an access token until the
authorization boundary consumes that persistence.

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
- Track persistence.

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

## Browser happy-path checks

Verify:

```text
/search
/artists
/artists/1001
/albums
/albums/2001
/library
/profile
```

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
verification.

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
- protected-media integration;
- client session integration;
- Search-to-Playback orchestration;
- cross-feature regression coverage;
- midterm integration preparation.

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