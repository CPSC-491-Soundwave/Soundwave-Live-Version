# Sprint 1 Integration Contracts

## Purpose

This document records the current Sprint 1 integration boundaries for Soundwave.

The goal is to define how independently authored team components connect to the shared application without duplicating another teammate's primary implementation responsibility.

This document describes the current integration points, ownership boundaries, verification commands, and known pending dependencies as of Sprint 1.

---

## Team Sprint 1 Ownership

| Team Member | Primary Sprint 1 Responsibility |
| --- | --- |
| Christian McGowan | Walking skeleton, backend health contract, CI and delivery workflow |
| Allison Yu | Catalog data foundation and deterministic seed |
| Emmanuel De Guzman | Login and authentication/identity spike |
| Matthew Choi | Media ingest and HTTP Range playback spike |
| Konner Rigby | Client shell and self-host packaging |

Shared integration is expected, but the primary implementation of each area remains with its assigned owner.

---

# 1. Shared Backend Contract

## Primary Owner

Christian McGowan

## Current Location

```text
server/
├── package.json
├── package-lock.json
├── src/
│   ├── app.js
│   └── server.js
└── test/
    └── health.test.js
```

Additional backend files may be added by other teammates as their Sprint 1 work is integrated.

## Runtime

The backend uses:

- Node.js
- JavaScript
- ES modules
- Node's HTTP server
- Node's built-in test runner

## Default Development Port

```text
8080
```

The port may be overridden with the `PORT` environment variable.

Example:

```bash
PORT=8081 npm start
```

## Current Public Health Contract

Endpoint:

```text
GET /health
```

Expected HTTP response:

```text
HTTP 200
```

Expected JSON body:

```json
{
  "status": "ok"
}
```

The health endpoint is intentionally public.

Sprint 1 integrations should not require authentication in order to call `/health`.

## Unknown Route Contract

Unknown routes currently return:

```text
HTTP 404
```

with:

```json
{
  "error": "not_found"
}
```

## Backend Verification

From the repository root:

```bash
cd server
npm ci
npm test
```

Current expected result:

```text
pass 2
fail 0
```

Start the backend with:

```bash
npm start
```

Expected startup output:

```text
Soundwave API listening on http://localhost:8080
```

---

# 2. Client Integration Contract

## Primary Owner

Konner Rigby

## Christian Integration Responsibility

Christian consumes the existing React/Vite client shell rather than creating a competing frontend structure.

Christian's Sprint 1 client integration is limited to backend availability status.

## Current Client Location

```text
client/
```

## Current Technology

The client currently uses:

- React
- JavaScript / JSX
- React Router
- Vite
- ESLint
- CSS
- shared CSS design tokens

Tailwind CSS is not used.

## Existing Shared Client Structure

Important existing areas include:

```text
client/src/
├── components/
├── pages/
└── styles/
```

Christian should follow the component and CSS conventions already established by the client shell.

---

# 3. Backend Availability Integration

## Primary Author

Christian McGowan

## Files

```text
client/src/components/BackendStatus.jsx
client/src/components/BackendStatus.css
client/src/components/Sidebar.jsx
client/vite.config.js
```

## Purpose

The backend status component provides a small visible indication of whether the client can reach the Soundwave backend.

The component has three states:

```text
Checking backend...
Backend online
Backend offline
```

## Request Contract

The client performs:

```text
GET /health
```

using a relative request path.

During Vite development, `/health` is proxied to:

```text
http://localhost:8080
```

This avoids hard-coding the backend URL inside the React component and avoids creating a development-only CORS requirement.

## Development Flow

```text
BackendStatus.jsx
        |
        | GET /health
        v
Vite development server
        |
        | development proxy
        v
Node backend on localhost:8080
        |
        v
{"status":"ok"}
```

## Ownership Boundary

Christian owns the backend availability component and health integration.

Christian does not own:

- the overall React application shell
- application routing architecture
- playback UI architecture
- self-host packaging
- deployment routing

Those interfaces remain under the ownership of the teammate responsible for them.

---

# 4. Authentication Integration Contract

## Primary Owner

Emmanuel De Guzman

## Current Backend Dependencies

Authentication work currently requires server dependencies including:

```text
argon2
jsonwebtoken
```

