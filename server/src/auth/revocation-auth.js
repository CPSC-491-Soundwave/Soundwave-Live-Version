const ALLOWED_ROLES = new Set(["user", "admin"]);

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Authenticates a Bearer token and checks persistent revocation.
 *
 * Returns null for invalid, expired, legacy, or revoked tokens.
 * Propagates repository failures so callers can fail closed.
 */
export async function authenticateRequestWithRevocation(
  request,
  tokenService,
  tokenRevocationRepository
) {
  if (
    !tokenService ||
    typeof tokenService.verify_token !== "function"
  ) {
    throw new TypeError(
      "A valid token service is required."
    );
  }

  if (
    !tokenRevocationRepository ||
    typeof tokenRevocationRepository.isTokenRevoked !== "function"
  ) {
    throw new TypeError(
      "A token revocation repository is required."
    );
  }

  const header = request?.headers?.authorization;

  if (typeof header !== "string") {
    return null;
  }

  const parts = header.trim().split(/\s+/);

  if (
    parts.length !== 2 ||
    parts[0].toLowerCase() !== "bearer" ||
    !parts[1]
  ) {
    return null;
  }

  let claims;

  try {
    claims = tokenService.verify_token(parts[1]);
  } catch {
    return null;
  }

  if (!claims || typeof claims !== "object") {
    return null;
  }

  if (
    typeof claims.sub !== "string" ||
    !claims.sub.trim()
  ) {
    return null;
  }

  if (!ALLOWED_ROLES.has(claims.role)) {
    return null;
  }

  // Older access tokens without jti must reauthenticate.
  if (
    typeof claims.jti !== "string" ||
    !UUID_V4_PATTERN.test(claims.jti)
  ) {
    return null;
  }

  if (
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  // Keep database failures outside the JWT verification catch.
  // A failed revocation lookup must never authorize the request.
  const revoked =
    await tokenRevocationRepository.isTokenRevoked(
      claims.jti
    );

  if (typeof revoked !== "boolean") {
    throw new TypeError(
      "Revocation lookup must return a boolean."
    );
  }

  if (revoked) {
    return null;
  }

  return {
    userId: claims.sub.trim(),
    role: claims.role,
    jti: claims.jti,
    exp: claims.exp
  };
}
