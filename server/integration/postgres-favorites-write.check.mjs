
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import pg from "pg";

import { createApp } from "../src/app.js";
import { createCatalogRepository } from "../src/data/catalog.repository.js";
import { createCatalogService } from "../src/catalog/catalog.service.js";
import { createCatalogHandler } from "../src/catalog/catalog.handler.js";

const { Pool } = pg;

const TRACK_ID = 3002;

const NEGATIVE_CONTROL =
  process.env.SCRUM363_NEGATIVE_CONTROL === "1";

const POLICY =
  "PUT is idempotent; DELETE is idempotent; mixed concurrent " +
  "PUT/DELETE may finish present or absent; writes are principal-scoped";

function requireDedicatedDatabase() {
  const dbName = process.env.PGDATABASE ?? "";

  if (!/(_test|_ci)$/.test(dbName)) {
    throw new Error(
      "SCRUM-363 refuses to run outside a dedicated " +
      "*_test or *_ci PostgreSQL database."
    );
  }

  return dbName;
}

async function closeServer(server) {
  if (!server) {
    return;
  }

  server.closeAllConnections?.();

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

test(
  "SCRUM-363: real PostgreSQL Favorites mutation matrix",
  async (t) => {
    const targetDatabase = requireDedicatedDatabase();

    const pool = new Pool({
      max: 12
    });

    let server;

    const createdUsers = [];

    let accountA;
    let accountB;

    // Always clean up the temporary test users.
    // Favorites rows cascade when their users are deleted.
    t.after(async () => {
      try {
        await closeServer(server);
      } finally {
        try {
          if (createdUsers.length > 0) {
            await pool.query(
              "DELETE FROM users WHERE id = ANY($1::bigint[])",
              [createdUsers]
            );

            console.log(
              "[SCRUM-363] Temporary users removed; " +
              "ON DELETE CASCADE restored their Favorites."
            );
          }
        } finally {
          await pool.end();
        }
      }
    });

    // Confirm the actual connected database.
    const checked = await pool.query(
      "SELECT current_database() AS name"
    );

    assert.equal(
      checked.rows[0].name,
      targetDatabase,
      "Connected to an unexpected database"
    );

    // Reuse an existing catalog fixture.
    // Do not create or modify catalog tracks.
    const track = await pool.query(
      "SELECT id FROM tracks WHERE id = $1",
      [TRACK_ID]
    );

    assert.equal(
      track.rowCount,
      1,
      `Seed Track ${TRACK_ID} is missing. ` +
        "Migrate and seed the test database first."
    );

    // Prepare two isolated, temporary standard users.
    const suffix = randomUUID()
      .replaceAll("-", "")
      .slice(0, 16);

    const testHash = await argon2.hash(
      randomBytes(24).toString("hex"),
      {
        type: argon2.argon2id
      }
    );

    for (const label of ["a", "b"]) {
      const result = await pool.query(
        `INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, 'user')
         RETURNING id`,
        [
          `scrum363_${label}_${suffix}`,
          testHash
        ]
      );

      createdUsers.push(
        String(result.rows[0].id)
      );
    }

    [accountA, accountB] = createdUsers;

    console.log(
      `[SCRUM-363] database=${targetDatabase} ` +
      `userA=${accountA} userB=${accountB} ` +
      `track=${TRACK_ID}`
    );

    console.log(
      `[SCRUM-363] conflict policy: ${POLICY}`
    );

    // Stable integration-test principals.
    // No real JWT secrets or login credentials are needed.
    const principals = {
      "scrum363-a": accountA,
      "scrum363-b": accountB
    };

    const tokenService = {
      verify_token(token) {
        const sub = principals[token];

        if (!sub) {
          throw new Error(
            "Invalid integration-test bearer token"
          );
        }

        return {
          sub,
          role: "user",
          jti:
            token === "scrum363-a"
              ? "11111111-1111-4111-8111-111111363001"
              : "11111111-1111-4111-8111-111111363002",
          exp: Math.floor(Date.now() / 1000) + 3600
        };
      }
    };

    // Use the real production repository/service/handler.
    const catalogRepository =
      createCatalogRepository(pool);

    const catalogService =
      createCatalogService(catalogRepository);

    const handler = createCatalogHandler(
      catalogService,
      { tokenService }
    );

    // HTTP authorization uses controlled test principals.
    // The actual database writes use the real PostgreSQL pool.
    server = createApp({
      tokenService,

      tokenRevocationRepository: {
        isTokenRevoked: async () => false
      },

      handleCatalogRequest: handler
    });

    server.listen(0, "127.0.0.1");

    await once(server, "listening");

    const baseUrl =
      `http://127.0.0.1:${server.address().port}`;

    async function mutate(
      method,
      bearer,
      headers = {}
    ) {
      const response = await fetch(
        `${baseUrl}/api/library/favorites/${TRACK_ID}`,
        {
          method,
          headers: bearer
            ? {
                Authorization: `Bearer ${bearer}`,
                ...headers
              }
            : {
                ...headers
              }
        }
      );

      return response.status;
    }

    // Reset only the temporary users' Favorites.
    // Never touch development or teammate data.
    async function reset() {
      await pool.query(
        `DELETE FROM favorites
         WHERE user_id = ANY($1::bigint[])`,
        [[accountA, accountB]]
      );
    }

    async function actualRows() {
      const result = await pool.query(
        `SELECT
           user_id::text AS user_id,
           track_id::text AS track_id
         FROM favorites
         WHERE user_id = ANY($1::bigint[])
         ORDER BY user_id, track_id`,
        [[accountA, accountB]]
      );

      return result.rows
        .map(
          (row) =>
            `${row.user_id}:${row.track_id}`
        )
        .sort();
    }

    function expectedRows({
      a = false,
      b = false
    } = {}) {
      return [
        ...(a ? [`${accountA}:${TRACK_ID}`] : []),
        ...(b ? [`${accountB}:${TRACK_ID}`] : [])
      ].sort();
    }

    // Record expected and actual rows for both test users.
    // Also verify no duplicate associations exist.
    async function verify(label, expected) {
      const actual = await actualRows();

      console.log(
        `[${label}] expected=${JSON.stringify(expected)} ` +
        `actual=${JSON.stringify(actual)}`
      );

      assert.deepEqual(
        actual,
        expected,
        `${label}: final PostgreSQL rows differ`
      );

      const duplicates = await pool.query(
        `SELECT
           user_id,
           track_id,
           COUNT(*)::int AS count
         FROM favorites
         WHERE user_id = ANY($1::bigint[])
         GROUP BY user_id, track_id
         HAVING COUNT(*) > 1`,
        [[accountA, accountB]]
      );

      assert.equal(
        duplicates.rowCount,
        0,
        `${label}: duplicate user-track association`
      );
    }

    // T01: Add
    await t.test(
      "T01 add creates one user-scoped association",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-a"),
          204
        );

        await verify(
          "T01",
          expectedRows({ a: true })
        );
      }
    );

    // T02: Remove
    await t.test(
      "T02 remove deletes only the intended association",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-a"),
          204
        );

        assert.equal(
          await mutate("PUT", "scrum363-b"),
          204
        );

        assert.equal(
          await mutate("DELETE", "scrum363-a"),
          204
        );

        await verify(
          "T02",
          expectedRows({ b: true })
        );
      }
    );

    // T03: Repeated add
    await t.test(
      "T03 repeated PUT is idempotent",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-a"),
          204
        );

        assert.equal(
          await mutate("PUT", "scrum363-a"),
          204
        );

        await verify(
          "T03",
          expectedRows({ a: true })
        );
      }
    );

    // T04: Repeated remove
    await t.test(
      "T04 repeated DELETE is idempotent",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-a"),
          204
        );

        assert.equal(
          await mutate("DELETE", "scrum363-a"),
          204
        );

        assert.equal(
          await mutate("DELETE", "scrum363-a"),
          204
        );

        await verify(
          "T04",
          expectedRows()
        );
      }
    );

    // T05: Concurrent duplicate additions
    await t.test(
      "T05 simultaneous PUTs cannot create duplicates",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-b"),
          204
        );

        const codes = await Promise.all(
          Array.from(
            { length: 12 },
            () => mutate("PUT", "scrum363-a")
          )
        );

        assert.ok(
          codes.every((code) => code === 204),
          `Unexpected concurrent PUT statuses: ${codes}`
        );

        await verify(
          "T05",
          expectedRows({
            a: true,
            b: true
          })
        );
      }
    );

    // T06: Concurrent duplicate removals
    await t.test(
      "T06 simultaneous DELETEs leave no association",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-a"),
          204
        );

        assert.equal(
          await mutate("PUT", "scrum363-b"),
          204
        );

        const codes = await Promise.all(
          Array.from(
            { length: 12 },
            () => mutate("DELETE", "scrum363-a")
          )
        );

        assert.ok(
          codes.every((code) => code === 204),
          `Unexpected concurrent DELETE statuses: ${codes}`
        );

        await verify(
          "T06",
          expectedRows({ b: true })
        );
      }
    );

    // T07: Concurrent mixed operations
    await t.test(
      "T07 mixed concurrent PUT/DELETE has a legal final state",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-b"),
          204
        );

        const methods = [
          "PUT",
          "DELETE",
          "PUT",
          "DELETE",
          "PUT",
          "DELETE",
          "PUT",
          "DELETE"
        ];

        const codes = await Promise.all(
          methods.map(
            (method) =>
              mutate(method, "scrum363-a")
          )
        );

        assert.ok(
          codes.every((code) => code === 204),
          `Unexpected concurrent mixed statuses: ${codes}`
        );

        const actual = await actualRows();

        const legal = [
          expectedRows({ b: true }),
          expectedRows({
            a: true,
            b: true
          })
        ];

        console.log(
          `[T07] allowed=${JSON.stringify(legal)} ` +
          `actual=${JSON.stringify(actual)}`
        );

        assert.ok(
          legal.some(
            (expected) =>
              JSON.stringify(expected) ===
              JSON.stringify(actual)
          ),
          "T07: illegal mixed-write final state"
        );
      }
    );

    // T08: Unauthorized cross-user mutation attempts
    await t.test(
      "T08 forged user identity and anonymous DELETE cannot modify User B",
      async () => {
        await reset();

        // User B owns the existing association.
        assert.equal(
          await mutate("PUT", "scrum363-b"),
          204
        );

        // User A attempts to impersonate User B
        // through untrusted identity headers.
        assert.equal(
          await mutate(
            "DELETE",
            "scrum363-a",
            {
              "X-User-Id": accountB,
              "X-Role": "admin"
            }
          ),
          204
        );

        // Anonymous DELETE must be rejected.
        assert.equal(
          await mutate("DELETE", null),
          401
        );

        await verify(
          "T08 after forbidden mutation attempts",
          expectedRows({ b: true })
        );

        // A forged owner header must not redirect
        // User A's legitimate PUT to User B.
        assert.equal(
          await mutate(
            "PUT",
            "scrum363-a",
            {
              "X-User-Id": accountB
            }
          ),
          204
        );

        await verify(
          "T08 after A-owned PUT",
          expectedRows({
            a: true,
            b: true
          })
        );
      }
    );

    // T09: Deliberate negative-control verification
    await t.test(
      "T09 deliberate negative control is detected; reviewed assertion passes",
      async () => {
        await reset();

        assert.equal(
          await mutate("PUT", "scrum363-a"),
          204
        );

        const actual = await actualRows();

        if (NEGATIVE_CONTROL) {
          console.log(
            "[T09] DELIBERATE NEGATIVE CONTROL: " +
            "the next assertion must fail."
          );

          // Intentionally incorrect expected Track ID.
          // Only enabled during the negative-control run.
          assert.deepEqual(
            actual,
            [`${accountA}:${TRACK_ID + 1}`],
            "Expected intentional SCRUM-363 negative-control failure"
          );
        } else {
          await verify(
            "T09",
            expectedRows({ a: true })
          );
        }
      }
    );
  }
);
