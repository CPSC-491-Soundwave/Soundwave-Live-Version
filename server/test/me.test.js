import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { handleMe } from '../src/auth/me.js';
import { createTokenService } from '../src/auth/token.js';

const SECRET_KEY = 'ME_TEST_SECRET_KEY';
const tokenService = createTokenService(SECRET_KEY);

describe('GET /auth/me (handleMe)', () => {
  const validUser = { id: '42', role: 'user' };

  test('returns 200 and user identity for a valid authenticated request', () => {
    const validToken = tokenService.create_token(validUser);
    const req = {
      headers: { authorization: `Bearer ${validToken}` }
    };

    let statusCode = null;
    let responseHeaders = null;
    let responseBody = null;

    const res = {
      writeHead(status, headers) {
        statusCode = status;
        responseHeaders = headers;
      },
      end(body) {
        responseBody = body;
      }
    };

    handleMe(req, res, tokenService);

    assert.equal(statusCode, 200);
    assert.deepEqual(responseHeaders, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    
    assert.deepEqual(JSON.parse(responseBody), {
      user: {
        id: '42',
        role: 'user'
      }
    });
  });

  test('returns 401 Unauthorized when Authorization header is missing', () => {
    const req = { headers: {} }; 

    let statusCode = null;
    let responseHeaders = null;
    let responseBody = null;

    const res = {
      writeHead(status, headers) {
        statusCode = status;
        responseHeaders = headers;
      },
      end(body) {
        responseBody = body;
      }
    };

    handleMe(req, res, tokenService);

    assert.equal(statusCode, 401);
    assert.equal(responseHeaders['WWW-Authenticate'], 'Bearer');
    assert.equal(JSON.parse(responseBody).error, 'Unauthorized');
  });

  test('returns 401 Unauthorized for a malformed token', () => {
    const req = {
      headers: { authorization: 'Bearer this-is-not-a-valid-token' }
    };

    let statusCode = null;
    let responseHeaders = null;
    let responseBody = null;

    const res = {
      writeHead(status, headers) {
        statusCode = status;
        responseHeaders = headers;
      },
      end(body) {
        responseBody = body;
      }
    };

    handleMe(req, res, tokenService);

    assert.equal(statusCode, 401);
    assert.equal(responseHeaders['WWW-Authenticate'], 'Bearer');
    assert.deepEqual(JSON.parse(responseBody), {
        error: 'Unauthorized'
        });
    });
});
