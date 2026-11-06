# SCRUM-242 — Playback and Seek CI Regression Gate

Project: Soundwave — CPSC 491-05
Owner: Christian McGowan
Sprint: Sprint 4
Branch: christian-dev

## Objective

Provide an independent, automated CI gate for
Christian-owned playback transport, seek controls,
progress updates, and playback lifecycle behavior.

## Implementation

Workflow:
.github/workflows/ci.yml

Job:
playback-seek-regression

Display name:
Playback and Seek Regression (SCRUM-242)

Command:
cd client && npm run test:playback-seek

## Automated Coverage

SCRUM-309:
- Duplicate Play/Pause transport protection.
- Pending transport command handling.

SCRUM-310:
- Actual media duration and seek position.
- Seek control boundaries and player synchronization.
- Real playback progress callback behavior.
- Progress cleanup after track replacement/unload.

SCRUM-221:
- Failed Pause command behavior.
- Play/seek/pause/resume/finish/replay lifecycle.
- Late buffering callbacks after completion.
- Session removal during active playback.

The targeted suite contains 21 existing test cases
across four test files.

## CI Methodology

1. Check out the pull request revision.
2. Configure the project's Node.js CI environment.
3. Install locked client dependencies with npm ci.
4. Run the dedicated playback/seek test command.
5. Fail the job if any test command fails.

The job runs on pull requests targeting main and
pushes to main through the existing workflow triggers.

The check is separate from the general Client Tests
and Search-to-Play Regression jobs.

## Ownership Boundaries

This work does not change:
- Emmanuel's Search-to-Play regression tests.
- Matthew's media streaming or playback-event backend.
- Allison's buffering monitoring implementation.
- Konner's queue/navigation implementation.
- Database integrity and migration testing.

## Test Environment

Uses deterministic Vitest tests and mocked playback
interfaces. A live backend, database, browser, or
audio fixture is not required for this CI gate.

Real-browser verification is documented separately
under SCRUM-222.

## Verification Evidence

Local verification date: November 5, 2026
Verified against merged main baseline: cbd2136


Local targeted tests: PASS — 21/21 tests across 4 files
Full frontend regression: PASS — 202/202 tests across 39 files
ESLint: PASS — npm run lint
Production build: PASS — npm run build
GitHub Actions CI job: PASS - PR #163
GitHub PR number: #163 - merged into main

The GitHub job must pass before SCRUM-242 is
considered verified in the pull request.

Adding a job does not automatically make it a
branch-protection required status check. Repository
administrators may configure that separately.
