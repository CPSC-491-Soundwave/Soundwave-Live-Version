# CM-T32 / SCRUM-213 — Midterm Contract-Change and Regression Triage

**Owner:** Christian McGowan

**Prepared:** October 15, 2026

**Status:** Change-impact traceability drafted; mandatory 30-minute, two-role exploratory session has **not yet been performed or evidenced**. The session log below is intentionally blank.

**Midterm:** October 22, 2026. **Development freeze reference:** October 15, 2026; coordinate fixes and rechecks with the owning teammate.

## Methodology and scope

Use change-impact analysis, requirements-to-test traceability, time-boxed exploratory integration testing, defect-severity triage, and blocker retesting. This review verifies that login, search, shared authorization, and playback contracts work together; it does not duplicate Emmanuel's automated login-to-play journey or Matthew's streaming implementation.

## Key contract changes and feature owners

| Contract or change | Evidence / reference | Primary owner / boundary |
| --- | --- | --- |
| Signed JWT principal `{ userId, role, jti, exp }`, active/revoked/expired session responses | `docs/session-revocation-authorization-adr.md`; `server/src/auth/*` | Christian — shared security |
| Frontend session invalidation using the token associated with a request | `client/src/App.jsx`; `client/src/components/SessionStatus.jsx` | Christian shared session-status integration; Emmanuel login/playback integration |
| Search selection forwarded to shared playback | `client/src/App.jsx`, `client/src/App.search-playback.test.jsx` | Emmanuel — frontend integration; catalog/search owner must confirm their API contract |
| `POST /api/tracks/:id/media-access` returns `204` and a media cookie for authorized session | `client/src/components/PlaybackBar.jsx`; `server/src/media/media-access.handler.js` | Emmanuel frontend consumption; Matthew media access and streaming backend |
| Media cookie is short-lived, track-bound and denied after source JWT revocation | `server/src/media/media-ticket.js`; `server/test/media-access.app.test.js` | Matthew — media ticket/stream; Christian — revocation service |
| Player lifecycle and errors changed after the initial media-access integration | Player update merged as PR #124; `client/src/components/PlaybackBar.jsx` | Matthew / playback feature owner; verify with team |

## Five-path requirements-to-test traceability matrix

Status differentiates automated evidence from **manual exploration still pending**.

| ID | Integration path / expected behavior | Owner(s) | Existing evidence | Manual status |
| --- | --- | --- | --- | --- |
| P1 | Login as user, then search catalog; session persists and search results appear | Emmanuel (login/UI) plus search/catalog feature owner | `client/src/App.search-playback.test.jsx`; login and search route tests under `server/test` | Pending 30-min exploratory session |
| P2 | Search for playable track, select, receive `204` on protected media access, then play or show controlled stream error | Emmanuel (UI), Matthew (media/player), catalog owner | `client/src/App.search-playback.test.jsx`; `server/test/media-access.app.test.js`; `client/src/components/PlaybackBar.test.jsx` | Pending browser playback verification |
| P3 | Logout invalidates account/library and previously issued media access; no new media ticket | Christian (JWT/logout); Matthew (media ticket) | New `server/test/cross-feature-authorization.test.js` 1/1 pass; `server/test/protected-revocation-routes.test.js` | Pending browser/API exploratory observation |
| P4 | `user` cannot access **test-only** admin policy (`403`); `admin` is allowed; no verified production admin-only endpoint | Christian (shared role policies) | `server/test/request-authorization.test.js`; no production admin-only route identified in inspected source | Pending fixture-based two-role execution / team clarification |
| P5 | Expired JWT receives `401`; client does not maintain an invalid session or incorrectly clear a newer session | Christian (session UI/shared auth); Emmanuel (login/playback UI) | `server/test/revocation-auth.test.js`; `client/src/App.session-status.test.jsx`; `client/src/App.session-race.test.jsx` | Pending controlled expiration/manual feedback observation |

**Coverage warning:** Test-file presence is not evidence that the entire browser flow was manually exercised. A successful `POST /media-access` is also not equivalent to successful playback of audio bytes. P4 is a test-policy verification, **not a production administrator page**.

## Automated verification already executed

**Environment:** WSL Soundwave checkout, Node/npm local tests. The new cross-feature server test uses an in-memory revocation fixture and no PostgreSQL database; no standalone PostgreSQL integration check was executed as part of Block 7. Frontend automated tests use their configured mocks/test DOM rather than a live browser against a running backend.

