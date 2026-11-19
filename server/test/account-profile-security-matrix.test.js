/**
 * SCRUM-223: independent account-scoping and username-boundary HTTP matrix.
 * No database or running service is needed for this test file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";

const JWT_SECRET = "scrum223-isolated-fixture-secret-2026-not-for-production";
const tokens = createTokenService(JWT_SECRET);

function profileRow(record) {
  return {
    user_id: record.id,
    username: record.username,
    role: record.role,
    audio_quality_preference: record.quality,
    password_hash: "SENTINEL_HASH_MUST_NOT_LEAK"
  };
}

async function fixture(t) {
  const accounts = new Map([
    ["81001", { id: "81001", username: "matrix_alpha", role: "user", quality: null }],
    ["81002", { id: "81002", username: "matrix_beta", role: "user", quality: "Auto" }]
  ]);
  let updateCalls = 0;
  const server = createApp({
    tokenService: tokens,
    tokenRevocationRepository: {
      async isTokenRevoked() { return false; }
    },
    async findProfileByUserId(id) {
      const record = accounts.get(String(id));
      return record ? profileRow(record) : null;
    },
    async updateProfileByUserId(id, changes) {
      updateCalls += 1;
      const record = accounts.get(String(id));
      if (!record) return null;
      if (Object.hasOwn(changes, "username")) record.username = changes.username;
      if (Object.hasOwn(changes, "audioQualityPreference")) {
        record.quality = changes.audioQualityPreference;
      }
      return profileRow(record);
    }
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const authA = tokens.create_token({ id: 81001, role: "user" });
  const authB = tokens.create_token({ id: 81002, role: "user" });

  async function request(method, path, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json()
    };
  }
  return { accounts, request, authA, authB, get updateCalls() { return updateCalls; } };
}

test("SCRUM-223 matrix: authenticated A cannot redirect PATCH into B's account", async (t) => {
  const scope = await fixture(t);
  const { request, accounts, authA, authB } = scope;
  const originalB = structuredClone(accounts.get("81002"));

  for (const unauthorized of [
    { username: "hijacked", userId: "81002" },
    { username: "hijacked", id: "81002" },
    { username: "hijacked", role: "admin" },
    { username: "hijacked", password_hash: "fake" }
  ]) {
    const res = await request("PATCH", "/account/profile", {
      token: authA, body: unauthorized
    });
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(accounts.get("81002"), originalB);
  }

  const updated = await request("PATCH", "/account/profile", {
    token: authA, body: { username: "alpha_updated", audioQualityPreference: "High" }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.id, "81001");
  assert.equal(updated.body.user.role, "user");
  assert.equal(updated.body.preferences.audioQualityPreference, "High");
  assert.equal(JSON.stringify(updated.body).includes("SENTINEL_HASH_MUST_NOT_LEAK"), false);
  assert.deepEqual(accounts.get("81002"), originalB);

  const bProfile = await request("GET", "/account/profile", { token: authB });
  assert.equal(bProfile.status, 200);
  assert.equal(bProfile.body.user.id, "81002");
  assert.equal(bProfile.body.user.username, originalB.username);
  assert.equal(bProfile.body.preferences.audioQualityPreference, originalB.quality);
  assert.equal(scope.updateCalls, 1); // only A's legitimate update reached persistence
});

test("SCRUM-223 matrix: 64 Unicode code points accepted; 65 rejected without mutation", async (t) => {
  const scope = await fixture(t);
  const accepted = "🎵".repeat(64);
  const tooLong = "🎵".repeat(65);
  const result = await scope.request("PATCH", "/account/profile", {
    token: scope.authA, body: { username: accepted }
  });
  assert.equal(result.status, 200);
  assert.equal(scope.accounts.get("81001").username, accepted);

  const callsBefore = scope.updateCalls;
  const rejection = await scope.request("PATCH", "/account/profile", {
    token: scope.authA, body: { username: tooLong, audioQualityPreference: "Low" }
  });
  assert.equal(rejection.status, 400);
  assert.equal(scope.updateCalls, callsBefore);
  assert.equal(scope.accounts.get("81001").username, accepted);
  assert.equal(scope.accounts.get("81001").quality, null);
});

test("SCRUM-223 matrix: correctly signed but expired JWT cannot mutate account", async (t) => {
  const scope = await fixture(t);
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign({
    sub: "81001", role: "user", jti: randomUUID(), iat: now - 180,
    exp: now - 60
  }, JWT_SECRET, { algorithm: "HS256" });
  assert.equal(jwt.verify(expired, JWT_SECRET, { ignoreExpiration: true }).sub, "81001");
  assert.throws(() => jwt.verify(expired, JWT_SECRET), { name: "TokenExpiredError" });

  const before = structuredClone(scope.accounts.get("81001"));
  const reply = await scope.request("PATCH", "/account/profile", {
    token: expired, body: { username: "expired_should_not_save", audioQualityPreference: "High" }
  });
  assert.equal(reply.status, 401);
  assert.equal(scope.updateCalls, 0);
  assert.deepEqual(scope.accounts.get("81001"), before);
  assert.equal(JSON.stringify(reply.body).includes(expired), false);
});
