/**
 * SCRUM-358: real PostgreSQL + HTTP integration smoke.
 * Run explicitly from the repository root:
 *   node --env-file=database/.env.test \
 *     server/scripts/scrum358-postgres-http-smoke.mjs soundwave_allison_test
 *
 * Safety: checks exact database name before writing, uses disposable IDs,
 * runs all database changes inside one outer transaction, and ALWAYS rolls
 * that transaction back. Inner repository transactions use SAVEPOINTs on the
 * same PostgreSQL connection. Nothing is committed to the test database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

import { createApp } from "../src/app.js";
import { hash_password } from "../src/auth/hasher.js";
import { createTokenService } from "../src/auth/token.js";
import { createAuthUserRepository } from "../src/data/auth-user.repository.js";
import { createAccountProfileRepository } from "../src/data/account-profile.repository.js";
import { createTokenRevocationRepository } from "../src/data/token-revocation.repository.js";

const expectedDatabase = process.argv[2];
const suffix = randomBytes(6).toString("hex");
const userId = (BigInt(`0x${randomBytes(7).toString("hex")}`) + 1000000000000000n).toString();
const competingUserId = (BigInt(userId) + 1n).toString();
const originalName = `s358_${suffix}_original`;
const updatedName = `s358_${suffix}_updated`;
const competingName = `s358_${suffix}_taken`;
const rollbackName = `s358_${suffix}_rollback`;
const password = `SCRUM358_disposable_${randomBytes(24).toString("hex")}`;
const client = new pg.Client();
let server;
let transactionOpen = false;
let connectionOpen = false;
let failure;

function check(condition, label) {
  assert.ok(condition, label);
  console.log(`PASS: ${label}`);
}

// The outer transaction is managed here. The repository sees SAVEPOINTs
// instead of BEGIN/COMMIT/ROLLBACK, so no inner update can commit test data.
const database = {
  query(sql, params) {
    return client.query(sql, params);
  },
  async connect() {
    return {
      async query(sql, params) {
        const command = typeof sql === "string" ? sql.trim().toUpperCase() : "";
        if (command === "BEGIN") {
          return client.query("SAVEPOINT scrum358_profile_update");
        }
        if (command === "COMMIT") {
          return client.query("RELEASE SAVEPOINT scrum358_profile_update");
        }
        if (command === "ROLLBACK") {
          await client.query("ROLLBACK TO SAVEPOINT scrum358_profile_update");
          return client.query("RELEASE SAVEPOINT scrum358_profile_update");
        }
        return client.query(sql, params);
      },
      release() {
        // The test owns this connection until its outer ROLLBACK.
      }
    };
  }
};

async function httpRequest(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const json = await response.json();
  return { status: response.status, headers: response.headers, body: json };
}

async function accountRow() {
  const result = await client.query(
    `SELECT u.id, u.username, u.role, p.audio_quality_preference AS quality
       FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0];
}

async function main() {
  if (!expectedDatabase || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(expectedDatabase)) {
    throw new Error("Pass the exact expected test database name as the only argument.");
  }
  if (!/test/i.test(expectedDatabase)) {
    throw new Error("Refusing a database name that does not include 'test'.");
  }

  await client.connect();
  connectionOpen = true;
  const inspection = await client.query(`
    SELECT current_database() AS name,
           to_regclass('users') AS users,
           to_regclass('user_preferences') AS preferences,
           to_regclass('revoked_access_tokens') AS revocations
  `);
  const actual = inspection.rows[0];
  assert.equal(actual.name, expectedDatabase,
    "Database mismatch: refusing to insert any test records");
  check(Boolean(actual.users && actual.preferences && actual.revocations),
    "Required live PostgreSQL tables exist");

  const constraints = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid IN ('users'::regclass, 'user_preferences'::regclass)
      AND conname = ANY($1::text[])
  `, [["users_username_unique", "user_preferences_audio_quality_nonblank"]]);
  assert.deepEqual(
    new Set(constraints.rows.map((row) => row.conname)),
    new Set(["users_username_unique", "user_preferences_audio_quality_nonblank"])
  );
  console.log(`VERIFIED: Expected test database '${actual.name}' and real schema constraints`);

  // Do expensive password hashing before opening the transaction.
  const passwordHash = await hash_password(password);
  await client.query("BEGIN");
  transactionOpen = true;
  await client.query("SET LOCAL statement_timeout = '10s'");

  await client.query(
    `INSERT INTO users (id, username, password_hash, role)
     VALUES ($1, $2, $3, 'user'), ($4, $5, $3, 'user')`,
    [userId, originalName, passwordHash, competingUserId, competingName]
  );
  console.log("PASS: Two disposable accounts inserted inside rollback-only transaction");

  const profiles = createAccountProfileRepository(database);
  const authentication = createAuthUserRepository(database);
  const revocations = createTokenRevocationRepository(database);
  const tokens = createTokenService(`scrum358-integration-${randomBytes(32).toString("hex")}`);
  server = createApp({
    tokenService: tokens,
    tokenRevocationRepository: revocations,
    findUserByUsername: authentication.findUserByUsername,
    findProfileByUserId: profiles.findProfileByUserId,
    updateProfileByUserId: profiles.updateProfileByUserId
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  let result = await httpRequest("POST", "/auth/login", {
    username: originalName, password
  });
  assert.equal(result.status, 200);
  assert.equal(typeof result.body.accessToken, "string");
  const token = result.body.accessToken;
  console.log("PASS: Real POST /auth/login authenticates disposable account");

  result = await httpRequest("GET", "/account/profile", undefined, token);
  assert.equal(result.status, 200);
  assert.equal(result.body.user.username, originalName);
  assert.equal(result.body.preferences.audioQualityPreference, null);
  console.log("PASS: Real GET /account/profile reads the initial account");

  result = await httpRequest("PATCH", "/account/profile", {
    username: updatedName, audioQualityPreference: "High"
  }, token);
  assert.equal(result.status, 200);
  assert.equal(result.body.user.id, userId);
  assert.equal(result.body.user.role, "user");
  assert.equal(result.body.user.username, updatedName);
  assert.equal(result.body.preferences.audioQualityPreference, "High");
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(JSON.stringify(result.body).includes("password_hash"), false);
  const saved = await accountRow();
  assert.equal(saved.username, updatedName);
  assert.equal(saved.quality, "High");
  console.log("PASS: PATCH persists both fields in actual PostgreSQL tables");

  result = await httpRequest("GET", "/account/profile", undefined, token);
  assert.equal(result.status, 200);
  assert.equal(result.body.user.username, updatedName);
  assert.equal(result.body.preferences.audioQualityPreference, "High");
  console.log("PASS: Fresh GET reflects the persisted update");

  result = await httpRequest("POST", "/auth/login", {
    username: originalName, password
  });
  assert.equal(result.status, 401);
  result = await httpRequest("POST", "/auth/login", {
    username: updatedName, password
  });
  assert.equal(result.status, 200);
  console.log("PASS: New username can log in; old username cannot");

  result = await httpRequest("PATCH", "/account/profile", {
    username: competingName, audioQualityPreference: "Low"
  }, token);
  assert.equal(result.status, 409);
  assert.equal((await accountRow()).username, updatedName);
  assert.equal((await accountRow()).quality, "High");
  console.log("PASS: Unique constraint rejects duplicate username without partial update");

  result = await httpRequest("PATCH", "/account/profile", {
    userId: competingUserId, role: "admin", username: "forbidden"
  }, token);
  assert.equal(result.status, 400);
  const competing = await client.query("SELECT username, role FROM users WHERE id = $1", [competingUserId]);
  assert.deepEqual(competing.rows[0], { username: competingName, role: "user" });
  console.log("PASS: Forged target identity and privilege modifications are rejected");

  result = await httpRequest("PATCH", "/account/profile", {
    audioQualityPreference: null
  }, token);
  assert.equal(result.status, 200);
  assert.equal((await accountRow()).quality, null);
  console.log("PASS: Preference can be cleared with JSON null");

  await assert.rejects(
    profiles.updateProfileByUserId(userId, {
      username: rollbackName,
      audioQualityPreference: "  "
    }),
    (error) => error.code === "23514"
  );
  assert.equal((await accountRow()).username, updatedName);
  assert.equal((await accountRow()).quality, null);
  console.log("PASS: Real database constraint failure rolls back username change");

  const claims = tokens.verify_token(token);
  const revoked = await revocations.revokeToken({
    jti: claims.jti,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  assert.equal(revoked, true);
  result = await httpRequest("PATCH", "/account/profile", {
    username: rollbackName
  }, token);
  assert.equal(result.status, 401);
  assert.equal((await accountRow()).username, updatedName);
  console.log("PASS: Persistently revoked JWT cannot change the profile");
}

try {
  await main();
} catch (error) {
  failure = error;
  console.error(`FAIL: ${error?.code ? `${error.code}: ` : ""}${error?.message ?? error}`);
} finally {
  if (server?.listening) {
    try {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    } catch (error) {
      failure ??= error;
      console.error("FAIL: Could not close local test server safely.");
    }
  }
  if (transactionOpen && connectionOpen) {
    try {
      await client.query("ROLLBACK");
      transactionOpen = false;
      console.log("CLEANUP: Outer transaction rolled back; no test writes committed.");
      const rows = await client.query(
        "SELECT COUNT(*)::integer AS count FROM users WHERE id = ANY($1::bigint[])",
        [[userId, competingUserId]]
      );
      assert.equal(rows.rows[0].count, 0);
      console.log("PASS: Disposable accounts are absent after rollback.");
    } catch (error) {
      failure ??= error;
      console.error(`CLEANUP ERROR: ${error.message}`);
    }
  }
  if (connectionOpen) {
    try {
      await client.end();
    } catch (error) {
      failure ??= error;
      console.error("CLEANUP ERROR: Failed to close PostgreSQL connection.");
    }
  }
  if (failure) {
    console.error("SCRUM-358 PostgreSQL/HTTP smoke FAILED; do not commit.");
    process.exitCode = 1;
  } else {
    console.log("SCRUM-358 PostgreSQL/HTTP smoke PASSED; no database records retained.");
  }
}
