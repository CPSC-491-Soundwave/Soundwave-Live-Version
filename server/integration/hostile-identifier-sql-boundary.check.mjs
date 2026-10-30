
/**
 * Soundwave - Sprint 4
 * Author: Allison Yu
 * Jira: https://491group1.atlassian.net/browse/SCRUM-291
 * SOC 2: CC6.6
 *
 * Automated hostile identifier and SQL-boundary tests.
 * Uses an isolated PostgreSQL database.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { before, after, test } from 'node:test';
import pg from 'pg';

const { Pool } = pg;

const SERVER_DIR = resolve(import.meta.dirname, '..');

const RESOURCES = [
  { name: 'artists', id: 1001 },
  { name: 'albums', id: 2001 },
  { name: 'tracks', id: 3005 },
];

const ATTACKS = [
  ['letters', 'abc'],
  ['decimal', '1.5'],
  ['oversized number', '999999999999999999999999'],
  ['SQL boolean expression', '1 OR 1=1'],
  ['SQL quotation', "1' OR '1'='1"],
];

const PRIVATE_FIELD =
  /"(?:media_path|mediaPath|filePath|storageKey|streamUrl)"\s*:/i;

const LEAK =
  /\b(?:SQLSTATE|PGPASSWORD|JWT_SECRET|MEDIA_TICKET_SECRET)\b|\b(?:SELECT|INSERT|UPDATE|DELETE)\s+[^\n]{0,120}\b(?:FROM|INTO|SET)\b|\bsyntax error at or near\b|\bnode:internal\b|\bat\s+[^\n]{1,120}:\d+:\d+|\/(?:home|mnt|srv|var)\/[^\s"']+/i;

let db;
let child;
let origin;

function assertDisposableDb() {
  const { PGDATABASE, PGHOST, PGUSER } = process.env;

  if (!/(?:^|[_-])(test|ci)(?:$|[_-])/i.test(PGDATABASE ?? '')) {
    throw new Error(
      'PGDATABASE must name a dedicated test/CI database.'
    );
  }

  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    '::1',
    'postgres',
  ];

  if (!allowedHosts.includes(PGHOST) || !PGUSER) {
    throw new Error(
      'Verify PGHOST/PGUSER: use local or CI PostgreSQL.'
    );
  }

  if (process.env.DATABASE_URL) {
    throw new Error(
      'Unset DATABASE_URL to avoid a different database.'
    );
  }
}

async function unusedPort() {
  const server = createServer();

  await new Promise((ready, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', ready);
  });

  const port = server.address().port;

  await new Promise((closed) => server.close(closed));

  return port;
}

async function startBackend() {
  const port = await unusedPort();
  origin = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, ['src/server.js'], {
    cwd: SERVER_DIR,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      JWT_SECRET: randomBytes(48).toString('hex'),
      MEDIA_TICKET_SECRET: randomBytes(48).toString('hex'),
    },
  });

  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Test server exited during startup.');
    }

    try {
      const health = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(500),
      });

      if (health.status === 200) {
        return;
      }
    } catch {
      // Backend is not ready yet.
    }

    await delay(100);
  }

  throw new Error(
    'Test server did not bind to its assigned PORT.'
  );
}

/**
 * SHA-256 snapshot of all catalog records.
 * Compares content, not just row counts.
 */
async function catalogHash() {
  const client = await db.connect();

  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'
    );

    const rowsByTable = {};

    for (const { name } of RESOURCES) {
      // name comes only from fixed constants.
      const result = await client.query(
        `SELECT * FROM ${name} ORDER BY id`
      );

      rowsByTable[name] = result.rows;
    }

    await client.query('COMMIT');

    return createHash('sha256')
      .update(JSON.stringify(rowsByTable))
      .digest('hex');

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send a request to a catalog detail endpoint.
 */
async function requestDetail(resource, rawId) {
  const url =
    `${origin}/api/catalog/${resource.name}/` +
    encodeURIComponent(String(rawId));

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });

  const body = await response.text();

  let data = null;

  try {
    data = JSON.parse(body);
  } catch {
    // A non-JSON response will fail the relevant assertion.
  }

  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    body,
    data,
  };
}

/**
 * Check responses for sensitive implementation details.
 * Never print raw response bodies in assertion failures.
 */
function assertSanitized(result) {
  if (PRIVATE_FIELD.test(result.body)) {
    assert.fail('Storage locator exposed.');
  }

  if (LEAK.test(result.body)) {
    assert.fail('Potential SQL/secret/stack/path disclosure.');
  }
}

/**
 * SETUP
 */
before(async () => {
  assertDisposableDb();

  db = new Pool();

  await db.query('SELECT 1');

  for (const resource of RESOURCES) {
    const result = await db.query(
      `SELECT id FROM ${resource.name} WHERE id = $1`,
      [resource.id]
    );

    assert.equal(
      result.rowCount,
      1,
      `Seed missing: ${resource.name} ${resource.id}`
    );
  }

  await startBackend();

}, { timeout: 20000 });

/**
 * CLEANUP
 */
after(async () => {
  if (
    child &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    child.kill('SIGTERM');

    await Promise.race([
      once(child, 'exit').catch(() => {}),
      delay(2000),
    ]);

    if (
      child.exitCode === null &&
      child.signalCode === null
    ) {
      child.kill('SIGKILL');
    }
  }

  if (db) {
    await db.end();
  }
});

/**
 * SECURITY TESTS
 *
 * 3 resources x 7 cases = 21 tests.
 */
for (const resource of RESOURCES) {

  test(
    `AY-SEC-01 ${resource.name}: valid seeded ID`,
    async () => {
      const result = await requestDetail(
        resource,
        resource.id
      );

      assert.equal(result.status, 200);
      assert.equal(Number(result.data?.id), resource.id);

      assertSanitized(result);
    }
  );

  test(
    `AY-SEC-01 ${resource.name}: missing ID`,
    async () => {
      const beforeHash = await catalogHash();

      const result = await requestDetail(
        resource,
        999999999
      );

      const afterHash = await catalogHash();

      assert.equal(result.status, 404);
      assertSanitized(result);

      assert.equal(
        afterHash,
        beforeHash,
        'Unexpected catalog mutation'
      );
    }
  );

  for (const [label, payload] of ATTACKS) {

    test(
      `AY-SEC-02 ${resource.name}: reject ${label}`,
      async () => {
        const beforeHash = await catalogHash();

        const result = await requestDetail(
          resource,
          payload
        );

        const afterHash = await catalogHash();

        assert.equal(
          result.status,
          400,
          'Malformed ID must follow route 400 contract'
        );

        assert.match(
          result.type,
          /application\/json/i
        );

        assert.equal(
          typeof result.data?.error,
          'string'
        );

        // No resource data returned through error response.
        const forbiddenKeys = [
          'id',
          'artists',
          'albums',
          'tracks',
          'rows',
          'results',
          'data',
        ];

        for (const key of forbiddenKeys) {
          assert.equal(
            result.data?.[key],
            undefined,
            `Error exposed ${key} data`
          );
        }

        assertSanitized(result);

        assert.equal(
          afterHash,
          beforeHash,
          'Unexpected catalog mutation'
        );
      }
    );
  }
}
