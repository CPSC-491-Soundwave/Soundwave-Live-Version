// Sprint 3 AY-T31: Read-side cross-user Favorites disclosure matrix.
//
// Verifies that authenticated Favorites reads are scoped to the
// JWT-verified principal, using real PostgreSQL fixture records.
//
// Requires:
//   - An isolated PostgreSQL test database
//   - Applied database migrations
//   - Seeded catalog tracks
//   - The deterministic SCRUM-230 Favorites fixture
//
// Run from server/:
// node --env-file=../database/.env.test --test integration/postgres-favorites-isolation.check.mjs

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

const EXPECTED_USER_A_TRACKS = [3001, 3002];
const EXPECTED_USER_B_TRACKS = [3002, 3003];

// Convert a Favorites API response into sorted Track IDs.
// Also verify the public response contract.
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

    // Internal media storage information must never
    // appear in the public Favorites response.
    assert.equal('media_path' in item, false);
    assert.equal('storage_path' in item, false);
    assert.equal('file_path' in item, false);
  }

  return items
    .map(({ id }) => id)
    .sort((a, b) => a - b);
}

// Issue a request through the real HTTP application.
// The user identity must come from the signed JWT,
// not client-supplied headers.
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

// Verify that an unauthorized response does not
// accidentally include fixture track information.
async function assertNoFavoritesDisclosure(response) {
  assert.equal(response.status, 401);

  const body = await response.text();

  assert.doesNotMatch(
    body,
    /Fixture Track One|Fixture Track Two|Fixture Track Three/,
  );

  // No Favorites associations should be included
  // in an authentication failure response.
  assert.doesNotMatch(
    body,
    /"track_id"\s*:\s*300[123]/,
  );

  assert.doesNotMatch(
    body,
    /"id"\s*:\s*300[123]/,
  );
}

