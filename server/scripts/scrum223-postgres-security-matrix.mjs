/**
 * SCRUM-223: independent, real PostgreSQL + HTTP account security matrix.
 * Explicitly run from repository root, against a disposable test database:
 *   node --env-file=database/.env.test \
 *     server/scripts/scrum223-postgres-security-matrix.mjs soundwave_allison_test
 *
 * Safe by design: requires exact DB name; creates disposable accounts only
 * inside a single outer transaction; nested repository transactions use
 * SAVEPOINTs; ALWAYS rolls back and verifies zero remaining test accounts.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { hash_password } from "../src/auth/hasher.js";
import { createTokenService } from "../src/auth/token.js";
import { createAuthUserRepository } from "../src/data/auth-user.repository.js";
import { createAccountProfileRepository } from "../src/data/account-profile.repository.js";
import { createTokenRevocationRepository } from "../src/data/token-revocation.repository.js";

const expectedName = process.argv[2];
const suffix = randomBytes(6).toString("hex");
const idA = (1000000000000000n + BigInt(`0x${randomBytes(7).toString("hex")}`)).toString();
const idB = (BigInt(idA) + 1n).toString();
const originalA = `s223_${suffix}_a`;
const originalB = `s223_${suffix}_b`;
const password = `s223_fixture_${randomBytes(20).toString("hex")}`;
const jwtSecret = `s223_token_only_${randomBytes(32).toString("hex")}`;
const databaseClient = new pg.Client();
let connectionOpen = false;
let transactionOpen = false;
let server;
let failure;

function passed(label) {
  console.log(`PASS: ${label}`);
}

// Repository BEGIN/COMMIT/ROLLBACK are translated into savepoints on the
// outer transaction connection. No repository action can commit fixture data.
const database = {
  query(sql, params) { return databaseClient.query(sql, params); },
  async connect() {
    return {
      async query(sql, params) {
        const command = typeof sql === "string" ? sql.trim().toUpperCase() : "";
        if (command === "BEGIN") {
          return databaseClient.query("SAVEPOINT scrum223_account_write");
        }
        if (command === "COMMIT") {
          return databaseClient.query("RELEASE SAVEPOINT scrum223_account_write");
        }
        if (command === "ROLLBACK") {
          await databaseClient.query("ROLLBACK TO SAVEPOINT scrum223_account_write");
          return databaseClient.query("RELEASE SAVEPOINT scrum223_account_write");
        }
        return databaseClient.query(sql, params);
      },
      release() { /* Outer transaction owner retains connection. */ }
    };
  }
};

async function request(method, path, { token, body, rawBody, contentType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined || rawBody !== undefined) {
    headers["Content-Type"] = contentType ?? "application/json";
  }
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers,
    body: rawBody !== undefined ? rawBody
      : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, headers: response.headers, data, text };
}

async function account(id) {
  const result = await databaseClient.query(`
    SELECT u.id::text AS id, u.username, u.role, u.password_hash,
           p.audio_quality_preference AS quality
      FROM users u
      LEFT JOIN user_preferences p ON p.user_id = u.id
     WHERE u.id = $1`, [id]);
  assert.equal(result.rowCount, 1, "Expected disposable account to exist");
  return result.rows[0];
}

async function snapshot() {
  return { a: await account(idA), b: await account(idB) };
}

function assertSafeFailure(reply, expectedStatus, token = "") {
  assert.equal(reply.status, expectedStatus);
  assert.equal(reply.data !== null, true, "Expected JSON error response");
  assert.equal(typeof reply.data.error, "string");
  assert.equal(reply.text.includes("password_hash"), false);
  assert.equal(reply.text.includes("s223_fixture"), false);
  assert.equal(reply.text.includes("PostgreSQL"), false);
  if (token) assert.equal(reply.text.includes(token), false);
}

async function assertRejectedNoWrite(label, token, body, expectedStatus, extra = {}) {
  const before = await snapshot();
  const response = await request("PATCH", "/account/profile", { token, body, ...extra });
  assertSafeFailure(response, expectedStatus, token);
  assert.deepEqual(await snapshot(), before, `${label}: rows changed on rejected request`);
  passed(`${label}: HTTP ${expectedStatus}, both accounts unchanged`);
}

