// AY-T32: Populated-schema forward migration preservation verification.
//
// Run from the CURRENT Soundwave repository's database/ directory:
// node --env-file="$env:TEMP\soundwave-ayu-forward.env" --test test/forward-migration-preservation.test.js
//
// Prerequisite: soundwave_ayu_forward_test was populated from Git commit 731d674,
// snapshotted into ayu_forward_audit, then upgraded to the Sprint 3 migrations.
//
// This is STAGE 1 automation: it verifies an existing rehearsal database.
// A separate fresh-database bootstrap is still required for CI portability.
//
// Only the negative-control test writes data. That write is always inside
// a PostgreSQL transaction that is rolled back.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';

const EXPECTED_DATABASE = 'soundwave_ayu_forward_test';

const BASELINE_MIGRATIONS = [
  '20260915_ayu_001_catalog_core.sql',
  '20260916_ayu_002_auth_users.sql',
  '20260924_edg_001_user_preferences.sql',
  '20260927_cmg_001_catalog_search_support.sql',
  'trackMediaPath.sql',
];

const NEW_MIGRATIONS = [
  '20261008_cmg_001_revoked_access_tokens.sql',
  '20261011_ayu_003_user_favorites.sql',
  '20261029_mchoi_001_playback_events.sql',
];

const EXPECTED_TABLE_COUNTS = [
  ['albums', 3],
  ['artists', 3],
  ['tracks', 5],
  ['user_preferences', 0],
  ['users', 1],
];

function assertExpectedDatabaseConfiguration() {
  assert.equal(
    process.env.PGDATABASE,
    EXPECTED_DATABASE,
    'Refusing to test any database except soundwave_ayu_forward_test',
  );
}

function quoteIdentifier(name) {
  assert.match(
    name,
    /^[a-z][a-z0-9_]*$/,
    'Unexpected table identifier',
  );

  return `"${name.replaceAll('"', '""')}"`;
}

