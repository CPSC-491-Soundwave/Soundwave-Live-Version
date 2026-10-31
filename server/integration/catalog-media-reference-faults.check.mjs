/**
 * SCRUM-216 / Allison Yu / SOC 2 CC6.6
 *
 * Catalog-to-media reference fault-injection checks.
 *
 * Tests:
 * AY-SEC-03: Missing mapping
 * AY-SEC-04: Stale reference
 * AY-SEC-05: Rejected catalog locator lookup
 *
 * Uses a dedicated PostgreSQL test database.
 * All temporary database changes are rolled back.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import {
  mkdtemp,
  mkdir,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

import { createApp } from "../src/app.js";
import {
  createCatalogRepository
} from "../src/data/catalog.repository.js";
import {
  createMediaTicketService
} from "../src/media/media-ticket.js";

const { Pool } = pg;

const TRACK_ID = 3005;
const TEST_TOKEN = "scrum-216-local-token";

const TABLES = [
  "artists",
  "albums",
  "tracks"
];

/**
 * Prevent accidental use of a production database.
 */
function requireTestDatabase() {
  const name = process.env.PGDATABASE ?? "";
  const host = process.env.PGHOST ?? "";

  if (!/(?:^|[_-])(?:test|ci)(?:$|[_-])/i.test(name)) {
    throw new Error(
      "PGDATABASE must be a dedicated test/CI database."
    );
  }

  const allowedHosts = [
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres"
  ];

  if (!allowedHosts.includes(host)) {
    throw new Error(
      "PGHOST must point to local/CI PostgreSQL."
    );
  }

  if (
    !process.env.PGUSER ||
    process.env.DATABASE_URL
  ) {
    throw new Error(
      "Set PGUSER and unset DATABASE_URL before testing."
    );
  }
}

/**
 * Fingerprint complete catalog table contents.
 *
 * All table names are hardcoded constants.
 */
async function catalogFingerprint(client) {
  const result = {};

  for (const table of TABLES) {
    const { rows } = await client.query(
      `SELECT * FROM ${table} ORDER BY id`
    );

    result[table] = rows;
  }

  return createHash("sha256")
    .update(JSON.stringify(result))
    .digest("hex");
}

/**
 * Open a dedicated test connection.
 *
 * A transaction allows fault fixtures to be applied
 * temporarily and automatically removed afterward.
 */
async function withFixture(action) {
  requireTestDatabase();

  const pool = new Pool();

  let client;
  let inTransaction = false;

  try {
    client = await pool.connect();

    const baseline =
      await catalogFingerprint(client);

    await client.query("BEGIN");
    inTransaction = true;

    const initial = await client.query(
      `SELECT id, title, album_id, media_path
       FROM tracks
       WHERE id = $1
       FOR UPDATE`,
      [TRACK_ID]
    );

    assert.equal(
      initial.rowCount,
      1,
      "Expected seeded track 3005"
    );

    const repository =
      createCatalogRepository(client);

    await action({
      client,
      repository
    });

    await client.query("ROLLBACK");
    inTransaction = false;

    assert.equal(
      await catalogFingerprint(client),
      baseline,
      "Test fixture was not fully rolled back"
    );

  } finally {
    if (client) {
      if (inTransaction) {
        await client.query("ROLLBACK")
          .catch(() => {});
      }

      client.release();
    }

    await pool.end();
  }
}

/**
 * Start an isolated Soundwave HTTP server.
 *
 * Uses the authenticated test-harness pattern
 * already established in media-access.app.test.js.
 */
async function withApp(findTrackById, action) {
  const temporary = await mkdtemp(
    path.join(tmpdir(), "soundwave-scrum216-")
  );

  const mediaRoot =
    path.join(temporary, "media");

  let server;

  try {
    await mkdir(mediaRoot);

    const jti = randomUUID();

    const tokenService = {
      verify_token(value) {
        if (value !== TEST_TOKEN) {
          throw new Error("invalid_test_token");
        }

        return {
          sub: "scrum216-test-user",
          role: "user",
          jti,
          exp: Math.floor(Date.now() / 1000) + 1800
        };
      }
    };

    const tokenRevocationRepository = {
      async isTokenRevoked(value) {
        assert.equal(value, jti);
        return false;
      }
    };

    const mediaTicketService =
      createMediaTicketService({
        mediaSecret:
          randomBytes(32).toString("hex"),
        loginSecret:
          randomBytes(32).toString("hex"),
        secureCookies: false
      });

    server = createApp({
      tokenService,
      tokenRevocationRepository,
      mediaTicketService,
      findTrackById,
      mediaRoot
    });

    server.listen(0, "127.0.0.1");

    await once(server, "listening");

    const baseUrl =
      `http://127.0.0.1:${server.address().port}`;

    await action({
      baseUrl,
      mediaRoot
    });

  } finally {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close(error =>
          error ? reject(error) : resolve()
        );
      });
    }

    await rm(temporary, {
      recursive: true,
      force: true
    });
  }
}

