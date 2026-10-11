import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";

const tokenService =
  createTokenService("protected-route-test-secret");

function createMemoryRepository() {
  const revoked = new Set();

  return {
    async isTokenRevoked(jti) {
      return revoked.has(jti);
    },

    async revokeToken({ jti }) {
      if (revoked.has(jti)) {
        return false;
      }

      revoked.add(jti);
      return true;
    }
  };
}

async function startApp(t, repository) {
  const server = createApp({
    tokenService,

    tokenRevocationRepository: repository,

    async findProfileByUserId(userId) {
      return {
        user_id: userId,
        username: "test-user",
        role: "user",
        audio_quality_preference: null
      };
    },

    async handleCatalogRequest(req, res) {
      if (
        req.method !== "GET" ||
        (
          req.url !== "/api/library/recently-added" &&
          req.url !== "/api/library/favorites"
        )
      ) {
        return false;
      }

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(JSON.stringify([]));
      return true;
    }
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

async function getWithToken(baseUrl, path, token) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

test("logout denies access to all three protected routes", async t => {
  const repository = createMemoryRepository();
  const baseUrl = await startApp(t, repository);

  const token =
    tokenService.create_token({ id: 42, role: "user" });

  const protectedPaths = [
    "/auth/me",
    "/account/profile",
    "/api/library/recently-added",
    "/api/library/favorites"
  ];

  for (const path of protectedPaths) {
    const result =
      await getWithToken(baseUrl, path, token);

    assert.equal(result.status, 200, path);
  }

  const logout = await fetch(
    `${baseUrl}/auth/logout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  assert.equal(logout.status, 204);

  for (const path of protectedPaths) {
    const result =
      await getWithToken(baseUrl, path, token);

    assert.equal(result.status, 401, path);

    assert.equal(
      result.headers.get("www-authenticate"),
      "Bearer"
    );
  }
});

test("logging out one session does not revoke another", async t => {
  const baseUrl =
    await startApp(t, createMemoryRepository());

  const firstToken =
    tokenService.create_token({ id: 42, role: "user" });

  const secondToken =
    tokenService.create_token({ id: 42, role: "user" });

  const logout = await fetch(
    `${baseUrl}/auth/logout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firstToken}`
      }
    }
  );

  assert.equal(logout.status, 204);

  const rejected =
    await getWithToken(baseUrl, "/auth/me", firstToken);

  assert.equal(rejected.status, 401);

  const accepted =
    await getWithToken(baseUrl, "/auth/me", secondToken);

  assert.equal(accepted.status, 200);
});

test("protected routes fail closed when revocation lookup fails", async t => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("database_unavailable");
    }
  };

  const baseUrl = await startApp(t, repository);

  const token =
    tokenService.create_token({ id: 42, role: "user" });

  const result =
    await getWithToken(baseUrl, "/auth/me", token);

  assert.equal(result.status, 503);

  assert.deepEqual(await result.json(), {
    error: "authentication_unavailable"
  });

  const health = await fetch(`${baseUrl}/health`);

  assert.equal(health.status, 200);
});

test("missing revocation repository cannot authorize a protected route", async t => {
  const baseUrl = await startApp(t, undefined);

  const token =
    tokenService.create_token({ id: 42, role: "user" });

  const result =
    await getWithToken(baseUrl, "/auth/me", token);

  assert.equal(result.status, 503);
});