These dependencies are declared in the backend package configuration and are installed with:

```bash
cd server
npm ci
```

## Christian Integration Responsibility

Christian's Sprint 1 responsibility is limited to preserving the shared backend and CI integration points.

The public health endpoint remains accessible without authentication.

Future protected routes should consume Emmanuel's authentication and identity contract rather than creating a separate authentication implementation.

## CI Integration

The shared Server Tests CI job installs backend dependencies before running the backend test suite when a server lockfile is available.

Christian does not reimplement:

- password hashing
- token generation
- token validation
- login logic
- user session logic

These remain authentication-owner responsibilities.

---

# 5. Database and Catalog Integration Contract

## Primary Owner

Allison Yu

## Sprint 1 Responsibility

Allison owns the catalog data foundation and deterministic seed.

## Christian Integration Responsibility

Christian does not define or replace:

- database schema
- catalog migrations
- deterministic seed data
- database repository implementation

Christian's integration responsibilities are:

- preserve a backend structure capable of consuming the database layer
- consume Allison's verified migration and seed commands after they are established
- add stable database verification commands to CI when appropriate
- document database startup and readiness requirements after they are merged

## Current Status

Database-specific commands should not be invented before Allison's verified database contract is merged.

Once available, this document should be updated with:

```text
database startup command
migration command
seed command
database test command
required environment variables
```

---

# 6. Media and Playback Integration Contract

## Primary Owner

Matthew Choi

## Sprint 1 Responsibility

Matthew owns the Sprint 1 media playback spike, including track-to-file resolution, HTTP byte-range handling, media-specific response behavior, and playback experimentation.

Christian owns the shared integration boundary and documents how the walking skeleton consumes the media subsystem without replacing Matthew's implementation.

## Current Media Route Namespace

The current Sprint 1 media server exposes:

```text
GET /api/tracks/:trackId/stream
```

The standalone playback service currently listens on:

```text
http://localhost:4000
```

The current Sprint 1 smoke route is:

```text
GET http://localhost:4000/api/tracks/1/stream
```

This is the current media-owned route namespace for the playback spike.

The catalog contract does not require this route to remain the final production streaming API. Any future shared route change must preserve the canonical catalog track identity contract.

## Smoke Fixture Contract

The current Sprint 1 playback spike resolves temporary track ID `1` to:

```text
playback/mediaFiles/test.mp3
```

The `playback/mediaFiles` directory is intentionally ignored by Git.

The smoke fixture is therefore local-only and must not be treated as committed application media.

The fixture exists only to verify the media-delivery behavior of the Sprint 1 playback spike.

## Verified HTTP Behavior

The media spike was locally verified against the smoke fixture.

### Full-File Request

A request without a `Range` header:

```text
GET /api/tracks/1/stream
```

returns:

```text
200 OK
Content-Type: audio/mpeg
Accept-Ranges: bytes
Content-Length: <file-size>
```

The verified local smoke fixture returned a complete MP3 response.

### Valid Byte-Range Request

A request using:

```text
Range: bytes=0-99
```

returns:

```text
206 Partial Content
Content-Type: audio/mpeg
Accept-Ranges: bytes
Content-Length: 100
Content-Range: bytes 0-99/<file-size>
```

Sprint 1 verification confirmed that exactly 100 bytes were returned for this request.

### Invalid Byte-Range Request

A range beginning beyond the end of the file returns:

```text
416 Range Not Satisfiable
Content-Range: bytes */<file-size>
```

### Unknown Track Request

A request for an unresolved track ID returns:

```text
404 Not Found
```

### Missing Media File

If a configured media path does not exist or is not a file, the current media spike returns:

```text
404
Audio file not found
```

## Range Support Boundary

The current implementation supports single HTTP byte ranges in these forms:

```text
bytes=0-999
bytes=1000-
```

The current implementation does not support:

```text
bytes=-500
bytes=0-99,200-299
```

Open-ended ranges are capped to the media spike's configured chunk size.

Range parsing and partial-content implementation remain Matthew's responsibility.

Christian's integration work consumes and documents this behavior rather than replacing the Range implementation.

## Catalog-to-Media Identity Contract

The canonical cross-feature track identifier is:

```text
tracks.id
```

The catalog exposes this value as:

```text
track.id
```

