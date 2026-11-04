# SCRUM-222 — Playback Browser Verification

**Project:** Soundwave — CPSC 491-05
**Owner:** Christian McGowan
**Sprint:** Sprint 4
**Related Jira:** SCRUM-221, SCRUM-222, SCRUM-310
**Date:** November 4, 2026
**Branch:** christian-dev
**Baseline main:** 1949c5d
**Overall manual result:** PASS — 8/8 user-confirmed browser checks

## 1. Scope

Verify real-browser behavior of Christian's shared playback
transport, progress, seek/scrub, and responsive controls.

The authenticated Search-to-Play setup follows Emmanuel's
existing `docs/midterm-e2e-runbook.md`.

Do not claim ownership of:
- Emmanuel's authentication/search-to-play E2E coverage;
- Matthew's protected stream or media-access implementation;
- Allison's buffering-monitor implementation;
- Konner's queue and navigation implementation.

## 2. Methodology

Automated React integration testing verifies state transitions.
Manual browser testing verifies actual audio playback, timeline
behavior, keyboard access, and responsive presentation.

Use a real playable media file. Track 3005, Kontekst, is the
known playable fixture. Tracks 3001-3004 may contain metadata
without playable media.

Do not record passwords, JWTs, cookies, private keys,
Authorization header values, or other credentials.

## 3. Automated Baseline

| Check | Actual | Result |
|---|---|---|
| SCRUM-221 focused tests | 4/4 | PASS |
| Full frontend regression | 190/190, 36 files | PASS |
| Frontend ESLint | No errors | PASS |
| Vite production build | Successful | PASS |

## 4. Browser Environment

Browser and version: Not recorded
Operating system: Windows with WSL development server
Desktop viewport: Not recorded
Mobile emulation viewport: 375 x 667
Backend health: HTTP 200
Test account: Local authenticated user; no credentials recorded
Playable track: 3005 — Kontekst
Test date/time: November 4, 2026; exact time not recorded

## 5. Manual Test Cases

### B5-M01 — Real audio Play/Pause/Resume

Steps:
1. Log into the local Soundwave application.
2. Select playable track 3005, Kontekst.
3. Press Play; listen and observe elapsed time.
4. Press Pause; observe audio and elapsed time.
5. Press Play again.

Expected:
- Audible playback begins after loading.
- Playing and Paused states reflect actual playback.
- Elapsed time advances while playing.
- Pausing stops audio and position advancement.
- Resuming continues without restarting from zero.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

### B5-M02 — Seek during active playback

Steps:
1. Start Kontekst.
2. Seek forward to approximately 1:00.
3. Seek backward to approximately 0:20.
4. Listen after each seek.

Expected:
- Seek slider and displayed position update.
- Actual audio jumps to the chosen position.
- Playback remains active.
- The selected track remains Kontekst.
- The real media duration is used, not the fixture's
  12.345-second catalog metadata.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

### B5-M03 — Seek while paused

Steps:
1. Pause the playing track.
2. Move the seek slider to a new position.
3. Wait several seconds without pressing Play.
4. Resume playback.

Expected:
- Seek updates the selected position.
- Paused state remains visible.
- No audio starts automatically after seeking.
- Resume starts at the new position.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

### B5-M04 — Completion and replay

Steps:
1. Start Kontekst.
2. Seek close to the end of the actual audio duration.
3. Allow audio to finish naturally.
4. Observe the player and press Play again.

Expected:
- Player displays Finished when audio ends.
- Pause is no longer presented as an active command.
- Replay starts playing the same track again.
- No duplicate playback or overlapping audio occurs.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

### B5-M05 — Track replacement stops old audio

Steps:
1. Start Kontekst and confirm it is audible.
2. Select a different catalog track.
3. Observe the player and listen for continued audio.

Expected:
- Kontekst audio stops after replacement.
- Old track progress does not continue updating.
- New track metadata or a controlled error is shown.
- Missing media on fixture tracks is recorded as a
  fixture limitation, not a seek regression.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

### B5-M06 — Keyboard controls

Steps:
1. Return to playable track 3005.
2. Use Tab to focus Play/Pause.
3. Activate with Enter or Space.
4. Focus the seek slider.
5. Use arrow keys to change the seek position.

Expected:
- Controls are keyboard reachable.
- Focus is visibly identifiable.
- Play/Pause works from the keyboard.
- Seek slider has a usable accessible label.
- Keyboard seeking updates playback position.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

### B5-M07 — Responsive mobile presentation

Steps:
1. Open browser DevTools device emulation.
2. Set viewport to 375 x 667.
3. Select and play Kontekst.
4. Pause, resume, and seek from the emulated viewport.
5. Inspect the player, navigation, and session controls.

Expected:
- Playback controls remain visible and usable.
- Seek slider is reachable.
- Session controls do not overlap the player.
- Navigation does not obstruct playback controls.
- No unintended horizontal page overflow occurs.
- Play/Pause and seeking remain operational.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

### B5-M08 — Browser runtime and network observations

Steps:
1. Open DevTools Console and Network.
2. Reload and log in if necessary.
3. Select playable track 3005.
4. Play, pause, and seek.
5. Inspect relevant network statuses and console errors.

Expected:
- No unexpected browser runtime exceptions.
- Media access is authorized.
- Audio streaming succeeds.
- Seeking does not trigger unrelated metadata reloads.
- No JWT or media credential appears in the stream URL.

Record only safe status codes and request paths.
Do not save unredacted request headers or cookies.

Actual: Expected behavior confirmed by manual browser testing.
Result: PASS
Evidence/notes: User-reported PASS on November 4, 2026; no screenshot attached.

## 6. Defects and Limitations

No defects reported during the eight manual browser checks. This does not establish that the application is defect-free.

For each issue record:
- Test ID:
- Reproduction steps:
- Expected:
- Actual:
- Browser and viewport:
- Severity:
- Ownership:
- Fix or Jira follow-up:

## 7. Final Evidence and Sign-off

Manual cases passed: 8 / 8
Manual cases failed: 0
Manual cases blocked: 0
Unexpected console errors: None reported during B5-M08
Backend exceptions: Not independently verified from backend logs

Overall outcome: PASS — all eight manual checks confirmed; automated suite 190/190; lint and build passed.

SCRUM-222 should not be marked complete until actual browser
results are recorded and relevant defects are resolved or
explicitly documented.
