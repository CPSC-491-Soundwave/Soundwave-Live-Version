import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

import {
  createTokenRevocationRepository
} from "../../server/src/data/token-revocation.repository.js";

const { Pool } = pg;

test("revocation persists within PostgreSQL transaction and rolls back", async () => {
  const databaseName = process.env.PGDATABASE ?? "";

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      "Revocation integration test requires a test database."
    );
  }

  const pool = new Pool();
  let client;
  let inTransaction = false;

  const jti = randomUUID();
  const otherJti = randomUUID();

  const username =
    `cmg_revocation_${randomUUID().replaceAll("-", "")}`;

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    inTransaction = true;

    const userResult = await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, 'user')
      RETURNING id
      `,
      [username, "test-only-placeholder-hash"]
    );

    const userId = String(userResult.rows[0].id);

    const repository =
      createTokenRevocationRepository(client);

    assert.equal(
      await repository.isTokenRevoked(jti),
      false
    );

    const inserted = await repository.revokeToken({
      jti,
      userId,
      expiresAt
    });

    assert.equal(inserted, true);

    assert.equal(
      await repository.isTokenRevoked(jti),
      true
    );

    const duplicate = await repository.revokeToken({
      jti,
      userId,
      expiresAt
    });

    assert.equal(duplicate, false);

    assert.equal(
      await repository.isTokenRevoked(otherJti),
      false
    );

    const stored = await client.query(
      `
      SELECT jti, user_id
      FROM revoked_access_tokens
      WHERE jti = $1
      `,
      [jti]
    );

    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].jti, jti);
    assert.equal(String(stored.rows[0].user_id), userId);

    await client.query("ROLLBACK");
    inTransaction = false;

    const afterRollback = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM revoked_access_tokens
      WHERE jti = $1
      `,
      [jti]
    );

    assert.equal(afterRollback.rows[0].count, 0);

    const userAfterRollback = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE username = $1
      `,
      [username]
    );

    assert.equal(userAfterRollback.rows[0].count, 0);
  } finally {
    if (client) {
      try {
        if (inTransaction) {
          await client.query("ROLLBACK");
        }
      } finally {
        client.release();
      }
    }

    await pool.end();
  }
});

test("committed revocation is visible across PostgreSQL connections", async () => {
  const databaseName = process.env.PGDATABASE ?? "";

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error("A dedicated test database is required.");
  }

  const pool = new Pool({ max: 2 });
  const jti = randomUUID();
  const username =
    `cmg_commit_${randomUUID().replaceAll("-", "")}`;

  let writer;
  let reader;
  let userId;

  try {
    writer = await pool.connect();

    const user = await writer.query(
      `
      INSERT INTO users (username, password_hash, role)
      VALUES ($1, $2, 'user')
      RETURNING id
      `,
      [username, "test-only-placeholder-hash"]
    );

    userId = String(user.rows[0].id);

    const writerRepository =
      createTokenRevocationRepository(writer);

    const inserted = await writerRepository.revokeToken({
      jti,
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    assert.equal(inserted, true);

    // Hold the writer connection while opening a second one.
    reader = await pool.connect();

    const writerPid = (
      await writer.query("SELECT pg_backend_pid() AS pid")
    ).rows[0].pid;

    const readerPid = (
      await reader.query("SELECT pg_backend_pid() AS pid")
    ).rows[0].pid;

    assert.notEqual(writerPid, readerPid);

    const readerRepository =
      createTokenRevocationRepository(reader);

    assert.equal(
      await readerRepository.isTokenRevoked(jti),
      true
    );

    const stored = await reader.query(
      `
      SELECT jti, user_id
      FROM revoked_access_tokens
      WHERE jti = $1
      `,
      [jti]
    );

    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].jti, jti);
    assert.equal(String(stored.rows[0].user_id), userId);
  } finally {
    if (reader) {
      reader.release();
    }

    try {
      if (writer && userId) {
        await writer.query(
          `
          DELETE FROM revoked_access_tokens
          WHERE jti = $1 AND user_id = $2
          `,
          [jti, userId]
        );

        await writer.query(
          `
          DELETE FROM users
          WHERE id = $1 AND username = $2
          `,
          [userId, username]
        );
      }
    } finally {
      if (writer) {
        writer.release();
      }

      await pool.end();
    }
  }
});