- `cd client && npm test -- --run`: **97/97 pass**, 19 test files (before adding cross-feature server test).
- `cd client && npm run lint`: pass.
- `cd client && npm run build`: pass.
- `cd server && npm test`: **223/223 pass** after adding cross-feature test.
- `cd server && npm run test:auth`: **95/95 pass** (subset of backend; cross-feature file is not in this dedicated script).
- `cd server && node --test test/cross-feature-authorization.test.js`: **1/1 pass**.
- `cd server && node --test test/request-authorization.test.js test/search-routes.test.js`: **20/20 pass** (test-only administrator-policy outcomes plus guest-accessible Search route).
- **Live browser plus real database integrated demonstration:** Not evidenced here.

## 30-minute exploratory test charter — TO EXECUTE

**Required setup:** Team-approved local or demo environment, known playable track fixture, two role identities (`user` and `admin`) or a documented role-policy test fixture, no real passwords or tokens recorded. Obtain a safe method for forcing an expired test session without leaking credentials or altering a teammate's persistent database.

**Record before starting:** Date/time zone: ______; tester: ______; URL or localhost origin: ______; application commit: ______; browser/version: ______; backend/database fixture: ______; roles used (names only): ______; evidence link/location: ______.

| Elapsed time | Activity | Expected observations | Actual result / evidence (fill only after testing) |
| --- | --- | --- | --- |
| 00:00–05:00 | Confirm environment, roles, login and search fixtures | Demo environment loads; user and admin role fixtures identified | **NOT EXECUTED** |
| 05:00–10:00 | User login → Search (P1) | Valid session; search renders expected catalog results | **NOT EXECUTED** |
| 10:00–15:00 | Search → protected playback (P2) | Media-access handshake precedes streaming; audio works or precise failure recorded | **NOT EXECUTED** |
| 15:00–20:00 | Logout → account/media reuse (P3) | Revoked credentials receive `401`; previously issued media ticket rejected | **NOT EXECUTED** |
| 20:00–25:00 | Regular-user/admin permission comparison (P4) | Test policy rejects user (`403`) and allows admin; record fixture versus real UI | **NOT EXECUTED** |
| 25:00–30:00 | Expired-session feedback (P5) and defect triage | Controlled expiry → `401`, session invalidation; record untestable paths and blockers | **NOT EXECUTED** |

**Session start:** ______  **Session end:** ______  **Elapsed minutes:** ______  **Completed by:** ______

**User-role scenario actually executed:** ______  **Administrator-role scenario actually executed:** ______

**Paths not executable and why:** ______

**Evidence links (screenshots, sanitized console/network log, test run):** ______

## Defect and blocker triage register

There are no confirmed defects from the automated evidence listed above. **Do not treat unexecuted exploratory cases as passing.**

| Defect/Jira link | Path | Reproduction steps | Expected vs actual | Severity | Owning teammate | Retest before Oct 22 | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None recorded | — | — | — | — | — | — | Pending exploratory session |

**Severity convention:** Blocker = demonstration cannot continue or authorization bypass exposes protected data; High = critical login/search/playback path fails with no viable workaround; Medium = degraded path with viable workaround; Low = noncritical cosmetic/docs issue. Assign the owning feature team member and Jira/PR link for each confirmed defect; seek team approval for any fix after the freeze.

## Outstanding risks and completion evidence

- **Open requirement:** 30-minute exploratory session not performed or logged; at least two role scenarios not yet evidenced.
- **Open environment dependency:** Actual user/admin fixtures, safe expired-session setup, and browser playback fixture must be confirmed by the team.
- **Open evidence requirement:** Add real defect links, retest results, reviewer feedback, and any October 22 blocker-resolution evidence after they exist.
- **Verified automated status:** Baseline 97 frontend pass; 223 backend pass, including one cross-feature assertion; 95 dedicated security checks pass.
- **Teammate review approval:** Pending. Add the PR and reviewer URL when confirmed.

## Review sign-off

**Reviewer:** ______  **Review date:** ______  **Review URL:** ______

**Final midterm-triage status:** **IN PROGRESS — automated regression green; manual session and reviewer sign-off still outstanding.**
