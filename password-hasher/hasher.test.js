import { describe, test, expect } from '@jest/globals';
import { hash_password, verify} from "./hasher.js"

describe('First hashing multiple passwords', () => {
    const pass1 = "SuperCoolPassword_1234";
    const pass2 = "ThisPassword.123";
    const pass3 = "ThatPassword_123";
    const pass4 = "IalMOstgotIt-23";
    const pass5 = "Kaleidomi_123";
    const pass6 = "JoshIsAwesome.231";
    const notPass = "400230203"; 
    
    test('Testing if each password and the respect hash matches', async() => {
        const hash1 = await hash_password(pass1);
        const hash2 = await hash_password(pass2);
        const hash3 = await hash_password(pass3);
        const hash4 = await hash_password(pass4);
        const hash5 = await hash_password(pass5);
        const hash6 = await hash_password(pass6);
        
        const check1 = await verify(hash1, pass1);
        const check2 = await verify(hash2, pass2);
        const check3 = await verify(hash3, pass3);
        const check4 = await verify(hash4, pass4);
        const check5 = await verify(hash5, pass5);
        const check6 = await verify(hash6, pass6);
        
        expect(check1).toBe(true);
        expect(check2).toBe(true);
        expect(check3).toBe(true);
        expect(check4).toBe(true);
        expect(check5).toBe(true);
        expect(check6).toBe(true);
    });
    
    test('Testing on failed verification', async() => {
        const hash1 = await hash_password(pass1);
        const hash2 = await hash_password(pass2);
        const hash3 = await hash_password(pass3);
        const hash4 = await hash_password(pass4);
        const hash5 = await hash_password(pass5);
        const hash6 = await hash_password(pass6);
        
        const check1 = await verify(hash1, notPass);
        const check2 = await verify(hash2, notPass);
        const check3 = await verify(hash3, notPass);
        const check4 = await verify(hash4, notPass);
        const check5 = await verify(hash5, notPass);
        const check6 = await verify(hash6, notPass);
        
        expect(check1).toBe(false);
        expect(check2).toBe(false);
        expect(check3).toBe(false);
        expect(check4).toBe(false);
        expect(check5).toBe(false);
        expect(check6).toBe(false);
    });
    
    describe('Edge Cases', () => {
    test('should handle an empty string password safely', async () => {
      const emptyPassword = '';
      const hash = await hash_password(emptyPassword);
      
      expect(hash).toBeDefined();
      expect(await verify(hash, emptyPassword)).toBe(true);
    });

test('should reject verification if the hash is malformed or tampered with', async () => {
            const validPassword = pass1;
            const hash = await hash_password(validPassword);
            const tamperedHash = hash.slice(0, -3) + 'abc';
            
            // argon2.verify throws an error on malformed hashes or returns false
            try {
                const isValid = await verify(tamperedHash, validPassword);
                expect(isValid).toBe(false);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
});
