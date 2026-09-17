import { authenticateRequest, write401Response } from './auth.js';

/**
 * Handles an authenticated GET /auth/me request.
 *
 * Current Sprint 1 behavior:
 * - Authenticates the request using the Bearer access token.
 * - Returns the identity contained in the authenticated principal.
 *
 * Future database behavior:
 * - Use principal.userId to retrieve the current user from PostgreSQL.
 * - Return safe/current user fields from the database instead of relying
 *   only on claims stored in the access token.
 */
export function handleMe(req, res, tokenService) {
    const principal = authenticateRequest(req, tokenService);

    if (!principal) {
        write401Response(res);
        return;
    }

    const responseBody = JSON.stringify({
        user: {
            id: principal.userId,
            role: principal.role
        }
    });

    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });

    res.end(responseBody);
}