async function assertMatchesOriginalRows(client, tableName) {
  const tableIdentifier = quoteIdentifier(tableName);

  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS missing
       FROM ayu_forward_audit.baseline_rows AS b
      WHERE b.table_name = $1
        AND NOT EXISTS (
          SELECT 1
            FROM public.${tableIdentifier} AS current_row
           WHERE (to_jsonb(current_row) - 'password_hash') @> b.row_data
        )`,
    [tableName],
  );

  assert.equal(
    rows[0].missing,
    0,
    `Historical rows changed in ${tableName}`,
  );
}

test(
  'AY-T32: upgraded populated database preserves historical data',
  async (t) => {
    assertExpectedDatabaseConfiguration();

    const pool = new pg.Pool();

    t.after(async () => pool.end());

    // A live connection check is essential:
    // an environment-file check alone cannot protect
    // against a different database selected by
    // connection options.

    const {
      rows: [target],
    } = await pool.query(`
      SELECT current_database() AS database_name,
             to_regclass('public.favorites') AS favorites_table,
             to_regclass('public.revoked_access_tokens') AS revocation_table,
             to_regclass('ayu_forward_audit.baseline_rows') AS saved_rows,
             to_regclass('ayu_forward_audit.baseline_tables') AS saved_tables,
             to_regclass('ayu_forward_audit.baseline_migrations') AS saved_migrations,
             to_regclass('ayu_forward_audit.baseline_user_auth_fingerprints') AS saved_auth
    `);

    assert.equal(
      target.database_name,
      EXPECTED_DATABASE,
    );

    for (const field of [
      'favorites_table',
      'revocation_table',
      'saved_rows',
      'saved_tables',
      'saved_migrations',
      'saved_auth',
    ]) {
      assert.notEqual(
        target[field],
        null,
        `Required relation missing: ${field}`,
      );
    }

    // --------------------------------------------------
    // Test 1: Migration history preservation
    // --------------------------------------------------

    await t.test(
      'migration ledger retains five historical entries plus two new entries',
      async () => {
        const [
          { rows: live },
          { rows: baseline },
        ] = await Promise.all([
          pool.query(
            'SELECT filename FROM public.schema_migrations ORDER BY filename',
          ),
          pool.query(
            'SELECT filename FROM ayu_forward_audit.baseline_migrations ORDER BY filename',
          ),
        ]);

        assert.deepEqual(
          baseline.map((r) => r.filename),
          [...BASELINE_MIGRATIONS].sort(),
        );

        assert.deepEqual(
          live.map((r) => r.filename),
          [...BASELINE_MIGRATIONS, ...NEW_MIGRATIONS].sort(),
        );

        const {
          rows: [{ modified }],
        } = await pool.query(`
          SELECT COUNT(*)::int AS modified
          FROM (
            SELECT filename, applied_at
            FROM ayu_forward_audit.baseline_migrations

            EXCEPT

            SELECT filename, applied_at
            FROM public.schema_migrations
          ) AS discrepancies
        `);

        assert.equal(
          modified,
          0,
          'Historical migration ledger was modified',
        );
      },
    );

    // --------------------------------------------------
    // Test 2: Historical table and record preservation
    // --------------------------------------------------

    await t.test(
      'all five pre-upgrade tables retain their row counts and data',
      async () => {
        const { rows: savedTables } = await pool.query(`
          SELECT
            table_name,
            row_count::int AS row_count
          FROM ayu_forward_audit.baseline_tables
          ORDER BY table_name
        `);

        assert.deepEqual(
          savedTables.map((r) => [
            r.table_name,
            r.row_count,
          ]),
          EXPECTED_TABLE_COUNTS,
        );

        for (const {
          table_name: tableName,
          row_count: expectedCount,
        } of savedTables) {
          const {
            rows: [{ count }],
          } = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM public.${quoteIdentifier(tableName)}`,
          );

          assert.equal(
            count,
            expectedCount,
            `Row count changed in ${tableName}`,
          );

          await assertMatchesOriginalRows(
            pool,
            tableName,
          );
        }
      },
    );

    // --------------------------------------------------
    // Test 3: Historical user authentication data
    // --------------------------------------------------

    await t.test(
      'the historical account and stored password hash are unchanged',
      async () => {
        const { rows } = await pool.query(`
          SELECT
            u.id::text AS id,
            u.username,
            u.role,
            (
              md5(u.password_hash) =
              a.password_hash_fingerprint
            ) AS hash_unchanged
          FROM public.users AS u
          JOIN ayu_forward_audit.baseline_user_auth_fingerprints AS a
            ON a.id = u.id
          WHERE u.id = 9900201
        `);

        assert.deepEqual(rows, [
          {
            id: '9900201',
            username: 'ayu_forward_upgrade_fixture',
            role: 'user',
            hash_unchanged: true,
          },
        ]);
      },
    );

    // --------------------------------------------------
    // Test 4: Historical catalog read relationships
    // --------------------------------------------------

    await t.test(
      'historical catalog tracks still resolve to albums and artists',
      async () => {
        const { rows } = await pool.query(`
          SELECT
            t.id::int AS track_id,
            a.id::int AS album_id,
            a.artist_id::int AS artist_id
          FROM public.tracks AS t
          JOIN public.albums AS a
            ON a.id = t.album_id
          WHERE t.id IN (3001, 3002, 3003)
          ORDER BY t.id
        `);

        assert.deepEqual(rows, [
          {
            track_id: 3001,
            album_id: 2001,
            artist_id: 1001,
          },
          {
            track_id: 3002,
            album_id: 2001,
            artist_id: 1001,
          },
          {
            track_id: 3003,
            album_id: 2002,
            artist_id: 1002,
          },
        ]);
      },
    );

    // --------------------------------------------------
    // Test 5: New Favorites read relationship
    // --------------------------------------------------

    await t.test(
      'new Favorites join preserves the expected fixture user associations',
      async () => {
        const { rows } = await pool.query(`
          SELECT
            f.user_id::text AS user_id,
            t.id::int AS track_id
          FROM public.favorites AS f
          JOIN public.tracks AS t
            ON t.id = f.track_id
          JOIN public.albums AS a
            ON a.id = t.album_id
          WHERE f.user_id = 9900201
          ORDER BY t.id
        `);

        assert.deepEqual(rows, [
          {
            user_id: '9900201',
            track_id: 3001,
          },
          {
            user_id: '9900201',
            track_id: 3002,
          },
        ]);
      },
    );

    // --------------------------------------------------
    // Test 6: Negative-control preservation test
    // --------------------------------------------------

    await t.test(
      'negative control detects a changed historical track and rolls it back',
      async () => {
        const client = await pool.connect();

        let transactionStarted = false;

        try {
          const { rows: before } = await client.query(
            'SELECT title FROM public.tracks WHERE id = 3001',
          );

          assert.equal(before.length, 1);
          assert.equal(
            before[0].title,
            'Fixture Track One',
          );

          // Begin an isolated PostgreSQL transaction.
          await client.query('BEGIN');

          transactionStarted = true;

          // Deliberately simulate historical data corruption.
          await client.query(
            `UPDATE public.tracks
             SET title = title || ' [AY-T32 TEST CHANGE]'
             WHERE id = 3001`,
          );

          // Reuse the same preservation oracle
          // from the positive historical-data test.
          //
          // The assertion must fail because the
          // original saved Track no longer matches.

          await assert.rejects(
            assertMatchesOriginalRows(
              client,
              'tracks',
            ),
            {
              code: 'ERR_ASSERTION',
            },
            'The preservation oracle failed to detect the test-only change',
          );
        } finally {
          // Always restore the original database state.
          if (transactionStarted) {
            await client.query('ROLLBACK');
          }

          client.release();
        }

        // Confirm the historical Track title was restored.
        const { rows: after } = await pool.query(
          'SELECT title FROM public.tracks WHERE id = 3001',
        );

        assert.equal(
          after[0]?.title,
          'Fixture Track One',
        );
      },
    );
  },
);
