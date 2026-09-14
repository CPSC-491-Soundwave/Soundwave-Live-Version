# Contributing to Soundwave

Soundwave is developed collaboratively for CPSC 491-05 Fall 2026.

This document defines the shared development, testing, Git, and pull request practices for the project.

For instructions on cloning, installing, and running Soundwave, see the root `README.md`.

---

## Development Stack

The current project uses:

- Node.js 20.x
- JavaScript
- React with JavaScript/JSX
- Vite
- React Router
- CSS and shared design tokens
- Git and GitHub

The team is not using Tailwind CSS.

Verify the required development tools:

```bash
git --version
node --version
npm --version
```

The project has been successfully developed using Node.js 20.x.

---

## Repository Areas

Current major repository areas include:

```text
client/             React/Vite client
server/             Node.js backend
auth/               Authentication work
password-hasher/    Password hashing work
token-auth/         Token authentication work
playback/           Playback/media work
```

Additional directories may be added as Sprint work is merged.

Contributors should integrate with existing project areas rather than creating competing implementations of another teammate's assigned feature.

---

## Sprint 1 Primary Ownership

| Team Member | Primary Sprint 1 Responsibility |
| --- | --- |
| Christian McGowan | Walking skeleton, backend health contract, CI and delivery workflow |
| Allison Yu | Catalog data foundation and deterministic seed |
| Emmanuel De Guzman | Login and authentication/identity spike |
| Matthew Choi | Media ingest and HTTP Range playback spike |
| Konner Rigby | Client shell and self-host packaging |

Shared integration is expected.

A contributor may consume, test, document, or integrate another teammate's interface, but should not independently replace another teammate's primary Sprint 1 implementation.

---

## Git Identity

All course work must be attributable to the developer who authored it.

Verify your Git identity:

```bash
git config user.name
git config user.email
```

If necessary, configure the identity for this repository:

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

Use a consistent named GitHub identity throughout the project.

---

## Branch Workflow

Implementation work should be completed on a developer branch rather than directly on `main`.

Before beginning a new block of work, move to the repository root:

```bash
cd ~/Soundwave-Live-Version
```

Check the current repository state:

```bash
git status
git branch --show-current
```

Switch to your assigned development branch:

```bash
git switch <your-development-branch>
```

Fetch the latest remote changes:

```bash
git fetch origin
```

Merge the current `main` branch into your development branch:

```bash
git merge origin/main
```

Verify the repository state:

```bash
git status
```

Example:

```bash
cd ~/Soundwave-Live-Version
git switch christian-dev
git fetch origin
git merge origin/main
git status
```

This synchronization should be performed before beginning new development work and after another teammate merges work that your task depends on.

If Git reports a merge conflict, resolve the affected files before continuing.

Do not blindly overwrite another teammate's changes.

---

## Backend Verification

The Node.js backend is located in:

```text
server/
```

Run the current backend tests with:

```bash
cd ~/Soundwave-Live-Version/server
npm test
```

The current backend tests verify:

- `GET /health` returns HTTP `200`.
- `/health` returns the expected JSON response.
- Unknown routes return HTTP `404`.

Backend changes should not be submitted for review if the applicable backend tests fail.

The current server uses Node.js built-in modules and does not yet require an external dependency installation step.

If external backend dependencies are added later, the backend setup and CI instructions must be updated accordingly.

---

## Client Verification

The React/Vite client is located in:

```text
client/
```

From a fresh checkout, install the client dependencies:

```bash
cd ~/Soundwave-Live-Version/client
npm ci
```

Run ESLint:

```bash
npm run lint
```

Run the production build:

```bash
npm run build
```

Client-related changes should not be submitted for review if linting or the production build fails.

The client does not currently define an automated `npm test` script.

---

## Current Local Verification Baseline

Before opening a pull request that affects the existing backend or client, run the applicable checks.

### Backend

```bash
cd ~/Soundwave-Live-Version/server
npm test
```

### Client

```bash
cd ~/Soundwave-Live-Version/client
npm ci
npm run lint
npm run build
```

These commands form the current local verification baseline.

GitHub Actions will automate these checks as part of the shared delivery workflow.

Additional database, authentication, media, and packaging checks should be added only after their owners establish verified commands and integration contracts.

---

## Inspect Changes Before Committing

Return to the repository root:

```bash
cd ~/Soundwave-Live-Version
```

Check the current changes:

```bash
git status
```

Inspect unstaged changes:

```bash
git --no-pager diff
```

Check for whitespace errors:

```bash
git diff --check
```

No output from `git diff --check` means Git did not detect whitespace errors.

Do not commit changes that you have not reviewed.

---

## Stage Changes Carefully

Stage only files that belong to the current task.

