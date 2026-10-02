# Soundwave Sprint 2 Build Version Contract

Owner: Christian McGowan

## Purpose

Soundwave CI assigns each workflow run a traceable build identity so a
successful main-branch build can be mapped back to the exact Git commit
and GitHub Actions execution that produced it.

## Build Version Format

Build versions use:

    s2.<run_number>+<short_sha>

Example:

    s2.248+1a2b3c4

Where:

- `s2` identifies the Sprint 2 build-version contract.
- `run_number` is GitHub Actions `GITHUB_RUN_NUMBER`.
- `short_sha` is the first seven characters of `GITHUB_SHA`.

The build version does not contain credentials, tokens, database
passwords, JWT secrets, or other sensitive configuration.

## build-info.json

CI generates:

    artifacts/build-info.json

The metadata contains:

- `version` - Soundwave build identity.
- `commitSha` - complete Git commit SHA.
- `shortSha` - seven-character Git commit identifier.
- `runNumber` - GitHub Actions workflow run number.
- `runId` - GitHub Actions workflow run ID.
- `branch` - source branch or ref name.
- `eventName` - workflow event that generated the metadata.
- `generatedAtUtc` - UTC metadata-generation timestamp.

## CI Behavior

The `Build Metadata` job validates metadata generation during both
pull-request and main-branch workflow runs.

For pull requests, metadata generation is validated but the artifact is
not persisted.

For pushes or merges to `main`, CI uploads `build-info.json` as a GitHub
Actions artifact named:

    soundwave-build-info-<run_number>

The artifact is retained for 30 days.

## Traceability

Given a build version such as:

    s2.248+1a2b3c4

the team can identify:

1. GitHub Actions run number `248`.
2. The originating Git revision beginning with `1a2b3c4`.
3. The complete commit SHA recorded in `build-info.json`.
4. The branch, workflow event, run ID, and generation timestamp.

This supports debugging, build verification, and rollback analysis
without relying on ambiguous labels such as `latest`.

## Rollback and Debugging

When investigating a regression:

1. Obtain the build version or `build-info.json`.
2. Locate the associated GitHub Actions run.
3. Verify the recorded full commit SHA.
4. Compare that revision with the last known-good revision.
5. Use the normal reviewed Git process to revert or restore code.

The metadata identifies a build. It does not automatically deploy,
revert, or roll back application code.

## Security Boundary

`build-info.json` contains build provenance only.

It must not contain:

- JWT secrets.
- Database passwords.
- API credentials.
- Authentication tokens.
- Private keys.
- Application user data.

## Local Validation

The generator can be validated locally without creating a tracked
repository artifact:

    GITHUB_RUN_NUMBER=999 \
    GITHUB_SHA="$(git rev-parse HEAD)" \
    GITHUB_REF_NAME="christian-dev" \
    GITHUB_RUN_ID="local-validation" \
    GITHUB_EVENT_NAME="push" \
    node scripts/generate-build-info.mjs \
      /tmp/soundwave-build-info.json

The generated metadata can then be inspected with:

    cat /tmp/soundwave-build-info.json

---

## Sprint 2 Final Workflow Export Contract

In addition to generating `build-info.json`, the `Build Metadata` job now exposes the generated build version directly to GitHub Actions.

### Job output

The job exposes:

    version

from:

    steps.build_info.outputs.version

A later job may consume the value through a normal GitHub Actions `needs:` dependency.

Conceptually:

    needs: build-metadata

and:

    needs.build-metadata.outputs.version

### Job environment variable

The Build Metadata job also writes:

    SOUNDWAVE_BUILD_VERSION

to the GitHub Actions environment for later steps in that job.

The workflow verifies that:

    SOUNDWAVE_BUILD_VERSION

matches:

    steps.build_info.outputs.version

before the metadata artifact is displayed or uploaded.

## Hosted Sprint 2 Evidence

Verified main-branch metadata run:

    Run number: 147
    Build version: s2.147+78ed45f
    Branch: main
    Event: push
    Artifact: soundwave-build-info-147.zip

The artifact upload completed successfully and contained the generated `build-info.json`.

Final hosted workflow-output verification:

    Build version export verified: s2.149+c2f90e3

The following Build Metadata steps completed successfully:

    Generate build metadata
    Verify build metadata exports
    Display build metadata
    Upload build metadata

This satisfies the Sprint 2 requirement that the Soundwave build identity be both traceable as an artifact and directly consumable by CI orchestration.