The media subsystem consumes the corresponding:

```text
trackId
```

The current deterministic catalog fixture track IDs are:

```text
3001
3002
3003
3004
```

The catalog must not expose media-storage implementation details such as:

```text
filePath
mediaPath
storageKey
mediaId
local filesystem paths
```

Media resolution remains a media-owned concern.

## Temporary Sprint 1 Identity Limitation

The current standalone playback spike uses:

```text
trackId = 1
```

for its local smoke fixture.

This temporary media-spike identifier is not one of the deterministic catalog fixture IDs `3001` through `3004`.

Sprint 1 verification therefore distinguishes between:

```text
media smoke verification
    trackId 1
    -> local playback/mediaFiles/test.mp3

shared catalog identity contract
    tracks.id
    -> canonical cross-feature trackId
```

Future shared catalog/media integration must resolve media resources from canonical `tracks.id` values rather than relying on the temporary hardcoded smoke ID.

Christian does not change Matthew's Sprint 1 playback spike solely to hide this temporary integration boundary.

## Metadata Boundary

Metadata extraction exists under:

```text
playback/metadata.js
```

and currently reads media metadata such as:

```text
title
artist
album
duration
```

Sprint 1 does not define automatic writes from extracted media metadata into the catalog database.

Any future metadata-ingestion workflow requires a separately reviewed mapping and ownership contract.

## Authentication Boundary

Authentication must not break valid HTTP Range behavior when protected media is introduced.

The existing authentication/media requirements establish that authenticated valid Range requests must continue to support:

```text
206 Partial Content
```

Credential handling and protected-media authorization remain separate integration responsibilities and do not change Matthew's Sprint 1 Range implementation in this contract.

## Christian Integration Responsibility

Christian's Sprint 1 media integration responsibility is to:

- reserve and document the media route namespace
- document the local smoke fixture path
- verify the current media HTTP behavior
- preserve the canonical catalog track identity boundary
- identify the temporary `trackId = 1` smoke limitation
- keep filesystem and storage details out of the catalog contract
- avoid duplicating Matthew's Range and media-resolution implementation

Christian does not own or replace:

- media file storage
- byte-range parsing
- partial-content streaming
- media-specific error handling
- playback internals
- metadata extraction internals

Those remain Matthew's authored Sprint 1 responsibilities.

---

# 7. Self-Hosted Packaging Integration Contract

## Primary Owner

Konner Rigby

## Sprint 1 Responsibility

Konner owns the client shell and self-host packaging.

## Christian Integration Responsibility

Christian consumes the packaging contract in CI after it is established.

Christian does not independently create a competing Docker or Compose architecture.

## Verified Packaging Checks

The current Sprint 1 packaging artifacts have been verified for configuration
parsing and image construction.

The following checks completed successfully:

```text
sudo docker compose config
sudo docker compose build
```

Verified results:

- `compose.yml` parses successfully with Docker Compose.
- the server Docker image builds successfully;
- the client Docker image builds successfully;
- Docker builds do not introduce tracked repository changes.

These checks verify the packaging definition and image-build path. They do not
by themselves verify the complete container runtime integration.

## Current Runtime Integration Limitation

The merged backend startup contract now requires `JWT_SECRET`.

The current `compose.yml` supplies the server with:

```text
PORT=8080
```

but does not currently supply `JWT_SECRET`.

The current Compose definition also does not define a PostgreSQL service or
provide the backend PostgreSQL connection variables:

```text
PGHOST
PGPORT
PGUSER
PGPASSWORD
PGDATABASE
```

Because of this configuration gap, full `docker compose up` runtime verification
is not considered complete for the integrated Sprint 1 application.

This limitation is recorded as a cross-team packaging integration finding.
Christian does not independently replace Konner's Docker or Compose architecture
to conceal the mismatch.

Once the packaging owner establishes the final runtime configuration contract,
CI may add stable checks such as:

```text
container configuration validation
container build validation
container runtime health validation
```

only after those commands have been verified against the shared integration
configuration.

---

# 8. Continuous Integration Contract

## Primary Owner

Christian McGowan

## Workflow

The shared GitHub Actions workflow is located at:

```text
.github/workflows/ci.yml
```

## Current Required Checks

The current CI pipeline includes:

