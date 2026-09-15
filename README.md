# Soundwave-Live-Version

Soundwave is the CPSC 491-05 Fall 2026 capstone implementation of the Soundwave music-streaming application.

This repository contains the shared Soundwave application. Development is completed on individual development branches and integrated into `main` through peer-reviewed pull requests.

---

## Team

- Christian McGowan
- Allison Yu
- Emmanuel De Guzman
- Matthew Choi
- Konner Rigby

**Course:** CPSC 491-05  
**Semester:** Fall 2026

---

# 1. Current Technology Stack

The current merged Sprint 1 implementation uses:

| Area | Technology |
| --- | --- |
| Backend | Node.js |
| Backend Language | JavaScript |
| Backend HTTP | Node.js built-in HTTP server |
| Backend Tests | Node.js built-in test runner |
| Frontend | React |
| Frontend Language | JavaScript / JSX |
| Frontend Build Tool | Vite |
| Frontend Routing | React Router |
| Frontend Styling | CSS and shared design tokens |
| Source Control | Git / GitHub |
| CI | GitHub Actions planned during Sprint 1 |
| Database | PostgreSQL planned; implementation owned by Allison Yu |
| Password Hashing | Argon2id via `argon2` |
| Access Tokens | JWT via `jsonwebtoken` |
| Media / Streaming | Sprint 1 implementation owned by Matthew Choi |
| Packaging / Self-host Setup | Sprint 1 implementation owned by	 Konner Rigby |

**Tailwind CSS is not being used.**

The repository will expand as the remaining Sprint 1 implementations are merged.

---

# 2. Quick Start

A new developer should be able to use the instructions below to clone the repository, install dependencies, start the frontend and backend, verify the backend, and run the currently available checks.

## 2.1 Clone the Repository

From a WSL/Linux terminal:

```bash
cd ~
git clone https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version.git
cd Soundwave-Live-Version
```

Verify that the repository was cloned successfully:

```bash
pwd
git status
git branch --show-current
```

The branch should initially be:

```text
main
```

---

## 2.2 Install Client Dependencies

From the repository root:

```bash
cd client
npm ci
```

The client contains a committed `package-lock.json`, so `npm ci` should be used for a clean and reproducible installation.

Return to the repository root:

```bash
cd ..
```

---

## 2.3 Start the Backend

From the repository root:

```bash
cd server
npm start
```

Expected output:

```text
Soundwave API listening on http://localhost:8080
```

Leave this terminal running.

---

## 2.4 Start the Client

Open a second WSL/Linux terminal.

Move into the project:

```bash
cd ~/Soundwave-Live-Version/client
```

Start the Vite development server:

```bash
npm run dev
```

Vite will print the local development URL in the terminal.

Open the URL shown by Vite in a browser.

Leave this terminal running while using the client.

---

## 2.5 Verify the Backend

Open another terminal and run:

```bash
curl -i http://localhost:8080/health
```

Expected response:

```text
HTTP/1.1 200 OK
Content-Type: application/json
```

Expected JSON body:

```json
{"status":"ok"}
```

The `/health` endpoint is intentionally public.

It currently verifies that the Soundwave Node.js backend process is alive and responding to HTTP requests.

---

## 2.6 Verify Unknown-Route Handling

With the backend running:

```bash
curl -i http://localhost:8080/not-real
```

Expected response:

```text
HTTP/1.1 404 Not Found
```

Expected JSON body:

```json
{"error":"not_found"}
```

---

## 2.7 Run Backend Tests

From the repository root:

```bash
cd server
npm test
```

The current backend test suite verifies:

- `GET /health` returns HTTP `200`.
- `/health` returns the expected JSON response.
- Unknown routes return HTTP `404`.

Current expected result:

```text
tests 2
pass 2
fail 0
```

---

## 2.8 Verify the Client

From the repository root:

```bash
cd client
```

Run ESLint:

```bash
npm run lint
```

Build the production client:

```bash
npm run build
```

Both commands should complete successfully before a client-related pull request is submitted.

The client does not currently define an automated `npm test` script.

---

# 3. Prerequisites

Before working with Soundwave, install:

- Git
- Node.js 20.x
- npm
- Visual Studio Code or another editor
- WSL/Linux if following the documented development environment

The current project has been successfully run with:

