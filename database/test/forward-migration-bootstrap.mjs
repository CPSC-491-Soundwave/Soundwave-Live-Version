// AY-T32: Rebuild a pre-Sprint-3 database and verify its forward upgrade.
//
// Run only against a NEW, EMPTY, disposable
// soundwave_ayu_forward_test database.
//
// This script never drops or recreates databases.
// It does not modify historical migration files.
//
// From database/:
// node --env-file=<isolated-config> test/forward-migration-bootstrap.mjs
//
// Prerequisite: historical Git commit 731d674 must be available.
// GitHub Actions will need access to that commit's history.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BASELINE_COMMIT = '731d674';
const EXPECTED_DATABASE = 'soundwave_ayu_forward_test';

const HISTORICAL_MIGRATIONS = [
  '20260915_ayu_001_catalog_core.sql',
  '20260916_ayu_002_auth_users.sql',
  '20260924_edg_001_user_preferences.sql',
  '20260927_cmg_001_catalog_search_support.sql',
  'trackMediaPath.sql',
];

const NEW_MIGRATIONS = [
  '20261008_cmg_001_revoked_access_tokens.sql',
  '20261011_ayu_003_user_favorites.sql',
];

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(here, '..');
const repoRoot = path.resolve(databaseDir, '..');

// Retrieve the real historical SQL from Git.
// This avoids copying old migrations into the current
// migration directory or modifying Git history.
function historicalFile(relativePath) {
  try {
    return execFileSync(
      'git',
      ['show', `${BASELINE_COMMIT}:${relativePath}`],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    throw new Error(
      `Unable to load ${relativePath} from ${BASELINE_COMMIT}. ` +
      'Check that the historical commit is available. ' +
      'CI checkout may need fetch-depth: 0.',
    );
  }
}

// Run an existing Node.js script or test in database/.
// Inherit the isolated PostgreSQL environment variables.
function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: databaseDir,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  assert.equal(
    result.status,
    0,
    `Command failed: node ${args.join(' ')}`,
  );

  return result.stdout ?? '';
}

// Count migration actions rather than assuming that
// any successful exit code proves the expected upgrade.
function assertMigrationOutput(
  output,
  expectedApplied,
  expectedSkipped,
) {
  const applied = output.match(/^apply .+\.sql$/gm) ?? [];
  const skipped = output.match(/^skip .+\.sql$/gm) ?? [];

  assert.equal(
    applied.length,
    expectedApplied,
    'Unexpected migration apply count',
  );

  assert.equal(
    skipped.length,
    expectedSkipped,
    'Unexpected migration skip count',
  );
}

