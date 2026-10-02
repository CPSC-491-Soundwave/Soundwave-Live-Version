# Account/Profile Read Contract

## Purpose
The Sprint 2 Account/Profile Read Path provides the authenticated Soundwave user with a read-only view of their own account identity and preference metadata. This contract defines the database, backend, authentication, frontend, and testing boundaries for Emmanuel De Guzman's Sprint 2 vertical slice.

## Sprint 2 Scope
*  **In Scope:** The following is the Sprint 2 scope for implementation purposes, including the following:
	
	- Profile/Preference Persistence
	- Authenticated current-user profile lookup
	- GET /account/profile
	- Audio-Quality Preference metadata
	- Read-Only profile UI
	- Positive/Negative Tests
	- Reproducible Local Fixture/Setup
	 
* **Out of Scope:** The following items are intentionally excluded from the
  Sprint 2 account/profile read-path scope:

	- Profile Editing
	- Changing Passwords
	- Registration
	- Account Recovery
	- Session Revocation
	- Refresh Tokens
	- Public Profiles
	- User Search
	- Media Transcoding
	- Actual Audio-Quality Switching

## Data Model
Sprint 2 uses a separate user_preferences table associated with the existing
users table. This keeps authentication data such as usernames, password hashes,
and roles separate from user preference metadata.

* Logical Organization
* Flexibility and Scalability
* Cleaner Queries and caching
* Access Control

## GET /account/profile
Sprint 2 exposes an authenticated read endpoint:

`GET /account/profile`

The endpoint returns the account identity and supported preference metadata
for the currently authenticated user.

The client does not provide a target user ID. The backend derives the user
identity from the authenticated request principal.

This endpoint is read-only during Sprint 2.

## Authentication and Authorization

`GET /account/profile` requires an authenticated request.

The backend uses the verified authentication principal to determine the
current user's ID. The client cannot request another user's profile by
supplying a different user ID.

Authentication-sensitive values are not part of the profile response,
including:

- `password_hash`
- `JWT_SECRET`
- access tokens
- internal token-signing information

Expected behavior:

- Valid authenticated request -> HTTP 200
- Missing authentication -> HTTP 401
- Invalid or expired authentication -> HTTP 401

## Response Fields

A successful `GET /account/profile` request returns a profile-safe response for
the authenticated user.

Current Sprint 2 response shape:

```json
{
  "user": {
    "id": "42",
    "username": "profile-test-user",
    "role": "user"
  },
  "preferences": {
    "audioQualityPreference": "test-quality"
  }
}
```
`test-quality` is an example test value and is not a product-defined
audio-quality option. Sprint 2 does not define or enforce the final set of
supported quality labels.

When the authenticated user has no explicit audio-quality preference, the
endpoint returns:
```
{
  "preferences": {
    "audioQualityPreference": null
  }
}
```

## Frontend Behavior

Sprint 2 provides a minimal read-only account profile view.

The client:

- Request `GET /account/profile` using the existing authenticated session.
- Display the authenticated user's username.
- Display the authenticated user's role.
- Display the audio-quality preference when available.
- Handle an unset audio-quality preference without failing the page.
- Provide basic loading and request-failure behavior.

Profile editing, password changes, preference editing, registration, and
account recovery are outside Sprint 2 scope.

## Error Behavior

Expected Sprint 2 endpoint behavior:

- Valid authenticated profile -> HTTP 200
- Missing authentication -> HTTP 401
- Invalid or expired authentication -> HTTP 401
- Authenticated principal with no matching profile -> HTTP 404
- Repository/profile identity mismatch -> controlled HTTP 500
- Repository or persistence failure -> controlled HTTP 500

The endpoint must not expose database errors, authentication secrets, or raw
sensitive persistence data in its HTTP response.

## Testing Requirements

Sprint 2 verification covers the account/profile feature at multiple layers.

Repository tests verify:

- Profile lookup by user ID.
- Optional `user_preferences` behavior.
- Missing-user behavior.
- Parameterized SQL.
- Exclusion of `password_hash`.

HTTP route tests verify:

- Authenticated success.
- Missing authentication.
- Invalid authentication.
- Missing profile behavior.
- Principal-to-profile identity consistency.
- Controlled repository failure behavior.

PostgreSQL-backed integration verification confirms that the real users and
user_preferences tables work through the repository and authenticated
`GET /account/profile` path.

