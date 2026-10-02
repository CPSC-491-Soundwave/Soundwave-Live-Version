import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

test.after(async () => {
  await pool.end();
});

test("catalog schema retains required relationship contract", async () => {
  const requiredColumns = {
    artists: ["id", "name", "created_at"],
    albums: ["id", "artist_id", "title", "created_at"],
    tracks: ["id", "album_id", "title", "duration_ms", "created_at"]
  };

  for (const [tableName, expectedColumns] of Object.entries(requiredColumns)) {
    const result = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `,
      [tableName]
    );

    const actualColumns = result.rows.map((row) => row.column_name);

    for (const column of expectedColumns) {
      assert.ok(
        actualColumns.includes(column),
        `${tableName}.${column} must exist`
      );
    }
  }

  const foreignKeys = await pool.query(`
    SELECT
      rel.relname AS table_name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel
      ON rel.oid = con.conrelid
    JOIN pg_namespace nsp
      ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND con.contype = 'f'
      AND rel.relname IN ('albums', 'tracks')
    ORDER BY rel.relname
  `);

  const definitions = foreignKeys.rows.map(
    (row) => `${row.table_name}: ${row.definition}`
  );

  assert.ok(
    definitions.some(
      (definition) =>
        definition.includes("albums:") &&
        definition.includes("FOREIGN KEY (artist_id)") &&
        definition.includes("REFERENCES artists(id)")
    ),
    "albums.artist_id must reference artists.id"
  );

  assert.ok(
    definitions.some(
      (definition) =>
        definition.includes("tracks:") &&
        definition.includes("FOREIGN KEY (album_id)") &&
        definition.includes("REFERENCES albums(id)")
    ),
    "tracks.album_id must reference albums.id"
  );

  const indexes = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'albums_artist_id_idx',
        'tracks_album_id_idx'
      )
    ORDER BY indexname
  `);

  assert.deepEqual(
    indexes.rows.map((row) => row.indexname),
    [
      "albums_artist_id_idx",
      "tracks_album_id_idx"
    ]
  );
});

test("deterministic catalog fixtures retain stable identities and relationships", async () => {
  const artists = await pool.query(`
    SELECT id, name
    FROM artists
    WHERE id IN (1001, 1002)
    ORDER BY id
  `);

  assert.deepEqual(artists.rows, [
    {
      id: "1001",
      name: "Fixture Artist One"
    },
    {
      id: "1002",
      name: "Fixture Artist Two"
    }
  ]);

  const albums = await pool.query(`
    SELECT id, artist_id, title
    FROM albums
    WHERE id IN (2001, 2002)
    ORDER BY id
  `);

  assert.deepEqual(albums.rows, [
    {
      id: "2001",
      artist_id: "1001",
      title: "Fixture Album Alpha"
    },
    {
      id: "2002",
      artist_id: "1002",
      title: "Fixture Album Beta"
    }
  ]);

  const tracks = await pool.query(`
    SELECT id, album_id, title, duration_ms
    FROM tracks
    WHERE id IN (3001, 3002, 3003, 3004)
    ORDER BY id
  `);

  assert.deepEqual(tracks.rows, [
    {
      id: "3001",
      album_id: "2001",
      title: "Fixture Track One",
      duration_ms: 180000
    },
    {
      id: "3002",
      album_id: "2001",
      title: "Fixture Track Two",
      duration_ms: 205000
    },
    {
      id: "3003",
      album_id: "2002",
      title: "Fixture Track Three",
      duration_ms: 195000
    },
    {
      id: "3004",
      album_id: "2002",
      title: "Fixture Track Four",
      duration_ms: 222000
    }
  ]);
});