async function main() {
  // --------------------------------------------------
  // 1. Validate the configured database.
  // --------------------------------------------------

  assert.equal(
    process.env.PGDATABASE,
    EXPECTED_DATABASE,
    'Refusing any database except soundwave_ayu_forward_test',
  );

  // Load all required sources before modifying the DB.
  const historicalSql = HISTORICAL_MIGRATIONS.map(
    (filename) => ({
      filename,
      sql: historicalFile(
        `database/migrations/${filename}`,
      ),
    }),
  );

  const catalogSeed = historicalFile(
    'database/seeds/20260915_ayu_catalog_seed.sql',
  );

  const fixtureSql = await readFile(
    path.join(
      here,
      'fixtures',
      '20261015_ayu_forward_upgrade_baseline.sql',
    ),
    'utf8',
  );

  const snapshotSql = await readFile(
    path.join(
      here,
      'fixtures',
      '20261015_ayu_forward_upgrade_snapshot.sql',
    ),
    'utf8',
  );

  const client = new pg.Client();

  await client.connect();

  try {
    const { rows: [target] } = await client.query(`
      SELECT
        current_database() AS name,
        current_user AS role_name,
        to_regclass(
          'public.schema_migrations'
        ) AS migrations_table,
        to_regclass('public.users') AS users_table,
        to_regclass('public.favorites') AS favorites_table,
        (
          SELECT COUNT(*)::int
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
        ) AS public_tables,
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_namespace
          WHERE nspname = 'ayu_forward_audit'
        ) AS audit_exists
    `);

    // Refuse any database that already contains
    // application records, migrations, or audit data.
    assert.equal(
      target.name,
      EXPECTED_DATABASE,
      'Unsafe database connection',
    );

    assert.equal(
      target.migrations_table,
      null,
      'Database already migrated',
    );

    assert.equal(
      target.users_table,
      null,
      'Database contains a users table',
    );

    assert.equal(
      target.favorites_table,
      null,
      'Database contains Favorites',
    );

    assert.equal(
      target.public_tables,
      0,
      'Database is not empty; refusing to modify',
    );

    assert.equal(
      target.audit_exists,
      false,
      'Audit schema already exists',
    );

    console.log(
      `PASS: connected to empty ${target.name} (${target.role_name})`,
    );

    // --------------------------------------------------
    // 2. Apply historical migration SQL.
    // --------------------------------------------------

    // Match the real migration runner's ledger shape.
    await client.query(`
      CREATE TABLE public.schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const { filename, sql } of historicalSql) {
      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          `INSERT INTO public.schema_migrations
             (filename)
           VALUES ($1)`,
          [filename],
        );

        await client.query('COMMIT');

        console.log(`historical apply ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');

        throw new Error(
          `Historical migration failed: ${filename}`,
          { cause: error },
        );
      }
    }

    const {
      rows: [{ count: historicalCount }],
    } = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM public.schema_migrations
    `);

    assert.equal(
      historicalCount,
      5,
      'Expected five historical migrations',
    );

    // --------------------------------------------------
    // 3. Seed the historical database.
    // --------------------------------------------------

    await client.query(catalogSeed);

    // Add the historical fixture account.
    await client.query(fixtureSql);

    // Snapshot every pre-upgrade table.
    await client.query(snapshotSql);

    // --------------------------------------------------
    // 4. Verify the historical baseline.
    // --------------------------------------------------

    const { rows: [baseline] } = await client.query(`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM public.artists
        ) AS artists,
        (
          SELECT COUNT(*)::int
          FROM public.albums
        ) AS albums,
        (
          SELECT COUNT(*)::int
          FROM public.tracks
        ) AS tracks,
        (
          SELECT COUNT(*)::int
          FROM public.users
        ) AS users,
        (
          SELECT COUNT(*)::int
          FROM ayu_forward_audit.baseline_tables
        ) AS tables,
        to_regclass('public.favorites') AS favorites
    `);

    assert.deepEqual(
      [
        baseline.artists,
        baseline.albums,
        baseline.tracks,
        baseline.users,
        baseline.tables,
        baseline.favorites,
      ],
      [3, 3, 5, 1, 5, null],
      'Historical seed/snapshot differs from expected baseline',
    );

    console.log(
      'PASS: populated historical schema and captured audit snapshot',
    );
  } finally {
    await client.end();
  }

  // --------------------------------------------------
  // 5. Apply CURRENT migrations to populated database.
  // --------------------------------------------------

  console.log(
    '\nApplying current migrations to historical database:',
  );

  const firstOutput = runNode(['migrate.js']);

  assertMigrationOutput(firstOutput, 2, 5);

  for (const filename of NEW_MIGRATIONS) {
    assert.match(
      firstOutput,
      new RegExp(
        `^apply ${filename.replaceAll('.', '\\.')}$`,
        'm',
      ),
    );
  }

  // --------------------------------------------------
  // 6. Insert post-upgrade Favorites.
  // --------------------------------------------------

  const updated = new pg.Client();

  await updated.connect();

  try {
    const { rows: [target] } = await updated.query(
      'SELECT current_database() AS name',
    );

    assert.equal(target.name, EXPECTED_DATABASE);

    await updated.query('BEGIN');

    try {
      await updated.query(`
        INSERT INTO public.favorites (
          user_id,
          track_id
        )
        VALUES
          (9900201, 3001),
          (9900201, 3002)
      `);

      await updated.query('COMMIT');
    } catch (error) {
      await updated.query('ROLLBACK');
      throw error;
    }

    console.log(
      'PASS: post-upgrade Favorites associations inserted',
    );
  } finally {
    await updated.end();
  }

  // --------------------------------------------------
  // 7. Verify migration rerun safety.
  // --------------------------------------------------

  console.log('\nRe-running current migrations:');

  const secondOutput = runNode(['migrate.js']);

  assertMigrationOutput(secondOutput, 0, 7);

  // --------------------------------------------------
  // 8. Execute preservation + negative-control tests.
  // --------------------------------------------------

  console.log(
    '\nRunning preservation and negative-control tests:',
  );

  runNode([
    '--test',
    'test/forward-migration-preservation.test.js',
  ]);

  console.log(
    '\nPASS: AY-T32 complete forward-compatibility rehearsal',
  );
}

main().catch((error) => {
  console.error('AY-T32 bootstrap failed:', error);
  process.exitCode = 1;
});
