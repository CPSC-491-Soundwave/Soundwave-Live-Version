# Soundwave Sprint 4 — Playback and CC6.3 Baseline

**Owner:** Christian McGowan  
**Jira:** [SCRUM-307](https://491group1.atlassian.net/browse/SCRUM-307)  
**Sprint:** October 29–November 5, 2026  
**Working branch:** `christian/s4-b0-security-playback-baseline`  
**Pinned source revision:** `93c17c4b55efd5bc9cd8a63b8cac826562baca82` (`origin/main` at B0 synchronization)  
**Status:** Source review documented; local test execution and PR review pending. This is not a claim that Sprint 4 security controls have passed.

## 1. Objective and ownership boundary

B0 establishes a reproducible baseline for Christian's original Sprint 4 feature: **Play/Pause/Resume/Skip handoff and seek reliability**, including control UI, player adapter and test infrastructure. It also defines the starting assumptions for Christian's separately owned **SOC 2-aligned CC6.3 role-privilege assessment** (SCRUM-308). No runtime behavior is changed by this document.

The primary implementation blocks are SCRUM-309 (transport reliability) and SCRUM-310 (seek/scrub). Previously created work covers independent testing (SCRUM-221 and SCRUM-222), dedicated playback CI (SCRUM-242) and evidence handoff (SCRUM-314). **Do not create another copy of those tickets.**

## 2. Revision and source inventory

The local terminal verified `christian-dev` fast-forwarded to `93c17c4`, then created the dedicated B0 branch, with no tracked or untracked modifications reported. These are terminal-observed Git facts, not test-execution results.

| Area | Current source | Inspection finding at pinned revision |
|---|---|---|
| Selection source of truth | `client/src/App.jsx` | `selectedTrackId` is App state; Search, Library and album selection callbacks feed it; App passes `trackId`, `accessToken` and `onSessionInvalidated` to PlaybackBar. |
| Transport component | `client/src/components/PlaybackBar.jsx` | Uses `loadTrack`, `playMusic`, `pauseMusic`, `unloadMusic` and `setMusicVolume`. Renders playing/paused/finished/ready status; Play/Pause handler waits for actual Howler `onplay` event. |
| Skip UI at baseline | `client/src/components/PlaybackBar.jsx` | Previous and Next buttons are rendered disabled. Queue selection/skip policy is not Christian's independent feature; Konner supplies the queue/next track decision. |
| Shared player adapter | `client/src/playback/playback.js` | Maintains a module-level Howler instance and loaded Track ID; `loadTrack` unloads the previous instance, and callback hooks surface playback events. |
| Seek API | `client/src/playback/playback.js` | `setMusicProgress(seconds)` exists, requires a loaded Howler instance and rejects non-finite or negative positions; its current implementation does not cap a position to actual track duration. PlaybackBar does not currently import this function or expose a seek slider. |
| Protected media consumer | `client/src/components/PlaybackBar.jsx` | Prepares access before loading audio. Handles 401, 403 and 503 as distinct outcomes; session invalidation callback is used on 401. Emmanuel owns consumer failure-anomaly monitoring, retry/cancellation policy and signals in CC7.2. |
| Role authorization | `server/src/auth/authorization.js` | Supports `user`/`admin` principal roles and distinguishes missing/invalid identity from allowed/forbidden role decisions. Role checking is separate from JWT validation. |
| Revocation-aware request guard | `server/src/auth/request-authorization.js`; `server/src/auth/revocation-auth.js` | Combines revocation-aware authentication with allowed-role checks and the 401/403/503 failure boundary. |
| Related test baseline | `client/src/components/PlaybackBar.test.jsx`; `client/src/App.search-playback.test.jsx`; `server/test/request-authorization.test.js`; `server/test/protected-revocation-routes.test.js` | Existing regression suites are available; existing test counts/results must not be represented as new Sprint 4 evidence. |

### Source links (pinned commit)

- [App selected-track handoff](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/blob/93c17c4/client/src/App.jsx)
- [PlaybackBar UI and control status](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/blob/93c17c4/client/src/components/PlaybackBar.jsx)
- [Howler adapter and existing seek function](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/blob/93c17c4/client/src/playback/playback.js)
- [Role decisions](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/blob/93c17c4/server/src/auth/authorization.js)
- [Request-level auth integration](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/blob/93c17c4/server/src/auth/request-authorization.js)
- [Revocation verification](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/blob/93c17c4/server/src/auth/revocation-auth.js)

## 3. Original implementation-plan contribution areas

| Original Sprint 4 contribution | Evidence/decision for Christian's work |
|---|---|
| Database/data modeling (conditional) | **No new database schema is planned at B0.** Current media transport state is client/Howler-owned. Reassess only if a written server-persistence contract requires it; Konner owns persistent queue data. |
| Backend API/services | Existing protected media endpoint is the server boundary; local play/pause/seek should use the current client adapter unless a separately approved server-side control contract emerges. No parallel command endpoint is justified from the current source alone. |
| Auth/security | Reuse server-authorized media access; a local button is not a privileged server action. CC6.3 independently assesses server-side role policy and effective privilege removal. |
| Streaming/media | Harden Play/Pause/Resume, track-replacement lifecycle, seek range handling and **response to a Konner-selected next Track ID**; do not implement queue ordering. |
| Frontend UI/UX | Improve the existing PlaybackBar control behavior and add an accessible seek/scrub interface in B2/B3. |
| Testing | Run existing baseline tests, then author additional model transitions in SCRUM-221 and manual seek cases in SCRUM-222 without counting the same cases twice. |
| DevOps | Implement focused playback/seek test invocation and CI visibility in SCRUM-242; avoid renaming/removing other owners' required checks. |
| Docs/metrics | Preserve this dated architecture baseline, explain control semantics and decisions, and link PR/CI/test evidence in SCRUM-314. |

**Boundary rule:** Christian controls response to a changed Track ID, but Konner remains the owner of choosing the next Track ID and maintaining queue invariants. Matthew owns media protocol/Range and playback-event writes; Allison owns data-reference/query semantics; Emmanuel owns protected-playback errors, retry policy and CC7.2 monitoring.

## 4. Specific B2/B3 risks to verify (hypotheses, not confirmed defects)

1. A second rapid Play/Pause command could be issued before the audio engine reports the first transition. Expected policy must be agreed and tested.
2. An async callback from Track A could affect transport state after Track B replaces it. Verify stale callbacks are ignored and old audio is unloaded.
3. Seek can currently pass nonnegative values greater than duration to Howler. Specify and test an approved clamp/no-op policy for unknown and known duration.
4. A new selected Track ID from Konner's queue must not cause overlapping audio, stale display, or a delayed seek against the previous Track ID.
5. Local control gestures must not be represented as newly authorized server actions; server-side protected media access remains authoritative.

## 5. CC6.3 starting point and assessment ownership

**Control:** `SW-S4-CC6.3`, owned by Christian, covering least privilege and effective role/privilege changes at the shared server guard.

- Supported role strings include `user` and `admin`. Missing/invalid principal, forbidden valid role and allowed role are differentiated by the shared authorization path.
- **Assessment hypothesis:** an already-issued signed token may continue to carry an earlier role even if a durable database role is downgraded. Determine actual accepted policy by using an isolated fixture; do not label this a vulnerability before executed evidence.
- **Test design for SCRUM-308:** at least eight principal × role-policy outcomes; forged role/body/header attempts; invalid/revoked JWT; dependency outage; role downgrade and old-token replay; expected-versus-actual matrix; separate real production routes from any test-only admin policy.
- A test-only admin guard is *not* proof that a production administrator endpoint exists. Report production privileged-route cases as Not Applicable/Blocked if absent.
- No screenshots or artifacts may expose signed tokens, cookies, passwords, media tickets or local secret values.

## 6. Baseline testing ledger — execution still required

| Evidence ID | Command run from repo | Actual outcome | Status |
|---|---|---|---|
| B0-CLI-01 | `cd client && npm run test:search-to-play` | Await local command output (counts and exit status) | NOT RUN |
| B0-CLI-02 | `cd client && npm run build` | Await local command output | NOT RUN |
| B0-SRV-01 | `cd server && npm run test:auth` | Await local command output (counts and exit status) | NOT RUN |
| B0-GIT-01 | `git rev-parse HEAD; git status --short --branch` | `93c17c4` and clean B0 branch observed before artifact creation | BASELINE OBSERVED |

No result is marked passing until the actual run is captured. If a command is blocked by local dependencies or a database fixture, record the blocker rather than inventing a pass.

## 7. B0 closeout checklist and next steps

- [x] Confirm the current development branch and base commit.
- [x] Identify the playback UI, adapter, selected-track handoff and security guard source files.
- [x] Record preliminary no-new-database/no-new-control-endpoint architecture decisions.
- [x] Identify concrete B2/B3 risks and teammate collision boundaries.
- [ ] Execute local client/server baseline commands and record results.
- [ ] Confirm tests correspond to the pinned revision and link logs or summarized counts.
- [ ] Commit this B0-only document in the B0 branch and open a PR referencing SCRUM-307.
- [ ] Obtain non-author review, required checks and PR/CI evidence; update SCRUM-307 with the link.

**Expected PR:** `docs(sprint4): establish playback and CC6.3 baseline (SCRUM-307)`.

**Evidence policy:** The PR describes source inspection and test design; it does not claim a SOC 2 audit, executed CC6.3 security tests, or completed B1/B2/B3 work. All actual test-result and review fields must be filled using observed evidence.
