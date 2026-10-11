import { write401Response } from "./auth.js";

import {
  authenticateRequestWithRevocation
} from "./revocation-auth.js";

/**
 * Revokes the current JWT access token.
 *
 * POST /auth/logout
 *
 * Success: 204 No Content
 * Invalid or already-revoked token: 401 Unauthorized
 *
 * Database errors propagate to the HTTP application,
 * which must return a controlled server error.
 */
export async function handleLogout(
  request,
  response,
  {
    tokenService,
    tokenRevocationRepository
  } = {}
) {
  if (
    !tokenRevocationRepository ||
    typeof tokenRevocationRepository.revokeToken !== "function"
  ) {
    throw new TypeError(
      "Logout requires a token revocation repository."
    );
  }

  const principal =
    await authenticateRequestWithRevocation(
      request,
      tokenService,
      tokenRevocationRepository
    );

  if (!principal) {
    write401Response(response);
    return;
  }

  const expiresAt =
    new Date(principal.exp * 1000);

  const inserted =
    await tokenRevocationRepository.revokeToken({
      jti: principal.jti,
      userId: principal.userId,
      expiresAt
    });

  if (typeof inserted !== "boolean") {
    throw new TypeError(
      "Revocation insertion must return a boolean."
    );
  }

  response.writeHead(204, {
    "Cache-Control": "no-store"
  });

  response.end();
}
