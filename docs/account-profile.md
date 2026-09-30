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
	 
* **Out-of-Scope:** These are excluded from Sprint 2, as they are part of a completely outside the Sprint 2 account/profile read-path scope, including but not limited to the following:

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

## Frontend Behavior

Sprint 2 will provide a minimal read-only account profile view.

The client will:

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

PostgreSQL-backed integration verification will confirm that the real users and
user_preferences tables work through the repository and authenticated
`GET /account/profile` path.

Final manual verification will demonstrate:

`POST /auth/login` -> Bearer access token -> `GET /account/profile`

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