async function main() {
  if (
    !expectedName ||
    !/^[A-Za-z][A-Za-z0-9_]*$/.test(expectedName) ||
    !/test/i.test(expectedName)
  ) {
    throw new Error("Pass an explicitly named test database as the only argument.");
  }

  await databaseClient.connect();
  connectionOpen = true;
  const check = await databaseClient.query(`
    SELECT current_database() AS name,
           to_regclass('users') AS users,
           to_regclass('user_preferences') AS preferences,
           to_regclass('revoked_access_tokens') AS revocations
  `);
  const info = check.rows[0];
  assert.equal(info.name, expectedName, "Database name mismatch: refusing writes");
  assert.ok(info.users && info.preferences && info.revocations,
    "Required test schema is missing");
  passed("Exact test database and required tables verified");

  const hashedPassword = await hash_password(password);
  await databaseClient.query("BEGIN");
  transactionOpen = true;
  await databaseClient.query("SET LOCAL statement_timeout = '10s'");
  await databaseClient.query(`
    INSERT INTO users (id, username, password_hash, role)
    VALUES ($1, $2, $3, 'user'), ($4, $5, $3, 'user')`,
    [idA, originalA, hashedPassword, idB, originalB]);
  passed("Created two disposable user accounts in rollback-only transaction");

  const profiles = createAccountProfileRepository(database);
  const users = createAuthUserRepository(database);
  const revocations = createTokenRevocationRepository(database);
  const tokens = createTokenService(jwtSecret);
  server = createApp({
    tokenService: tokens,
    tokenRevocationRepository: revocations,
    findUserByUsername: users.findUserByUsername,
    findProfileByUserId: profiles.findProfileByUserId,
    updateProfileByUserId: profiles.updateProfileByUserId
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  async function logIn(username) {
    const res = await request("POST", "/auth/login", {
      body: { username, password }
    });
    assert.equal(res.status, 200, "Disposable login must succeed");
    assert.equal(typeof res.data.accessToken, "string");
    return res.data.accessToken;
  }
  const tokenA = await logIn(originalA);
  const tokenB = await logIn(originalB);
  passed("Both accounts authenticated independently through POST /auth/login");

  const bBefore = await account(idB);
  const aTokenGet = await request("GET", "/account/profile", { token: tokenA });
  const bTokenGet = await request("GET", "/account/profile", { token: tokenB });
  assert.equal(aTokenGet.status, 200);
  assert.equal(bTokenGet.status, 200);
  assert.equal(aTokenGet.data.user.id, idA);
  assert.equal(bTokenGet.data.user.id, idB);
  assert.equal(aTokenGet.data.user.username, originalA);
  assert.equal(bTokenGet.data.user.username, originalB);
  passed("GET profile is scoped separately to each token's authenticated account");

  for (const [label, malicious] of [
    ["other-account userId", { username: "stolen", userId: idB }],
    ["other-account id", { username: "stolen", id: idB }],
    ["role escalation", { username: "stolen", role: "admin" }],
    ["password-hash overwrite", { username: "stolen", password_hash: "fake" }],
    ["unknown email field", { username: "stolen", email: "x@example.invalid" }]
  ]) {
    await assertRejectedNoWrite(label, tokenA, malicious, 400);
  }

  // Signed with the *same* secret, and otherwise valid claims. The only
  // difference from a valid token is that exp is in the past.
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign({
    sub: idA, role: "user", jti: randomUUID(),
    iat: now - 180, exp: now - 60
  }, jwtSecret, { algorithm: "HS256" });
  assert.equal(jwt.verify(expired, jwtSecret, { ignoreExpiration: true }).sub, idA);
  assert.throws(() => jwt.verify(expired, jwtSecret), { name: "TokenExpiredError" });
  await assertRejectedNoWrite("expired correctly signed JWT", expired,
    { username: "expired_update", audioQualityPreference: "High" }, 401);
  await assertRejectedNoWrite("missing JWT", null, { username: "no_auth" }, 401);

  const valid64 = "🎵".repeat(64);
  let res = await request("PATCH", "/account/profile", {
    token: tokenA, body: { username: valid64, audioQualityPreference: "High" }
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.id, idA);
  assert.equal(res.data.user.username, valid64);
  assert.equal((await account(idA)).quality, "High");
  assert.deepEqual(await account(idB), bBefore);
  passed("Exactly 64 Unicode code points accepted; account B unchanged");

  await assertRejectedNoWrite("65 Unicode code points", tokenA,
    { username: "🎵".repeat(65), audioQualityPreference: "Low" }, 400);
  await assertRejectedNoWrite("control character", tokenA,
    { username: "bad\u0007name", audioQualityPreference: "Low" }, 400);
  await assertRejectedNoWrite("duplicate username owned by B", tokenA,
    { username: originalB, audioQualityPreference: "Low" }, 409);
  await assertRejectedNoWrite("mixed valid and protected fields", tokenB,
    { audioQualityPreference: "Medium", role: "admin" }, 400);
  await assertRejectedNoWrite("invalid preference combined with username", tokenA,
    { username: "change_should_rollback", audioQualityPreference: "Lossless" }, 400);

  const finalA = await account(idA);
  const finalB = await account(idB);
  assert.equal(finalA.username, valid64);
  assert.equal(finalA.quality, "High");
  assert.deepEqual(finalB, bBefore);
  assert.equal(finalB.role, "user");
  passed("Post-rejection PostgreSQL snapshots preserve both accounts and password hashes");

  const finalGetB = await request("GET", "/account/profile", { token: tokenB });
  assert.equal(finalGetB.status, 200);
  assert.equal(finalGetB.data.user.username, originalB);
  assert.equal(finalGetB.data.user.id, idB);
  assert.equal(finalGetB.text.includes("password_hash"), false);
  assert.equal(finalGetB.text.includes(tokenB), false);
  passed("Account B remains isolated; API response exposes no credential material");
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
      console.error("CLEANUP ERROR: Could not close local test server");
    }
  }
  if (transactionOpen && connectionOpen) {
    try {
      await databaseClient.query("ROLLBACK");
      transactionOpen = false;
      passed("Outer transaction rolled back; no test writes committed");
      const result = await databaseClient.query(`
        SELECT COUNT(*)::integer AS count FROM users
        WHERE id = ANY($1::bigint[])`, [[idA, idB]]);
      assert.equal(result.rows[0].count, 0);
      passed("Both disposable accounts absent after cleanup");
    } catch (error) {
      failure ??= error;
      console.error(`CLEANUP ERROR: ${error?.message ?? error}`);
    }
  }
  if (connectionOpen) {
    try { await databaseClient.end(); } catch (error) {
      failure ??= error;
      console.error("CLEANUP ERROR: PostgreSQL connection could not close");
    }
  }
  if (failure) {
    console.error("SCRUM-223 MATRIX FAILED. Review test evidence before committing.");
    process.exitCode = 1;
  } else {
    console.log("SCRUM-223 MATRIX PASSED. No database records retained.");
  }
}
