
// SCRUM-230: PostgreSQL-backed, deterministic Favorites fixture verification.
// Run only with an isolated .env.test database after migrations/catalog seed.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const { Client } = pg;

const fixtureSql = await readFile(
  new URL('./fixtures/20261008_ayu_favorites_test_fixture.sql', import.meta.url),
  'utf8',
);

const verifySql = await readFile(
  new URL('./fixtures/verify_ayu_favorites_fixture.sql', import.meta.url),
  'utf8',
);

const favoritePairsSql = `
  SELECT user_id::text AS user_id, track_id::text AS track_id
  FROM favorites
  WHERE user_id IN (9900101, 9900102)
  ORDER BY user_id, track_id
`;

const expectedPairs = [
  { user_id: '9900101', track_id: '3001' },
  { user_id: '9900101', track_id: '3002' },
  { user_id: '9900102', track_id: '3002' },
  { user_id: '9900102', track_id: '3003' },
];

async function connectToTestDatabase() {
  const client = new Client(); // Uses PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.

  await client.connect();

  try {
    const { rows } = await client.query(
      'SELECT current_database() AS database',
    );

    assert.match(
      rows[0].database,
      /(^|_)(test|ci)($|_)/i,
      'Refusing to change a database that is not marked test/CI',
    );

    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

test('Favorites fixture loads twice with four exact user-track associations', async () => {
  const client = await connectToTestDatabase();

  try {
    await client.query(fixtureSql);
    await client.query(verifySql);

    const first = await client.query(favoritePairsSql);
    assert.deepEqual(first.rows, expectedPairs);

    // An idempotent fixture must not add rows or change the associations.
    await client.query(fixtureSql);
    await client.query(verifySql);

    const second = await client.query(favoritePairsSql);
    assert.deepEqual(second.rows, expectedPairs);
  } finally {
    await client.end();
  }
});

test('Favorites verifier rejects missing data without leaving test DB modified', async () => {
  const client = await connectToTestDatabase();

  try {
    // Make this test independent of whether the first test ran.
    await client.query(fixtureSql);
    await client.query(verifySql);

    await client.query('BEGIN');

    try {
      const removed = await client.query(
        'DELETE FROM favorites WHERE user_id = $1 AND track_id = $2',
        [9900101, 3001],
      );

      assert.equal(removed.rowCount, 1);

      await assert.rejects(
        client.query(verifySql),
        /Expected exactly 4 fixture favorites; found 3/,
      );
    } finally {
      // PostgreSQL rolls back the deliberate failed assertion and DELETE.
      await client.query('ROLLBACK');
    }

    await client.query(verifySql);

    const restored = await client.query(favoritePairsSql);
    assert.deepEqual(restored.rows, expectedPairs);
  } finally {
    await client.end();
  }
});
