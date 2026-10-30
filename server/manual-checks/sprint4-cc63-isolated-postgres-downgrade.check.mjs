/**
 * SCRUM-308: PostgreSQL-backed CC6.3 role downgrade observation.
 * Manual run ONLY, from server/; never run on shared team databases.
 * Uses fixed local socket port/database/user and an explicit opt-in.
 * The admin-only HTTP endpoint is a TEST FIXTURE, not a production route.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { createTokenService } from '../src/auth/token.js';
import { authorizeRevocableRequest } from '../src/auth/request-authorization.js';
import { createAuthUserRepository } from '../src/data/auth-user.repository.js';
import { createTokenRevocationRepository } from '../src/data/token-revocation.repository.js';
import { hash_password } from '../src/auth/hasher.js';

const { Pool } = pg;
const EXPECTED = Object.freeze({
  host: '127.0.0.1',
  port: 55432,
  database: 'soundwave_cm_b1_test',
  user: 'soundwave_cm_b1',
});

function isolateOrThrow() {
  if (process.env.CM_B1_DISPOSABLE_DB_CONFIRM !== 'YES_ISOLATED_CONTAINER') {
    throw new Error('REFUSED: set CM_B1_DISPOSABLE_DB_CONFIRM=YES_ISOLATED_CONTAINER after verifying the dedicated container.');
  }
  if (typeof process.env.CM_B1_PG_PASSWORD !== 'string' || process.env.CM_B1_PG_PASSWORD.length < 16) {
    throw new Error('REFUSED: missing ephemeral CM_B1_PG_PASSWORD (minimum 16 characters).');
  }
  // This test deliberately ignores PGHOST, PGPORT, PGDATABASE, PGUSER,
  // PGPASSWORD, and DATABASE_URL, including values from database/.env.test.
  return {
    ...EXPECTED,
    password: process.env.CM_B1_PG_PASSWORD,
    ssl: false,
    connectionTimeoutMillis: 3000,
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  if (!server?.listening) return;
  server.closeIdleConnections?.();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
function bearer(url, token) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

test('SCRUM-308: committed PostgreSQL role downgrade, old JWT, new JWT, targeted revocation', async t => {
  const config = isolateOrThrow();
  const pool = new Pool(config);
  const independentPool = new Pool(config);
  let appServer;
  let adminPolicyServer;
  let userId;
  const username = `cmg_s4_cc63_${randomUUID().replaceAll('-', '')}`;
  const password = `isolated-${randomUUID()}`;

  try {
    const identity = (await pool.query(
      'SELECT current_database() AS db, current_user AS role_name, inet_server_port() AS server_port'
    )).rows[0];
    assert.equal(identity.db, EXPECTED.database, 'must use Christian-only disposable test database');
    assert.equal(identity.role_name, EXPECTED.user, 'must use Christian-only role');
    assert.equal(Number(identity.server_port), 5432, 'PostgreSQL should be inside its own container');
    const count = (await pool.query('SELECT COUNT(*)::integer AS count FROM users')).rows[0].count;
    assert.equal(count, 0, 'Refuse to modify a populated database');
    t.diagnostic(`Verified isolated target: ${identity.db}, user ${identity.role_name}, host ${EXPECTED.host}, publishedPort ${EXPECTED.port}; existingUsers=0`);

    const hash = await hash_password(password);
    const inserted = await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'admin') RETURNING id`,
      [username, hash]
    );
    userId = String(inserted.rows[0].id);

    const tokenService = createTokenService('scrum-308-ephemeral-test-only-token-signing-key');
    const users = createAuthUserRepository(pool);
    const revocations = createTokenRevocationRepository(pool);
    appServer = createApp({
      tokenService,
      tokenRevocationRepository: revocations,
      findUserByUsername: users.findUserByUsername,
    });
    adminPolicyServer = http.createServer(async (req, res) => {
      const principal = await authorizeRevocableRequest(req, res, {
        tokenService,
        tokenRevocationRepository: revocations,
        allowedRoles: ['admin'],
      });
      if (!principal) return;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed: true }));
    });
    const appBase = await listen(appServer);
    const adminFixtureBase = await listen(adminPolicyServer);

    async function login() {
      const response = await fetch(`${appBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      assert.equal(response.status, 200, 'login for isolated fixture user');
      const payload = await response.json();
      assert.equal(typeof payload.accessToken, 'string');
      return payload.accessToken;
    }

    const oldToken = await login();
    const oldClaims = tokenService.verify_token(oldToken);
    assert.equal(oldClaims.role, 'admin');
    assert.equal(String(oldClaims.sub), userId);
    assert.equal((await bearer(adminFixtureBase, oldToken)).status, 200);

    const updated = await pool.query(
      `UPDATE users SET role = 'user' WHERE id = $1 AND username = $2 RETURNING role`,
      [userId, username]
    );
    assert.equal(updated.rowCount, 1);
    assert.equal(updated.rows[0].role, 'user');
    // Independent connection proves the role update committed.
    const durable = await independentPool.query('SELECT role FROM users WHERE id = $1', [userId]);
    assert.equal(durable.rows[0].role, 'user');

    const oldMeResponse = await bearer(`${appBase}/auth/me`, oldToken);
    const oldMeRole = oldMeResponse.status === 200 ? (await oldMeResponse.json()).user.role : null;
    const oldAdminResponse = await bearer(adminFixtureBase, oldToken);
    const oldAdminStatus = oldAdminResponse.status;
    t.diagnostic(`COMMITTED ROLE=user | OLD JWT role=admin | production /auth/me HTTP=${oldMeResponse.status} responseRole=${oldMeRole ?? 'n/a'} | TEST-ONLY admin policy HTTP=${oldAdminStatus}`);
    assert.ok([200, 401, 403, 503].includes(oldAdminStatus));
    if (oldAdminStatus === 200) {
      t.diagnostic('ASSESSMENT GAP under immediate privilege-removal policy: old JWT retained admin access in test-only policy. Not a SOC 2 PASS or proof of a production admin endpoint.');
    }

    const newToken = await login();
    const newClaims = tokenService.verify_token(newToken);
    assert.equal(newClaims.role, 'user');
    assert.equal((await bearer(adminFixtureBase, newToken)).status, 403);

    await revocations.revokeToken({
      jti: oldClaims.jti,
      userId,
      expiresAt: new Date(oldClaims.exp * 1000),
    });
    assert.equal((await bearer(adminFixtureBase, oldToken)).status, 401);
    t.diagnostic('Explicit token-specific revocation returned 401. This does NOT prove role changes automatically revoke old sessions.');
  } finally {
    await close(adminPolicyServer);
    await close(appServer);
    try {
      if (userId) {
        await pool.query('DELETE FROM revoked_access_tokens WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM users WHERE id = $1 AND username = $2', [userId, username]);
      }
    } finally {
      await independentPool.end();
      await pool.end();
    }
  }
});
