const ALLOWED_ROLES = new Set(['user', 'admin']);

/**
 * Extracts and verifies the user principal from an HTTP request.
 * 
 * @param {import('http').IncomingMessage} req 
 * @param {Object} tokenService 
 * @returns {{ userId: string, role: 'user' | 'admin' } | null}
 */
export function authenticateRequest(req, tokenService) {
  if (!tokenService || typeof tokenService.verify_token !== 'function') {
    throw new Error('A valid tokenService with a verify_token method is required.');
  }

  const authHeader = req?.headers?.authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;

  if (scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  try {
    const claims = tokenService.verify_token(token);

    // Validate claims exist
    if (!claims) {
      return null;
    }

    // 1. Require claims.sub to be a non-empty string after trimming
    if (typeof claims.sub !== 'string' || claims.sub.trim().length === 0) {
      return null;
    }

    // 2. Require claims.role to be exactly one of the supported roles
    if (typeof claims.role !== 'string' || !ALLOWED_ROLES.has(claims.role)) {
      return null;
    }

    return {
      userId: claims.sub.trim(),
      role: claims.role
    };
  } catch {
    return null;
  }
}

/**
 * Writes a standard 401 Unauthorized response with the WWW-Authenticate header.
 * 
 * @param {import('http').ServerResponse} res 
 * @param {string} [message="Unauthorized"]
 */
export function write401Response(res, message = 'Unauthorized') {
  res.writeHead(401, { 
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Bearer'
  });
  res.end(JSON.stringify({ error: message }));
}
