import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';

import { createApp } from '../src/app.js';
import { createTokenService } from '../src/auth/token.js';
import { createCatalogHandler } from '../src/catalog/catalog.handler.js';
import { createCatalogService } from '../src/catalog/catalog.service.js';
import { createCatalogRepository } from '../src/data/catalog.repository.js';

const EXPECTED_PAIRS = [
  ['9900101', 3001],
  ['9900101', 3002],
  ['9900102', 3002],
  ['9900102', 3003],
];

function trackIds(items) {
  assert.ok(
    Array.isArray(items),
    'Favorites response must be an array',
  );

  for (const item of items) {
    assert.equal(typeof item.id, 'number');
    assert.equal(typeof item.title, 'string');
    assert.equal(typeof item.album?.title, 'string');
    assert.equal(typeof item.artist?.name, 'string');

    // Internal storage locations must not leak to clients.
    assert.equal('media_path' in item, false);
    assert.equal('storage_path' in item, false);
    assert.equal('file_path' in item, false);
  }

  return items
    .map(({ id }) => id)
    .sort((a, b) => a - b);
}

async function requestFavorites(
  baseUrl,
  token,
  extraHeaders = {},
) {
  return fetch(`${baseUrl}/api/library/favorites`, {
    headers: {
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...extraHeaders,
    },
  });
}

test(
  'authenticated Favorites reads enforce database-backed user isolation',
  async (t) => {
    // This test must never connect to the development
    // or production database.
    assert.match(
      process.env.PGDATABASE ?? '',
      /(^|_)(test|ci)($|_)/i,
      'Use an isolated PGDATABASE ending in _test or _ci',
    );

    const pool = new pg.Pool();

    t.after(() => pool.end());

    const { rows: databases } = await pool.query(
      'SELECT current_database() AS name',
    );

    assert.equal(
      databases[0].name,
      process.env.PGDATABASE,
    );

    // Fail rather than silently testing empty or
    // incorrectly prepared fixture data.
    const { rows } = await pool.query(`
      SELECT
        user_id::text AS user_id,
        track_id::integer AS track_id
      FROM favorites
      WHERE user_id IN (9900101, 9900102)
      ORDER BY user_id, track_id
    `);

    assert.deepEqual(
      rows.map(({ user_id, track_id }) => [
        user_id,
        track_id,
      ]),
      EXPECTED_PAIRS,
      'Load the deterministic SCRUM-230 fixture first',
    );

    // Reuse Christian's token service rather than
    // implementing custom JWT verification.
    const tokenService = createTokenService(
      'scrum-228-isolation-only-test-signing-secret',
    );

    // Revocation behavior is independently covered
    // by the existing authentication tests.
    const tokenRevocationRepository = {
      async isTokenRevoked() {
        return false;
      },
    };

    // Real PostgreSQL-backed repository and service.
    const catalogService = createCatalogService(
      createCatalogRepository(pool),
    );

    const handleCatalogRequest = createCatalogHandler(
      catalogService,
      { tokenService },
    );

    const server = createApp({
      tokenService,
      tokenRevocationRepository,
      handleCatalogRequest,
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    t.after(
      () =>
        new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    );

    const url = `http://127.0.0.1:${server.address().port}`;

    const tokenA = tokenService.create_token({
      id: 9900101,
      role: 'user',
    });

    const tokenB = tokenService.create_token({
      id: 9900102,
      role: 'user',
    });

    await t.test(
      'fixture user A sees only tracks 3001 and 3002',
      async () => {
        const response = await requestFavorites(url, tokenA);

        assert.equal(response.status, 200);
        assert.deepEqual(
          trackIds(await response.json()),
          [3001, 3002],
        );
      },
    );

    await t.test(
      'fixture user B sees only tracks 3002 and 3003',
      async () => {
        const response = await requestFavorites(url, tokenB);

        assert.equal(response.status, 200);
        assert.deepEqual(
          trackIds(await response.json()),
          [3002, 3003],
        );
      },
    );

    await t.test(
      'forged identity headers cannot cross user boundaries',
      async () => {
        const response = await requestFavorites(
          url,
          tokenA,
          {
            'X-User-Id': '9900102',
            'X-Role': 'admin',
          },
        );

        assert.equal(response.status, 200);
        assert.deepEqual(
          trackIds(await response.json()),
          [3001, 3002],
        );
      },
    );

    await t.test(
      'no token and malformed token are rejected',
      async () => {
        for (const token of [
          null,
          'definitely-invalid',
        ]) {
          const response = await requestFavorites(
            url,
            token,
          );

          assert.equal(response.status, 401);
        }
      },
    );
  },
);
