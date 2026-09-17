import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;

function createClient() {
  return new Client();
}

test("database tests run only against the dedicated test database", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        current_database() AS database_name,
        current_user AS user_name
    `);

    assert.equal(
      result.rows[0].database_name,
      "soundwave_allison_test"
    );

    assert.equal(
      result.rows[0].user_name,
      "soundwave_app"
    );
  } finally {
    await client.end();
  }
});

test("Sprint 1 catalog tables exist", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'schema_migrations',
          'artists',
          'albums',
          'tracks'
        )
      ORDER BY table_name
    `);

    assert.deepEqual(
      result.rows.map((row) => row.table_name),
      [
        "albums",
        "artists",
        "schema_migrations",
        "tracks",
      ]
    );
  } finally {
    await client.end();
  }
});

test("Migration 001 is recorded as applied", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT filename
      FROM schema_migrations
      WHERE filename = $1
    `, [
      "20260915_ayu_001_catalog_core.sql",
    ]);

    assert.equal(result.rows.length, 1);
    assert.equal(
      result.rows[0].filename,
      "20260915_ayu_001_catalog_core.sql"
    );
  } finally {
    await client.end();
  }
});

test("deterministic artist fixtures exist", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT id, name
      FROM artists
      WHERE id IN (1001, 1002)
      ORDER BY id
    `);

    assert.equal(result.rows.length, 2);

    assert.deepEqual(
      result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
      })),
      [
        {
          id: 1001,
          name: "Fixture Artist One",
        },
        {
          id: 1002,
          name: "Fixture Artist Two",
        },
      ]
    );
  } finally {
    await client.end();
  }
});

test("deterministic album fixtures reference the expected artists", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT id, artist_id, title
      FROM albums
      WHERE id IN (2001, 2002)
      ORDER BY id
    `);

    assert.deepEqual(
      result.rows.map((row) => ({
        id: Number(row.id),
        artistId: Number(row.artist_id),
        title: row.title,
      })),
      [
        {
          id: 2001,
          artistId: 1001,
          title: "Fixture Album Alpha",
        },
        {
          id: 2002,
          artistId: 1002,
          title: "Fixture Album Beta",
        },
      ]
    );
  } finally {
    await client.end();
  }
});

test("deterministic track fixtures reference the expected albums", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT id, album_id, title, duration_ms
      FROM tracks
      WHERE id IN (3001, 3002, 3003, 3004)
      ORDER BY id
    `);

    assert.deepEqual(
      result.rows.map((row) => ({
        id: Number(row.id),
        albumId: Number(row.album_id),
        title: row.title,
        durationMs: row.duration_ms,
      })),
      [
        {
          id: 3001,
          albumId: 2001,
          title: "Fixture Track One",
          durationMs: 180000,
        },
        {
          id: 3002,
          albumId: 2001,
          title: "Fixture Track Two",
          durationMs: 205000,
        },
        {
          id: 3003,
          albumId: 2002,
          title: "Fixture Track Three",
          durationMs: 195000,
        },
        {
          id: 3004,
          albumId: 2002,
          title: "Fixture Track Four",
          durationMs: 222000,
        },
      ]
    );
  } finally {
    await client.end();
  }
});

test("catalog join returns track, album, and artist metadata", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        t.id AS track_id,
        t.title AS track_title,
        t.duration_ms,
        a.id AS album_id,
        a.title AS album_title,
        ar.id AS artist_id,
        ar.name AS artist_name
      FROM tracks t
      JOIN albums a
        ON a.id = t.album_id
      JOIN artists ar
        ON ar.id = a.artist_id
      WHERE t.id IN (3001, 3002, 3003, 3004)
      ORDER BY t.id
    `);

    assert.equal(result.rows.length, 4);

    assert.deepEqual(
      {
        trackId: Number(result.rows[0].track_id),
        trackTitle: result.rows[0].track_title,
        durationMs: result.rows[0].duration_ms,
        albumId: Number(result.rows[0].album_id),
        albumTitle: result.rows[0].album_title,
        artistId: Number(result.rows[0].artist_id),
        artistName: result.rows[0].artist_name,
      },
      {
        trackId: 3001,
        trackTitle: "Fixture Track One",
        durationMs: 180000,
        albumId: 2001,
        albumTitle: "Fixture Album Alpha",
        artistId: 1001,
        artistName: "Fixture Artist One",
      }
    );
  } finally {
    await client.end();
  }
});

test("album foreign key rejects a nonexistent artist", async () => {
  const client = createClient();

  try {
    await client.connect();

    await assert.rejects(
      client.query(
        `
        INSERT INTO albums (artist_id, title)
        VALUES ($1, $2)
        `,
        [
          999999999,
          "Invalid Artist FK Album",
        ]
      ),
      (error) => {
        assert.equal(error.code, "23503");
        return true;
      }
    );
  } finally {
    await client.end();
  }
});

test("track foreign key rejects a nonexistent album", async () => {
  const client = createClient();

  try {
    await client.connect();

    await assert.rejects(
      client.query(
        `
        INSERT INTO tracks (album_id, title, duration_ms)
        VALUES ($1, $2, $3)
        `,
        [
          999999999,
          "Invalid Album FK Track",
          120000,
        ]
      ),
      (error) => {
        assert.equal(error.code, "23503");
        return true;
      }
    );
  } finally {
    await client.end();
  }
});