import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";
import { UsernameConflictError } from "../src/data/account-profile.repository.js";

const tokenService = createTokenService("scrum358-test-only-secret-not-for-production");
const validToken = tokenService.create_token({ id: 42, role: "user" });

async function startFixture(t, overrides = {}) {
  const calls = [];
  const server = createApp({
    tokenService,
    tokenRevocationRepository: {
      async isTokenRevoked() { return false; }
    },
    updateProfileByUserId: async (userId, changes) => {
      calls.push({ userId, changes });
      return {
        user_id: String(userId),
        username: changes.username ?? "original_user",
        role: "user",
        audio_quality_preference: Object.hasOwn(changes, "audioQualityPreference")
          ? changes.audioQualityPreference : "Auto",
        password_hash: "must-never-appear"
      };
    },
    ...overrides
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/account/profile`, calls };
}

function patch(url, body, options = {}) {
  const { token = validToken, contentType = "application/json", ...additional } = options;
  const headers = { ...additional };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (contentType) headers["Content-Type"] = contentType;
  return fetch(url, { method: "PATCH", headers, body });
}

test("PATCH updates username under authenticated principal and returns only safe fields", async (t) => {
  const { url, calls } = await startFixture(t);
  const response = await patch(url, JSON.stringify({ username: "  new_name " }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [{ userId: "42", changes: { username: "new_name" } }]);
  const result = await response.json();
  assert.deepEqual(result, {
    user: { id: "42", username: "new_name", role: "user" },
    preferences: { audioQualityPreference: "Auto" }
  });
  assert.equal(JSON.stringify(result).includes("must-never-appear"), false);
});

test("PATCH supports preference only, both fields, and explicit null clearing", async (t) => {
  const { url, calls } = await startFixture(t);
  for (const change of [
    { audioQualityPreference: " High " },
    { username: "next_user", audioQualityPreference: "Medium" },
    { audioQualityPreference: null }
  ]) {
    const response = await patch(url, JSON.stringify(change));
    assert.equal(response.status, 200);
    const profile = await response.json();
    assert.equal(profile.preferences.audioQualityPreference,
      Object.hasOwn(change, "audioQualityPreference")
        ? (typeof change.audioQualityPreference === "string"
            ? change.audioQualityPreference.trim() : change.audioQualityPreference)
        : "Auto");
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0].changes.audioQualityPreference, "High");
  assert.deepEqual(calls.map((entry) => entry.userId), ["42", "42", "42"]);
});

test("PATCH accepts JSON UTF-8 content type", async (t) => {
  const { url } = await startFixture(t);
  const response = await patch(url, '{"username":"Zoë"}', { contentType: "application/json; charset=utf-8" });
  assert.equal(response.status, 200);
});

test("PATCH rejects absent/invalid authentication before any mutation", async (t) => {
  const { url, calls } = await startFixture(t);
  const body = JSON.stringify({ username: "new_name" });
  assert.equal((await patch(url, body, { token: null })).status, 401);
  assert.equal((await patch(url, body, { token: "invalid.jwt.value" })).status, 401);
  assert.equal(calls.length, 0);
});

test("PATCH rejects revoked token before any mutation", async (t) => {
  const { url, calls } = await startFixture(t, {
    tokenRevocationRepository: { async isTokenRevoked() { return true; } }
  });
  const response = await patch(url, '{"username":"new_name"}');
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("PATCH fails closed when revocation storage is unavailable", async (t) => {
  const { url, calls } = await startFixture(t, {
    tokenRevocationRepository: { async isTokenRevoked() { throw new Error("db unavailable"); } }
  });
  const response = await patch(url, '{"username":"new_name"}');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_unavailable");
  assert.equal(calls.length, 0);
});

test("PATCH rejects unsupported content types and content encodings", async (t) => {
  const { url, calls } = await startFixture(t);
  assert.equal((await patch(url, '{"username":"a"}', { contentType: "text/plain" })).status, 415);
  assert.equal((await patch(url, '{"username":"a"}', { contentType: "application/json; charset=latin1" })).status, 415);
  assert.equal((await patch(url, '{"username":"a"}', { "Content-Encoding": "gzip" })).status, 415);
  assert.equal(calls.length, 0);
});

const badRequests = [
  ["malformed JSON", '{"username":', "invalid_json"],
  ["empty body", "", "invalid_json"],
  ["empty object", "{}", "invalid_profile_update"],
  ["null body", "null", "invalid_profile_update"],
  ["array body", "[]", "invalid_profile_update"],
  ["immutable role", '{"role":"admin"}', "invalid_profile_update"],
  ["other account identifier", '{"userId":"7","username":"x"}', "invalid_profile_update"],
  ["password hash", '{"password_hash":"x"}', "invalid_profile_update"],
  ["unknown field", '{"email":"x@y.com"}', "invalid_profile_update"],
  ["null username", '{"username":null}', "invalid_username"],
  ["blank username", '{"username":"   "}', "invalid_username"],
  ["overlong username", JSON.stringify({ username: "a".repeat(65) }), "invalid_username"],
  ["control in username", JSON.stringify({ username: "bad\nname" }), "invalid_username"],
  ["empty preference", '{"audioQualityPreference":""}', "invalid_audio_quality_preference"],
  ["unknown preference", '{"audioQualityPreference":"lossless"}', "invalid_audio_quality_preference"],
  ["incorrect preference type", '{"audioQualityPreference":12}', "invalid_audio_quality_preference"],
  ["nested data", '{"username":{"name":"a"}}', "invalid_username"],
  ["repeated username key", '{"username":"a","username":"b"}', "duplicate_field"],
  ["escaped duplicate username", '{"username":"a","userna\\u006de":"b"}', "duplicate_field"],
  ["repeated preference key", '{"audioQualityPreference":"Auto","audioQualityPreference":null}', "duplicate_field"]
];

for (const [label, body, error] of badRequests) {
  test(`PATCH rejects ${label} without writing`, async (t) => {
    const { url, calls } = await startFixture(t);
    const response = await patch(url, body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, error);
    assert.equal(calls.length, 0);
  });
}

test("PATCH enforces 16 KiB payload limit", async (t) => {
  const { url, calls } = await startFixture(t);
  const response = await patch(url, JSON.stringify({ username: "x".repeat(17 * 1024) }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "body_too_large");
  assert.equal(calls.length, 0);
});

test("PATCH maps known username uniqueness violation to 409", async (t) => {
  const { url } = await startFixture(t, {
    updateProfileByUserId: async () => { throw new UsernameConflictError(); }
  });
  const response = await patch(url, '{"username":"taken"}');
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "username_unavailable" });
});

test("PATCH returns 404 for missing authenticated user", async (t) => {
  const { url } = await startFixture(t, { updateProfileByUserId: async () => null });
  const response = await patch(url, '{"username":"new_name"}');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "profile_not_found" });
});

test("PATCH returns controlled 500 for repository failure or mismatched user", async (t) => {
  for (const updateProfileByUserId of [
    async () => { throw new Error("SQL secrets should not leak"); },
    async () => ({ user_id: "999", username: "wrong" })
  ]) {
    await t.test("sensitive failure", async (sub) => {
      const { url } = await startFixture(sub, { updateProfileByUserId });
      const response = await patch(url, '{"username":"new_name"}');
      assert.equal(response.status, 500);
      const text = await response.text();
      assert.equal(text.includes("SQL secrets"), false);
      assert.deepEqual(JSON.parse(text), { error: "internal_error" });
    });
  }
});
