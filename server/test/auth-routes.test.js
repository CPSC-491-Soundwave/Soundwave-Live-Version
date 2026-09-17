import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";
import { hash_password } from "../src/auth/hasher.js";

test(
  "login token authenticates GET /auth/me through the real HTTP server",
  async (t) => {
    const password = "rubberbabybabybunkers123";

    const passwordHash = await hash_password(password);

    const testUser = {
      id: 1,
      username: "testuser",
      password_hash: passwordHash,
      role: "user",
    };

    const findUserByUsername = async (username) => {
      if (username === testUser.username) {
        return testUser;
      }

      return null;
    };

    const tokenService = createTokenService(
      "test-only-secret-key-for-auth-route-integration",
    );

    const server = createApp({
      tokenService,
      findUserByUsername,
    });

    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    );

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    assert.ok(address);
    assert.equal(typeof address, "object");

    const loginResponse = await fetch(
      `http://127.0.0.1:${address.port}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "testuser",
          password,
        }),
      },
    );

    assert.equal(loginResponse.status, 200);

    const loginBody = await loginResponse.json();

    assert.equal(loginBody.tokenType, "Bearer");
    assert.equal(typeof loginBody.accessToken, "string");
    assert.ok(loginBody.accessToken.length > 0);

    const meResponse = await fetch(
      `http://127.0.0.1:${address.port}/auth/me`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
      },
    );

    assert.equal(meResponse.status, 200);

    const meBody = await meResponse.json();

    assert.deepEqual(meBody, {
      user: {
        id: "1",
        role: "user",
      },
    });
  },
);

test(
  "GET /auth/me rejects an unauthenticated HTTP request",
  async (t) => {
    const tokenService = createTokenService(
      "test-only-secret-key-for-auth-route-integration",
    );

    const server = createApp({
      tokenService,
      findUserByUsername: async () => null,
    });

    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    );

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    assert.ok(address);
    assert.equal(typeof address, "object");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/me`,
    );

    assert.equal(response.status, 401);
  },
);
