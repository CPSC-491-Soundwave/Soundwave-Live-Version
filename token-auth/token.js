import jwt from 'jsonwebtoken';

// Per recommendation: I wanna try a different way:

export function createTokenService(secretKey) {
    // Adding an undefined check
    if (!secretKey || typeof secretKey !== 'string') {
        throw new Error('Invalid Key! Key is required to initialize token serivces.');
    }
    
    const ALGORITHM = 'HS256';
    
  return {
    create_token(user) {
        if (user.id == undefined || user.id == null || user.id == '') {
            throw new Error('ID is required for a token.');
        }
    
        if (!user.role) {
            throw new Error('Invalid role.');
        }
      const payload = { 
        sub: String(user.id), 
        role: user.role 
      };
      return jwt.sign(payload, secretKey, { 
        algorithm: ALGORITHM,
        expiresIn: '15m'
        });
    },
     verify_token(token) {
        return jwt.verify(token, secretKey, { 
            algorithms: [ALGORITHM] 
            });
        }
    };
}
