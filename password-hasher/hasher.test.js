import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hash_password, verify } from "./hasher.js";

describe('First hashing multiple passwords', () => {
  const pass1 = "SuperCoolPassword_1234";
  const pass2 = "ThisPassword.123";
  const pass3 = "ThatPassword_123";
  const pass4 = "IalMOstgotIt-23";
  const pass5 = "Kaleidomi_123";
  const pass6 = "JoshIsAwesome.231";
  const notPass = "400230203"; 
  
  test('Testing if each password and the respect hash matches', async () => {
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
    
    assert.equal(check1, true);
    assert.equal(check2, true);
    assert.equal(check3, true);
    assert.equal(check4, true);
    assert.equal(check5, true);
    assert.equal(check6, true);
  });
  
  test('Testing on failed verification', async () => {
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
    
    assert.equal(check1, false);
    assert.equal(check2, false);
    assert.equal(check3, false);
    assert.equal(check4, false);
    assert.equal(check5, false);
    assert.equal(check6, false);
  });
  
  describe('Edge Cases', () => {
    test('should handle an empty string password safely', async () => {
      const emptyPassword = '';
      const hash = await hash_password(emptyPassword);
      
      assert.ok(hash);
      assert.equal(await verify(hash, emptyPassword), true);
    });

    test('should reject verification if the hash is malformed or tampered with', async () => {
      const validPassword = pass1;
      const hash = await hash_password(validPassword);
      const tamperedHash = hash.slice(0, -3) + 'abc';
      
      try {
        const isValid = await verify(tamperedHash, validPassword);
        assert.equal(isValid, false);
      } catch (error) {
        assert.ok(error);
      }
    });
  });
});
