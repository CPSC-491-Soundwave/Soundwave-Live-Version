# Soundwave Local Authentication Testing Runbook

This guide documents the local authentication test flow used during Sprint 1 so Emmanuel and teammates can reproduce or demo the working account flow.

## Assumptions

- PostgreSQL is installed and running locally.
- `database/.env` and `server/.env` already exist locally and are ignored by Git.
- The database migrations are present in the repo.
- The local test account convention is `devuser`.
- The Sprint 1 client stores the access token in memory only, so refreshing the page clears authenticated state.

---

## 1. Go to the repository root

```bash
cd ~/Soundwave-Live-Version
```

If dependencies have not been installed on the machine yet:

```bash
cd server
npm ci
cd ../database
npm ci
cd ..
```

## 2. Load the development environment

Every new terminal that needs the backend/database environment must load the env files:

```bash
set -a
source database/.env
source server/.env
set +a
```

Verify the required variable names are present without printing their values:

```bash
env \
  | cut -d= -f1 \
  | grep -E '^(PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|JWT_SECRET)$' \
  | sort
```

Expected names:

```text
JWT_SECRET
PGDATABASE
PGHOST
PGPASSWORD
PGPORT
PGUSER
```

Do not print or share the actual database password or JWT secret.

## 3. Confirm PostgreSQL connectivity

```bash
psql -c "SELECT current_database(), current_user;"
```

Expected user:

```text
soundwave_app
```

If this fails, stop before continuing with auth testing.

## 4. Run database migrations

From the repository root:

```bash
node database/migrate.js
```

On an already-configured database, output similar to this is expected:

```text
skip 20260915_ayu_001_catalog_core.sql
skip 20260916_ayu_002_auth_users.sql
Database migrations complete.
```

Verify tables:

```bash
psql -c "\dt"
```

Expected tables include:

```text
albums
artists
schema_migrations
tracks
users
```

Optional auth schema check:

```bash
psql -c "\d users"
```

## 5. Check whether `devuser` already exists

```bash
psql -c "
SELECT id, username, role, created_at
FROM users
WHERE username = 'devuser';
"
```

If a row exists and you remember the password, skip to backend testing.

If the account does not exist, or you forgot its password, continue to the next section.

## 6. Create or reset the local `devuser` account

Enter a local test password without putting it in shell history:

```bash
read -s -p "Local devuser password: " TEST_PASSWORD
echo
```

Generate a hash using Soundwave's existing Argon2 implementation:

```bash
TEST_HASH=$(
  TEST_PASSWORD="$TEST_PASSWORD" \
  node --input-type=module -e \
  "import { hash_password } from './server/src/auth/hasher.js';
   console.log(await hash_password(process.env.TEST_PASSWORD));"
)
```

Verify a hash was produced without printing the full value:

```bash
case "$TEST_HASH" in
  '$argon2id$'*) echo "Argon2id hash looks valid" ;;
  *) echo "Unexpected hash format" ;;
esac
```

If `devuser` does not exist:

```bash
psql \
  -v username='devuser' \
  -v password_hash="$TEST_HASH" <<'SQL'
INSERT INTO users (username, password_hash, role)
VALUES (:'username', :'password_hash', 'user')
RETURNING id, username, role, created_at;
SQL
```

Expected:

```text
INSERT 0 1
```

If `devuser` already exists, reset the stored password hash:

```bash
psql \
  -v username='devuser' \
  -v password_hash="$TEST_HASH" <<'SQL'
UPDATE users
SET password_hash = :'password_hash'
WHERE username = :'username'
RETURNING id, username, role, created_at;
SQL
```

Expected:

```text
UPDATE 1
```

Verify the row without printing the password hash:

```bash
psql -c "
SELECT id, username, role
FROM users
WHERE username = 'devuser';
"
```

## 7. Start the backend

Use a terminal where the environment variables have already been loaded.

```bash
cd ~/Soundwave-Live-Version/server
npm start
```

Leave this terminal running.

If startup fails with:

```text
A valid secretKey string is required...
```

then `server/.env` was not loaded in that terminal.

## 8. Backend smoke test

From another terminal:

```bash
curl -i http://localhost:8080/health
```

Expected:

```text
HTTP/1.1 200 OK
```

with:

```json
{"status":"ok"}
```

## 9. Verify unauthenticated `/auth/me`

```bash
curl -i http://localhost:8080/auth/me
```

Expected:

```text
HTTP/1.1 401 Unauthorized
```

This is the correct result for a request without a Bearer token.

## 10. Verify invalid login behavior

