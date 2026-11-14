
# SCRUM-250 — Sprint 4 Container Reliability Results

**Project:** Soundwave — CPSC 491
**Owner:** Konner Rigby
**Sprint:** Sprint 4 (October 29 – November 5, 2026)
**Parent Story:** SCRUM-245
**Status:** Implementation and testing completed; documentation review pending.

## 1. Overview

Sprint 4 extended Soundwave's existing Docker Compose
runtime verification with repeatable health-state,
restart/recovery, and resource diagnostic tests.

The implementation builds on the earlier Compose smoke,
failure, and cleanup tests.

The work preserves existing application functionality,
database implementations, and GitHub Actions workflows.

## 2. Test Environment

The tests use Docker Compose with:

- `compose.yml`
- `compose.ci.yml`
- Node.js test scripts in `scripts/`
- Docker Engine and Docker Compose
- PostgreSQL 16 in the isolated CI configuration

Recovery and health-state tests use isolated Compose
projects and temporary configuration overrides.

The existing application exposes backend port 8080
and client port 5173. Isolated tests may override host
port mappings to avoid conflicts.

### Prerequisites

From the repository root:

```bash
docker version
docker compose version
docker compose -f compose.yml -f compose.ci.yml config --quiet
```

The configuration validation command should exit with
code 0.

Do not include environment-file contents or credential
values in test evidence.

## 3. SCRUM-246 — Container Health-State Verification

**Script:** `scripts/compose-health-state.test.mjs`

### Procedure

```bash
node scripts/compose-health-state.test.mjs
echo $?
```

### Expected Result

- Backend container enters the running state.
- PostgreSQL reports healthy status.
- Backend `/health` endpoint confirms readiness.
- Stopping the backend changes its runtime state.
- Backend becomes unavailable after stopping.
- Isolated resources are cleaned up.

### Observed Result

The test confirmed backend running state, PostgreSQL
health, and backend readiness in approximately 1,056 ms.

After stopping the backend, the test verified that the
container was no longer running and that the application
was unavailable.

**Result:** PASS — exit code 0.

### Negative Verification

```bash
HEALTH_TEST_FORCE_FAILURE=1 \
node scripts/compose-health-state.test.mjs

echo $?
```

The injected unexpected-state condition was detected.
The script collected diagnostics, returned exit code 1,
and removed isolated resources.

**Result:** PASS — expected failure detected.

## 4. SCRUM-247 — Backend Restart and Recovery

**Script:** `scripts/compose-backend-recovery.test.mjs`

### Procedure

```bash
node scripts/compose-backend-recovery.test.mjs
echo $?
```

### Expected Result

- Backend initially becomes healthy.
- Backend becomes unavailable after stopping.
- Backend restarts successfully.
- Health returns within the configured timeout.
- Failure produces diagnostics and nonzero exit status.
- Test resources are cleaned up.

### Observed Result

Initial backend readiness was verified.

The test detected temporary backend unavailability
after a controlled stop.

The backend recovered successfully within the
configured 30-second timeout.

Recorded successful recovery measurements included:

- Initial successful run: 1,386 ms.
- Subsequent successful run: 1,813 ms.

**Result:** PASS — exit code 0.

### Controlled Failure Test

```bash
RECOVERY_FORCE_FAILURE=1 \
node scripts/compose-backend-recovery.test.mjs

echo $?
```

The controlled failure prevented backend recovery.

The test reported failure after the configured timeout,
collected Compose diagnostics, returned exit code 1,
and cleaned up isolated containers and networks.

**Result:** PASS — expected failure behavior verified.

## 5. SCRUM-248 — Client Restart and Recovery

**Script:** `scripts/compose-client-recovery.test.mjs`

### Procedure

```bash
node scripts/compose-client-recovery.test.mjs
echo $?
```

### Expected Result

- Client initially becomes available.
- Client becomes unavailable when stopped.
- Client restarts successfully.
- Client availability returns within 30 seconds.
- Backend and database remain operational.
- Unrelated services are not rebuilt or replaced.

### Observed Result

The test detected temporary client unavailability.

After restarting the client, availability returned
in approximately 1,442 ms.

