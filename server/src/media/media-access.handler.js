
const MEDIA_ACCESS_ROUTE =
/^\/api\/tracks\/([1-9][0-9]*)\/media-access$/;

function respondJson(response, statusCode, error, extraHeaders = {}) {
    if (response.headersSent) {
        response.destroy();
        return;
    }

    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...extraHeaders
    });

    response.end(JSON.stringify({ error }));
}

function validTrackId(routeValue) {
    const value = Number(routeValue);

    return (
        Number.isSafeInteger(value) &&
        value > 0 &&
        String(value) === routeValue
    );
}

export function createMediaAccessHandler({
    mediaTicketService,
    tokenService,
    tokenRevocationRepository,
    authorizeRevocableRequest,
    findTrackById
} = {}) {
    if (
        !mediaTicketService ||
        typeof mediaTicketService.issue !== "function" ||
        typeof mediaTicketService.createSetCookieHeader !== "function" ||
        typeof authorizeRevocableRequest !== "function" ||
        typeof findTrackById !== "function"
    ) {
        throw new TypeError(
            "Media access handler requires ticket, auth, and catalog dependencies."
        );
    }

    return async function handleMediaAccessRequest(request, response) {
        const url = new URL(request.url, "http://localhost");
        const match = MEDIA_ACCESS_ROUTE.exec(url.pathname);

        if (request.method !== "POST" || !match) {
            return false;
        }

        if (!validTrackId(match[1])) {
            respondJson(response, 400, "invalid_track_id");
            return true;
        }

        const trackId = Number(match[1]);

        // Reuse Christian's existing authentication.
        const principal = await authorizeRevocableRequest(
            request,
            response,
            {
                tokenService,
                tokenRevocationRepository,
                allowedRoles: ["user", "admin"]
            }
        );

        if (!principal) {
            return true;
        }

        try {
            // Authenticate before accessing the catalog.
            const track = await findTrackById(trackId);

            if (!track) {
                respondJson(response, 404, "track_not_found");
                return true;
            }

            if (!track.media_path) {
                respondJson(response, 404, "media_not_found");
                return true;
            }

            const issued = mediaTicketService.issue({
                principal,
                trackId
            });

            const setCookie =
            mediaTicketService.createSetCookieHeader({
                issued,
                trackId
            });

            response.writeHead(204, {
                "Set-Cookie": setCookie,
                "Cache-Control": "no-store",
                "Vary": "Authorization"
            });

            response.end();
        } catch {
            // Never log credentials or cookie contents.
            respondJson(response, 500, "internal_error");
        }

        return true;
    };
}

export async function authorizeMediaStreamRequest(
    request,
    response,
    {
        trackId,
        mediaTicketService,
        tokenService,
        tokenRevocationRepository,
        authorizeRevocableRequest
    } = {}
) {
    if (typeof authorizeRevocableRequest !== "function") {
        respondJson(response, 503, "authentication_unavailable");
        return null;
    }

    // Existing Bearer requests must retain priority.
    // A bad Bearer token cannot fall back to a cookie.
    if (
        request.headers.authorization !== undefined ||
        !mediaTicketService
    ) {
        return authorizeRevocableRequest(
            request,
            response,
            {
                tokenService,
                tokenRevocationRepository,
                allowedRoles: ["user", "admin"]
            }
        );
    }

    try {
        if (
            typeof mediaTicketService.authenticateCookieRequest !==
            "function"
        ) {
            throw new TypeError(
                "Media ticket service is unavailable."
            );
        }

        const principal =
        await mediaTicketService.authenticateCookieRequest({
            request,
            trackId,
            tokenRevocationRepository
        });

        if (!principal) {
            respondJson(
                response,
                401,
                "unauthorized",
                { "WWW-Authenticate": "Bearer" }
            );

            return null;
        }

        return principal;
    } catch {
        respondJson(response, 503, "authentication_unavailable");
        return null;
    }
}