```text
Node.js v20.20.1
npm 11.11.1
```

## 3.1 Verify Git

```bash
git --version
```

## 3.2 Verify Node.js

```bash
node --version
```

## 3.3 Verify npm

```bash
npm --version
```

## 3.4 Verify Git Identity

Course work must be attributable to the developer who authored it.

Check your configured identity:

```bash
git config user.name
git config user.email
```

If the repository-specific identity needs to be configured:

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

Use the same named GitHub identity throughout the semester.

---

# 4. Open the Project in Visual Studio Code

From the repository root:

```bash
cd ~/Soundwave-Live-Version
code .
```

If the repository was cloned somewhere else, navigate to that location instead.

---

# 5. Install and Use `tree`

The `tree` utility is useful for inspecting the repository without opening every directory manually.

Check whether it is installed:

```bash
tree --version
```

If it is not installed on Ubuntu/WSL:

```bash
sudo apt update
sudo apt install tree
```

From the Soundwave repository root, display the project while excluding Git metadata, Node dependencies, and build output:

```bash
tree -I 'node_modules|.git|build'
```

---

# 6. Current Sprint 1 Repository Skeleton

Current repository structure:

```text
.
├── README.md
├── client
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── public
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── assets
│   │   │   ├── hero.png
│   │   │   ├── react.svg
│   │   │   └── vite.svg
│   │   ├── components
│   │   │   ├── PlaybackBar.css
│   │   │   ├── PlaybackBar.jsx
│   │   │   ├── Sidebar.css
│   │   │   └── Sidebar.jsx
│   │   ├── index.css
│   │   ├── main.jsx
│   │   ├── pages
│   │   │   ├── Home.jsx
│   │   │   ├── Library.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Search.jsx
│   │   └── styles
│   │       └── tokens.css
│   └── vite.config.js
└── server
    ├── package.json
    ├── src
    │   ├── app.js
    │   └── server.js
    └── test
        └── health.test.js

11 directories, 29 files
```

This tree represents the current early Sprint 1 skeleton and will change as additional team pull requests are merged.

Run the following at any time to see the current structure:

```bash
cd ~/Soundwave-Live-Version
tree -I 'node_modules|.git|build'
```

---

# 7. Backend Setup — Christian McGowan

The current Soundwave backend uses:

- Node.js
- JavaScript
- ES modules
- Node.js built-in HTTP server
- Node.js built-in test runner

The backend is located in:

```text
server/
```

Current backend structure:

```text
server/
├── package.json
├── src/
│   ├── app.js
│   └── server.js
└── test/
    └── health.test.js
```

---

# 8. Backend Commands

## 8.1 Enter the Backend Directory

From the repository root:

```bash
cd server
```

Verify:

```bash
pwd
```

The path should end with:

```text
/Soundwave-Live-Version/server
```

---

## 8.2 Inspect Backend Configuration

```bash
cat package.json
```

Current configuration:

```json
{
  "name": "soundwave-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Soundwave backend server",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test"
  }
}
```

The backend uses Node.js built-in modules together with external packages.

Current backend authentication dependencies include:

| Package | Purpose |
| --- | --- |
| `argon2` | Argon2id password hashing and password verification |
| `jsonwebtoken` | Signed access-token creation and verification |


---

## 8.3 Start the Backend

```bash
npm start
```

Expected output:

```text
Soundwave API listening on http://localhost:8080
```

---

## 8.4 Development Watch Mode

During backend development:

```bash
npm run dev
```

Node will restart the backend when watched source files change.

Stop the process with:

```text
Ctrl+C
```

---

## 8.5 Run Backend Tests

```bash
npm test
```

Expected current result:

```text
tests 2
pass 2
fail 0
```

---

## 8.6 Run on Another Port

The backend defaults to port `8080`.

To use another port:

```bash
PORT=8081 npm start
```

Verify it:

```bash
curl -i http://localhost:8081/health
```

---

# 9. Client Setup — Konner Rigby

The current client uses:

- React
- React DOM
- React Router
- JavaScript / JSX
- Vite
- ESLint
- CSS
- shared CSS design tokens

The team is **not using Tailwind CSS**.

The client is located in:

```text
client/
```

---

# 10. Client Commands

## 10.1 Enter the Client Directory

From the repository root:

```bash
cd client
```

---

## 10.2 Install Client Dependencies