General form:

```bash
git add <files>
```

Example:

```bash
git add CONTRIBUTING.md
```

Check the staged files:

```bash
git status
```

View a summary of the staged changes:

```bash
git diff --cached --stat
```

Inspect the complete staged patch:

```bash
git --no-pager diff --cached
```

Check staged files for whitespace problems:

```bash
git diff --cached --check
```

Do not commit unrelated files simply because they are present in the working tree.

---

## Commit Messages

Use short, descriptive commit messages that explain the purpose of the change.

Examples:

```bash
git commit -m "feat: add Node.js backend health check skeleton"
```

```bash
git commit -m "docs: add complete development setup guide"
```

```bash
git commit -m "chore: establish contribution and PR workflow"
```

```bash
git commit -m "ci: add server and client verification checks"
```

After committing, inspect recent history:

```bash
git log --oneline -3
```

---

## Push Changes

Push your development branch to GitHub:

```bash
git push origin <your-development-branch>
```

Example:

```bash
git push origin christian-dev
```

Verify the local state afterward:

```bash
git status
```

Do not push feature implementation directly to `main`.

---

## Pull Request Process

Changes are integrated into `main` through peer-reviewed pull requests.

When opening a pull request:

1. Set `main` as the base branch.
2. Select your development branch as the compare branch.
3. Identify the primary author.
4. Link the related Jira issue when available.
5. Explain what changed.
6. Explain why the change is needed.
7. Document the commands or procedures used to test the change.
8. Identify teammate-owned interfaces or components consumed by the change.
9. Confirm that applicable local checks pass.
10. Request review from at least one teammate.
11. Address review feedback before merging.
12. Wait for required automated checks to pass before merging.

Do not merge a pull request until it is ready for integration and has received the required peer approval.

---

## Shared Files and Merge Conflicts

Some files are likely to be modified by multiple developers.

Examples include:

```text
README.md
CONTRIBUTING.md
server/package.json
client/package.json
client/package-lock.json
.github/
```

Before modifying a shared file, synchronize your branch:

```bash
git fetch origin
git merge origin/main
```

Coordinate with teammates when multiple branches may modify the same dependency, configuration, or documentation file.

Avoid unnecessary formatting or reorganization of another developer's code or documentation because those changes increase merge-conflict risk.

---

## Dependency Changes

Before adding a new dependency:

1. Confirm that it is required for the assigned task.
2. Check whether another teammate is currently changing the same package file.
3. Avoid adding duplicate libraries that solve the same problem.
4. Commit the appropriate lockfile when dependencies change.
5. Document new setup requirements when necessary.

The current client uses a committed `package-lock.json`.

The backend should gain its own lockfile when external backend dependencies are introduced.

---

## Secrets and Configuration

Never commit:

- passwords
- API keys
- authentication tokens
- private keys
- database passwords
- personal credentials
- production secrets
- real `.env` files containing secret values

Environment-specific configuration should use environment variables or another team-approved configuration mechanism.

The current backend supports the `PORT` environment variable.

Example:

```bash
cd ~/Soundwave-Live-Version/server
PORT=8081 npm start
```

A sanitized `.env.example` may be added when the team establishes additional environment variables.

The root repository `.gitignore` and area-specific `.gitignore` files should be used to prevent local or generated artifacts from being committed accidentally.

---

## Documentation

Documentation must reflect commands and behavior that have actually been verified against the repository.

When a change affects any of the following, update the relevant documentation:

- installation
- local startup
- testing
- configuration
- environment variables
- build commands
- database setup
- authentication setup
- media setup
- deployment or packaging

Each teammate should document the setup and verification commands for the subsystem they implement.

Do not document hypothetical commands as though they are already supported.

---

## Review Expectations

Peer review should evaluate more than whether code appears to compile.

Reviewers should consider:

- whether the change satisfies its acceptance criteria
- whether the implementation belongs to the stated task
- whether tests or reproducible verification steps are provided
- whether existing functionality still works
- whether another teammate's primary implementation was duplicated
- whether shared interfaces changed unexpectedly
- whether secrets or generated files were accidentally committed
- whether setup or development documentation needs updating
- whether the change introduces unnecessary merge-conflict risk

Substantive review comments are encouraged when a technical, integration, testing, or ownership concern is discovered.

---

## After a Pull Request Is Merged

After your pull request is merged into `main`, synchronize your development branch again:

```bash
cd ~/Soundwave-Live-Version
git switch <your-development-branch>
git fetch origin
git merge origin/main
git status
```

Example:

```bash
cd ~/Soundwave-Live-Version
git switch christian-dev
git fetch origin
git merge origin/main
git status
```

This ensures that future work begins from the current integrated repository state.