Final manual verification demonstrates:
`POST /auth/login` -> Bearer access token -> `GET /account/profile`

## Reproducible Local Profile Fixture and Verification

The following fixture is intended only for local Sprint 2 verification. The
credentials and `test-quality` preference are test-only values and are not
product-defined account defaults.

From the repository root, create the disposable verification fixtures:

```bash
cd server

node --env-file=../database/.env.test --input-type=module <<'NODE'
import pg from "pg";
import { hash_password } from "./src/auth/hasher.js";

const { Client } = pg;
const database = new Client();

await database.connect();

const password = "Sprint2ProfileTest123!";
const passwordHash = await hash_password(password);

const withPreferenceUsername =
  "edg_profile_e2e";

const noPreferenceUsername =
  "edg_profile_no_pref";

try {
  await database.query(
    `
    DELETE FROM users
    WHERE username IN ($1, $2)
    `,
    [
      withPreferenceUsername,
      noPreferenceUsername
    ]
  );

  const withPreference =
    await database.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [
        withPreferenceUsername,
        passwordHash,
        "user"
      ]
    );

  await database.query(
    `
    INSERT INTO user_preferences (
      user_id,
      audio_quality_preference
    )
    VALUES ($1, $2)
    `,
    [
      withPreference.rows[0].id,
      "test-quality"
    ]
  );

  await database.query(
    `
    INSERT INTO users (
      username,
      password_hash,
      role
    )
    VALUES ($1, $2, $3)
    `,
    [
      noPreferenceUsername,
      passwordHash,
      "user"
    ]
  );

  console.log(
    "Created Sprint 2 account/profile verification fixtures."
  );
} finally {
  await database.end();
}
NODE
```

The fixture creates two disposable users:

- `edg_profile_e2e` with `audio_quality_preference = test-quality`
- `edg_profile_no_pref` with no `user_preferences` row

Both fixture accounts use the local test-only password:

```text
Sprint2ProfileTest123!
```

### Start the Backend

From `server`:

```bash
JWT_SECRET="$(openssl rand -hex 32)" \
PORT=8080 \
node --env-file=../database/.env.test src/server.js
```

The API should report that it is listening on port `8080`.

### Start the Client

In a separate terminal, from the repository root:

```bash
cd client
npm run dev
```

The Vite development server proxies `/auth`, `/account`, `/api`, and `/health`
requests to the backend.

### Verify the Populated Preference Case

1. Open the Soundwave client in the browser.
2. Navigate to Login.
3. Authenticate using:
   - Username: `edg_profile_e2e`
   - Password: `Sprint2ProfileTest123!`
4. Navigate to Profile.
5. Verify the page displays:
   - Username: `edg_profile_e2e`
   - Role: `user`
   - Audio Quality Preference: `test-quality`
6. Verify no password hash, JWT secret, or access token is displayed.

Expected result:

```text
Authenticated profile loads successfully and displays test-quality.
```

### Verify the No-Preference Case

1. Log in using:
   - Username: `edg_profile_no_pref`
   - Password: `Sprint2ProfileTest123!`
2. Navigate to Profile.
3. Verify the page still loads successfully.
4. Verify the UI displays `Not set` for the audio-quality preference.

The corresponding API value is:

```json
{
  "preferences": {
    "audioQualityPreference": null
  }
}
```

### Cleanup

After manual verification, remove both disposable fixture users:

```bash
cd server

node --env-file=../database/.env.test --input-type=module <<'NODE'
import pg from "pg";

const { Client } = pg;
const database = new Client();

await database.connect();

try {
  await database.query(
    `
    DELETE FROM users
    WHERE username IN ($1, $2)
    `,
    [
      "edg_profile_e2e",
      "edg_profile_no_pref"
    ]
  );

  console.log(
    "Removed Sprint 2 account/profile verification fixtures."
  );
} finally {
  await database.end();
}
NODE
```

The `user_preferences` row associated with `edg_profile_e2e` is removed through
the existing `ON DELETE CASCADE` relationship.

## Deferred Work

The following work is intentionally deferred beyond the Sprint 2 account/profile
read path:

- Profile editing
- Password changes
- Registration
- Account recovery
- Refresh-token/session-revocation work
- Public user profiles
- User search
- Audio-quality preference editing
- Actual audio-quality switching or transcoding
- Additional account settings