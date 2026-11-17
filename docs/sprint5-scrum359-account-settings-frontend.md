# SCRUM-359 — Sprint 5 Account Settings React Editor

- **Owner:** Christian McGowan
- **Jira:** SCRUM-359
- **Scope:** Frontend implementation only; consumes backend contract from SCRUM-357 and merged PATCH route from SCRUM-358.

## Changes

- Preserve the existing `/profile` route, app shell, login route, GET behavior, account summary, and display of legacy audio-quality metadata.
- Add a labeled Account Settings form to the current profile page for own-username editing and the `Auto`, `Low`, `Medium`, `High` audio-quality metadata preference. A clear action sends JSON `null`.
- Send a minimal `PATCH /account/profile` payload with `Authorization: Bearer <token>`; do not send user IDs, roles, email, passwords, or unchanged legacy preferences.
- Use the server's successful response to update the local account summary and form. A fresh page visit re-fetches profile via GET. Failures never assert that an update succeeded.
- Maintain an accessible status/error message, disabled in-flight controls, discard action, and distinct errors for duplicate names, expired/revoked tokens, service unavailability, and transport failures.
- Remount profile state when the session token changes so previous account details and pending save results cannot leak into the next session. Abort in-flight PATCH on unmount.
- Keep audio quality clearly labeled as **saved metadata only**, not a streaming bitrate or codec control.

## Product/API boundaries

- Username accepts 1–64 Unicode code points after trimming and rejects ASCII control characters; the PostgreSQL uniqueness check remains authoritative.
- The server's supported audio-quality values are `Auto`, `Low`, `Medium`, `High`, and JSON `null` to clear. Existing GET may contain legacy values. The editor shows a legacy value without rewriting it during unrelated username updates.
- Username changes use a valid unrevoked access token; fresh-password reauthentication is not implemented by the existing backend contract. Security review should determine whether a future step-up flow is needed.
- Email/password editing, audio transcoding, backend changes, and extra settings are out of scope.
- SCRUM-223, SCRUM-224, and SCRUM-243 separately own verification matrix, exploratory accessibility review, and isolated CI end-to-end smoke. This PR adds focused React regression tests but does not duplicate their deliverables.

## Reproducible verification

```bash
cd client
npm run test:run -- src/pages/Profile.test.jsx src/pages/ProfileEditor.test.jsx
npm run test:run
npm run lint
npm run build
```

A manual review should include login -> `/profile` -> change username -> save -> reload and confirm persistence; changing the saved preference and clearing it; invalid/duplicate username handling; and logout/login with another account. Use a disposable account and the isolated local test database for live demonstrations.

## Evidence to capture

- React settings form with current account and editable fields.
- Username/preference save success and fresh GET after navigation or reload.
- Duplicate-name error and revoked-session error when safe to simulate.
- Frontend test, lint, build output and GitHub Actions checks from the SCRUM-359 PR.

## Verified implementation results

Verified locally on November 16, 2026:

- Focused Profile and Account Settings tests: 18 passed, 0 failed.
- Complete frontend suite: 226 passed, 0 failed, across 41 test files.
- ESLint: passed with exit code 0.
- Vite production build: passed with exit code 0.
- Browser: Account Settings form rendered under `/profile`.
- Browser: Duplicate username displayed the expected conflict error.
- Client-side username control-character validation was regression tested.
- Git whitespace verification: passed before staging.

The duplicate-username screenshot verifies the displayed error.
A browser Network-tab status of 409 and additional positive-save
demonstrations should be recorded separately when observed.

The audio-quality control saves metadata only; it does not alter
streaming bitrate or codec behavior.