The backend and PostgreSQL database remained
operational, and their containers were not replaced.

**Result:** PASS — exit code 0.

### Controlled Failure Test

```bash
CLIENT_RECOVERY_FORCE_FAILURE=1 \
node scripts/compose-client-recovery.test.mjs

echo $?
```

The injected failure prevented client recovery.

The test detected the failure after the configured
30-second timeout, collected diagnostics, returned
exit code 1, and cleaned up isolated resources.

**Result:** PASS — expected failure behavior verified.

## 6. SCRUM-249 — Container Resource Diagnostics

**Script:** `scripts/compose-resource-diagnostics.mjs`

### Procedure

Run against an existing isolated Compose test project:

```bash
node scripts/compose-resource-diagnostics.mjs sw-diag-249
```

The named project must exist and contain running
containers for diagnostics to be collected.

### Expected Result

Collect Docker-reported:

- CPU usage.
- Memory usage.
- Restart counts.
- Container running/stopped states.
- Available health information.

Do not expose environment variables or credentials.

### Observed Result

Diagnostics were collected for two containers.

| Metric | Backend | PostgreSQL |
|---|---|---|
| CPU usage | 0.00% | 2.35% |
| Memory usage | 28.47 MiB | 80.42 MiB |
| Restart count | 0 | 0 |
| Runtime state | Running | Running |
| Health | Not configured | Healthy |

**Result:** PASS — resource and state diagnostics collected.

### Recovery Failure Diagnostics

```bash
RECOVERY_FORCE_FAILURE=1 \
RECOVERY_TIMEOUT_MS=3000 \
node scripts/compose-backend-recovery.test.mjs

echo $?
```

The injected backend recovery failure was detected.

The diagnostics collector reported container states,
available CPU/memory information, restart counts,
and health information.

The test returned exit code 1 and removed isolated
resources.

**Result:** PASS — automatic failure diagnostics verified.

## 7. Failure Handling and Cleanup

The reliability tests use isolated Compose projects
to avoid disrupting normal development environments.

Expected failure handling includes:

1. Report a clear failure message.
2. Collect relevant Compose container diagnostics.
3. Return a nonzero exit code.
4. Stop and remove isolated test resources.

The recorded tests verified cleanup of isolated
containers and networks.

Some scenarios also remove associated test volumes.

## 8. Known Limitations

- Recovery times depend on the local machine, Docker
  startup conditions, and resource availability.
- The tests verify selected health and availability
  endpoints, not every application workflow.
- Resource diagnostics represent Docker-reported
  measurements at collection time, not continuous
  application performance monitoring.
- Some services do not define Docker health checks;
  application readiness is checked separately.
- Controlled failures verify diagnostic behavior
  but do not represent every possible production outage.
- Local Docker Engine availability is required.
- Test evidence must be sanitized to avoid exposing
  secrets or environment-file contents.

## 9. Jira and GitHub References

### Parent Story

SCRUM-245:
https://491group1.atlassian.net/browse/SCRUM-245

### Container Health-State Verification

SCRUM-246:
https://491group1.atlassian.net/browse/SCRUM-246

PR #160:
https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/160

### Backend Restart and Recovery

SCRUM-247:
https://491group1.atlassian.net/browse/SCRUM-247

PR #159:
https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/159

### Client Restart and Recovery

SCRUM-248:
https://491group1.atlassian.net/browse/SCRUM-248

PR #161:
https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/161

### Container Resource Diagnostics

SCRUM-249:
https://491group1.atlassian.net/browse/SCRUM-249

PR #164:
https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version/pull/164

### Documentation

SCRUM-250:
https://491group1.atlassian.net/browse/SCRUM-250

## 10. Conclusion

Sprint 4 Docker Compose reliability testing demonstrated
repeatable container health-state inspection, backend
and client restart/recovery verification, and resource
diagnostic collection.

Controlled failure tests verified nonzero exit behavior,
diagnostic reporting, and isolated cleanup.

The documented tests support repeatable local verification
and provide evidence for the Sprint 4 Docker Compose
reliability work under SCRUM-245.

This documentation summarizes recorded test results
and does not claim comprehensive production reliability
or performance certification.