/**
 * Make an authenticated request using test-only identity.
 */
function authenticatedRequest(
  baseUrl,
  suffix,
  method
) {
  return fetch(
    `${baseUrl}/api/tracks/${TRACK_ID}/${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`
      },
      signal: AbortSignal.timeout(5000)
    }
  );
}

/**
 * Verify that a read-only request did not mutate
 * catalog records, including metadata associations.
 */
async function withUnchangedCatalog(
  client,
  action
) {
  const before =
    await catalogFingerprint(client);

  await action();

  assert.equal(
    await catalogFingerprint(client),
    before,
    "Read-only media reference request mutated catalog rows"
  );
}

/**
 * AY-SEC-03
 *
 * Missing mapping:
 * A known track has media_path = NULL.
 *
 * Expected:
 * - HTTP 404
 * - media_not_found
 * - No media ticket
 * - No unexpected catalog mutations
 */
test(
  "AY-SEC-03 missing mapping: NULL path rejected; catalog unchanged",
  async () => {
    await withFixture(
      async ({ client, repository }) => {

        await client.query(
          `UPDATE tracks
           SET media_path = NULL
           WHERE id = $1`,
          [TRACK_ID]
        );

        const stored =
          await repository.findTrackById(TRACK_ID);

        assert.equal(
          stored.media_path,
          null
        );

        await withUnchangedCatalog(
          client,
          async () => {

            await withApp(
              id => repository.findTrackById(id),
              async ({ baseUrl }) => {

                const response =
                  await authenticatedRequest(
                    baseUrl,
                    "media-access",
                    "POST"
                  );

                assert.equal(
                  response.status,
                  404
                );

                assert.deepEqual(
                  await response.json(),
                  { error: "media_not_found" }
                );

                assert.equal(
                  response.headers.get("set-cookie"),
                  null
                );
              }
            );
          }
        );

        assert.deepEqual(
          await repository.findTrackById(TRACK_ID),
          stored
        );
      }
    );
  }
);

/**
 * AY-SEC-04
 *
 * Stale reference:
 * Track references a relative path that is
 * absent from an isolated media root.
 *
 * Expected:
 * - Existing filesystem resolution rejects it
 * - HTTP 404
 * - No unintended catalog mutations
 *
 * Does not test Range handling or media bytes.
 */
test(
  "AY-SEC-04 stale path: filesystem rejects reference; catalog unchanged",
  async () => {
    await withFixture(
      async ({ client, repository }) => {

        const stalePath =
          `nonexistent/scrum216-${randomUUID()}.mp3`;

        await client.query(
          `UPDATE tracks
           SET media_path = $1
           WHERE id = $2`,
          [stalePath, TRACK_ID]
        );

        const stored =
          await repository.findTrackById(TRACK_ID);

        assert.equal(
          stored.media_path,
          stalePath
        );

        await withUnchangedCatalog(
          client,
          async () => {

            await withApp(
              id => repository.findTrackById(id),
              async ({ baseUrl }) => {

                // Check the reference rejection boundary only.
                const response =
                  await authenticatedRequest(
                    baseUrl,
                    "stream",
                    "GET"
                  );

                assert.equal(
                  response.status,
                  404
                );

                assert.equal(
                  await response.text(),
                  "Audio file not found"
                );

                assert.equal(
                  response.headers.get("content-range"),
                  null
                );
              }
            );
          }
        );

        assert.deepEqual(
          await repository.findTrackById(TRACK_ID),
          stored
        );
      }
    );
  }
);

/**
 * AY-SEC-05
 *
 * Rejected locator lookup:
 * Inject a failing findTrackById dependency.
 *
 * Expected:
 * - HTTP 500 with controlled internal_error
 * - No media-access ticket
 * - Failure is not exposed in response
 * - No unexpected catalog mutations
 */
test(
  "AY-SEC-05 rejected locator: controlled error; catalog unchanged",
  async () => {
    await withFixture(
      async ({ client }) => {

        let calls = 0;

        await withUnchangedCatalog(
          client,
          async () => {

            await withApp(
              async id => {
                assert.equal(id, TRACK_ID);

                calls++;

                throw new Error(
                  "scrum216-private-lookup-diagnostic"
                );
              },
              async ({ baseUrl }) => {

                const response =
                  await authenticatedRequest(
                    baseUrl,
                    "media-access",
                    "POST"
                  );

                assert.equal(
                  response.status,
                  500
                );

                assert.deepEqual(
                  await response.json(),
                  { error: "internal_error" }
                );

                assert.equal(
                  response.headers.get("set-cookie"),
                  null
                );
              }
            );
          }
        );

        assert.equal(
          calls,
          1,
          "Injected lookup was not exercised exactly once"
        );
      }
    );
  }
);