# Soundwave — Sprint 5 Account Settings Update Contract

- **Owner:** Christian McGowan
- **Work item:** Sprint 5, Block 2 — API, data, and security contract
- **Status:** Source-aligned implementation design; **not yet implemented, merged, or verified**
- **Inspected source baseline:** `0874769`, synchronized into local `christian-dev` on November 16, 2026
- **Jira:** SCRUM-357
- **Existing verification issues:** SCRUM-223 (validation/authorization), SCRUM-224 (manual accessibility), SCRUM-243 (isolated CI smoke); **do not recreate**.

## 1. Product requirements and authoritative references

The source of truth is **Soundwaves Application Roadmap** (`Soundwave.pdf`, PDF page numbers below). The roadmap's planned product capabilities are distinct from functionality that is already implemented:

| Roadmap location | Source requirement | Impact on this sprint |
|---|---|---|
| PDF pp. 7–8, Project Plan and Milestones | Users must be able to edit account/personal/login information; client can edit user information. | This is a genuine acceptance requirement, not an invented enhancement. |
| PDF p. 77 (printed page 76), Settings — Account & Profile mockup | Users can change username, email, and password. | **Implement own-username editing** in the present update vertical slice. Record email/password as additional roadmap requirements requiring separate schema/security designs. |
| PDF p. 78 (printed page 77), Settings — General Settings mockup | Users can modify application settings, including audio quality. UI mockup displays **Auto**. | **Implement editable audio-quality preference metadata** and persistence. The mockup does **not** define an exhaustive quality-option enum or streaming/transcoding behavior. |
| PDF p. 23 (printed page 22), Authentication use case | Administrators can manage other users' usernames, emails, and passwords. | This is **admin account management**, not authorization for an ordinary user to change another account. It remains separate from this self-service PATCH. |
| PDF pp. 56–58, 67–68, 77–78, UX designs | Dark/navy interface, purple accent, predictable navigation, user profile entry point and settings sections. | Preserve existing React application shell and design system; extend existing `/profile` route where practical. |

**Definitive Sprint 5 choice:** Users can change **their own username** and **their own audio-quality preference**. This supersedes the earlier *username-only* proposal. The design does **not** claim that changing a preference will immediately change the bitrate, codec, or available stream quality.

### Other roadmap requirements versus current implementation

The roadmap also includes email/password updates and broader application settings (e.g., language, storage, theme). These are **not removed from the product requirements**; they are *not satisfied by the present two-field update*. In the inspected source baseline, `users` has no email column, and email/password changes need dedicated identity verification, migrations, and/or account-recovery decisions. Track these gaps in Block 1 release-readiness assessment and assign separately if the team intends to ship them before the final demo.

## 2. Verified baseline and compatibility boundaries

| Component | Inspected behavior | Preservation requirement |
|---|---|---|
| `server/src/account/profile.js` | GET handler builds safe response after verifying principal and profile identity. | Keep GET response and error behavior unchanged. |
| `server/src/app.js` | Revocation-aware authorization applies to selected GET routes including `/account/profile`. | **Explicitly protect PATCH** with the same revocation-aware pre-handler. |
| `server/src/auth/request-authorization.js` | Authorizes based on revocable JWT; authentication infrastructure failures return 503. | Fail closed on a revoked token or revocation-store outage. |
| `server/src/data/account-profile.repository.js` | Parameterized profile lookup from `users` LEFT JOIN `user_preferences`. | Extend same repository; never return password hashes. |
| `database/migrations/20260916_ayu_002_auth_users.sql` | `users.username` is NOT NULL/nonblank/UNIQUE; `users.role` has user/admin constraint. | Update only current principal's username and respect existing uniqueness semantics. |
| `database/migrations/20260924_edg_001_user_preferences.sql` | Nullable, nonblank-if-present `audio_quality_preference` keyed by user ID. | Use the **existing table**; no new table is needed for the two fields. |
| `server/src/auth/login.js` + `server/src/data/auth-user.repository.js` | Login finds the user by trimmed username and verifies a password. | Verify login under the updated username and refusal under the old username after a change. |
| `client/src/pages/Profile.jsx` and `client/src/styles/profile.css` | Read-only profile at `/profile`. | Extend with accessible editing and session-safe request state. |
| Existing profile tests | **10 backend + 4 frontend** focused tests passed locally before changes. | Preserve baseline and add appropriate new tests. |

## 3. HTTP API contract — edit both fields

**Endpoint:** `PATCH /account/profile`
**Authentication:** `Authorization: Bearer <token>`; target user ID is **never** taken from the payload, URL, or user-controlled claim beyond the authenticated principal.
**Media type:** `application/json`, permitting a valid charset parameter.
**Request size:** **Proposed** 16 KiB raw-body limit, consistent with the existing login route; any implementation must enforce that bound and control parse errors.
**Cache:** `Cache-Control: no-store` on sensitive/profile responses.

