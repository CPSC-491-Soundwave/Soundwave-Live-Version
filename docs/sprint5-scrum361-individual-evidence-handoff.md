# SCRUM-361 - Sprint 5 Individual Engineering Evidence and Handoff

- **Owner:** Christian McGowan
- **Course/project:** CPSC 491-05 / Soundwave
- **Evidence date:** November 19, 2026
- **Jira:** https://491group1.atlassian.net/browse/SCRUM-361
- **Repository:** https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version
- **Status:** Handoff draft ready for final links, review, and submission. Do not mark the release GO on the basis of this index.

## 1. Individual Sprint 5 scope and merged work

The following seven distinct engineering/testing deliverables are confirmed merged in GitHub by the recorded user-provided PR pages and prior terminal evidence. They represent Christian's authored work rather than the entire team's release acceptance.

| Jira | Deliverable | Merged PR | Attributable evidence |
| --- | --- | --- | --- |
| [SCRUM-357](https://491group1.atlassian.net/browse/SCRUM-357) | Account Settings API, data, and security contract | [#172](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/172) | `docs/sprint5-account-settings-update-contract.md` |
| [SCRUM-358](https://491group1.atlassian.net/browse/SCRUM-358) | Authorized, transactional Account Settings profile update API | [#173](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/173) | `server/scripts/scrum358-postgres-http-smoke.mjs`; app, repository, and server tests |
| [SCRUM-359](https://491group1.atlassian.net/browse/SCRUM-359) | React Account Settings editor and saved-preference UI | [#174](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/174) | `client/src/pages/ProfileEditor.jsx` and corresponding component tests |
| [SCRUM-223](https://491group1.atlassian.net/browse/SCRUM-223) | Invalid-input and authorization security matrix | [#182](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/182) | `docs/sprint5-scrum223-account-security-matrix.md`; PostgreSQL negative-test harness |
| [SCRUM-224](https://491group1.atlassian.net/browse/SCRUM-224) | Manual Account Settings accessibility review | [#186](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/186) | `docs/sprint5-scrum224-account-settings-accessibility-review.md` + 5 screenshots |
| [SCRUM-243](https://491group1.atlassian.net/browse/SCRUM-243) | Isolated GitHub Actions Account Settings HTTP/PostgreSQL smoke workflow | [#187](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/187) | `.github/workflows/scrum243-account-settings-smoke.yml` + CI design report |
| [SCRUM-360](https://491group1.atlassian.net/browse/SCRUM-360) | Integrated regression testing and individual Account Settings dry-run | [#188](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/188) | `docs/sprint5-scrum360-integration-regression-and-dry-run.md` + 6 screenshots |

**Remaining Sprint 5 administrative/evidence tasks:** [SCRUM-356](https://491group1.atlassian.net/browse/SCRUM-356) (shared group release-readiness document updated and Jira comment submitted by Christian; team-wide sign-off remains separate) and this [SCRUM-361](https://491group1.atlassian.net/browse/SCRUM-361) (handoff and submission).

## 2. Exact integration verification record

**Regression tested commit:** `181fcb0`, merged SCRUM-243 PR #187.
**Later synchronized base:** `853761c`, merged SCRUM-360 PR #188; not a replacement for the earlier test-run SHA.

| Check | Exact command (from repo root) | Recorded outcome |
| --- | --- | --- |
| Node backend regression | `( cd server && npm test )` | **PASS:** 315/315 tests; 12 suites; exit code 0 |
| React client sequential | `( cd client && npm run test:run -- --no-file-parallelism )` | **PASS:** 267/267 tests; 48/48 files; exit code 0 |
| React client default parallel | `( cd client && npm run test:run )` | **PASS:** 267/267 tests; 48/48 files; exit code 0 |
| Focused account-profile tests | `( cd client && npm run test:run -- src/pages/Profile.test.jsx src/pages/ProfileEditor.test.jsx )` | **PASS:** 18/18 tests in 2 files, observed after PR #184 integration on `49f84b6` |
| Account Settings lint | `( cd client && npm run lint )` | **PASS:** exit code 0 on `49f84b6` |
| Account Settings build | `( cd client && npm run build )` | **PASS:** exit code 0 on `49f84b6` |

**849/849 test executions** = 315 backend + 267 client sequential + 267 client parallel. The 267 client tests ran twice, so 849 is an execution count, **not** a count of distinct test cases. Historical intermittent favorites/playback parallel failures were **not reproduced** in the one recorded successful parallel run; stability across repeated runs has not been established.

## 3. Executed manual evidence and screenshots

### SCRUM-224 - scoped Account Settings accessibility review

Five observations recorded as PASS for the tested scope: keyboard focus, accessible names/descriptions, visible validation feedback, successful save feedback, and responsive visual usability. See the detailed limitation notes for untested screen-reader announcements and formal reflow/zoom checks.

- Report: [`docs/sprint5-scrum224-account-settings-accessibility-review.md`](sprint5-scrum224-account-settings-accessibility-review.md)
- Images: [`docs/evidence/scrum224/`](evidence/scrum224/), five original PNG evidence assets.
- Merged PR: [#186](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/186).

### SCRUM-360 - individual integrated Account Settings demonstration

Six scenarios recorded as passing for the observed/reported scope on November 19, 2026: (D1) authenticated Account Profile; (D2) saved settings with HTTP 200; (D3) retained saved preference after reported refresh; (D4) overlength-username validation; (D5) restored form state after reported Discard; and (D6) Account Settings usable alongside active playback. Still images show the resulting states and do not establish all underlying interactions independently.

- Report: [`docs/sprint5-scrum360-integration-regression-and-dry-run.md`](sprint5-scrum360-integration-regression-and-dry-run.md)
- Images: [`docs/evidence/scrum360/`](evidence/scrum360/), six screenshots extracted from the supplied demo PDF.
- Merged PR: [#188](https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/188).

## 4. CI/CD proof and release provenance

### SCRUM-243: Dedicated Account Settings PostgreSQL/HTTP Smoke

- Workflow: `.github/workflows/scrum243-account-settings-smoke.yml`
- Jira: SCRUM-243
- Implementation: merged PR #187
- Run: https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/actions/runs/44637342398
- Trigger: `pull_request`, PR #187 from `christian-dev`
- Conclusion: **SUCCESS**
- Total duration: 43 seconds
- Job: Account Settings PostgreSQL + HTTP Smoke - **PASS**
- Artifacts: 1 uploaded; exact artifact name not recorded
- Exact run SHA: not visible in supplied screenshot; do not infer it

This run verifies that the dedicated smoke workflow executed
successfully on the PR. It is distinct from the general CI pipeline.

### General Soundwave CI

- Workflow: `.github/workflows/ci.yml`
- Run: https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/actions/runs/44642342466
- Branch: `main`
- Commit: `853761c`
- Conclusion: **SUCCESS**
- Total duration: 1 minute 8 seconds
- Artifacts: 4 reported
- Passing checks include server tests, client tests,
  client lint/build, authentication security, database tests,
  media regression, and other project integration checks.

These records establish successful observed CI runs.
They do not independently establish the final Sprint 6
release-candidate status or team-wide release approval.

## 5. SCRUM-356 - shared group release-readiness definition

Christian updated the team's shared **Sprint 5 - Release Readiness Definition** with his actual Sprint 5 PRs, backend/client regression, Account Settings demo and screenshot evidence, individual security/accessibility verification, and residual risk assessment. This is the **existing group artifact**, not a duplicate individual release-readiness report.

**Authoritative shared document URL:** https://docs.google.com/document/d/1PFj05S27sNlINpJrT1mcF38VBR940Kkf6IJs9mMoXLg/edit?usp=sharing
**SCRUM-356 issue:** https://491group1.atlassian.net/browse/SCRUM-356
**Team review / comment / acceptance evidence:** Christian updated the group document and posted his SCRUM-356 Jira comment on November 19, 2026. Independent team approval remains unverified.

The group document must continue to distinguish **supporting Sprint 5 Account Settings readiness** from **the planned Sprint 6 administrator upload -> catalog -> playback final demonstration**, which has not been implemented and independently verified in the evidence available here. A whole-team GO/NO-GO declaration requires the team's release gates, selected release SHA, and independent demonstrations.

## 6. Open risks, boundaries, and release handoff

| Risk or limitation | Confirmed observation | Remaining disposition / owner |
| --- | --- | --- |
| Historical client parallel flakiness | Earlier favorites/playback-related intermittent failures; one latest parallel run passed 267/267 | Reproduce/log if it recurs; coordinate with responsible frontend owner. Do **not** claim permanently fixed. |
| `playback_events` migration | Local PostgreSQL error `42P01` resolved by applying the already-authored migration; table existence rechecked | Team/release operator verifies migrations in each release environment; successful event write after migration not separately established. |
| Saved audio-quality preference | `High` saved and retained as Account Settings metadata | Never claim the value changes streaming codec or bitrate. |
| Sensitive username-change policy | Authorized profile update works; explicit reauthentication requirement not established by current agreed security policy | Security policy review before final release; not labeled a confirmed vulnerability. |
| Sprint 4 role downgrade / old JWT observation | A prior test-only guard accepted an old admin JWT until revoked | Check the actual release path before claiming immediate privilege-downgrade protection; security owner to disposition. |
| Sprint 6 main scenario | Admin upload -> catalog -> playback is a proposed future major demo | Implement, test/secure, merge and independently rehearse during Sprint 6. |
| Group-wide readiness | Member scripts and team release-gate sign-offs remain separate | Only the group may approve a common release candidate and final GO/NO-GO. |

## 7. Sprint 5 handoff and completion checklist

- [x] Seven individual implementation/testing evidence PRs merged: #172, #173, #174, #182, #186, #187, #188.
- [x] Integrated regression (backend + sequential client + default parallel client) recorded on `181fcb0`.
- [x] Five scoped manual accessibility observations and linked screenshot assets recorded.
- [x] Six integrated Account Settings demo observations and linked screenshot assets recorded.
- [x] Shared release-readiness document updated with Christian's evidence (operator reported).
- [x] Shared document URL recorded in this handoff; SCRUM-356 Jira comment submitted. Include the link in the final course submission.
- [x] Capture actual dedicated SCRUM-243 successful Actions run URL and artifact count (1); artifact name and exact SHA not recorded.
- [ ] Obtain/record group acknowledgment for Christian's SCRUM-356 contribution; preserve overall group readiness as pending.
- [ ] Obtain reviewer approval and merge the SCRUM-361 documentation PR, if the team requires a repo record.
- [ ] Link SCRUM-361 and the full Sprint 5 evidence index in the individual course submission and mark Jira Done per team workflow.

**Suggested personal status:** Sprint 5 Account Settings implementation and scoped supporting validation completed; release-candidate certification and the Sprint 6 admin-upload scenario remain pending shared milestones. No claim of comprehensive WCAG compliance or whole-product production readiness.
