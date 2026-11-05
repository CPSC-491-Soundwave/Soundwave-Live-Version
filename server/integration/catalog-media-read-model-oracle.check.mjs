/**
 * SCRUM-292 / Allison Yu / SOC 2 CC6.6
 * Deterministic read-model oracle for catalog-to-media references.
 *
 * AY-SEC-03: missing media mapping (NULL).
 * AY-SEC-04: stale, fixed path with no existing file.
 * AY-SEC-05: rejected locator lookup with sanitized handler response.
 *
 * SCRUM-216 already covers end-to-end HTTP reference faults. This file
 * checks the repository read model and the sanitized rejection boundary.
 * No Range bytes or credential handling are tested here.
 *
 * Confirm the proposed expected representations with Matthew before
 * considering SCRUM-292's cross-owner contract acceptance complete.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

import { createCatalogRepository } from "../src/data/catalog.repository.js";
import { createMediaAccessHandler } from "../src/media/media-access.handler.js";

const { Pool } = pg;
const TRACK_ID = 3005;
const STALE_PATH = "nonexistent/scrum-292-track-3005.mp3";
const PRIVATE_DIAGNOSTIC = "scrum292-internal-locator-diagnostic";
const TABLES = ["artists", "albums", "tracks"];

function requireTestDatabase() {
  const database = process.env.PGDATABASE ?? "";
  const host = process.env.PGHOST ?? "";

  assert.match(database, /(?:^|[_-])(?:test|ci)(?:$|[_-])/i,
    "PGDATABASE must identify an isolated test/CI database");
  assert.ok(["localhost", "127.0.0.1", "::1", "postgres"].includes(host),
    "PGHOST must point to local/CI PostgreSQL");
  assert.ok(process.env.PGUSER, "PGUSER is required");
  assert.equal(process.env.DATABASE_URL, undefined,
    "Unset DATABASE_URL before running this test");
}

// Hash all catalog rows, not only Track 3005, to detect unrelated writes.
async function fingerprint(client) {
  const tables = {};
  for (const table of TABLES) {
    const { rows } = await client.query(`SELECT * FROM ${table} ORDER BY id`);
    tables[table] = rows;
  }
  return createHash("sha256").update(JSON.stringify(tables)).digest("hex");
}

// One connection/transaction per case. Fixtures never persist after a test.
async function withFixture(run) {
  requireTestDatabase();
  const pool = new Pool();
  let client;
  let transactionOpen = false;

  try {
    client = await pool.connect();
    const baseline = await fingerprint(client);

    await client.query("BEGIN");
    transactionOpen = true;

    const fixture = await client.query(
      "SELECT id, media_path FROM tracks WHERE id = $1 FOR UPDATE",
      [TRACK_ID]
    );
    assert.equal(fixture.rowCount, 1, "Seeded Track 3005 is required");

    const result = await run({
      client,
      repository: createCatalogRepository(client),
      async readOnly(action) {
        const before = await fingerprint(client);
        let actual;
        try {
          actual = await action();
        } finally {
          assert.equal(await fingerprint(client), before,
            "Read operation mutated artists/albums/tracks");
        }
        return actual;
      }
    });

    await client.query("ROLLBACK");
    transactionOpen = false;
    assert.equal(await fingerprint(client), baseline,
      "Temporary fixture changes were not fully rolled back");

    return { ...result, catalogMutation: "none", rollbackVerified: true };
  } finally {
    if (client) {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => {});
      }
      client.release();
    }
    await pool.end();
  }
}

function emitEvidence(scenario, record) {
  console.log(`SCRUM-292-EVIDENCE ${JSON.stringify({
    jira: "SCRUM-292",
    author: "Allison Yu",
    scenario,
    observedAt: new Date().toISOString(),
    ...record
  })}`);
}

test("AY-SEC-03: missing mapping has no media association or catalog writes", async () => {
  const record = await withFixture(async ({ client, repository, readOnly }) => {
    await client.query("UPDATE tracks SET media_path = NULL WHERE id = $1", [TRACK_ID]);

    const expected = { trackId: String(TRACK_ID), mediaPath: null };
    const actual = await readOnly(async () => {
      const track = await repository.findTrackById(TRACK_ID);
      assert.ok(track, "Existing catalog track must still be retrievable");
      return { trackId: String(track.track_id), mediaPath: track.media_path };
    });
    assert.deepEqual(actual, expected);

    return { fixture: { trackId: TRACK_ID, mediaPath: null }, expected, actual };
  });
  emitEvidence("AY-SEC-03", record);
});

test("AY-SEC-04: fixed stale reference does not resolve to a media file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "soundwave-scrum292-"));
  const mediaRoot = path.join(directory, "media");

  try {
    await mkdir(mediaRoot);
    const candidate = path.resolve(mediaRoot, STALE_PATH);
    assert.ok(candidate.startsWith(mediaRoot + path.sep));

    // The fixed fixture must actually be missing, not only named 'nonexistent'.
    await assert.rejects(realpath(candidate), { code: "ENOENT" });

    const record = await withFixture(async ({ client, repository, readOnly }) => {
      await client.query("UPDATE tracks SET media_path = $1 WHERE id = $2",
        [STALE_PATH, TRACK_ID]);

      const expected = {
        trackId: String(TRACK_ID), mediaPath: STALE_PATH, fileExists: false
      };
      const actual = await readOnly(async () => {
        const track = await repository.findTrackById(TRACK_ID);
        assert.ok(track, "Catalog track must remain retrievable");
        let fileExists = true;
        try {
          await realpath(path.resolve(mediaRoot, track.media_path));
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
          fileExists = false;
        }
        return {
          trackId: String(track.track_id),
          mediaPath: track.media_path,
          fileExists
        };
      });
      assert.deepEqual(actual, expected);

      return {
        fixture: { trackId: TRACK_ID, mediaPath: STALE_PATH, mediaRoot: "isolated temporary directory" },
        expected, actual
      };
    });
    emitEvidence("AY-SEC-04", record);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// In-process handler test: authorization is stubbed to an already-authorized
// principal. This is NOT a test of tokens, cookies, or media transport.
test("AY-SEC-05: rejected locator produces a sanitized error and no writes", async () => {
  const record = await withFixture(async ({ client, readOnly }) => {
    let lookupCalls = 0;

    const rejectingRepository = createCatalogRepository({
      async query(statement, parameters) {
        assert.match(statement, /FROM\s+tracks\s+t/i);
        assert.deepEqual(parameters, [TRACK_ID]);
        lookupCalls += 1;
        throw new Error(PRIVATE_DIAGNOSTIC);
      }
    });

    const handler = createMediaAccessHandler({
      mediaTicketService: {
        issue() { return {}; },
        createSetCookieHeader() { return ""; }
      },
      authorizeRevocableRequest: async () => ({ sub: "scrum292-oracle", role: "user" }),
      findTrackById: id => rejectingRepository.findTrackById(id)
    });

    const response = {
      headersSent: false,
      statusCode: null,
      headers: {},
      body: null,
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.headersSent = true;
      },
      end(body = "") { this.body = body; },
      destroy() { throw new Error("Unexpected response destruction"); }
    };

    const expected = {
      status: 500,
      body: { error: "internal_error" },
      exposedDiagnostic: false,
      locatorCalls: 1
    };

    const actual = await readOnly(async () => {
      const handled = await handler({
        method: "POST",
        url: `/api/tracks/${TRACK_ID}/media-access`
      }, response);
      assert.equal(handled, true);
      assert.equal(typeof response.body, "string");

      return {
        status: response.statusCode,
        body: JSON.parse(response.body),
        exposedDiagnostic: response.body.includes(PRIVATE_DIAGNOSTIC),
        locatorCalls: lookupCalls
      };
    });
    assert.deepEqual(actual, expected);

    return {
      fixture: { trackId: TRACK_ID, rejectedQuery: "findTrackById", injection: "deterministic test-only rejection" },
      expected, actual
    };
  });
  emitEvidence("AY-SEC-05", record);
});