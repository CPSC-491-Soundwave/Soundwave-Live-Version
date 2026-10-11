import {
  authenticateRequestWithRevocation
} from "./revocation-auth.js";

import {
  enforceRoleAccess
} from "./authorization.js";

/**
 * Authenticate and authorize an HTTP request.
 *
 * Returns an authenticated principal when access is allowed.
 *
 * Otherwise writes:
 * 401 - invalid or missing authentication
 * 403 - authenticated but insufficient permissions
 * 503 - authentication infrastructure unavailable
 *
 * Callers must stop processing when null is returned.
 */
export async function authorizeRevocableRequest(
  request,
  response,
  {
    tokenService,
    tokenRevocationRepository,
    allowedRoles
  } = {}
) {
  try {
    const principal =
      await authenticateRequestWithRevocation(
        request,
        tokenService,
        tokenRevocationRepository
      );

    const allowed = enforceRoleAccess(
      principal,
      allowedRoles,
      response
    );

    if (!allowed) {
      return null;
    }

    return principal;
  } catch (error) {
    console.error(
      "Request authorization failed:",
      error
    );

    if (response.headersSent) {
      response.destroy();
      return null;
    }

    response.writeHead(503, {
      "Content-Type":
        "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });

    response.end(
      JSON.stringify({
        error: "authentication_unavailable"
      })
    );

    return null;
  }
}
