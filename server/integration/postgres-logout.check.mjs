import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";
import { hash_password } from "../src/auth/hasher.js";

import {
  createAuthUserRepository
} from "../src/data/auth-user.repository.js";

import {
  createAccountProfileRepository
} from "../src/data/account-profile.repository.js";

import {
  createTokenRevocationRepository
} from "../src/data/token-revocation.repository.js";

import {
  createCatalogHandler
} from "../src/catalog/catalog.handler.js";

const { Pool } = pg;

test("HTTP logout persists revocation in PostgreSQL", async () => {
  if (!/test/i.test(process.env.PGDATABASE ?? "")) {
    throw new Error("A dedicated test database is required.");
  }

  const pool = new Pool();
  const readerPool = new Pool();

  let server;
  let userId;

  const username =
    `cmg_logout_${randomUUID().replaceAll("-", "")}`;

  const password = `test-${randomUUID()}`;

  try {
    const databaseName = (
      await pool.query(
        "SELECT current_database() AS name"
      )
    ).rows[0].name;

    assert.match(databaseName, /test/i);

    const passwordHash = await hash_password(password);

    const userResult = await pool.query(
      `
      INSERT INTO users (username, password_hash, role)
      VALUES ($1, $2, 'user')
      RETURNING id
      `,
      [username, passwordHash]
    );

    userId = String(userResult.rows[0].id);

    const tokenService = createTokenService(
      "sprint3-postgres-http-test-secret"
    );

    const authUsers = createAuthUserRepository(pool);

    const profiles =
      createAccountProfileRepository(pool);

    const revocations =
      createTokenRevocationRepository(pool);

    const catalogHandler = createCatalogHandler(
      {
        async listTracks() {
          return [];
        },
        async listRecentlyAddedTracks() {
          return [];
        },
        async listFavoritesForPrincipal() {
          return [];
        }
      },
      { tokenService }
    );

    server = createApp({
      tokenService,
      tokenRevocationRepository: revocations,
      findUserByUsername:
        authUsers.findUserByUsername,
      findProfileByUserId:
        profiles.findProfileByUserId,
      handleCatalogRequest: catalogHandler
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const baseUrl =
      `http://127.0.0.1:${server.address().port}`;

    async function login() {
      const result = await fetch(
        `${baseUrl}/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            username,
            password
          })
        }
      );

      assert.equal(result.status, 200);

      const body = await result.json();

      assert.equal(
        typeof body.accessToken,
        "string"
      );

      return body.accessToken;
    }

    async function authorizedGet(path, token) {
      return fetch(`${baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    const tokenA = await login();
    const tokenB = await login();

    assert.notEqual(tokenA, tokenB);

    const claimsA =
      tokenService.verify_token(tokenA);

    const claimsB =
      tokenService.verify_token(tokenB);

    assert.notEqual(claimsA.jti, claimsB.jti);

    const protectedRoutes = [
      "/auth/me",
      "/account/profile",
      "/api/library/recently-added",
      "/api/library/favorites"
    ];

    for (const path of protectedRoutes) {
      const result =
        await authorizedGet(path, tokenA);

      assert.equal(
        result.status,
        200,
        `Before logout: ${path}`
      );
    }

    const logoutResponse = await fetch(
      `${baseUrl}/auth/logout`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenA}`
        }
      }
    );

    assert.equal(logoutResponse.status, 204);

    // Verify committed persistence using a different pool.
    const stored = await readerPool.query(
      `
      SELECT jti, user_id, expires_at
      FROM revoked_access_tokens
      WHERE jti = $1
      `,
      [claimsA.jti]
    );

    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].jti, claimsA.jti);
    assert.equal(
      String(stored.rows[0].user_id),
      userId
    );

    for (const path of protectedRoutes) {
      const rejected =
        await authorizedGet(path, tokenA);

      assert.equal(
        rejected.status,
        401,
        `Revoked session: ${path}`
      );

      const accepted =
        await authorizedGet(path, tokenB);

      assert.equal(
        accepted.status,
        200,
        `Active second session: ${path}`
      );
    }

    const secondLogout = await fetch(
      `${baseUrl}/auth/logout`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenB}`
        }
      }
    );

    assert.equal(secondLogout.status, 204);

    console.log(
      "PASS: Real HTTP login issued independent JWTs."
    );
    console.log(
      "PASS: Logout committed revocation to PostgreSQL."
    );
    console.log(
      "PASS: Revoked JWT rejected by all four protected routes."
    );
    console.log(
      "PASS: Independent session remained authorized."
    );
  } finally {
    try {
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close(error => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    } finally {
      try {
        if (userId) {
          await pool.query(
            "DELETE FROM revoked_access_tokens WHERE user_id = $1",
            [userId]
          );

          await pool.query(
            "DELETE FROM users WHERE id = $1 AND username = $2",
            [userId, username]
          );
        }
      } finally {
        await readerPool.end();
        await pool.end();
      }
    }
  }
});
