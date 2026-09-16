import assert from 'node:assert/strict';
import { describe, test, before } from 'node:test';
import { EventEmitter } from 'node:events';
import { handleLogin } from '../src/auth/login.js';
import { hash_password } from "../src/auth/hasher.js";

// --- Helper Functions to Mock HTTP Objects ---

function createMockReq(bodyString = '') {
    const req = new EventEmitter();
    req.setEncoding = () => {};
    
    // Simulate stream delay
    process.nextTick(() => {
        if (bodyString) {
            req.emit('data', bodyString);
        }
        req.emit('end');
    });
    
    return req;
}

function createMockRes() {
    return {
        statusCode: null,
        headers: null,
        body: null,
        writeHead(code, headers) {
            this.statusCode = code;
            this.headers = headers;
        },
        end(payload) {
            this.body = payload ? JSON.parse(payload) : null;
        }
    };
}

describe('POST /auth/login (handleLogin)', () => {
    let validHash;
    const MOCK_PASSWORD = 'super_secret_password';

    before(async () => {
        // Pre-compute a real hash so hasher.js verify() passes seamlessly
        validHash = await hash_password(MOCK_PASSWORD);
    });

    const mockFindUser = async (username) => {
        if (username === 'valid_user') {
            return {
                id: '42',
                username: 'valid_user',
                password_hash: validHash,
                role: 'user'
            };
        }
        if (username === 'corrupt_hash_user') {
            return {
                id: '99',
                username: 'corrupt_hash_user',
                password_hash: 'not-a-real-argon2-hash-string',
                role: 'user'
            };
        }
        return null;
    };

    const mockTokenService = {
        create_token: () => 'mock-jwt'
    };

    describe('Dependencies', () => {
        test('throws TypeError if findUserByUsername is missing', async () => {
            const req = createMockReq();
            const res = createMockRes();
            
            await assert.rejects(
                () => handleLogin(req, res, { tokenService: mockTokenService }),
                { name: 'TypeError', message: 'findUserByUsername must be a function' }
            );
        });

        test('throws TypeError if tokenService is missing', async () => {
            const req = createMockReq();
            const res = createMockRes();
            
            await assert.rejects(
                () => handleLogin(req, res, { findUserByUsername: mockFindUser }),
                { name: 'TypeError', message: 'tokenService must provide create_token()' }
            );
        });
    });

    describe('Parsing', () => {
        test('returns 400 for malformed JSON', async () => {
            const req = createMockReq('{"username": "test", badjson');
            const res = createMockRes();

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, { error: 'Invalid JSON' });
        });

        test('returns 413 if request body is too large (> 16 KiB)', async () => {
            const req = new EventEmitter();
            req.setEncoding = () => {};
            const res = createMockRes();
            
            process.nextTick(() => {
                req.emit('data', 'A'.repeat(17 * 1024));
                req.emit('end');
            });

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 413);
            assert.deepEqual(res.body, { error: 'Request body too large' });
        });
    });

    describe('Validation', () => {
        test('returns 400 when username is missing', async () => {
            const req = createMockReq(JSON.stringify({ password: 'only_password' }));
            const res = createMockRes();

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, { error: 'Username and password are required' });
        });

        test('returns 400 when password is missing', async () => {
            const req = createMockReq(JSON.stringify({ username: 'only_user' }));
            const res = createMockRes();

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 400);
            assert.deepEqual(res.body, { error: 'Username and password are required' });
        });
    });

    describe('Authentication & Security Boundary', () => {
        test('returns 401 for unknown user', async () => {
            const req = createMockReq(JSON.stringify({ username: 'ghost_user', password: MOCK_PASSWORD }));
            const res = createMockRes();

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 401);
            assert.deepEqual(res.body, { error: 'Invalid username or password' });
        });

        test('returns 401 for wrong password', async () => {
            const req = createMockReq(JSON.stringify({ username: 'valid_user', password: 'wrong_password' }));
            const res = createMockRes();

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 401);
            assert.deepEqual(res.body, { error: 'Invalid username or password' });
        });

        test('returns 200 + Bearer token and passes correct {id, role} to token service', async () => {
            const req = createMockReq(JSON.stringify({ username: 'valid_user', password: MOCK_PASSWORD }));
            const res = createMockRes();
            
            // Capture the user payload to assert the security boundary
            let capturedUserPayload = null;
            const spyTokenService = {
                create_token: (user) => {
                    capturedUserPayload = user;
                    return 'mock-jwt-for-42';
                }
            };

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: spyTokenService });

            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.body, { accessToken: 'mock-jwt-for-42', tokenType: 'Bearer' });
            
            // The boundary check: ensure we didn't accidentally pass the password_hash to the JWT!
            assert.deepEqual(capturedUserPayload, { id: '42', role: 'user' });
        });
    });

    describe('Internal Failures', () => {
        test('returns 500 if DB lookup throws', async () => {
            const req = createMockReq(JSON.stringify({ username: 'valid_user', password: MOCK_PASSWORD }));
            const res = createMockRes();
            
            const failingFindUser = async () => { throw new Error('DB Down'); };

            await handleLogin(req, res, { findUserByUsername: failingFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 500);
            assert.deepEqual(res.body, { error: 'Internal server error' });
        });

        test('returns 500 if stored password hash is corrupt', async () => {
            const req = createMockReq(JSON.stringify({ username: 'corrupt_hash_user', password: MOCK_PASSWORD }));
            const res = createMockRes();

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: mockTokenService });

            assert.equal(res.statusCode, 500);
            assert.deepEqual(res.body, { error: 'Internal server error' });
        });

        test('returns 500 if token creation throws', async () => {
            const req = createMockReq(JSON.stringify({ username: 'valid_user', password: MOCK_PASSWORD }));
            const res = createMockRes();
            
            const failingTokenService = { 
                create_token: () => { throw new Error('JWT Library Error'); }
            };

            await handleLogin(req, res, { findUserByUsername: mockFindUser, tokenService: failingTokenService });

            assert.equal(res.statusCode, 500);
            assert.deepEqual(res.body, { error: 'Internal server error' });
        });
    });
});
