import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";

const tokenService =
  createTokenService("logout-http-test-secret");

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
    tokenRevocationRepository: repository
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

test("HTTP logout revokes one token without revoking another", async t => {
  const repository = createMemoryRepository();
  const baseUrl = await startApp(t, repository);

  const firstToken =
    tokenService.create_token({ id: 42, role: "user" });

  const secondToken =
    tokenService.create_token({ id: 42, role: "user" });

  assert.notEqual(firstToken, secondToken);

  const firstLogout = await fetch(
    `${baseUrl}/auth/logout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firstToken}`
      }
    }
  );

  assert.equal(firstLogout.status, 204);

  const repeatedLogout = await fetch(
    `${baseUrl}/auth/logout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firstToken}`
      }
    }
  );

  assert.equal(repeatedLogout.status, 401);

  const secondLogout = await fetch(
    `${baseUrl}/auth/logout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secondToken}`
      }
    }
  );

  assert.equal(secondLogout.status, 204);
});

test("HTTP logout rejects a missing Bearer token", async t => {
  const baseUrl =
    await startApp(t, createMemoryRepository());

  const result = await fetch(
    `${baseUrl}/auth/logout`,
    { method: "POST" }
  );

  assert.equal(result.status, 401);
  assert.equal(
    result.headers.get("www-authenticate"),
    "Bearer"
  );
});

test("HTTP logout returns 503 when revocation lookup fails", async t => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("database_unavailable");
    },

    async revokeToken() {
      throw new Error("Should not write");
    }
  };

  const baseUrl = await startApp(t, repository);

  const token =
    tokenService.create_token({ id: 42, role: "user" });

  const result = await fetch(
    `${baseUrl}/auth/logout`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  assert.equal(result.status, 503);

  assert.deepEqual(await result.json(), {
    error: "authentication_unavailable"
  });
});