For a fresh clone:

```bash
npm ci
```

`npm ci` uses the committed `package-lock.json` and installs the exact dependency versions represented by the lockfile.

---

## 10.3 Inspect Available Client Scripts

```bash
npm run
```

The current client scripts are:

```text
dev
build
lint
preview
```

The relevant `package.json` scripts are:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

---

## 10.4 Start the Client Development Server

```bash
npm run dev
```

Vite will print the local URL in the terminal.

Open that URL in a browser.

Stop the development server with:

```text
Ctrl+C
```

---

## 10.5 Run Client Linting

```bash
npm run lint
```

Linting should complete successfully before submitting client changes for review.

---

## 10.6 Build the Client

```bash
npm run build
```

Vite will produce the production build output.

The generated build directory should not be manually edited or committed unless the team explicitly changes that policy.

---

## 10.7 Preview the Production Build

After running:

```bash
npm run build
```

start the Vite preview server:

```bash
npm run preview
```

Vite will display the preview URL in the terminal.

Open the displayed URL in a browser.

Stop it with:

```text
Ctrl+C
```

---

# 11. Run the Current Application Locally

The current frontend and backend run as separate development processes.

## Terminal 1 — Backend

```bash
cd ~/Soundwave-Live-Version/server
npm start
```

Expected:

```text
Soundwave API listening on http://localhost:8080
```

## Terminal 2 — Client

```bash
cd ~/Soundwave-Live-Version/client
npm ci
npm run dev
```

Open the URL printed by Vite.

## Terminal 3 — Backend Verification

```bash
curl -i http://localhost:8080/health
```

Expected:

```json
{"status":"ok"}
```

Also verify the backend's `404` behavior:

```bash
curl -i http://localhost:8080/not-real
```

Expected:

```json
{"error":"not_found"}
```

At the current Sprint 1 stage, the client shell and backend skeleton are both runnable, but complete client/backend feature integration is still being developed.

---

# 12. Full Current Verification

Before submitting changes that affect the existing client or backend, run the checks relevant to both applications.

## Backend

```bash
cd ~/Soundwave-Live-Version/server
npm test
```

## Client Lint

```bash
cd ~/Soundwave-Live-Version/client
npm run lint
```

## Client Build

```bash
npm run build
```

A healthy current checkout should have:

```text
Backend tests: PASS
Client lint:    PASS
Client build:   PASS
```

These commands are expected to become automated GitHub Actions checks during Sprint 1.

---

# 13. Database Setup — Allison Yu

Allison Yu owns the Sprint 1 catalog-data/database foundation.

Once that implementation is merged into `main`, this section should include exact commands for:

- PostgreSQL installation or startup;
- database configuration;
- database creation;
- migrations;
- migration rollback where supported;
- deterministic seed data;
- database verification;
- database-related tests.

Until Allison's implementation is merged, do not create or document a competing database setup.

---

# 14. Authentication Setup — Emmanuel De Guzman

Emmanuel De Guzman owns the Sprint 1 login and identity/authentication spike.

The authentication implementation is currently being developed on Emmanuel's
development branch and has not yet been merged into `main`.

Current authentication work includes:

- Argon2id password hashing and password verification;
- signed JWT access-token creation and verification;
- short-lived access-token expiration;
- Bearer-token request authentication;
- validation of supported authentication roles;
- backend authentication tests using Node.js `node:test`.

## 14.1 Authentication Dependencies

The current authentication implementation uses the following external Node.js
packages:

| Package | Purpose |
| --- | --- |
| `argon2` | Argon2id password hashing and password verification |
| `jsonwebtoken` | JWT creation, signing, and verification |

These dependencies are currently required by Emmanuel's authentication branch.

They have not yet been documented as part of the merged backend dependency
contract because the authentication implementation has not been merged into
`main`.

The shared backend `package.json` and `package-lock.json` should only be updated
through the team's agreed integration process.

## 14.2 Authentication Source Files

The current authentication implementation is organized under:
```
/auth 
login.js for login requests
me.js for identity handler
auth.js for request handler

/password-hasher
hasher.js for argon password hasher and verifier

/token-auth
token.js for token generator and verifier
```

## 14.3 Authentication Tests

Once the authentication dependencies are installed, run the authentication
test suite from the current authentication development directory:

