import {hash_password, verify} from './hasher.js'

async function testingHash() {
    const hash1 = await hash_password("Hello1123");
    const hash2 = await hash_password("Hello123");
    
    console.log(hash1);
    console.log(hash2);
    
    const verif1 = await verify(hash1, "Hello1123");
    const verif2 = await verify(hash2, "Hello1123");
    
    console.log(verif1);
    console.log(verif2);
}

console.log(testingHash());