### Valid update examples

Edit username only:

```json
{"username":"updated_username"}
```

Edit audio-quality preference only:

```json
{"audioQualityPreference":"Auto"}
```

Clear audio-quality preference:

```json
{"audioQualityPreference":null}
```

Edit both in one **atomic** request:

```json
{"username":"updated_username","audioQualityPreference":"Auto"}
```

### Public response

The successful PATCH response must match the safe shape of the existing GET:

```json
{
  "user":{"id":"42","username":"updated_username","role":"user"},
  "preferences":{"audioQualityPreference":"Auto"}
}
```

Example IDs/usernames are fictitious. Do not expose password hashes, raw JWTs, credential material, database errors, or signing secrets.

### Field and validation policy

- **Allowlist only:** `username`, `audioQualityPreference`. Reject `id`, `userId`, `role`, `password`, `password_hash`, `email`, unknown keys, arrays, primitive JSON, and empty update objects. The presence of immutable/unsupported fields invalidates the **whole** request; do not silently ignore them.
- **Username:** must be a string and nonblank after trimming; respect the existing unique constraint. A maximum length and permitted-character policy must be chosen as a *new implementation rule* after checking existing account fixtures; the roadmap provides no character/length rules. Do not accidentally impose case-insensitive uniqueness or ASCII-only restrictions while claiming this is existing behavior. Identical-value updates should be safe.
- **Audio quality:** `null` clears the preference. Otherwise accept a trimmed, nonblank, bounded-length string. Preserve the original Sprint 2 metadata semantics; **Auto is confirmed by the roadmap mockup**, but the document does not enumerate all valid values. The implementation must explicitly document its chosen accepted-label policy and use the *same* policy in server validation, UI controls, and tests. Do not misrepresent stored labels as functional transcoding modes. Avoid breaking existing test fixtures containing arbitrary legacy nonblank values.
- **Request-body security:** reject malformed JSON, oversized requests, malformed content types, and unsupported field types. Reject or explicitly test/document duplicate JSON-key behavior; plain `JSON.parse` cannot detect duplicates.
- **Ownership:** only the verified principal's user ID is eligible for update; a user cannot alter another account by adding an ID or changing a role in the body.
- **Reauthentication:** username is a login identifier. Confirm the team's security policy for fresh password confirmation/step-up authentication before implementing sensitive account changes. Do not invent an alternate authentication subsystem; reuse verified password-checking primitives if reauthentication is required.

### Error-response specification

| Condition | Status | Required behavior |
|---|---:|---|
| Valid edit, including safe no-op | 200 | Return current persisted profile shape. |
| Missing, invalid, expired, or revoked JWT | 401 | No write; controlled error, no leaked profile values. |
| Revocation/authorization store unavailable | 503 | Fail closed; **no write**. |
| Malformed JSON, invalid type, unknown/immutable field, empty update | 400 | Controlled JSON error; no write. |
| Unsupported media type | 415 | Controlled JSON error; no write. |
| Body exceeds enforced raw-byte limit | 413 | Controlled JSON error; no write. |
| Username uniqueness conflict | 409 | Controlled conflict error; no account data disclosure. |
| Authenticated user no longer exists | 404 | No inserted orphan preference row. |
| Unexpected storage or application failure | 500 | No sensitive internal details; no partial write. |

Agree on exact error codes/bodies while writing backend tests. Keep existing GET error behavior intact.

## 4. Persistence and atomicity

- Reuse the existing `users` and `user_preferences` tables. The existing username UNIQUE constraint remains the concurrency backstop; map only the intended PostgreSQL uniqueness violation to HTTP 409.
- `username` modification must be parameterized and scoped by `WHERE id = <verified principal user ID>`; never use an arbitrary client-supplied account identifier.
- Preference update must use a parameterized **upsert** keyed on the verified user ID and must allow clearing the value to SQL NULL. An authenticated user without a preference row is a valid case.
- If both fields are supplied in one PATCH, perform the multi-table mutation **in one database transaction on the same connection** and roll back on any failure; no partial username or preference write is permitted.
- Prefer a repository method returning a profile-safe record read within the committed result path. If the connection's transaction abstraction differs from unit-test stubs, extend test fixtures rather than weakening transaction behavior.
- An existing user must be confirmed before any new preferences row is created. Deleting the user concurrently must not result in an orphan or a misleading success.

## 5. Security and session handling

