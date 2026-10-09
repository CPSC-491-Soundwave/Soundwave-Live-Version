import test from "node:test";
import assert from "node:assert/strict";

import {
  createTokenRevocationRepository
} from "../src/data/token-revocation.repository.js";

const JTI = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "42";
const EXPIRES_AT = new Date("2030-01-01T00:00:00.000Z");

test("repository requires database.query()", () => {
  assert.throws(
    () => createTokenRevocationRepository(null),
    TypeError
  );

  assert.throws(
    () => createTokenRevocationRepository({}),
    TypeError
  );
});

test("revokeToken inserts a parameterized revocation record", async () => {
  const calls = [];

  const database = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rowCount: 1 };
    }
  };

  const repository = createTokenRevocationRepository(database);

  const inserted = await repository.revokeToken({
    jti: JTI,
    userId: USER_ID,
    expiresAt: EXPIRES_AT
  });

  assert.equal(inserted, true);
  assert.equal(calls.length, 1);

  assert.match(
    calls[0].sql,
    /INSERT INTO revoked_access_tokens/
  );

  assert.match(
    calls[0].sql,
    /ON CONFLICT \(jti\) DO NOTHING/
  );

  assert.deepEqual(calls[0].parameters, [
    JTI,
    USER_ID,
    EXPIRES_AT
  ]);
});

test("repeated revocation reports an existing record", async () => {
  const database = {
    async query() {
      return { rowCount: 0 };
    }
  };

  const repository = createTokenRevocationRepository(database);

  const inserted = await repository.revokeToken({
    jti: JTI,
    userId: USER_ID,
    expiresAt: EXPIRES_AT
  });

  assert.equal(inserted, false);
});

test("isTokenRevoked returns true for a revoked token", async () => {
  const database = {
    async query(sql, parameters) {
      assert.match(sql, /FROM revoked_access_tokens/);
      assert.match(sql, /expires_at > NOW\(\)/);
      assert.deepEqual(parameters, [JTI]);

      return {
        rows: [{ revoked: true }]
      };
    }
  };

  const repository = createTokenRevocationRepository(database);

  assert.equal(
    await repository.isTokenRevoked(JTI),
    true
  );
});

test("isTokenRevoked returns false for a nonrevoked token", async () => {
  const database = {
    async query() {
      return {
        rows: [{ revoked: false }]
      };
    }
  };

  const repository = createTokenRevocationRepository(database);

  assert.equal(
    await repository.isTokenRevoked(JTI),
    false
  );
});

test("repository rejects invalid JWT identifiers", async () => {
  const database = {
    async query() {
      throw new Error("Database should not be queried");
    }
  };

  const repository = createTokenRevocationRepository(database);

  await assert.rejects(
    repository.revokeToken({
      jti: "not-a-uuid",
      userId: USER_ID,
      expiresAt: EXPIRES_AT
    }),
    TypeError
  );

  await assert.rejects(
    repository.isTokenRevoked("invalid"),
    TypeError
  );
});

test("revokeToken rejects invalid users and expiration dates", async () => {
  const database = {
    async query() {
      throw new Error("Database should not be queried");
    }
  };

  const repository = createTokenRevocationRepository(database);

  await assert.rejects(
    repository.revokeToken({
      jti: JTI,
      userId: "-1",
      expiresAt: EXPIRES_AT
    }),
    TypeError
  );

  await assert.rejects(
    repository.revokeToken({
      jti: JTI,
      userId: USER_ID,
      expiresAt: new Date("invalid")
    }),
    TypeError
  );
});

test("database failures propagate during revocation", async () => {
  const database = {
    async query() {
      throw new Error("database_unavailable");
    }
  };

  const repository = createTokenRevocationRepository(database);

  await assert.rejects(
    repository.revokeToken({
      jti: JTI,
      userId: USER_ID,
      expiresAt: EXPIRES_AT
    }),
    /database_unavailable/
  );

  await assert.rejects(
    repository.isTokenRevoked(JTI),
    /database_unavailable/
  );
});