```bash
node --test
```

The latest local authentication test run produced:

```text
tests 25
pass 25
fail 0
```

## 14.4 Auth Config

The Sprint 1 authentication implementation defines `JWT_SECRET` as the
server-side signing secret for JWT access tokens.

The secret is supplied to:

`createTokenService(secretKey)`

Real signing secrets must not be committed to Git, exposed to the client,
or written to logs.

The shared backend does not yet read `JWT_SECRET` during startup. This
configuration contract will be wired into the shared server during
integration.

See `AUTHCONFIG.md` for generation, handling, testing, and deferred
configuration details.

# 15. Media and Streaming Setup — Matthew Choi

Matthew Choi owns the Sprint 1 media-ingest and HTTP Range playback spike.

Once that implementation is merged into `main`, this section should contain verified instructions for:

- legal test-media setup;
- media directory configuration;
- media ingest;
- metadata extraction;
- media endpoint verification;
- HTTP Range requests;
- HTTP `206 Partial Content` verification;
- media-specific automated tests.

Do not implement or document a competing media endpoint outside the established media contract.

---

# 16. Packaging and Self-Hosted Setup — Konner Rigby

Konner Rigby owns the Sprint 1 client shell and self-host packaging work.

Once container/self-host packaging is merged into `main`, this section should contain verified commands for:

- required container tooling;
- Docker build;
- Docker Compose startup;
- Docker Compose shutdown;
- persistent data configuration;
- clean-machine startup verification.

Until that implementation is merged, use the direct Node.js and Vite development commands documented above.

---

# 17. Git Development Workflow

Implementation work should be performed on a developer branch rather than directly on `main`.

## 17.1 Check Current Repository State

```bash
cd ~/Soundwave-Live-Version
git status
git branch --show-current
```

---

## 17.2 Switch to Your Development Branch

```bash
git switch <your-development-branch>
```

Example:

```bash
git switch christian-dev
```

---

## 17.3 Synchronize With the Latest `main`

Before beginning a new block of work:

```bash
git fetch origin
git merge origin/main
git status
```

Example complete sequence:

```bash
cd ~/Soundwave-Live-Version
git switch christian-dev
git fetch origin
git merge origin/main
git status
```

This should also be done after another teammate merges work that your implementation depends on.

If Git reports a merge conflict, stop and resolve the affected files before continuing.

Do not blindly overwrite another teammate's changes.

---

# 18. Inspect Changes Before Committing

Check status:

```bash
git status
```

Inspect unstaged changes:

```bash
git diff
```

Avoid the Git pager if desired:

```bash
git --no-pager diff
```

Check for whitespace errors:

```bash
git diff --check
```

No output from `git diff --check` means Git did not detect whitespace errors.

---

# 19. Stage Changes

Stage only files related to the current task.

General form:

```bash
git add <files>
```

Example:

```bash
git add README.md
```

Example for backend files:

```bash
git add server
```

Check staged files:

```bash
git status
```

View a summary:

```bash
git diff --cached --stat
```

Inspect the full staged change:

```bash
git --no-pager diff --cached
```

Check staged whitespace:

```bash
git diff --cached --check
```

Do not commit until you understand what is staged.

---

# 20. Commit Changes

Create a descriptive commit:

```bash
git commit -m "<descriptive commit message>"
```

Examples used or planned during Sprint 1:

```bash
git commit -m "feat: add Node.js backend health check skeleton"
```

```bash
git commit -m "docs: add complete development setup guide"
```

```bash
git commit -m "chore: establish pull request workflow"
```

```bash
git commit -m "ci: add Node.js and client verification checks"
```

Inspect recent commit history:

```bash
git log --oneline -3
```

---

# 21. Push Your Development Branch

Push the current development branch:

```bash
git push origin <your-development-branch>
```

Example:

```bash
git push origin christian-dev
```

Then verify:

```bash
git status
```

A synchronized branch should report approximately:

```text
On branch <your-development-branch>
Your branch is up to date with 'origin/<your-development-branch>'.

nothing to commit, working tree clean
```

---

# 22. Pull Request Workflow

After pushing:

1. Open the Soundwave GitHub repository.
2. Select **Pull requests**.
3. Create a new pull request.
4. Set the base branch to `main`.
5. Set the compare branch to your development branch.
6. Explain what changed.
7. Explain how the change was tested.
8. Link the corresponding Jira issue when available.
9. Request review from at least one teammate.
10. Address review comments.
11. Wait for required checks to pass.
12. Merge only after approval.

