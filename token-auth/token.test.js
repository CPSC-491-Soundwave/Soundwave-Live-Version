import { describe, test, expect } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { createTokenService } from "./token.js";

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

        expect(check1.sub).toBe(user1.id);
        expect(check1.role).toBe(user1.role);

        expect(check2.sub).toBe(user2.id);
        expect(check2.role).toBe(user2.role);
    });

    test('Test 2: Testing that wrong secret key fails verification using two token services', () => {
        const serviceA = createTokenService(SECRET_KEY);
        const serviceB = createTokenService(SECRET_NKEY);

        const tokenFromA = serviceA.create_token(user3);

        expect(() => {
            serviceB.verify_token(tokenFromA);
        }).toThrow();
    });

    test('Test 3: Testing that malformed token fails', () => {
        const malformedToken = "this-is-not-a-jwt";

        expect(() => {
            tokenService.verify_token(malformedToken);
        }).toThrow();
    });

    test('Test 4: Testing that expired token fails', () => {
        const expiredToken = jwt.sign({ sub: user4.id, role: user4.role }, SECRET_KEY, { 
            algorithm: 'HS256',
            expiresIn: '0s' 
        });

        expect(() => {
            tokenService.verify_token(expiredToken);
        }).toThrow();
    });

    test('Test 5: Testing that token does not contain sensitive user fields', () => {
        const userWithPassword = { id: '1', role: 'user', password_hash: 'fake-sensitive-value' };
        
        const token = tokenService.create_token(userWithPassword);
        const check = tokenService.verify_token(token);

        expect(check.sub).toBe('1');
        expect(check.role).toBe('user');
        expect(check.password_hash).toBeUndefined();
    });

    test('Bonus: should reject initialization if secretKey is missing or empty', () => {
        expect(() => createTokenService('')).toThrow();
        expect(() => createTokenService(null)).toThrow();
    });
});
