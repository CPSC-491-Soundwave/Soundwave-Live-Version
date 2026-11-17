import test from "node:test";
import assert from "node:assert/strict";

import {
  createAccountProfileRepository,
  UsernameConflictError
} from "../src/data/account-profile.repository.js";

function fixture({ failAt = "", userExists = true, conflict = false } = {}) {
  const operations = [];
  const client = {
    async query(sql, parameters = []) {
      const text = sql.trim();
      operations.push({ text, parameters });
      if (failAt && text.includes(failAt)) {
        if (conflict) {
          const error = new Error("unique violation");
          error.code = "23505";
          error.constraint = "users_username_unique";
          throw error;
        }
        throw new Error("simulated failure");
      }
      if (/^SELECT id FROM users/.test(text)) {
        return { rows: userExists ? [{ id: "42" }] : [] };
      }
      if (/SELECT\s+u\.id AS user_id/i.test(text)) {
        return {
          rows: [{
            user_id: "42", username: "updated_user", role: "user",
            audio_quality_preference: "High", password_hash: "secret"
          }]
        };
      }
      return { rows: [] };
    },
    release() { operations.push({ text: "RELEASE", parameters: [] }); }
  };
  const database = {
    async query(sql, parameters) { return client.query(sql, parameters); },
    async connect() { return client; }
  };
  return { repository: createAccountProfileRepository(database), operations };
}

test("transactional username + preference update is account scoped and parameterized", async () => {
  const { repository, operations } = fixture();
  const result = await repository.updateProfileByUserId("42", {
    username: "updated_user", audioQualityPreference: "High"
  });
  assert.equal(result.user_id, "42");
  assert.deepEqual(operations.map(({ text }) => text.split(/\s+/)[0]), [
    "BEGIN", "SELECT", "UPDATE", "INSERT", "SELECT", "COMMIT", "RELEASE"
  ]);
  const update = operations[2];
  assert.match(update.text, /UPDATE users SET username = \$1 WHERE id = \$2/);
  assert.deepEqual(update.parameters, ["updated_user", "42"]);
  const preference = operations[3];
  assert.match(preference.text, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.deepEqual(preference.parameters, ["42", "High"]);
  assert.doesNotMatch(operations[4].text, /password_hash/i);
});

test("preference clear uses NULL without username update", async () => {
  const { repository, operations } = fixture();
  await repository.updateProfileByUserId("42", { audioQualityPreference: null });
  assert.equal(operations.some(({ text }) => text.startsWith("UPDATE users")), false);
  const preference = operations.find(({ text }) => text.startsWith("INSERT INTO user_preferences"));
  assert.deepEqual(preference.parameters, ["42", null]);
  assert.equal(operations.some(({ text }) => text === "COMMIT"), true);
});

test("missing account aborts transaction without creating preference", async () => {
  const { repository, operations } = fixture({ userExists: false });
  assert.equal(await repository.updateProfileByUserId("404", { audioQualityPreference: "Auto" }), null);
  assert.equal(operations.some(({ text }) => text.startsWith("INSERT")), false);
  assert.equal(operations.some(({ text }) => text === "COMMIT"), false);
  assert.equal(operations.some(({ text }) => text === "ROLLBACK"), true);
});

test("duplicate username fails with typed conflict and rollback", async () => {
  const { repository, operations } = fixture({ failAt: "UPDATE users", conflict: true });
  await assert.rejects(
    repository.updateProfileByUserId("42", { username: "taken" }),
    UsernameConflictError
  );
  assert.equal(operations.some(({ text }) => text === "ROLLBACK"), true);
  assert.equal(operations.some(({ text }) => text === "COMMIT"), false);
  assert.equal(operations.at(-1).text, "RELEASE");
});

test("failed preference persistence rolls back prior username mutation", async () => {
  const { repository, operations } = fixture({ failAt: "INSERT INTO user_preferences" });
  await assert.rejects(
    repository.updateProfileByUserId("42", {
      username: "changed", audioQualityPreference: "Low"
    }),
    /simulated failure/
  );
  assert.equal(operations.some(({ text }) => text.startsWith("UPDATE users")), true);
  assert.equal(operations.some(({ text }) => text === "ROLLBACK"), true);
  assert.equal(operations.some(({ text }) => text === "COMMIT"), false);
});

test("profile reads continue working with query-only database doubles", async () => {
  const database = {
    async query() {
      return { rows: [{ user_id: "42", username: "unchanged" }] };
    }
  };
  const repository = createAccountProfileRepository(database);
  assert.equal((await repository.findProfileByUserId("42")).username, "unchanged");
  await assert.rejects(
    repository.updateProfileByUserId("42", { username: "new" }),
    /database.connect/
  );
});