The expected integration flow is:

```text
Developer Branch
       |
       v
Pull Request
       |
       v
Automated Checks
       |
       v
Peer Review
       |
       v
main
```

Direct feature development on `main` should be avoided.

---

# 23. Synchronize After a Pull Request Is Merged

After your pull request is merged, update your development branch.

```bash
cd ~/Soundwave-Live-Version
git switch <your-development-branch>
git fetch origin
git merge origin/main
git status
```

Christian example:

```bash
cd ~/Soundwave-Live-Version
git switch christian-dev
git fetch origin
git merge origin/main
git status
```

This keeps the development branch synchronized with work merged by other teammates.

---

# 24. Environment and Secrets

Do not commit:

- passwords;
- API keys;
- authentication tokens;
- private keys;
- database passwords;
- personal credentials;
- production secrets;
- real `.env` files containing secret values.

Environment-specific configuration should use environment variables or another team-approved configuration mechanism.

A sanitized `.env.example` may be committed once the complete environment-variable contract is established.

The current backend already supports:

```text
PORT
```

Example:

```bash
PORT=8081 npm start
```

## 24.1 Authentication Environment

The Sprint 1 authentication implementation defines:

```
`JWT_SECRET` is the server-side secret used to sign and verify JWT access
tokens.
```

The shared backend does not yet consume this environment variable during
startup. It currently defines the authentication configuration contract that
will be wired into the shared server during integration.

Real JWT signing secrets must not be committed to Git, exposed to the client,
or written to logs.

See `AUTHCONFIG.md` for generation, handling, testing, and deferred
configuration details.

---

# 25. Sprint 1 Ownership Boundaries

Sprint 1 implementation is divided so teammates can integrate without creating competing implementations of the same feature.

| Team Member | Sprint 1 Primary Responsibility |
| --- | --- |
| Christian McGowan | Walking skeleton, backend health contract, CI/delivery workflow |
| Allison Yu | Catalog data foundation and deterministic seed |
| Emmanuel De Guzman | Login and identity/authentication spike |
| Matthew Choi | Media ingest and HTTP Range playback spike |
| Konner Rigby | Client shell and self-host packaging |

Shared integration is expected.

A developer may:

- consume another teammate's interface;
- review another teammate's pull request;
- integrate their own feature with another subsystem.

A developer should not independently implement another teammate's primary Sprint 1 feature.

---

# 26. Current Sprint 1 Status

Currently established or merged:

- GitHub repository;
- individual development branches;
- peer-reviewed PR workflow in use;
- Node.js + JavaScript backend skeleton;
- configurable backend port;
- public `GET /health`;
- backend health automated test;
- unknown-route `404` automated test;
- React/Vite client shell;
- CSS-based client styling;
- sidebar component;
- playback-bar component;
- Home page;
- Library page;
- Login page;
- Search page.

Still expected during Sprint 1:

- root development documentation;
- contribution guide;
- formal pull-request template;
- GitHub Actions checks;
- database/catalog-data foundation;
- authentication/identity spike;
- media-ingest and Range-streaming spike;
- self-host packaging;
- client/backend health integration.

This section should be updated as pull requests are merged.

---

# 27. Shared README Ownership

The root `README.md` is shared team documentation.

Before modifying it:

```bash
cd ~/Soundwave-Live-Version
git switch <your-development-branch>
git fetch origin
git merge origin/main
git status
```

To minimize conflicts:

1. Update only the section relevant to your subsystem where practical.
2. Do not reorganize or rewrite another teammate's section unnecessarily.
3. Do not document commands that have not actually been verified.
4. Update commands whenever implementation changes make older instructions invalid.
5. Merge documentation changes regularly instead of allowing large conflicting README changes to accumulate.
6. Each teammate should document the setup and verification commands associated with the subsystem they implement.

---

# 28. Troubleshooting

## 28.1 `npm` Cannot Find `package.json`

If npm reports an error similar to:

```text
ENOENT
Could not read package.json
```

check your location:

```bash
pwd
```

For backend commands, the path should end with:

```text
/Soundwave-Live-Version/server
```

