import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { authenticateRequest, write401Response } from './auth.js';
import { createTokenService } from "../token-auth/token.js";

const SECRET_KEY = 'TEST_SECRET_KEY';
const tokenService = createTokenService(SECRET_KEY);

describe('authenticateRequest Middleware', () => {
  const validUser = { id: '42', role: 'user' };

  test('valid Bearer token → returns { userId, role }', () => {
    const validToken = tokenService.create_token(validUser);
    const mockReq = {
      headers: { authorization: `Bearer ${validToken}` }
    };

    const principal = authenticateRequest(mockReq, tokenService);

    assert.deepEqual(principal, {
      userId: '42',
      role: 'user'
    });
  });

  test('missing Authorization header → null', () => {
    const mockReq = { headers: {} };
    assert.equal(authenticateRequest(mockReq, tokenService), null);
  });

  test('wrong authentication scheme → null', () => {
    const mockReq = {
      headers: { authorization: 'Basic dXNlcjpwYXNz' }
    };
    assert.equal(authenticateRequest(mockReq, tokenService), null);
  });

  test('malformed token → null', () => {
    const mockReq = {
      headers: { authorization: 'Bearer this-is-not-a-valid-jwt' }
    };
    assert.equal(authenticateRequest(mockReq, tokenService), null);
  });

  test('expired token → null', () => {
    const expiredToken = jwt.sign({ sub: '42', role: 'user' }, SECRET_KEY, { 
      algorithm: 'HS256',
      expiresIn: '0s' 
    });
    const mockReq = {
      headers: { authorization: `Bearer ${expiredToken}` }
    };

    assert.equal(authenticateRequest(mockReq, tokenService), null);
  });

  test('wrong-signature token → null', () => {
    const wrongService = createTokenService('DIFFERENT_SECRET_KEY');
    const wrongToken = wrongService.create_token(validUser);

    const mockReq = {
      headers: { authorization: `Bearer ${wrongToken}` }
    };

    assert.equal(authenticateRequest(mockReq, tokenService), null);
  });

  test('token with whitespace sub claim → null', () => {
    const token = jwt.sign({ sub: '   ', role: 'user' }, SECRET_KEY, { algorithm: 'HS256' });
    const mockReq = {
      headers: { authorization: `Bearer ${token}` }
    };

    assert.equal(authenticateRequest(mockReq, tokenService), null);
  });

  test('token with invalid role → null', () => {
    const token = jwt.sign({ sub: '42', role: 'superadmin' }, SECRET_KEY, { algorithm: 'HS256' });
    const mockReq = {
      headers: { authorization: `Bearer ${token}` }
    };

    assert.equal(authenticateRequest(mockReq, tokenService), null);
  });

  test('broken/missing tokenService → throws configuration error', () => {
    const mockReq = {
      headers: { authorization: 'Bearer some-token' }
    };

    assert.throws(() => authenticateRequest(mockReq, null));
    assert.throws(() => authenticateRequest(mockReq, {}));
  });

  test('write401Response writes correct status, headers, and payload', () => {
    let statusCode = null;
    let headers = null;
    let endedBody = null;

    const mockRes = {
      writeHead(status, headerObject) {
        statusCode = status;
        headers = headerObject;
      },
      end(body) {
        endedBody = body;
      }
    };

    write401Response(mockRes, 'Unauthorized');

    assert.equal(statusCode, 401);
    assert.deepEqual(headers, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer'
    });
    assert.deepEqual(JSON.parse(endedBody), { error: 'Unauthorized' });
  });
});