- Update `app.js` so `PATCH /account/profile` enters the existing `authorizeRevocableRequest()` pre-handler, with allowed roles `user` and `admin` for **self-service** updates.
- Retain identity-scoped access, revocation checks, and controlled 401/503 failure responses. A mere JWT signature verification inside an update handler is **not equivalent** to revocation-aware authorization.
- Ordinary Settings cannot change user roles, user IDs, other users' records, passwords, or admin privileges through this endpoint.
- The Sprint 4 CC6.3 administrator-downgrade test-only observation is a separate privilege-lifecycle question; this task does not claim it is resolved.
- Do not put credentials, Authorization headers, raw tokens, database connection strings, or sensitive profile data into GitHub Actions logs or presentation screenshots.
- After username changes, verify the new username works for login and the old username no longer identifies this account; test the behavior of an already-issued token based on the implementation's actual user-ID semantics.

## 6. Frontend behavior and visual alignment

- Reuse the React `Profile.jsx` route and Soundwave styling. The roadmap has **Account & Profile** and **General Settings** concepts; they may be sections of one responsive page without introducing a duplicate navigation tree.
- Account & Profile: render current username as an editable, labeled input, with read-only role and ID; provide Save/Cancel, clear validation, saving state, success feedback, and error recovery.
- General Settings: render an editable audio-quality preference control and show current stored value, clearing/unset behavior, and explanatory copy that this release persists *preference metadata* rather than changing the audio stream. **Auto** is roadmap-grounded; any further labels must be explicitly documented as implementation choices, not attributed to the roadmap.
- Preserve existing dark navy/purple visual language and accessible keyboard focus, labels, live success/error feedback, and responsive layout.
- On `accessToken` change or logout, immediately invalidate the previous user's profile and in-flight writes; do not let late responses show the prior user's account or success state.
- Disable repeated submissions while saving, preserve server-acknowledged values on failures, and verify a fresh GET/browser refresh shows stored updates.

## 7. Test and evidence plan

**Blocks 3 and 4 — implementation tests:**

1. Username-only PATCH returns the updated profile; GET confirms persistence.
2. Audio-preference-only PATCH returns and persists the preferred value; `null` clears it.
3. Combined PATCH updates both fields atomically; an injected second-operation failure rolls back the username.
4. Duplicate username produces 409 without changing either field.
5. Missing, invalid, expired and revoked JWTs are rejected; revocation-store outage returns 503 without writes.
6. Invalid JSON, oversized request, unsupported media type, wrong types, empty updates, and immutable/unknown keys are rejected.
7. A client cannot choose another user's ID, modify a role, or obtain a password hash.
8. Missing user and database failures produce controlled responses without partial changes.
9. New-username login succeeds and old-username login fails for the renamed account; existing-session behavior is characterized by tests.
10. React tests cover populated/unset preference, save/cancel, validation, two-field editing, loading/errors, session transition races, and refresh persistence.
11. Existing baseline **10 server + 4 frontend profile tests** remain green; run affected auth/routes/CI suites, lint, and client build before opening the implementation PRs.

**Existing separate verification tasks:**

- **SCRUM-223 (Block 5):** Independent invalid-input and authorization matrix (at least eight cases) and database no-write oracles.
- **SCRUM-224 (Block 6):** Manual keyboard, focus, labels, accessibility, errors, save-state observations with dated screenshots.
- **SCRUM-243 (Block 7):** Isolated, reproducible real-stack profile-update and persisted-read smoke test in GitHub Actions.

No tests, deployments, merges, or demonstrations are claimed as completed by this design document.

## 8. Design-review items that remain genuinely unspecified by the roadmap

1. **Exact audio-quality choices beyond Auto:** The mockup depicts **Auto** but contains no full enum or bitrate promises. The implementation must document its accepted string policy and avoid pretending quality changes playback.
2. **Username limits and sensitivity policy:** Existing PostgreSQL schema guarantees nonblank/unique, not a specific length or character set; user-login reauthentication expectations require an explicit design choice.
3. **Email/password and other settings roadmap gaps:** Email storage/migrations and current-password verification or recovery work remain separately scoped. This Sprint 5 two-field feature is not a complete implementation of every roadmap mockup.
4. **Jira traceability:** Add the exact newly created Block 2 ticket key, link peer-reviewed PR and passing checks, and replace proposed acceptance with observed test evidence only after execution.

## 9. Block 2 acceptance checklist

- [x] Product-spec evidence establishes username editing and audio-quality preference editing as required capabilities.
- [x] Existing account/profile code, schema, routing, auth, and focused tests inspected.
- [x] Existing 10 backend and 4 frontend tests passed at baseline.
- [x] Decision to preserve GET response and reuse existing tables recorded.
- [x] Atomic combined-update, ownership, and revoked-session requirements specified.
- [ ] Exact username validation and permitted quality-label policy captured in implementation review.
- [ ] Reauthentication expectations agreed with the team before shipping identity edits.
- [ ] Actual Jira issue key and PR added; peer review completed.
- [ ] Backend/frontend implementations built, tested, and merged in their respective blocks.