```bash
curl -i -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"definitely-does-not-exist","password":"anything"}'
```

Expected:

```text
HTTP/1.1 401 Unauthorized
```

The response should use the generic invalid-credentials message.

## 11. Verify successful login from the terminal

If `TEST_PASSWORD` is still set:

```bash
LOGIN_PAYLOAD=$(
  TEST_PASSWORD="$TEST_PASSWORD" \
  node -e '
    process.stdout.write(JSON.stringify({
      username: "devuser",
      password: process.env.TEST_PASSWORD
    }))
  '
)
```

Send the login request:

```bash
LOGIN_RESPONSE=$(
  curl -sS -X POST http://localhost:8080/auth/login \
    -H "Content-Type: application/json" \
    --data "$LOGIN_PAYLOAD"
)

echo "$LOGIN_RESPONSE"
```

Expected response structure:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer"
}
```

Do not share or screenshot the complete JWT unless necessary.

Extract the access token:

```bash
ACCESS_TOKEN=$(
  LOGIN_RESPONSE="$LOGIN_RESPONSE" \
  node -e '
    const response = JSON.parse(process.env.LOGIN_RESPONSE);
    if (!response.accessToken) {
      console.error("No accessToken returned");
      process.exit(1);
    }
    process.stdout.write(response.accessToken);
  '
)
```

Use it with `/auth/me`:

```bash
curl -i http://localhost:8080/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Expected:

```text
HTTP/1.1 200 OK
```

with authenticated identity data similar to:

```json
{
  "user": {
    "id": "1",
    "role": "user"
  }
}
```

## 12. Start the frontend

Open another terminal:

```bash
cd ~/Soundwave-Live-Version/client
npm ci
npm run dev
```

Open the Vite URL, normally:

```text
http://localhost:5173
```

Log in with:

```text
Username: devuser
Password: the local password selected earlier
```

Expected UI result:

```text
You are successfully authenticated.

User ID: 1
Role: user
```

## 13. Verify browser network requests

Open browser developer tools:

- Press `F12`, or
- Press `Ctrl + Shift + I`, or
- Right-click the page and choose **Inspect**

Open the **Network** tab and log in again.

Expected requests:

```text
POST /auth/login    200
GET  /auth/me       200
```

This verifies the full vertical slice:

```text
Login UI
  ↓
Vite proxy
  ↓
POST /auth/login
  ↓
PostgreSQL
  ↓
Argon2 verification
  ↓
JWT creation
  ↓
GET /auth/me
  ↓
Authenticated UI
```

## 14. Verify expected refresh behavior

After a successful login, refresh the browser.

Current Sprint 1 behavior is expected to be:

```text
authenticated
     ↓
browser refresh
     ↓
in-memory access token disappears
     ↓
authenticated state is lost
```

This is a known Sprint 1 limitation because the access token is intentionally stored in memory only.

## 15. Run regression checks before a demo or PR closeout

Backend:

```bash
cd ~/Soundwave-Live-Version/server
npm test
```

Known Sprint 1 baseline:

```text
tests 49
pass 49
fail 0
```

Frontend:

```bash
cd ~/Soundwave-Live-Version/client
npm run lint
npm run build
```

## 16. Clean up temporary shell credentials

When testing is complete:

```bash
unset TEST_PASSWORD
unset TEST_HASH
unset LOGIN_PAYLOAD
unset LOGIN_RESPONSE
unset ACCESS_TOKEN
```

The local `devuser` database row may remain if a ready-to-use demo account is useful.

# Quick Demo Checklist

If the machine is already configured:

```text
1. Source database/.env and server/.env
2. Start backend
3. Start frontend
4. Open localhost:5173
5. Log in as devuser
6. Show authenticated User ID and role
7. Open DevTools → Network
8. Show POST /auth/login = 200
9. Show GET /auth/me = 200
10. Optional: refresh and explain the in-memory session limitation
```

# Troubleshooting

### Login returns `401`

Check:

```text
Does devuser exist?
Are you using the current local test password?
Was the stored password hash reset after changing the password?
```

### Backend will not start

Check:

```text
Did you source server/.env in THIS terminal?
Is JWT_SECRET present in the environment?
```

### Database calls fail

Check:

```text
Did you source database/.env?
Is PostgreSQL running?
Does psql connect?
Did the migrations run?
```

### Migration reports that `pg` is missing

Install the dependencies for the package that owns the database tooling:

```bash
cd ~/Soundwave-Live-Version/database
npm ci
```

Then retry from the repository root:

```bash
cd ..
node database/migrate.js
```
