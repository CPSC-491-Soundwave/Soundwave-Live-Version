# Soundwave Pull Request Review Checklist

This checklist defines the Sprint 1 pull request review process for Soundwave. It is intended to help authors and reviewers verify that changes are attributable, tested, documented, secure, and compatible with the rest of the project before merging into `main`.

## Before Opening a Pull Request

### Author Checklist

- [ ] Work is being completed on the author's own development branch.
- [ ] The change corresponds to an assigned Jira task.
- [ ] The pull request has a clear and specific title.
- [ ] The pull request description explains what changed.
- [ ] The pull request identifies how the change was tested.
- [ ] The pull request does not claim implementation work owned by another team member.
- [ ] Unrelated changes are excluded from the pull request.
- [ ] `git status` has been reviewed before committing.
- [ ] No temporary, generated, or machine-specific files are accidentally included.

## Code Quality

Before requesting review:

- [ ] Code is readable and reasonably organized.
- [ ] Existing project conventions are followed.
- [ ] Duplicate implementations of existing features were not introduced.
- [ ] Shared interfaces and integration contracts are preserved unless the change intentionally updates them.
- [ ] Debugging code and unnecessary console output have been removed.
- [ ] Unused imports, variables, files, and dependencies have been removed.
- [ ] Comments explain non-obvious behavior where appropriate.

## Frontend Changes

For changes affecting the Soundwave client:

- [ ] Existing Soundwave design tokens are reused where appropriate.
- [ ] Shared shell behavior remains intact.
- [ ] Sidebar navigation still works.
- [ ] Persistent playback UI remains mounted during navigation.
- [ ] Relevant routes render successfully.
- [ ] Loading, empty, or error states are handled where required.
- [ ] Backend integration uses the existing proxy/configuration approach rather than introducing conflicting hard-coded URLs.
- [ ] Client lint passes.

Run:

```bash
cd client
npm run lint
```

- [ ] Client build passes.

Run:

```bash
npm run build
```

- [ ] Relevant client tests pass.

Run:

```bash
npm run test:run
```

## Backend Changes

For changes affecting the Soundwave server:

- [ ] Existing API contracts are preserved unless intentionally changed.
- [ ] HTTP status codes are appropriate for the behavior.
- [ ] Error responses do not expose sensitive information.
- [ ] Authentication-protected routes enforce the expected authorization behavior.
- [ ] Environment-dependent configuration is not hard-coded into source code.
- [ ] Relevant server tests pass.

Run:

```bash
cd server
npm test
```

## Database Changes

For changes affecting the database:

- [ ] Schema changes are implemented through the project's migration process.
- [ ] Existing migrations are not rewritten after they have been shared or applied unless the team explicitly agrees.
- [ ] New tables, columns, indexes, or constraints have a clear purpose.
- [ ] Database changes do not duplicate another team member's assigned schema work.
- [ ] Queries use the agreed database interfaces and conventions.
- [ ] No database credentials are committed.
- [ ] Relevant database tests or migration checks pass.

## Authentication and Security

For security-sensitive changes:

- [ ] No passwords, JWT secrets, API keys, database passwords, or other secrets are committed.
- [ ] `.env` files remain local and ignored by Git.
- [ ] Passwords are not stored or logged in plaintext.
- [ ] Authentication failures use appropriate generic error responses.
- [ ] Protected requests validate authentication as required.
- [ ] Tokens or credentials are not unnecessarily printed to logs.
- [ ] Client-side code does not expose server secrets.

## Docker and Self-Host Changes

For Docker, Compose, or deployment-related changes:

- [ ] Docker images build successfully.
- [ ] Docker Compose configuration remains compatible with the current client and server.
- [ ] Required environment variables are supplied without committing secret values.
- [ ] Container networking uses service names or the documented host connection method.
- [ ] Backend health verification succeeds.
- [ ] Client availability verification succeeds.
- [ ] The Compose smoke test passes.

Run from the repository root:

```bash
node scripts/compose-smoke-test.mjs
```

Expected successful output includes:

```text
Backend health check passed.
Client check passed.
Soundwave Compose smoke test passed.
```

## Documentation

- [ ] README or project documentation is updated if setup or behavior changed.
- [ ] New commands or configuration requirements are documented.
- [ ] Documentation does not contain real credentials or secrets.
- [ ] Jira status accurately reflects the state of the work.
- [ ] The pull request description provides enough context for another team member to review the change.

## Reviewer Checklist

The reviewer should verify:

- [ ] The pull request matches its stated scope.
- [ ] The work is attributable to the listed author.
- [ ] The implementation does not duplicate another team member's assigned task.
- [ ] The code is understandable and follows existing project conventions.
- [ ] Relevant automated checks are passing.
- [ ] Important behavior has been tested or demonstrated.
- [ ] Existing functionality has not obviously regressed.
- [ ] Shared integration contracts remain compatible.
- [ ] No secrets or sensitive local configuration are included.
- [ ] Documentation is updated when necessary.
- [ ] Requested changes are resolved before approval.

## Review Decision

### Approve

Approve when:

- The implementation satisfies its intended scope.
- Relevant tests and automated checks pass.
- No blocking correctness, security, integration, or ownership issues remain.

### Request Changes

Request changes when:

- The implementation is broken or incomplete for its stated scope.
- Required tests fail.
- The change introduces a security concern.
- The change conflicts with an existing integration contract without coordination.
- Secrets or credentials are exposed.
- The implementation duplicates work assigned to another team member.

### Comment

Use a non-blocking comment when:

- A suggestion would improve the implementation but is not required for correctness.
- Clarification would help future maintainers.
- A follow-up improvement can reasonably be handled in another Jira task.

## Merge Requirements

Before merging into `main`:

- [ ] At least one teammate has reviewed the pull request.
- [ ] Required GitHub checks are passing.
- [ ] Blocking review comments have been resolved.
- [ ] The pull request has the correct base and compare branches.
- [ ] The final diff has been reviewed for accidental files or unrelated changes.
- [ ] The pull request is approved before merge.

The normal Soundwave workflow is:

```text
Jira task
    ↓
Developer branch
    ↓
Commit and push
    ↓
Pull request
    ↓
Automated checks
    ↓
Peer review
    ↓
Approval
    ↓
Merge into main
```

## Sprint 1 Review Goal

The Sprint 1 review process is intended to maintain clear individual ownership while allowing all five team members to integrate their work into one Soundwave application.

A teammate may review, consume, or integrate another member's feature, but the same implementation task should not be claimed by multiple primary authors.