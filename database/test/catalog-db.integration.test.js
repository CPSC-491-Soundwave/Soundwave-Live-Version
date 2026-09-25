import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;

function createClient() {
  return new Client();
}

/*
 * Safety check
 */
test("database tests run against the dedicated test database", async () => {
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

/*
 * Catalog schema tests
 */
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
        "tracks"
      ]
    );
  } finally {
    await client.end();
  }
});

test("Migration 001 is recorded exactly once", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(
      `
      SELECT filename
      FROM schema_migrations
      WHERE filename = $1
      `,
      [
        "20260915_ayu_001_catalog_core.sql"
      ]
    );

    assert.equal(result.rows.length, 1);

    assert.equal(
      result.rows[0].filename,
      "20260915_ayu_001_catalog_core.sql"
    );
  } finally {
    await client.end();
  }
});

/*
 * Deterministic seed tests
 */
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

    assert.deepEqual(
      result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name
      })),
      [
        {
          id: 1001,
          name: "Fixture Artist One"
        },
        {
          id: 1002,
          name: "Fixture Artist Two"
        }
      ]
    );
  } finally {
    await client.end();
  }
});

test("deterministic albums reference expected artists", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        id,
        artist_id,
        title
      FROM albums
      WHERE id IN (2001, 2002)
      ORDER BY id
    `);

    assert.deepEqual(
      result.rows.map((row) => ({
        id: Number(row.id),
        artistId: Number(row.artist_id),
        title: row.title
      })),
      [
        {
          id: 2001,
          artistId: 1001,
          title: "Fixture Album Alpha"
        },
        {
          id: 2002,
          artistId: 1002,
          title: "Fixture Album Beta"
        }
      ]
    );
  } finally {
    await client.end();
  }
});

test("deterministic tracks reference expected albums", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        id,
        album_id,
        title,
        duration_ms
      FROM tracks
      WHERE id IN (3001, 3002, 3003, 3004)
      ORDER BY id
    `);

    assert.deepEqual(
      result.rows.map((row) => ({
        id: Number(row.id),
        albumId: Number(row.album_id),
        title: row.title,
        durationMs: row.duration_ms
      })),
      [
        {
          id: 3001,
          albumId: 2001,
          title: "Fixture Track One",
          durationMs: 180000
        },
        {
          id: 3002,
          albumId: 2001,
          title: "Fixture Track Two",
          durationMs: 205000
        },
        {
          id: 3003,
          albumId: 2002,
          title: "Fixture Track Three",
          durationMs: 195000
        },
        {
          id: 3004,
          albumId: 2002,
          title: "Fixture Track Four",
          durationMs: 222000
        }
      ]
    );
  } finally {
    await client.end();
  }
});

/*
 * Catalog relationship test
 */
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
        artistName: result.rows[0].artist_name
      },
      {
        trackId: 3001,
        trackTitle: "Fixture Track One",
        durationMs: 180000,
        albumId: 2001,
        albumTitle: "Fixture Album Alpha",
        artistId: 1001,
        artistName: "Fixture Artist One"
      }
    );
  } finally {
    await client.end();
  }
});

/*
 * Catalog foreign-key constraint tests
 */
