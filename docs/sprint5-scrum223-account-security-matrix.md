# SCRUM-223 — Account Settings Invalid-Input and Authorization Matrix

- **Owner:** Christian McGowan
- **Sprint:** 5
- **Jira:** SCRUM-223
- **Scope:** Test-only coverage for merged `PATCH /account/profile`; no application or schema changes.
- **Baseline:** Merged SCRUM-357, SCRUM-358, SCRUM-359 and subsequent team integrations.

## Purpose and non-overlap

SCRUM-358 already tests isolated input errors, revocation, transaction behavior with doubles, and a baseline PostgreSQL smoke. SCRUM-359 tests React editing and conflict messages. SCRUM-223 adds a **cross-user security matrix** combining two independent authenticated identities with rejection/non-mutation assertions. The real-DB script verifies each rejected PATCH against both PostgreSQL user rows, including their stored password hashes, and verifies outer-transaction cleanup.

The deliverables are `server/test/account-profile-security-matrix.test.js` (automatically discovered by the server's `node --test` suite) and `server/scripts/scrum223-postgres-security-matrix.mjs` (explicitly executed against the isolated test DB). No runtime source changes are part of this ticket.

## Security matrix

| ID | Test case | Expected | Evidence level |
|---|---|---|---|
| S223-01 | A token GETs A, B token GETs B | Both HTTP 200; correctly scoped profile IDs | Real HTTP + DB |
| S223-02 | A attempts to target B via `userId` or `id` | 400; neither DB account changes | Unit HTTP + real HTTP + DB |
| S223-03 | A supplies `role`, `password_hash`, or `email` alongside valid username | 400; whole request rejected | Unit HTTP + real HTTP + DB |
| S223-04 | A changes username and quality while B remains active | 200; only A changes | Unit HTTP + real HTTP + DB |
| S223-05 | Correctly signed JWT has expired | 401; no DB writes | Unit HTTP + real HTTP + DB |
| S223-06 | Missing JWT | 401; no DB writes | Real HTTP + DB |
| S223-07 | Username is 64 Unicode code points (emoji) | 200; persisted without breaking B | Unit HTTP + real HTTP + DB |
| S223-08 | Username is 65 Unicode code points | 400; both accounts unchanged | Unit HTTP + real HTTP + DB |
| S223-09 | Control-character username with otherwise valid preference | 400; neither account changes | Real HTTP + DB |
| S223-10 | A requests B's existing username and preference change | 409; preference remains unchanged too | Real HTTP + DB |
| S223-11 | B submits valid preference with invalid role change | 400; neither field updates | Real HTTP + DB |
| S223-12 | Invalid preference combined with valid username | 400; no partial write | Real HTTP + DB |
| S223-13 | GET / PATCH responses exclude credential material | No password hashes or JWTs in responses | Unit HTTP + real HTTP + DB |
| S223-14 | Disposable fixture teardown | Always ROLLBACK; verify both IDs absent | Real PostgreSQL |

## Execution

From repository root:

```bash
node --test server/test/account-profile-security-matrix.test.js
cd server && npm test
cd ..
node --env-file=database/.env.test \
  server/scripts/scrum223-postgres-security-matrix.mjs soundwave_allison_test
```

The PostgreSQL script explicitly refuses any database name without `test`, requires exact name matching, and verifies required tables before writing. It uses randomly generated, disposable account IDs, runs inside a single outer transaction, translates repository transactions to SAVEPOINTs, rolls back in `finally`, and checks that no fixture accounts remain. It never outputs passwords or raw tokens. Do **not** run against production or a teammate's shared development database.

## Manual review and additional acceptance

- Inspect Git diff: only this matrix, the integration script, and this documentation may be staged.
- Record the actual server-test counts and script exit code; do not claim test success until the WSL run passes.
- Confirm `git diff --cached --check` is empty.
- Keep screenshots free of passwords, tokens, environment files, and database credential material.
- Peer-review denial semantics and whether username changes need fresh password verification. That policy question is not resolved or implemented under this test-only issue.
- Do not treat parallel JavaScript test timing problems in teammate-owned favorites components as an account-security regression; track them independently in SCRUM-360.

## Known limitations and separate work

- These tests execute sequential requests on one isolated DB connection. They do **not** establish concurrent transaction isolation or load safety; concurrency tests require distinct DB connections and belong in an additional review if required.
- Persistent token revocation and rollback are already verified by SCRUM-358's PostgreSQL smoke. SCRUM-223 adds **expired JWT** and **two-account negative-path consistency** coverage instead of repeating that smoke.
- Manual keyboard and assistive-technology exploration belongs to SCRUM-224.
- GitHub Actions isolated Account Settings smoke belongs to SCRUM-243.
- Final cross-feature regressions and dry-run evidence belong to SCRUM-360.

## Verified Sprint 5 test results

Verified locally on November 19, 2026:

- Independent SCRUM-223 HTTP matrix: 3 passed, 0 failed.
- Real PostgreSQL two-account security matrix: passed, exit code 0.
- Full backend regression: 315 passed, 0 failed.
- Correctly signed expired JWT rejected with HTTP 401.
- Cross-account and privilege-modification requests rejected.
- Unicode username boundaries and duplicate conflicts verified.
- PostgreSQL snapshots confirmed no changes after rejected requests.
- Both disposable test accounts absent after transaction rollback.
- No application source code or database migrations modified.

The PostgreSQL matrix executes sequential requests against an
isolated test transaction. It does not establish concurrency or
load-test guarantees.

Independent frontend accessibility and CI smoke work remains
assigned to SCRUM-224 and SCRUM-243, respectively.