For client commands, the path should end with:

```text
/Soundwave-Live-Version/client
```

Inspect the current directory:

```bash
ls -la
```

---

## 28.2 Inspect Backend Files

From the repository root:

```bash
find server -maxdepth 4 -type f -print | sort
```

Expected current backend files:

```text
server/package.json
server/src/app.js
server/src/server.js
server/test/health.test.js
```

---

## 28.3 Inspect Client Files

From the repository root:

```bash
find client -maxdepth 3 -type f -print | sort
```

---

## 28.4 Accidentally Created a Nested `server/server`

Always check your current directory before creating relative paths:

```bash
pwd
```

If you are already inside:

```text
Soundwave-Live-Version/server
```

use paths such as:

```bash
mkdir -p src
mkdir -p test
```

Do **not** run:

```bash
mkdir -p server/src
```

from inside `server/`, because that creates:

```text
server/server/src
```

From the repository root, this is correct:

```bash
mkdir -p server/src
mkdir -p server/test
```

---

## 28.5 Port 8080 Already in Use

If the backend reports:

```text
EADDRINUSE
```

check for a running Node.js process:

```bash
ps aux | grep "[n]ode"
```

If the backend is running in another terminal, return to that terminal and press:

```text
Ctrl+C
```

Then retry:

```bash
cd ~/Soundwave-Live-Version/server
npm start
```

Alternatively:

```bash
PORT=8081 npm start
```

and verify:

```bash
curl -i http://localhost:8081/health
```

---

## 28.6 Exit the Git Pager

Some Git commands may open a pager.

Press:

```text
q
```

to exit.

To avoid the pager:

```bash
git --no-pager diff
```

or:

```bash
git --no-pager diff --cached
```

---

## 28.7 Verify Repository Structure

From the repository root:

```bash
tree -I 'node_modules|.git|build'
```

This is useful after pulling another teammate's changes to confirm what was added.

---

# 29. Fresh-Clone Verification Checklist

The sequence below can be used to verify that a new developer can run the current Soundwave skeleton from scratch.

## Clone

```bash
cd ~
git clone https://github.com/CPSC-491-Soundwave/Soundwave-Live-Version.git
cd Soundwave-Live-Version
```

## Inspect

```bash
git status
git branch --show-current
tree -I 'node_modules|.git|build'
```

## Install Client Dependencies

```bash
cd client
npm ci
```

## Verify Client

```bash
npm run lint
npm run build
```

## Start Client

```bash
npm run dev
```

Leave that terminal running.

## Start Backend in Another Terminal

```bash
cd ~/Soundwave-Live-Version/server
npm start
```

Leave that terminal running.

## Verify Backend in Another Terminal

```bash
curl -i http://localhost:8080/health
curl -i http://localhost:8080/not-real
```

Expected behavior:

```text
GET /health   -> HTTP 200
unknown route -> HTTP 404
```

## Run Backend Tests

Stop the backend with `Ctrl+C`, then:

```bash
cd ~/Soundwave-Live-Version/server
npm test
```

Expected:

```text
tests 2
pass 2
fail 0
```

If all of these steps succeed, the current Sprint 1 Soundwave skeleton is installed and functioning correctly.

---

# 30. Development Verification Checklist

Before opening a pull request, verify the portions of the application affected by your change.

## Backend

```bash
cd ~/Soundwave-Live-Version/server
npm test
```

## Client

```bash
cd ~/Soundwave-Live-Version/client
npm run lint
npm run build
```

## Repository

```bash
cd ~/Soundwave-Live-Version
git status
git diff --check
```

After staging:

```bash
git status
git diff --cached --stat
git diff --cached --check
```

Inspect the staged patch:

```bash
git --no-pager diff --cached
```

Only commit files that belong to the intended change.

---

# 31. Soundwave Project Direction

Soundwave is being developed as a secure, responsive, self-hostable music-streaming application.

The current Sprint 1 implementation is intentionally small and establishes the foundation that later features will consume.

Future integrations include:

- PostgreSQL-backed catalog data;
- authentication and user identity;
- HTTP Range-based audio streaming;
- client/backend integration;
- media ingest;
- playback;
- automated CI;
- self-host deployment;
- playback analytics;
- administration functionality.

Features should be added through small, attributable, peer-reviewed pull requests rather than large conflicting implementations.