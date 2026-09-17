# Authentication Configuration

## Purpose

Soundwave authentication requires server-side configuration for signing and
verifying JWT access tokens.

The authentication implementation receives the signing secret through:

`createTokenService(secretKey)`

The token service does not choose or hardcode the secret itself. The shared
server startup/configuration layer will eventually provide the configured
secret during application startup.

---

## JWT_SECRET

`JWT_SECRET` is the server-side secret used to sign and verify Soundwave JWT
access tokens.

- Required when authentication is enabled
- Passed to `createTokenService(secretKey)`
- Must remain private
- Must never be committed to Git
- Must never be sent to the client
- Must never be written to logs

The current authentication implementation rejects an empty or missing signing
secret.

---

## Generating a Development Secret

A local development secret can be generated with:

```bash
openssl rand -hex 32
```

## Supplying the Secret

For local development, the secret may be supplied through the shell
environment:

```bash
export JWT_SECRET="<generated-secret>"
```

## Secret Handling

The JWT signing secret must not be committed to Git, exposed to the client,
included in API responses, or written to application logs.

The application must not use a hardcoded fallback secret when JWT_SECRET
is missing.

## Test Configuration

Authentication tests use explicit test-only secrets and should not depend on the developer's real `JWT_SECRET`.

## Deferred Configuration

Database configuration, refresh/session configuration, TOTP, account lockout,
and guest-session configuration are outside the current Sprint 1
authentication configuration contract.