test(
  'authenticated Favorites reads enforce database-backed user isolation',
  async (t) => {
    // Prevent accidental execution against development
    // or production databases.
    assert.match(
      process.env.PGDATABASE ?? '',
      /(^|_)(test|ci)($|_)/i,
      'Use an isolated PGDATABASE ending in _test or _ci',
    );

    const pool = new pg.Pool();

    t.after(async () => {
      await pool.end();
    });

    const { rows: databases } = await pool.query(
      'SELECT current_database() AS name',
    );

    assert.equal(
      databases[0].name,
      process.env.PGDATABASE,
    );

    // Verify the exact deterministic Favorites
    // associations before running HTTP requests.
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

    // Reuse Soundwave's existing JWT service.
    // Never introduce custom token verification.
    const tokenService = createTokenService(
      'scrum-228-isolation-only-test-signing-secret',
    );

    // Revocation is tested independently by the
    // existing authentication/security test suites.
    const tokenRevocationRepository = {
      async isTokenRevoked() {
        return false;
      },
    };

    // Use the real PostgreSQL-backed catalog repository
    // and existing catalog service.
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

    // Use an ephemeral localhost port to prevent
    // conflicts with a running development server.
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

    const url =
      `http://127.0.0.1:${server.address().port}`;

    // Two independently signed authenticated principals.
    const tokenA = tokenService.create_token({
      id: 9900101,
      role: 'user',
    });

    const tokenB = tokenService.create_token({
      id: 9900102,
      role: 'user',
    });

    // --------------------------------------------------
    // FDM-01: User A reads their own Favorites.
    // --------------------------------------------------
    await t.test(
      'FDM-01: fixture user A sees only tracks 3001 and 3002',
      async () => {
        const response = await requestFavorites(
          url,
          tokenA,
        );

        assert.equal(response.status, 200);

        const actual = trackIds(
          await response.json(),
        );

        assert.deepEqual(
          actual,
          EXPECTED_USER_A_TRACKS,
        );

        assert.equal(actual.length, 2);

        // Track 3003 belongs exclusively to user B.
        assert.equal(actual.includes(3003), false);
      },
    );

    // --------------------------------------------------
    // FDM-02: User B reads their own Favorites.
    // --------------------------------------------------
    await t.test(
      'FDM-02: fixture user B sees only tracks 3002 and 3003',
      async () => {
        const response = await requestFavorites(
          url,
          tokenB,
        );

        assert.equal(response.status, 200);

        const actual = trackIds(
          await response.json(),
        );

        assert.deepEqual(
          actual,
          EXPECTED_USER_B_TRACKS,
        );

        assert.equal(actual.length, 2);

        // Track 3001 belongs exclusively to user A.
        assert.equal(actual.includes(3001), false);
      },
    );

    // --------------------------------------------------
    // FDM-03: User A spoofs user B in request headers.
    // --------------------------------------------------
    await t.test(
      'FDM-03: user A cannot access user B favorites through forged headers',
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

        const actual = trackIds(
          await response.json(),
        );

        // The signed JWT still identifies user A.
        assert.deepEqual(
          actual,
          EXPECTED_USER_A_TRACKS,
        );

        assert.equal(actual.includes(3003), false);
      },
    );

    // --------------------------------------------------
    // FDM-04: User B spoofs user A in request headers.
    // NEW COVERAGE FOR AY-T31.
    // --------------------------------------------------
    await t.test(
      'FDM-04: user B cannot access user A favorites through forged headers',
      async () => {
        const response = await requestFavorites(
          url,
          tokenB,
          {
            'X-User-Id': '9900101',
            'X-Role': 'admin',
          },
        );

        assert.equal(response.status, 200);

        const actual = trackIds(
          await response.json(),
        );

        // The signed JWT still identifies user B.
        assert.deepEqual(
          actual,
          EXPECTED_USER_B_TRACKS,
        );

        assert.equal(actual.includes(3001), false);
      },
    );

    // --------------------------------------------------
    // FDM-05: Anonymous request.
    // Previously combined with malformed-token coverage.
    // --------------------------------------------------
    await t.test(
      'FDM-05: anonymous favorites read discloses no user favorites',
      async () => {
        const response = await requestFavorites(
          url,
          null,
        );

        await assertNoFavoritesDisclosure(response);
      },
    );

    // --------------------------------------------------
    // FDM-06: Invalid Bearer JWT.
    // Previously combined with anonymous coverage.
    // --------------------------------------------------
    await t.test(
      'FDM-06: malformed JWT cannot read any user favorites',
      async () => {
        const response = await requestFavorites(
          url,
          'definitely-invalid',
        );

        await assertNoFavoritesDisclosure(response);
      },
    );

    // --------------------------------------------------
    // FDM-07: Disclosure oracle negative control.
    //
    // Demonstrates that the exact-result assertion
    // detects a simulated cross-user Favorites leak.
    //
    // IMPORTANT:
    // This is a deliberate test-only mutation of
    // response data, NOT a real application disclosure.
    // It does not modify PostgreSQL or the server.
    // --------------------------------------------------
    await t.test(
      'FDM-07: disclosure oracle rejects a simulated foreign Favorite',
      async () => {
        const response = await requestFavorites(
          url,
          tokenA,
        );

        assert.equal(response.status, 200);

        const observed = trackIds(
          await response.json(),
        );

        // Verify that the real API response is correct.
        assert.deepEqual(
          observed,
          EXPECTED_USER_A_TRACKS,
        );

        // Simulate a bug that incorrectly includes
        // user B's exclusive track 3003.
        const simulatedLeak = [
          ...observed,
          3003,
        ].sort((a, b) => a - b);

        assert.deepEqual(
          simulatedLeak,
          [3001, 3002, 3003],
        );

        // The strict result oracle must reject
        // this deliberately incorrect response.
        assert.throws(
          () => {
            assert.deepEqual(
              simulatedLeak,
              EXPECTED_USER_A_TRACKS,
            );
          },
          {
            code: 'ERR_ASSERTION',
          },
        );
      },
    );
  },
);