test("albums reject nonexistent artist references", async () => {
  const client = createClient();

  try {
    await client.connect();

    await assert.rejects(
      client.query(
        `
        INSERT INTO albums (
          artist_id,
          title
        )
        VALUES ($1, $2)
        `,
        [
          999999999,
          "Invalid Artist FK Album"
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

test("tracks reject nonexistent album references", async () => {
  const client = createClient();

  try {
    await client.connect();

    await assert.rejects(
      client.query(
        `
        INSERT INTO tracks (
          album_id,
          title,
          duration_ms
        )
        VALUES ($1, $2, $3)
        `,
        [
          999999999,
          "Invalid Album FK Track",
          120000
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

/*
 * Authentication persistence schema tests
 */
test("authentication users table exists", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'users'
    `);

    assert.equal(result.rows.length, 1);
    assert.equal(
      result.rows[0].table_name,
      "users"
    );
  } finally {
    await client.end();
  }
});

test("Migration 002 auth users migration is recorded exactly once", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(
      `
      SELECT filename
      FROM schema_migrations
      WHERE filename = $1
      `,
      [
        "20260916_ayu_002_auth_users.sql"
      ]
    );

    assert.equal(result.rows.length, 1);

    assert.equal(
      result.rows[0].filename,
      "20260916_ayu_002_auth_users.sql"
    );
  } finally {
    await client.end();
  }
});

test("users table contains the fields required by the authentication contract", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN (
          'id',
          'username',
          'password_hash',
          'role',
          'created_at'
        )
      ORDER BY column_name
    `);

    assert.deepEqual(
      result.rows.map((row) => row.column_name),
      [
        "created_at",
        "id",
        "password_hash",
        "role",
        "username"
      ]
    );
  } finally {
    await client.end();
  }
});

test("users reject unsupported authentication roles", async () => {
  const client = createClient();

  const username =
    "ayu-invalid-role-db-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    await assert.rejects(
      client.query(
        `
        INSERT INTO users (
          username,
          password_hash,
          role
        )
        VALUES ($1, $2, $3)
        `,
        [
          username,
          "$argon2id$test-placeholder",
          "superuser"
        ]
      ),
      (error) => {
        /*
         * PostgreSQL SQLSTATE 23514:
         * check_violation
         */
        assert.equal(error.code, "23514");
        return true;
      }
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("users enforce unique usernames", async () => {
  const client = createClient();

  const username =
    "ayu-db-unique-test-user";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      `,
      [
        username,
        "$argon2id$first-test-placeholder",
        "user"
      ]
    );

    await assert.rejects(
      client.query(
        `
        INSERT INTO users (
          username,
          password_hash,
          role
        )
        VALUES ($1, $2, $3)
        `,
        [
          username,
          "$argon2id$second-test-placeholder",
          "user"
        ]
      ),
      (error) => {
        /*
         * PostgreSQL SQLSTATE 23505:
         * unique_violation
         */
        assert.equal(error.code, "23505");
        return true;
      }
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("users reject blank usernames", async () => {
  const client = createClient();

  try {
    await client.connect();

    await assert.rejects(
      client.query(
        `
        INSERT INTO users (
          username,
          password_hash,
          role
        )
        VALUES ($1, $2, $3)
        `,
        [
          "   ",
          "$argon2id$test-placeholder",
          "user"
        ]
      ),
      (error) => {
        assert.equal(error.code, "23514");
        return true;
      }
    );
  } finally {
    await client.end();
  }
});

test("users reject blank password hashes", async () => {
  const client = createClient();

  const username =
    "ayu-blank-password-hash-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    await assert.rejects(
      client.query(
        `
        INSERT INTO users (
          username,
          password_hash,
          role
        )
        VALUES ($1, $2, $3)
        `,
        [
          username,
          "   ",
          "user"
        ]
      ),
      (error) => {
        assert.equal(error.code, "23514");
        return true;
      }
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("users accept supported user role", async () => {
  const client = createClient();

  const username =
    "ayu-valid-user-role-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    const result = await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        username,
        password_hash,
        role
      `,
      [
        username,
        "$argon2id$valid-user-placeholder",
        "user"
      ]
    );

    assert.equal(result.rows.length, 1);

    assert.equal(
      result.rows[0].username,
      username
    );

    assert.equal(
      result.rows[0].role,
      "user"
    );

    assert.equal(
      typeof result.rows[0].password_hash,
      "string"
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("users accept supported admin role", async () => {
  const client = createClient();

  const username =
    "ayu-valid-admin-role-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    const result = await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        username,
        role
      `,
      [
        username,
        "$argon2id$valid-admin-placeholder",
        "admin"
      ]
    );

    assert.equal(result.rows.length, 1);

    assert.equal(
      result.rows[0].username,
      username
    );

    assert.equal(
      result.rows[0].role,
      "admin"
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("user_preferences reject nonexistent user references", async () => {
  const client = createClient();

  try {
    await client.connect();

    await assert.rejects(
      client.query(
        `
        INSERT INTO user_preferences (
          user_id,
          audio_quality_preference
        )
        VALUES ($1, $2)
        `,
        [
          999999999,
          "test-quality"
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

test("user_preferences table exists", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'user_preferences'
    `);

    assert.equal(result.rows.length, 1);
    assert.equal(
      result.rows[0].table_name,
      "user_preferences"
    );
  } finally {
    await client.end();
  }
});

/*
 * Sprint 2 account/profile preference persistence tests
 */

test("Migration 003 user preferences migration is recorded exactly once", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(
      `
      SELECT filename
      FROM schema_migrations
      WHERE filename = $1
      `,
      [
        "20260924_edg_001_user_preferences.sql"
      ]
    );

    assert.equal(result.rows.length, 1);

    assert.equal(
      result.rows[0].filename,
      "20260924_edg_001_user_preferences.sql"
    );
  } finally {
    await client.end();
  }
});

test("user_preferences table contains the expected profile preference fields", async () => {
  const client = createClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_preferences'
        AND column_name IN (
          'user_id',
          'audio_quality_preference'
        )
      ORDER BY column_name
    `);

    assert.deepEqual(
      result.rows,
      [
        {
          column_name: "audio_quality_preference",
          data_type: "text",
          is_nullable: "YES"
        },
        {
          column_name: "user_id",
          data_type: "bigint",
          is_nullable: "NO"
        }
      ]
    );
  } finally {
    await client.end();
  }
});

test("user_preferences allow an unset audio quality preference", async () => {
  const client = createClient();

  const username =
    "edg-null-audio-quality-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    const userResult = await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [
        username,
        "$argon2id$profile-null-test-placeholder",
        "user"
      ]
    );

    const userId = userResult.rows[0].id;

    const preferenceResult = await client.query(
      `
      INSERT INTO user_preferences (
        user_id,
        audio_quality_preference
      )
      VALUES ($1, $2)
      RETURNING
        user_id,
        audio_quality_preference
      `,
      [
        userId,
        null
      ]
    );

    assert.equal(preferenceResult.rows.length, 1);

    assert.equal(
      preferenceResult.rows[0].user_id,
      userId
    );

    assert.equal(
      preferenceResult.rows[0].audio_quality_preference,
      null
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("user_preferences enforce one preference row per user", async () => {
  const client = createClient();

  const username =
    "edg-unique-preference-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    const userResult = await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [
        username,
        "$argon2id$profile-unique-test-placeholder",
        "user"
      ]
    );

    const userId = userResult.rows[0].id;

    await client.query(
      `
      INSERT INTO user_preferences (
        user_id,
        audio_quality_preference
      )
      VALUES ($1, $2)
      `,
      [
        userId,
        "test-quality-a"
      ]
    );

    await assert.rejects(
      client.query(
        `
        INSERT INTO user_preferences (
          user_id,
          audio_quality_preference
        )
        VALUES ($1, $2)
        `,
        [
          userId,
          "test-quality-b"
        ]
      ),
      (error) => {
        /*
         * PostgreSQL SQLSTATE 23505:
         * unique_violation
         */
        assert.equal(error.code, "23505");
        return true;
      }
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("user_preferences reject blank audio quality preferences", async () => {
  const client = createClient();

  const username =
    "edg-blank-audio-quality-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    const userResult = await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [
        username,
        "$argon2id$profile-blank-test-placeholder",
        "user"
      ]
    );

    const userId = userResult.rows[0].id;

    await assert.rejects(
      client.query(
        `
        INSERT INTO user_preferences (
          user_id,
          audio_quality_preference
        )
        VALUES ($1, $2)
        `,
        [
          userId,
          "   "
        ]
      ),
      (error) => {
        /*
         * PostgreSQL SQLSTATE 23514:
         * check_violation
         */
        assert.equal(error.code, "23514");
        return true;
      }
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});

test("deleting a user cascades deletion of user_preferences", async () => {
  const client = createClient();

  const username =
    "edg-preference-cascade-test";

  try {
    await client.connect();

    await client.query(
      `
      DELETE FROM users
      WHERE username = $1
      `,
      [username]
    );

    const userResult = await client.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [
        username,
        "$argon2id$profile-cascade-test-placeholder",
        "user"
      ]
    );

    const userId = userResult.rows[0].id;

    await client.query(
      `
      INSERT INTO user_preferences (
        user_id,
        audio_quality_preference
      )
      VALUES ($1, $2)
      `,
      [
        userId,
        "test-quality"
      ]
    );

    await client.query(
      `
      DELETE FROM users
      WHERE id = $1
      `,
      [userId]
    );

    const preferenceResult = await client.query(
      `
      SELECT user_id
      FROM user_preferences
      WHERE user_id = $1
      `,
      [userId]
    );

    assert.equal(
      preferenceResult.rows.length,
      0
    );
  } finally {
    if (client._connected) {
      await client.query(
        `
        DELETE FROM users
        WHERE username = $1
        `,
        [username]
      );
    }

    await client.end();
  }
});
