import { write401Response } from "./auth.js";

const SUPPORTED_ROLES = new Set(["user", "admin"]);

/**
 * Evaluate authorization using a previously authenticated principal.
 *
 * Returns:
 * - "unauthenticated": missing or invalid principal
 * - "forbidden": valid principal without permission
 * - "allowed": valid principal with permission
 *
 * This function does not verify JWTs.
 */
export function evaluateRoleAccess(
  principal,
  allowedRoles
) {
  if (
    !Array.isArray(allowedRoles) ||
    allowedRoles.length === 0 ||
    allowedRoles.some(
      role => !SUPPORTED_ROLES.has(role)
    )
  ) {
    throw new TypeError(
      "Authorization requires an explicit list of supported roles."
    );
  }

  if (
    !principal ||
    typeof principal !== "object" ||
    typeof principal.userId !== "string" ||
    !principal.userId.trim() ||
    !SUPPORTED_ROLES.has(principal.role)
  ) {
    return "unauthenticated";
  }

  if (!allowedRoles.includes(principal.role)) {
    return "forbidden";
  }

  return "allowed";
}

/**
 * Enforce a role policy after authentication has completed.
 *
 * Returns true if the request may continue.
 * Writes 401 or 403 and returns false otherwise.
 *
 * Callers must stop processing when this returns false.
 */
export function enforceRoleAccess(
  principal,
  allowedRoles,
  response
) {
  const decision = evaluateRoleAccess(
    principal,
    allowedRoles
  );

  if (decision === "allowed") {
    return true;
  }

  if (decision === "unauthenticated") {
    write401Response(response);
    return false;
  }

  write403Response(response);
  return false;
}

/**
 * Send a consistent Forbidden response.
 */
export function write403Response(response) {
  if (
    !response ||
    typeof response.writeHead !== "function" ||
    typeof response.end !== "function"
  ) {
    throw new TypeError(
      "A valid HTTP response is required."
    );
  }

  response.writeHead(403, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  response.end(
    JSON.stringify({
      error: "forbidden"
    })
  );
}
