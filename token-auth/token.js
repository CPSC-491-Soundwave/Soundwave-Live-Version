import jwt from 'jsonwebtoken';

const ALLOWED_ROLES = new Set(['user', 'admin']);

export function createTokenService(secretKey) {
  if (!secretKey || typeof secretKey !== 'string') {
    throw new Error('A valid secretKey string is required to initialize the token service.');
  }

  const ALGORITHM = 'HS256';

  return {
    create_token(user) {
      if (!user || typeof user !== 'object') {
        throw new Error('User object must be provided.');
      }

      // Reject missing user id or blank normalized ID
      if (user.id === undefined || user.id === null) {
        throw new Error('User id is required.');
      }

      const normalizedId = String(user.id).trim();
      if (normalizedId.length === 0) {
        throw new Error('User id cannot be blank.');
      }

      // Validate allowed roles
      if (!user.role || !ALLOWED_ROLES.has(user.role)) {
        throw new Error(`Invalid or unrecognized role: "${user.role}". Allowed roles are: user, admin.`);
      }

      const payload = { 
        sub: normalizedId, 
        role: user.role 
      };

      return jwt.sign(payload, secretKey, { 
        algorithm: ALGORITHM,
        expiresIn: '2h' 
      });
    },
    verify_token(token) {
      return jwt.verify(token, secretKey, { 
        algorithms: [ALGORITHM] 
      });
    }
  };
}
