# Sprint 3 Midterm Security and Integration Code Review (SCRUM-209 / CM-S3-07)

**Reviewer / owner:** Christian McGowan

**Review date:** October 15, 2026

**Review type:** Retrospective teammate-PR security/integration review and current-`main` contract inspection

**Code baseline inspected:** `12cfb97` (`origin/main` after a fast-forward onto `christian-dev`)

**Assessment:** No confirmed midterm-blocking security contract violation in the inspected code. Browser-level rehearsal and GitHub review evidence remain outstanding as noted below.

## 1. Scope and review sources

This review provides the technical verification and documentation portion of `SCRUM-209` (CM-S3-07). The Jira issue URL must be added once verified. The goal is to assess the October 22 midterm's login, search-to-playback, session revocation, and protected-media integration without duplicating other teammates' feature ownership.

- **Primary teammate change reviewed:** [PR #119](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/119), Emmanuel's protected-playback/client-session integration, already merged when this inspection was performed.
- **Later playback change present in the checked-out code:** [PR #124](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/124), including the event-driven player refactor. This document assesses the *current merged behavior*; it is not a full review of every line in PR #124.
- **Security contract reference:** `docs/session-revocation-authorization-adr.md` (SCRUM-208); shared principal `{ userId, role, jti, exp }` and revocation-aware authorization.
- **Code inspected:** `client/src/App.jsx`, `client/src/components/PlaybackBar.jsx`, `client/src/playback/playback.js`, `server/src/media/media-access.handler.js`, `server/src/media/media-ticket.js`, `server/src/app.js`.
- **Tests identified:** `server/test/media-access.app.test.js`, plus the complete frontend/backend/authentication test runs below.

**Review limitation:** PR #119 was already merged before this examination; the document must not be represented as a pre-merge PR approval or as proof that a GitHub review comment was posted. Links to submitted review comments and independent approvals must be added once verified.

## 2. Inspection method

1. Synchronized the clean `christian-dev` working tree to `origin/main` using a fast-forward; confirmed `HEAD...origin/main` was `0 0`.
2. Reran the frontend, backend, dedicated security tests, frontend lint, and frontend build.
3. Traced token delivery from `App.jsx` to `PlaybackBar.jsx`, the `POST /api/tracks/:id/media-access` authorization handshake, and the subsequent `GET /api/tracks/:id/stream` media load.
4. Inspected the backend's shared authorization, signed media ticket, cookie attributes, revocation lookup, and stream route's authorization order.
5. Located relevant test cases by exact test name; their individual assertions were **not separately audited** during this pass.

## 3. Verified integration contracts and code evidence

| Contract / area | Observed implementation | Evidence | Assessment |
| --- | --- | --- | --- |
| Login/session handoff | `App` passes its `accessToken` and `onSessionInvalidated` callback to `PlaybackBar`. The callback only clears a session when the invalidated token still matches the current token. | `client/src/App.jsx`, around lines 48-57; `client/src/components/PlaybackBar.jsx`, around lines 17-20, 323-326 | Compatible with the shared client-session boundary in inspected code. |
| Playback authorization before audio loading | `PlaybackBar` posts the bearer token to `/api/tracks/:id/media-access` and requires HTTP `204` before calling `loadTrack(metadata.id, ...)`. | `client/src/components/PlaybackBar.jsx`, around lines 101-115, 214-240 | Pass. |
| `401` vs `403` vs `503` | `401` unloads audio and invalidates only the matching session; `403` denies playback without clearing the login; `503` reports temporary authentication unavailability without clearing the login. All paths return before `loadTrack`. | `client/src/components/PlaybackBar.jsx`, lines 142-233 | Pass for inspected branches. |
| Shared server authorization | The media-access handler calls `authorizeRevocableRequest` with `allowedRoles: ["user", "admin"]`, stops when no principal is returned, and checks the track only after authentication. | `server/src/media/media-access.handler.js`, lines 64-92 | Pass. No production admin-only media policy is claimed. |
| Ticket issuance | A successful media-access request issues a track-bound media ticket, sends `Set-Cookie`, and responds `204` with `Cache-Control: no-store`. | `server/src/media/media-access.handler.js`, lines 93-110 | Pass. |
| Authentication before streaming | The `/stream` route calls `authorizeMediaStreamRequest` and returns before catalog/file access when denied. | `server/src/app.js`, lines 353-397 | Pass. |
| Bearer precedence | A request containing any Authorization header is handled by revocation-aware bearer authorization rather than falling back to a media cookie. | `server/src/media/media-access.handler.js`, lines 136-150 | Pass. |
| Ticket signature, track and time binding | Ticket signature uses HMAC-SHA256 and timing-safe comparison. Verification checks issuer, audience, purpose, source-session ID, exact track, and expiry. A ticket never outlives its source JWT. | `server/src/media/media-ticket.js`, lines 32-35, 83-214 | Pass for inspected source. |
| Cookie protections | Cookie has a track-specific `/stream` path, `Max-Age`, `HttpOnly`, and `SameSite=Lax`; `Secure` is added in production-mode configuration. | `server/src/media/media-ticket.js`, lines 217-247 | Pass, subject to deployment configuration. |
| Logout/revocation of issued tickets | Each *new* cookie-authenticated streaming request queries the revocation repository with `sourceJti`; a revoked source session is rejected. Repository failure produces `503` through the handler. | `server/src/media/media-ticket.js`, lines 284-319; `server/src/media/media-access.handler.js`, lines 153-185 | Pass; does not imply interruption of an already-open audio response. |

The client uses Howler/HTML5 Audio to request `/api/tracks/:id/stream` (`client/src/playback/playback.js`, around lines 63-77). The code inspection does **not** independently verify the browser's actual cookie delivery or live playback in the presentation environment.

## 4. Automated verification evidence

Executed locally on the `12cfb97` synced code baseline:

| Check | Result |
| --- | --- |
| Client tests, `cd client && npm test -- --run` | **97/97 passed**, 19 test files |
| Client lint, `cd client && npm run lint` | **Passed** |
| Client production build, `cd client && npm run build` | **Passed** |
| Backend tests, `cd server && npm test` | **222/222 passed** |
| Dedicated auth security gate, `cd server && npm run test:auth` | **95/95 passed**; included in the 222 backend tests |
| Git working tree after inspection | **Clean** |

Existing test cases in `server/test/media-access.app.test.js` are explicitly named:

- `valid media cookie preserves HTTP Range streaming`
- `existing Bearer Range streaming still works`
- `missing login JWT cannot issue media access`
- `media cookie cannot be used for another track`
- `revoking login session invalidates media cookie`
- `revocation outage returns 503`
- `expired ticket can be renewed`
- `bad Bearer token cannot fall back to media cookie`
- `media ticket cannot authenticate ordinary API routes`

These case names were located in the source and the full backend test run passed. Individual test bodies were not separately reviewed. Results are **local test evidence**, not proof that GitHub hosted CI or deployed browser playback passed.

## 5. Findings, recommended follow-up, and ownership

**Confirmed midterm-blocking issues:** None identified within the inspected auth/media boundary as of this review. This is a bounded finding; it is not a claim that the entire application has no defects.

| Open verification / potential integration risk | Current status | Suggested responsible owner(s) | Recommended verification |
| --- | --- | --- | --- |
| Live login -> Search selection -> protected playback, including browser cookie delivery to HTML5 Audio | **Not manually verified in this review**; not a confirmed blocker | Emmanuel: frontend/search/playback integration; Matthew: media/ticket streaming; Christian: auth contract consultation | Rehearse on the actual midterm environment and capture pass/fail evidence. |
| Logout after a ticket has been issued -> subsequent new stream request denied | Source and named automated test found; browser behavior **not manually verified** | Matthew: stream/ticket; Christian: revocation integration | Run a browser-based logout/retry scenario; report whether a new stream request receives `401`. |
| Already-open stream after revocation | Not inspected or verified; the observed per-request check does not prove mid-response termination | Matthew: streaming behavior; Christian: security policy consultation | Decide and document expected policy for in-progress streams before claiming immediate stoppage. |
| Authentication service outage during playback initialization | Code path handles `503`; deployment simulation **not performed** | Emmanuel: error presentation; Christian: authorization service; Matthew: stream handler | If feasible, rehearse a controlled fail-closed response and confirm no fresh media data is authorized. |
| GitHub review links and independent approvals for Christian's merged implementation PRs | **Not established from the local checkout** | Christian: collect links; assigned teammate reviewer(s): provide substantive review | Link verified GitHub reviews and approvals to `SCRUM-209` before marking the ticket complete. |

Any reproducible blocker discovered during rehearsal should be logged as a Jira issue with a reproduction case, expected/actual behavior, owner, affected PR, severity, and pre-midterm disposition. **No Jira blocker is invented by this report.**

## 6. Midterm-readiness status and Jira completion evidence

| SCRUM-209 acceptance item | Status as of October 15 | Needed evidence / follow-up |
| --- | --- | --- |
| Review security-sensitive teammate change and shared principal/auth contracts | **Source-level review documented** | This document and PR #119 reference. |
| Check authorization response differences and login/search/protected-playback integration | **Code paths inspected** | Sections 3-4; browser rehearsal still pending. |
| At least one substantive teammate PR review | **Not yet proven as GitHub review activity** | Post a substantive review/comment on PR #119 (labeled retrospective), or review an open teammate PR, then link the actual GitHub review/comment URL. |
| Review comments / verified checks documented | **Verified checks documented here** | Add comment permalink once posted. |
| Findings linked to affected PR(s) | **PR #119 and #124 linked in this document** | Link any later specific finding to its actual PR/Jira issue. |
| Blocking issues assigned owners | **No confirmed blocker at inspection time** | Owners suggested for unverified follow-up; assign a concrete owner if an issue is reproduced. |
| Independent peer review of Christian implementation PRs | **Not independently verified** | Record actual reviewer and review links for the relevant merged PRs. |
| Outstanding midterm blockers documented by October 15 freeze | **No confirmed blocker from reviewed scope; unverified rehearsals disclosed here** | Update issue references promptly if the rehearsal finds one. |
| Midterm-critical review status recorded | **Recorded in this document** | Link this document's own PR and its review into SCRUM-209. |

### GitHub and Jira evidence links to complete

- Teammate integration change: [PR #119](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/119).
- Later playback integration: [PR #124](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/124).
- **Substantive teammate-PR review/comment permalink:** Pending posting/verification.
- **Independent peer review of Christian's implementation PRs:** Pending verification of actual GitHub review links.
- **PR adding this review document:** Pending creation.
- **Jira issue:** `SCRUM-209` (insert the team's actual Jira URL when available).

## 7. Review conclusion

At the synced `12cfb97` baseline, the inspected session principal, bearer authorization, signed media-ticket issuance, ticket-to-session revocation, and authorization-before-streaming behavior are internally consistent. The local frontend/backend/security test baseline passed. **No verified auth/media integration defect is identified here as an October 22 midterm blocker.**

This is a deliberately limited technical assessment, not an end-to-end production certification. Browser playback rehearsal, posting an actual teammate-PR review, and verifying independent approvals of Christian's prior implementation PRs remain separate required follow-up activities.
