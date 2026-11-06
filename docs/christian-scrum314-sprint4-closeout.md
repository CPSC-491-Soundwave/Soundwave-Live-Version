# SCRUM-314 — Sprint 4 Integration and Evidence Closeout

**Project:** Soundwave — CPSC 491-05
**Owner:** Christian McGowan
**Sprint:** Sprint 4
**Jira:** SCRUM-314
**Branch:** christian-dev
**Verified baseline:** c96563a
**Verification date:** November 5, 2026
**Status:** Local regression and browser smoke PASS; PR pending.

## 1. Purpose and Scope

Consolidate Christian McGowan's Sprint 4 implementation,
testing, CI verification, security assessment, integration
results, known limitations, and team handoff evidence.

This closeout documents verified work without modifying
production features or duplicating teammate responsibilities.

## 2. Jira and GitHub Traceability

| Jira | Completed work | Merged PR |
|---|---|---|
| SCRUM-307 | Sprint 4 playback and CC6.3 baseline | #139 |
| SCRUM-308 | CC6.3 authorization downgrade assessment | #144 |
| SCRUM-309 | Duplicate Play/Pause command protection | #152 |
| SCRUM-310 | Seek/scrub, progress and responsive controls | #154 |
| SCRUM-221 | Playback lifecycle integration testing | #156 |
| SCRUM-222 | Manual browser playback verification | #156 |
| SCRUM-242 | Playback/seek GitHub Actions regression gate | #163 |
| SCRUM-314 | Final Sprint 4 evidence closeout | Pending PR |

Repository:
https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version

Jira:
https://491group1.atlassian.net/browse/SCRUM-314

Merged PRs are verified through repository history.
Actual Jira workflow statuses require separate confirmation.

## 3. Integrated Baseline and Automated Verification

Integration baseline: c96563a
Latest included merge: PR #163
Branch comparison HEAD...origin/main: 0 ahead, 0 behind.
Original WSL distribution: Ubuntu.

| Verification | Actual result | Exit code |
|---|---|---|
| Playback/seek targeted regression | 21/21 passed, 4 files | 0 |
| Complete frontend test suite | 202/202 passed, 39 files | 0 |
| Frontend ESLint | PASS | 0 |
| Frontend Vite production build | PASS | 0 |
| Complete backend Node tests | 257/257 passed, 12 suites | 0 |

Local verification commands:
- cd client && npm run test:playback-seek
- cd client && npm run test:run
- cd client && npm run lint
- cd client && npm run build
- cd server && npm test

Detailed execution logs:
- /tmp/soundwave-b4-playback-seek.log
- /tmp/soundwave-b4-client-tests.log
- /tmp/soundwave-b4-client-lint.log
- /tmp/soundwave-b4-client-build.log
- /tmp/soundwave-b4-server-tests.log

The 21 targeted tests are included within the 202
frontend tests; they are not 21 additional unique tests.

Successful regression tests do not independently prove
every production security control is effective.

## 4. Browser Verification

SCRUM-222 recorded eight manually verified scenarios:

| ID | Browser scenario | Result |
|---|---|---|
| B5-M01 | Audible Play, Pause and Resume | PASS |
| B5-M02 | Seek forward/backward while playing | PASS |
| B5-M03 | Seek while paused | PASS |
| B5-M04 | Finished state and audible replay | PASS |
| B5-M05 | Replace active track without overlapping audio | PASS |
| B5-M06 | Keyboard playback and seeking | PASS |
| B5-M07 | Responsive mobile viewport, 375 x 667 | PASS |
| B5-M08 | Browser console and network sanity check | PASS |

Previous SCRUM-222 manual result: 8/8 PASS.
Post-merge SCRUM-314 smoke result: PASS, 5/5.

User-confirmed on November 5, 2026 against the
integrated Sprint 4 application.

| Test | Verification | Result |
|---|---|---|
| B4-S01 | Authenticated login | PASS |
| B4-S02 | Audible playback, pause and resume | PASS |
| B4-S03 | Seek updates time and audio position | PASS |
| B4-S04 | Logout closes session and stops playback | PASS |
| B4-S05 | No unexpected playback-related console errors | PASS |

