import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createTokenService } from "../src/auth/token.js";

const SECRET_KEY = 'NOT_A_REAL_SECRET';
const SECRET_NKEY = 'THIS_KEY_IS_SUPPOSED_TO_FAIL_WRONG_SIGNINGS';

const tokenService = createTokenService(SECRET_KEY);

describe('Generating tokens for this test', () => {
  const user1 = { id: '23', role: 'user' };
  const user2 = { id: '3421', role: 'user' };
  const user3 = { id: '56', role: 'user' };
  const user4 = { id: '75', role: 'user' };

  test('Testing that a token is generated and verified properly', () => {
    const t1 = tokenService.create_token(user1);
    const t2 = tokenService.create_token(user2);
    
    const check1 = tokenService.verify_token(t1);
    const check2 = tokenService.verify_token(t2);

    assert.equal(check1.sub, user1.id);
    assert.equal(check1.role, user1.role);

    assert.equal(check2.sub, user2.id);
    assert.equal(check2.role, user2.role);
  });

  test('Test 2: Testing that wrong secret key fails verification using two token services', () => {
    const serviceA = createTokenService(SECRET_KEY);
    const serviceB = createTokenService(SECRET_NKEY);

    const tokenFromA = serviceA.create_token(user3);

    assert.throws(() => {
      serviceB.verify_token(tokenFromA);
    });
  });

  test('Test 3: Testing that malformed token fails', () => {
    const malformedToken = "this-is-not-a-jwt";

    assert.throws(() => {
      tokenService.verify_token(malformedToken);
    });
  });

  test('Test 4: Testing that expired token fails', () => {
    const expiredToken = jwt.sign({ sub: user4.id, role: user4.role }, SECRET_KEY, { 
      algorithm: 'HS256',
      expiresIn: '0s' 
    });

    assert.throws(() => {
      tokenService.verify_token(expiredToken);
    });
  });

  test('Test 5: Testing that token does not contain sensitive user fields', () => {
    const userWithPassword = { id: '1', role: 'user', password_hash: 'fake-sensitive-value' };
    
    const token = tokenService.create_token(userWithPassword);
    const check = tokenService.verify_token(token);

    assert.equal(check.sub, '1');
    assert.equal(check.role, 'user');
    assert.equal(check.password_hash, undefined);
  });

  describe('Validation & Edge Cases', () => {
    test('should reject missing user object or null input', () => {
      assert.throws(() => tokenService.create_token(null));
      assert.throws(() => tokenService.create_token(undefined));
    });

    test('should reject invalid or blank user IDs', () => {
      assert.throws(() => tokenService.create_token({ role: 'user' }));
      assert.throws(() => tokenService.create_token({ id: '', role: 'user' }));
      assert.throws(() => tokenService.create_token({ id: '   ', role: 'user' }));
    });

    test('should reject invalid user roles', () => {
      assert.throws(() => tokenService.create_token({ id: '12', role: 'superadmin' }));
      assert.throws(() => tokenService.create_token({ id: '12', role: '' }));
    });

    test('should support numeric IDs by normalizing to string', () => {
      const token = tokenService.create_token({ id: 999, role: 'user' });
      const check = tokenService.verify_token(token);
      assert.equal(check.sub, '999');
    });

    test('should support admin role', () => {
      const token = tokenService.create_token({ id: '10', role: 'admin' });
      const check = tokenService.verify_token(token);
      assert.equal(check.role, 'admin');
    });

    test('should reject initialization if secretKey is missing or empty', () => {
      assert.throws(() => createTokenService(''));
      assert.throws(() => createTokenService(null));
    });
  });
});