```text
Soundwave CI / Server Tests
Soundwave CI / Client Lint
Soundwave CI / Client Build
```

## Server Tests

The server CI job:

1. checks out the repository
2. configures Node.js 20
3. installs server dependencies when the server lockfile is available
4. runs the backend test suite

Local equivalent:

```bash
cd server
npm ci
npm test
```

## Client Lint

Local equivalent:

```bash
cd client
npm ci
npm run lint
```

## Client Build

Local equivalent:

```bash
cd client
npm ci
npm run build
```

## Required Merge Behavior

The `main` branch requires the configured CI checks to pass before normal pull request integration.

The current delivery path is:

```text
developer branch
        |
        v
pull request
        |
        v
required GitHub Actions checks
        |
        v
peer review
        |
        v
main
```

---

# 9. Pull Request and Review Contract

Implementation work should be submitted through a development branch and peer-reviewed pull request.

The repository contains:

```text
.github/pull_request_template.md
```

and:

```text
CONTRIBUTING.md
```

Pull requests should document:

- primary author
- related Jira issue when available
- primary contribution area
- teammate-owned interfaces consumed
- implementation summary
- verification commands
- acceptance criteria
- documentation impact
- reviewer notes

At least one teammate approval is required under the current main-branch protection workflow.

---

# 10. Shared Dependency Contract

Dependencies should be declared in the appropriate package file.

For the backend:

```text
server/package.json
server/package-lock.json
```

For the client:

```text
client/package.json
client/package-lock.json
```

## Adding Dependencies

When intentionally adding a dependency:

```bash
npm install <package>
```

The corresponding package manifest and lockfile should be reviewed and committed.

## Installing Existing Dependencies

From a clean checkout:

```bash
npm ci
```

should be used when a committed lockfile exists.

This ensures local development and GitHub Actions use a reproducible dependency tree.

Generated `node_modules` directories must not be committed.

---

# 11. Secrets and Environment Contract

Secrets must not be committed to the repository.

Examples include:

- passwords
- database credentials
- token secrets
- API keys
- private keys
- production credentials

The current shared backend configuration includes:

```text
PORT
```

Additional environment variables should be documented by the teammate introducing the requirement.

A sanitized `.env.example` may be used after the complete variable contract is known.

---

# 12. Sprint 1 Verification Baseline

The following commands represent the current shared verification baseline.

## Server

```bash
cd ~/Soundwave-Live-Version/server
npm ci
npm test
```

## Client

```bash
cd ~/Soundwave-Live-Version/client
npm ci
npm run lint
npm run build
```

## Backend Health

With the backend running:

```bash
curl -i http://localhost:8080/health
```

Expected body:

```json
{"status":"ok"}
```

## Client Development Proxy

With the backend and Vite client running:

```bash
curl -i http://localhost:5173/health
```

Expected body:

```json
{"status":"ok"}
```

---

# 13. Integration Principles

Sprint 1 integration follows these principles:

1. Each teammate remains the primary author of their assigned subsystem.
2. Shared interfaces should be consumed rather than independently reimplemented.
3. Integration work should use small, reviewable pull requests.
4. CI should run reproducible commands from clean environments.
5. Dependency declarations and lockfiles should be committed together.
6. Setup and verification documentation should match actual merged behavior.
7. Shared files should be synchronized with `main` before modification.
8. Cross-team integration should minimize unnecessary changes to another teammate's implementation.
9. Required CI checks should remain enabled when integration problems are discovered.
10. CI failures should be fixed at the dependency, configuration, test, or implementation layer rather than bypassed.

---

# 14. Sprint 1 Integration Status

## Established

- Shared Node.js backend skeleton
- Public backend health endpoint
- Backend health tests
- React/Vite client shell
- Client lint and build commands
- Backend dependency installation contract
- Pull request template
- Contribution guide
- GitHub Actions CI
- Required CI checks on `main`
- Peer-review requirement
- Client/backend health integration

## Pending or Evolving

- Final database/catalog integration contract
- Final media verification command
- Final authentication integration details
- Final self-host packaging contract
- Additional CI checks based on stable teammate-owned interfaces
- Sprint-end clean-clone verification

This document should be updated when a teammate-owned contract changes or when a new integration requirement becomes stable.
