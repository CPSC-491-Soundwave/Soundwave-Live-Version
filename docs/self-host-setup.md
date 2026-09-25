# Soundwave Self-Host Setup

This document describes the Sprint 1 self-host setup for Soundwave.

The current setup runs the Soundwave client and backend server through Docker Compose while PostgreSQL runs on the host machine.

## Architecture

```text
Browser
  |
  | http://localhost:5173
  v
Soundwave Client Container
  |
  | /health, /auth, /api
  v
Soundwave Server Container
  |
  | PostgreSQL connection
  v
Host PostgreSQL
```

Docker Compose currently manages:

- Soundwave React/Vite client
- Soundwave Node.js backend server

PostgreSQL currently runs directly on the host machine.

---

## Prerequisites

Install the following before starting Soundwave:

- Git
- Node.js
- Docker Desktop
- PostgreSQL
- PostgreSQL command-line tools (`psql`)

Verify Docker:

```bash
docker --version
docker compose version
```

Verify PostgreSQL:

```bash
psql --version
pg_isready
```

Expected PostgreSQL result:

```text
localhost:5432 - accepting connections
```

---

## 1. Clone the Repository

```bash
git clone https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version.git
cd Soundwave-Live-Version
```

---

## 2. Configure Local Environment Files

The following local files are required:

```text
database/.env
server/.env
```

These files contain local credentials and secrets and must not be committed to Git.

The database environment requires values for:

```text
PGHOST
PGPORT
PGUSER
PGPASSWORD
PGDATABASE
```

The server environment requires the authentication configuration used by the backend, including:

```text
JWT_SECRET
```

Do not commit or share real passwords or secrets.

---

## 3. Configure PostgreSQL

The Sprint 1 development database uses the project database role:

```text
soundwave_app
```

The current development database is:

```text
soundwave_allison_dev
```

PostgreSQL must be running before Soundwave starts.

Load the local environment:

```bash
set -a
source database/.env
source server/.env
set +a
```

Verify connectivity:

```bash
psql -c "SELECT current_database(), current_user;"
```

A successful result should show the configured Soundwave database and:

```text
soundwave_app
```

---

## 4. Install Database Dependencies

From the repository root:

```bash
cd database
npm ci
cd ..
```

---

## 5. Run Database Migrations

Load the environment if it is not already loaded:

```bash
set -a
source database/.env
source server/.env
set +a
```

Run the migrations:

```bash
node database/migrate.js
```

Verify the tables:

```bash
psql -c "\dt"
```

Sprint 1 tables should include:

```text
albums
artists
schema_migrations
tracks
users
```

---

## 6. Start Soundwave with Docker Compose

Make sure Docker Desktop is running.

From the repository root:

```bash
docker compose up --build
```

Docker Compose builds and starts:

```text
client
server
```

The client is exposed at:

```text
http://localhost:5173
```

The backend is exposed at:

```text
http://localhost:8080
```

---

## 7. Verify Backend Health

Open:

```text
http://localhost:8080/health
```

or run:

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{"status":"ok"}
```

The Soundwave sidebar should also display:

```text
Backend online
```

---

## 8. Run the Automated Compose Smoke Test

Soundwave includes a repeatable Docker Compose smoke test.

From the repository root:

```bash
node scripts/compose-smoke-test.mjs
```

The smoke test automatically:

1. Builds the client and server Docker images.
2. Starts the Docker Compose stack.
3. Waits for the backend to become ready.
4. Checks `http://localhost:8080/health`.
5. Verifies the client at `http://localhost:5173`.
6. Reports success or failure.
7. Stops and removes the Compose services.

Successful output includes:

```text
Backend health check passed.
Client check passed.
Soundwave Compose smoke test passed.
```

---

## 9. Stop Soundwave

If Docker Compose is running interactively, press:

```text
Ctrl+C
```

Then run:

```bash
docker compose down
```

Verify the Compose services are stopped:

```bash
docker compose ps
```

---

## Local Development Without Docker

Soundwave can also run directly on the host machine.

### Start the Backend

From the repository root:

```bash
set -a
source database/.env
source server/.env
set +a

cd server
npm start
```

The backend listens on:

```text
http://localhost:8080
```

### Start the Frontend

In another terminal:

```bash
cd client
npm ci
npm run dev
```

The frontend normally runs at:

```text
http://localhost:5173
```

The Vite development server proxies `/health`, `/auth`, and `/api` requests to the backend.

---

## Docker Networking Notes

When Soundwave runs through Docker Compose, the client communicates with the backend using the Compose service hostname:

```text
http://server:8080
```

The backend connects to PostgreSQL running on the host through:

```text
host.docker.internal
```

This prevents containers from incorrectly treating `localhost` as the host machine.

---

## Troubleshooting

### Docker Command Works but the Daemon Is Unavailable

Example:

```text
Cannot connect to the Docker daemon
```

Start Docker Desktop and wait until the Docker engine is running.

Then verify:

```bash
docker compose ps
```

### Port 5173 Is Already in Use

Stop any locally running Vite process before starting Compose.

On macOS or Linux, check:

```bash
lsof -i :5173
```

### Port 8080 Is Already in Use

Stop any locally running Soundwave backend before starting Compose.

On macOS or Linux, check:

```bash
lsof -i :8080
```

### Backend Container Exits Immediately

Inspect the Compose services:

```bash
docker compose ps -a
docker compose logs server
```

A missing authentication configuration may produce an error similar to:

```text
A valid secretKey string is required to initialize the token service.
```

Confirm that `server/.env` exists and contains the required local configuration.

### Backend Cannot Connect to PostgreSQL

Verify PostgreSQL is running:

```bash
pg_isready
```

Verify local database connectivity:

```bash
psql -c "SELECT current_database(), current_user;"
```

When running through Docker Compose, the server uses:

```text
PGHOST=host.docker.internal
```

to reach PostgreSQL on the host machine.

### Client Displays "Backend offline"

Check the backend health endpoint:

```bash
curl http://localhost:8080/health
```

Then inspect Compose:

```bash
docker compose ps -a
docker compose logs server
```

---

## Sprint 1 Verification Checklist

Before considering the self-host setup verified:

- [ ] Docker Desktop is running
- [ ] PostgreSQL is running
- [ ] Local `.env` files exist and are not committed
- [ ] Database migrations complete successfully
- [ ] `docker compose up --build` starts the client and server
- [ ] `http://localhost:8080/health` returns `{"status":"ok"}`
- [ ] `http://localhost:5173` loads Soundwave
- [ ] The client reports `Backend online`
- [ ] `node scripts/compose-smoke-test.mjs` passes
- [ ] `docker compose down` cleanly stops the stack

---

## Sprint 1 Scope

The Sprint 1 self-host configuration establishes a working development and demonstration environment for Soundwave.

The current setup packages the client and backend through Docker Compose while PostgreSQL remains on the host machine.

Production deployment hardening, clean-machine deployment verification, backup and recovery procedures, and final release configuration are deferred to later implementation work.