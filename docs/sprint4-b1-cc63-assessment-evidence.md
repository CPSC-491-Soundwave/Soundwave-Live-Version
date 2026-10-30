# SCRUM-308 | Sprint 4 CC6.3 Authorization Assessment — Execution Record

- **Author:** Christian McGowan
- **PR base:** `origin/main` at `0d04ca1` (PR #142); initial assessment base `a8015e1` (PR #139).
- **Date:** October 29, 2026 (local test output).
- **Control:** SW-S4-CC6.3 — least privilege, role-policy enforcement, effective privilege removal.
**Status:** LOCAL ASSESSMENT EXECUTED; **effective privilege-removal GAP under an immediate-removal standard** demonstrated with a committed PostgreSQL role downgrade. The production `/auth/me` route returned a stale `admin` role, and a test-only admin-policy guard accepted the old token. Focused and local regression suites passed; the new B1 tests are included in the existing Authentication Security script. A remediation/policy decision and hosted PR/CI evidence remain pending. No SOC 2 certification claim.

## Executed local test

Command: `node --test server/test/sprint4-cc63-role-lifecycle-assessment.test.js`

Node reported **12 tests passed, 0 failed**, because the parent test plus its 11 subtests are counted. Exit code **0**. The test uses signed JWTs, the current `authorizeRevocableRequest()` helper, an isolated HTTP policy guard, an in-memory `roleState` fixture and an in-memory token-revocation repository. It **does not** update PostgreSQL and **does not** expose a production administrator endpoint.

| Case | Policy / scenario | Expected HTTP | Observed HTTP | Verification / control judgment |
|---|---|---:|---:|---|
| CM-01 | Guest → admin-only test policy | 401 | 401 | PASS, test harness |
| CM-02 | Signed regular user → admin-only test policy | 403 | 403 | PASS, test harness |
| CM-03 | Signed admin → admin-only test policy | 200 | 200 | PASS, test harness |
| CM-04 | Signed admin → explicit user-only test policy | 403 | 403 | PASS, test harness |
| CM-05 | Signed user → user-only test policy | 200 | 200 | PASS, test harness |
| CM-06 | Signed user + forged `X-Role: admin` | 403 | 403 | PASS, no escalation in test harness |
| CM-07 | Signed user + forged `X-User-Id` | 403 | 403 | PASS, no escalation in test harness |
| CM-08 | Revoked old admin JWT | 401 | 401 | PASS, isolated revocation fixture |
| CM-09 | Revocation lookup throws simulated outage | 503 | 503 | PASS, fail-closed test harness |
| CM-10 | User's fixture role changed `admin` → `user`, old signed admin JWT reused | **Deny if immediate removal required** | **200** | **CONTROL GAP** under immediate-removal policy; test itself deliberately passed as a characterization |
| CM-11 | Newly issued signed user JWT → admin-only test policy | 403 | 403 | PASS, test harness |

**Exact CM-10 diagnostic:** `currentRole=user; oldAdminTokenStatus=200; simulated role fixture, not production DB`. The role map is not connected to the middleware's authorization path. This demonstrates the effect of relying on the old signed JWT role in that test harness; it is **not** an executed PostgreSQL role-downgrade test.

The expected stack trace for `isolated_revocation_lookup_outage` is part of the successful CM-09 negative case; it is not an unhandled production error.

## Executed follow-up regression checks (October 29, 2026 local)

The author ran these on `christian/s4-b1-cc63-role-assessment` after adding `server/test/sprint4-cc63-role-lifecycle-assessment.test.js`:

| Test command | Observed result | Exit code | Meaning |
|---|---|---:|---|
| `cd server && npm run test:auth` (initial) | **95 tests passed, 0 failed** | 0 | Existing S3 authorization suite remained green before explicit B1 test inclusion. |
| `cd server && npm run test:auth` (after update and current-main verification) | **107 tests passed, 0 failed** | 0 | New B1 test included in the existing Authentication Security command via `server/package.json`. |
| `cd server && npm test` (initial and after rechecking latest merged main) | **237 tests passed, 0 failed** | 0 | Full backend suite auto-discovers the B1 test; includes **12 counted B1 tests** (11 named cases plus parent). |

Expected stack traces from deliberately injected database/revocation failures were logged, but both runners reported zero failures. The full suite's B1 CM-10 diagnostic again reported `currentRole=user; oldAdminTokenStatus=200`, confirming the same **test-only control gap**. These are local results only; no B1 GitHub Actions run, PR approval, or merge is yet recorded.

**Executed CI inclusion change:** appended `test/sprint4-cc63-role-lifecycle-assessment.test.js` to the explicit `scripts.test:auth` command in `server/package.json`. The resulting command passed **107/107**, exit 0. Source inspection confirmed that `.github/workflows/ci.yml:164` executes `npm run test:auth`, so the added test should run under the **existing** Authentication Security job on the upcoming PR. This does not yet count as a hosted CI pass.

## Executed isolated PostgreSQL role-downgrade assessment (October 29, 2026 local)

**Command:** `node --test server/manual-checks/sprint4-cc63-isolated-postgres-downgrade.check.mjs`, run with `CM_B1_DISPOSABLE_DB_CONFIRM=YES_ISOLATED_CONTAINER` and an ephemeral `CM_B1_PG_PASSWORD`. **Observed:** **1/1 test passed, 0 failed, exit 0**. The test's PASS indicates the characterization assertions completed, **not** that immediate privilege removal worked.

**Isolation and setup verified by terminal output:** a separate `postgres:16` Docker container named `soundwave-cm-b1-postgres`, published exclusively on `127.0.0.1:55432`, with PostgreSQL database `soundwave_cm_b1_test` and database user `soundwave_cm_b1`. `pg_isready` accepted connections; seven existing project migrations applied with exit 0; a pretest query verified **0 users** and the presence of `revoked_access_tokens`. The test code uses a fixed localhost/database/user configuration, ignores the inherited shared-database environment variables, and explicitly refuses a populated `users` table. The script creates a uniquely named fixture and performs cleanup in `finally`; a separate post-run row-count check was **not yet supplied**. No writes were directed to Allison's `soundwave_allison_test` database.

| Sequence | Observed result | Interpretation |
|---|---|---|
| Existing temporary admin logged in via actual Soundwave login handler | Signed JWT carried `role=admin` | Role recorded at login/issuance. |
| SQL `UPDATE users SET role='user'` committed; independently reread | Durable PostgreSQL role was `user` | **Real persisted role downgrade**, unlike CM-10's in-memory fixture. |
| Present old JWT to **production** `GET /auth/me` route | HTTP **200**, response `role=admin` | Production identity response still reflected the old signed role after durable downgrade. This is real production-route behavior under a local test setup, though it is **not** a demonstrated admin-only route. |
| Present old JWT to **test-only** admin policy route | HTTP **200** | Role-policy middleware accepted the stale privileged JWT after a real DB downgrade; **gap under prompt privilege-removal requirement**. |
| Log in again and present the new `user` JWT to test-only admin policy | HTTP **403** | New role is honored when a new token is issued. |
| Explicitly revoke the old JWT's `jti`, then present it to test-only admin policy | HTTP **401** | Existing targeted revocation works. **Downgrading a database role did not automatically revoke the token.** |

**Diagnostic recorded:** `COMMITTED ROLE=user | OLD JWT role=admin | production /auth/me HTTP=200 responseRole=admin | TEST-ONLY admin policy HTTP=200`. The test also reported that token-specific revocation produced 401. This gives stronger evidence for the stale-role concern than the simulated fixture, but does not demonstrate unauthorized media access, a production administrator-only route, or automatic role-change session invalidation.

**Test placement:** `server/manual-checks/sprint4-cc63-isolated-postgres-downgrade.check.mjs` is intentionally outside `server/test/` so ordinary `cd server && npm test` and GitHub Actions don't trigger a PostgreSQL write-enabled check. It must be run deliberately against the exact disposable test container. This manual-check is test code, not a manual browser session and not a hosted CI result.

## Source-backed assessment

- `server/src/auth/login.js` creates a JWT using the role from the user record at login.
- `server/src/auth/token.js` signs `sub`, `role`, `jti` with a two-hour expiration.
- `server/src/auth/revocation-auth.js` verifies the JWT and checks `jti` revocation; it returns `role` from signed claims, rather than looking up `users.role` on each request.
- `server/src/auth/request-authorization.js` enforces `allowedRoles` against that returned principal.
- At the inspected revision, actual general protected routes in `server/src/app.js` accept `user` and `admin`. The test-only admin route is **not** evidence of a production admin-only feature.

## CC6.3 acceptance assessment

| Criterion | Status at this checkpoint |
|---|---|
| AC-01 At least eight principal × role-policy cases | MET in isolated HTTP test harness; production privileged route evidence Not Applicable / not yet present |
| AC-02 Forged header/body identity cannot elevate | Header attempts covered and passed; body attribution not tested by this harness |
| AC-03 Missing/invalid/revoked JWT 401; forbidden 403 | Missing/revoked/forbidden pass in new harness; invalid/expired tests remain in prior S3 suite until separately rerun |
| AC-04 Fail-closed dependency outage | PASS for simulated revocation lookup outage; fresh-role lookup unimplemented and not applicable |
| AC-05 Effective role downgrade / old token | **GAP** under immediate-removal policy, supported by both simulated fixture and committed isolated PostgreSQL downgrade; stale role returned by production `/auth/me`, and admin-only **test guard** accepted old token |
| AC-06 Reproducible sanitized evidence | Local focused/auth/full-server results, real isolated PostgreSQL role-change sequence, and CI script wiring obtained; hosted PR/CI/peer-review evidence pending |
| AC-07 Final exceptions, impact, remediation and residual risk | IN PROGRESS; remediation/policy approval required. No prompt-removal fix was made in this B1 test/evidence work. |

## Decision and remediation options (proposed, not implemented)

1. **Immediate removal for privileged actions (recommended if privileged production routes are introduced):** check current durable role when entering true privileged routes and fail closed on lookup outage. This increases database dependency and requires review of latency and interfaces.
2. **Session invalidation on role change:** revoke affected active JWT `jti` values or use a credential/privilege version. Requires reliable role-change orchestration and session tracking; current test-specific revocation alone does not establish automatic invalidation.
3. **Accept expiry window only with explicit policy approval:** signed JWT roles remain unchanged until token expiry (two-hour lifetime in the inspected code). Document the risk and do not label prompt effective privilege removal as a pass.

**Immediate next steps:** Verify disposable-container fixture cleanup, stop/remove that temporary container, keep the manual check isolated from normal CI, obtain team/security-policy decision on **prompt removal versus token-expiry window**, and link the reviewed PR/hosted CI evidence. Do **not** claim the role-downgrade gap is remediated by merely recording or passing characterization tests.

## Ownership and evidence

Christian owns shared authorization role policy and the CC6.3 decision. Matthew owns event API/history row authorization, Allison owns catalog/data reference safety, Emmanuel owns client anomaly monitoring (CC7.2), and Konner owns PR/CI/Compose change management (CC8.1). Record new test authorship and actual GitHub Actions run under **SCRUM-308**. Reference S3 test coverage as inherited, not new S4 execution.

**Final control PASS withheld until:** a policy/remediation decision is recorded and, if prompt role removal is required, a fix is implemented and shown to deny old privileged tokens after role change. The test/evidence contribution may be reviewed and merged as a documented finding, but not labeled a resolved CC6.3 control. Hosted PR/CI evidence remains pending. No compliance PASS from the Node test exit status alone.

## October 29 verification checkpoint: latest merged main and saved changes

- Ran `git fetch origin --prune` on B1; comparison `git rev-list --left-right --count HEAD...origin/main` yielded **`0 0`**. `origin/main` still identified merge PR #139 at `a8015e1`; teammate development branches advanced, but none of their newer commits had reached `main` at the verified checkpoint.
- Temporarily saved all three B1 files in `stash@{0}` and restored them with `git stash apply`; no conflicts or other changed files appeared. The stash is retained as a backup until reviewed commit preparation.
- Confirmed the three original B1 working files: `server/package.json`, `server/test/sprint4-cc63-role-lifecycle-assessment.test.js`, and `docs/sprint4-b1-cc63-assessment-evidence.md`. A fourth intended file was subsequently added: the isolated database manual-check script in `server/manual-checks/`.
- After synchronization, ran `cd server && npm run test:auth`: **107/107 passed, exit 0**; `cd server && npm test`: **237/237 passed, exit 0**.
- Note: `npm test` and `npm run test:auth` overlap; do not add the two test counts as unique tests. Also, successful tests do not convert the CM-10 immediate-removal gap to PASS.

## Pre-PR outstanding items

- [ ] On the isolated container, inspect whether the fixture was cleaned up (`users` and `revoked_access_tokens` row counts); then stop only `soundwave-cm-b1-postgres` and clear its ephemeral password variable.
- [ ] Confirm `server/manual-checks/` contains only the intended `.check.mjs` and no ZIP, credentials, logs, or generated outputs.
- [ ] Record the team's privilege-removal policy, remediation owner/ticket or accepted residual risk. A passing **assessment test** must not be called a fixed **security control**.
- [ ] Re-fetch latest `origin/main`, stage and review only the four intended B1 files; inspect `git diff --cached --check`.
- [ ] Obtain hosted Authentication Security / Server Tests results, a peer reviewer, and link the merged PR and decision to SCRUM-308.
