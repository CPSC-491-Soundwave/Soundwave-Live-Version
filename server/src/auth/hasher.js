import argon2 from 'argon2';

export async function hash_password(password){
    const hashedPassword = await argon2.hash(password);
    return hashedPassword;
}

export async function verify(storedHash, password) {
    const matchPassword = await argon2.verify(storedHash, password);
    if (matchPassword) {
        return true;
    } else {
        return false;
    }
}