These results were manually reported by the tester.
No screenshot or browser version was recorded.

Browser/version and desktop viewport were not recorded.

Source evidence:
docs/christian-scrum222-playback-browser-verification.md

## 5. GitHub Actions Evidence

SCRUM-242 was merged through GitHub PR #163.

Dedicated CI job:
Playback and Seek Regression (SCRUM-242)

Command:
npm run test:playback-seek

The dedicated GitHub Actions check was reported
successful during PR #163 verification.

The job runs 21 existing tests independently from
the general client and Search-to-Play regression jobs.

This work did not remove teammate-owned CI checks,
change production code, or add new dependencies.

Adding a GitHub Actions job does not automatically
configure branch protection to require that check.

## 6. Outstanding CC6.3 Security Finding

Related Jira: SCRUM-308
Assessment: SW-S4-CC6.3 effective privilege removal

The isolated role-downgrade assessment found:

1. A user's database role changed from admin to user.
2. An existing signed JWT retained the old admin role.
3. The existing authenticated identity endpoint continued
   reporting the old token role.
4. A test-only admin authorization guard accepted the
   old token after the database role downgrade.
5. A newly issued user token was denied by that guard.
6. Explicit revocation of the old token caused denial.

Disposition: OPEN — remediation or risk decision required.

The assessment did not prove unauthorized access to
an existing production administrator-only endpoint.

Successful backend regression tests do not resolve
this finding.

Recommended team decision before privileged admin
functionality is introduced:

- Recheck persisted roles on privileged requests; or
- Revoke/invalidate sessions when roles change; or
- Explicitly document and approve a bounded token risk.

Any remediation needs an owner, Jira work item, and
fresh role-downgrade tests.

Original evidence:
docs/sprint4-b1-cc63-assessment-evidence.md

## 7. Known Limitations and Ownership Boundaries

### Media availability

Track 3005, Kontekst, is the known playable fixture.
Tracks 3001-3004 may contain catalog metadata but lack
playable media files.

One playable track does not prove all catalog records
have valid media references.

### Future feature work

Account Settings, administrative upload features,
broader UI improvements, and additional demo audio
remain subject to approved future sprint assignments.

No future feature is claimed as completed by SCRUM-314.

### Team coordination

Christian McGowan:
- Playback transport and seek/progress controls.
- Christian-owned playback verification and CI.
- CC6.3 role-downgrade assessment.

Allison Yu:
- Catalog/database integrity and buffering monitoring.

Emmanuel De Guzman:
- Authenticated Search-to-Play, retry/recovery,
  error handling and related diagnostics.

Konner Rigby:
- Queue/navigation and infrastructure recovery checks.

Matthew Choi:
- Protected media streaming, media protocol behavior
  and playback-event backend work.

New findings in teammate-owned components should be
reported to the appropriate owner instead of duplicated.

## 8. Acceptance and Handoff Checklist

- [x] Merged PR #163 integrated into local main baseline.
- [x] Local HEAD matches origin/main at c96563a.
- [x] Dedicated playback/seek tests: 21/21 passed.
- [x] Full frontend tests: 202/202 passed.
- [x] Full backend tests: 257/257 passed.
- [x] Frontend ESLint and production build passed.
- [x] Previous manual browser tests: 8/8 passed.
- [x] Dedicated GitHub Actions regression reported passing.
- [x] Open CC6.3 security gap documented accurately.
- [x] Known fixture limitations documented.
- [x] Team boundaries and future handoff documented.
- [x] Final post-merge browser smoke test: 5/5 PASS.
- [ ] SCRUM-314 closeout PR reviewed and merged.
- [ ] SCRUM-314 Jira workflow status confirmed.

## 9. Final Disposition

Local integration: PASS.
Frontend regression: PASS.
Backend regression: PASS.
Playback and seek CI: PASS.
Previous browser verification: PASS.
Post-merge browser smoke: PASS, 5/5.
CC6.3 effective privilege removal: OPEN.
Final documentation PR: PENDING.

The Sprint 4 implementation and automated verification
work is complete within the tested scope. This closeout
does not claim unresolved security findings are fixed.

Sprint 5-6 follow-up work must be reconciled with the
team's approved Jira backlog before implementation.
