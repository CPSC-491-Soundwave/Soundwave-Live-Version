import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createTokenService } from "../src/auth/token.js";

import {
  authorizeRevocableRequest
} from "../src/auth/request-authorization.js";

const tokenService =
  createTokenService("role-integration-test-secret");

function createRepository() {
  const revoked = new Set();

  return {
    revoked,

    async isTokenRevoked(jti) {
      return revoked.has(jti);
    }
  };
}

async function startServer(
  t,
  repository,
  allowedRoles = ["admin"]
) {
  const server = http.createServer(async (req, res) => {
    const principal = await authorizeRevocableRequest(
      req,
      res,
      {
        tokenService,
        tokenRevocationRepository: repository,
        allowedRoles
      }
    );

    if (!principal) return;

    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    res.end(JSON.stringify({
      userId: principal.userId,
      role: principal.role
    }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  return `http://127.0.0.1:${server.address().port}`;
}

async function requestWithToken(url, token, headers = {}) {
  return fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });
}

test("administrator accesses an admin-only policy", async t => {
  const url = await startServer(t, createRepository());

  const token = tokenService.create_token({
    id: 7,
    role: "admin"
  });

  const response = await requestWithToken(url, token);

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    userId: "7",
    role: "admin"
  });
});

test("regular user receives 403 for admin-only policy", async t => {
  const url = await startServer(t, createRepository());

  const token = tokenService.create_token({
    id: 42,
    role: "user"
  });

  const response = await requestWithToken(url, token);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "forbidden"
  });
});

test("missing authentication receives 401", async t => {
  const url = await startServer(t, createRepository());

  const response = await requestWithToken(url, null);

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("www-authenticate"),
    "Bearer"
  );
});

test("revoked administrator JWT receives 401", async t => {
  const repository = createRepository();
  const url = await startServer(t, repository);

  const token = tokenService.create_token({
    id: 7,
    role: "admin"
  });

  const claims = tokenService.verify_token(token);
  repository.revoked.add(claims.jti);

  const response = await requestWithToken(url, token);

  assert.equal(response.status, 401);
});

test("client role header cannot grant admin privileges", async t => {
  const url = await startServer(t, createRepository());

  const token = tokenService.create_token({
    id: 42,
    role: "user"
  });

  const response = await requestWithToken(url, token, {
    "X-Role": "admin",
    "X-User-Id": "7"
  });

  assert.equal(response.status, 403);
});

test("revocation database failure returns 503", async t => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("simulated_database_failure");
    }
  };

  const url = await startServer(t, repository);

  const token = tokenService.create_token({
    id: 7,
    role: "admin"
  });

  const response = await requestWithToken(url, token);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "authentication_unavailable"
  });
});

test("invalid authorization policy fails closed", async t => {
  const url = await startServer(
    t,
    createRepository(),
    ["superadmin"]
  );

  const token = tokenService.create_token({
    id: 7,
    role: "admin"
  });

  const response = await requestWithToken(url, token);

  assert.equal(response.status, 503);
});
