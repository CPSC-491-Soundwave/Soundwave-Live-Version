# Sprint 5 / SCRUM-358 — Profile-update backend implementation notes

## Scope and compatibility

- `PATCH /account/profile` updates the **authenticated user's** username and/or audio-quality preference; identity comes exclusively from the revocation-aware request principal.
- `GET /account/profile` is unchanged, including its response shape and existing profile tests.
- Supported request fields: `username` and `audioQualityPreference` only. Unknown and privileged fields are rejected as a whole, not silently ignored.
- Updates to both PostgreSQL tables share one client transaction and acquire a row lock on `users`. Failed changes are rolled back.
- A username conflict maps the existing `users_username_unique` PostgreSQL constraint to `409 username_unavailable`.
- A profile row does not have to exist in `user_preferences`; the update uses an account-scoped upsert.

## Audio-quality option policy

The roadmap's General Settings mockup shows `Auto` and requires an editable audio-quality setting, but does not define a complete quality enum or bitrate behavior. As a **new product policy for preference metadata only**, this implementation accepts `Auto`, `Low`, `Medium`, and `High`, or JSON `null` to clear the preference. The options do **not** modify codecs, transcoding, or the streaming bitrate. Existing read-only profiles may continue returning legacy stored values (including test fixtures), because GET remains compatible. The React editor in SCRUM-359 must use exactly the same set.

## Username validation policy

A username must be a string with 1–64 Unicode code points after trimming; ASCII control characters are prohibited. Case-sensitive matching and the unique constraint remain unchanged. A username change does not change the account ID; previously issued valid tokens remain tied to that ID. A new login must use the changed username. Username-specific password reauthentication is not provided by the current API; requiring a fresh password/step-up flow would require an agreed separate contract and explicit security review, not an invented login mechanism in this PR.

## HTTP error policy

| Status | Error |
|---|---|
| 400 | `invalid_json`, `duplicate_field`, `invalid_profile_update`, `invalid_username`, `invalid_audio_quality_preference`, or `invalid_body` |
| 401 | Existing authorization denial (`Unauthorized`) |
| 404 | `profile_not_found` |
| 409 | `username_unavailable` |
| 413 | `body_too_large` |
| 415 | `unsupported_media_type` or `unsupported_content_encoding` |
| 500 | `internal_error` (no SQL or credential details) |
| 503 | `authentication_unavailable` when revocation infrastructure fails |

All PATCH responses use JSON and `Cache-Control: no-store`. Request bodies are limited to 16 KiB. Duplicate top-level JSON keys are rejected, including escaped duplicate key spellings. `Content-Type: application/json` optionally permits a UTF-8 charset parameter.

## Verification gates

1. Run the focused repository, route, and existing profile tests.
2. Run `cd server && npm test` for full backend regressions.
3. Run `cd client && npm run test:run` to ensure shared auth/profile interactions remain sound even without frontend changes.
4. Run the reproducible PostgreSQL/HTTP integration smoke: `node --env-file=database/.env.test server/scripts/scrum358-postgres-http-smoke.mjs soundwave_allison_test`. The November 16 run passed real login, persisted updates, duplicate-username rejection, transaction rollback, token revocation, and disposable-account cleanup. SCRUM-223 and SCRUM-243 provide additional independent testing and CI verification.
5. Review the `git diff`, ensure `git diff --check` is clean, and request peer review before merging.

No database schema migration is required for these two existing fields. No passwords, JWTs, or connection secrets should appear in logs or screenshots.
