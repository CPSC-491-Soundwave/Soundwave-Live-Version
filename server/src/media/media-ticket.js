
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "sw_media";
const TICKET_PURPOSE = "soundwave-media-stream";
const TICKET_ISSUER = "soundwave-media-access";
const TICKET_AUDIENCE = "soundwave-media-stream";

const UUID_V4 =
/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function canonicalTrackId(input) {
    if (typeof input === "number") {
        return Number.isSafeInteger(input) && input > 0
        ? String(input)
        : null;
    }

    if (typeof input !== "string" || !/^[1-9][0-9]*$/.test(input)) {
        return null;
    }

    const number = Number(input);

    return Number.isSafeInteger(number) && String(number) === input
    ? input
    : null;
}

function sign(payloadBase64Url, secret) {
    return createHmac("sha256", secret)
    .update(`soundwave.media.v1.${payloadBase64Url}`, "utf8")
    .digest();
}

export function createMediaTicketService({
    mediaSecret,
    loginSecret,
    lifetimeSeconds = 300,
    secureCookies = process.env.NODE_ENV === "production",
    now = () => Date.now()
} = {}) {
    if (
        typeof mediaSecret !== "string" ||
        Buffer.byteLength(mediaSecret, "utf8") < 32
    ) {
        throw new TypeError(
            "MEDIA_TICKET_SECRET must contain at least 32 UTF-8 bytes."
        );
    }

    if (typeof loginSecret !== "string" || !loginSecret) {
        throw new TypeError(
            "JWT_SECRET is required to verify signing-key separation."
        );
    }

    if (mediaSecret === loginSecret) {
        throw new TypeError(
            "Media-ticket and login-JWT signing credentials must differ."
        );
    }

    if (
        !Number.isSafeInteger(lifetimeSeconds) ||
        lifetimeSeconds < 1 ||
        lifetimeSeconds > 600
    ) {
        throw new RangeError(
            "Media-ticket lifetime must be 1 to 600 seconds."
        );
    }

    if (typeof secureCookies !== "boolean" || typeof now !== "function") {
        throw new TypeError("Invalid media-ticket configuration.");
    }

    const secret = Buffer.from(mediaSecret, "utf8");
    const currentSeconds = () => Math.floor(now() / 1000);

    function issue({ principal, trackId } = {}) {
        const normalizedTrackId = canonicalTrackId(trackId);
        const issuedAt = currentSeconds();

        if (!normalizedTrackId) {
            throw new TypeError(
                "A positive canonical track ID is required."
            );
        }

        if (
            !principal ||
            typeof principal.userId !== "string" ||
            !principal.userId.trim() ||
            !UUID_V4.test(principal.jti ?? "") ||
            !Number.isSafeInteger(principal.exp) ||
            principal.exp <= issuedAt
        ) {
            throw new TypeError(
                "An active login principal with a session jti is required."
            );
        }

        // A ticket cannot outlive its originating login token.
        const expiresAt = Math.min(
            principal.exp,
            issuedAt + lifetimeSeconds
        );

        const payload = {
            v: 1,
            iss: TICKET_ISSUER,
            aud: TICKET_AUDIENCE,
            purpose: TICKET_PURPOSE,
            sub: principal.userId.trim(),
            trackId: normalizedTrackId,
            sourceJti: principal.jti,
            nonce: randomUUID(),
            iat: issuedAt,
            exp: expiresAt
        };

        const encodedPayload = Buffer.from(
            JSON.stringify(payload),
                                           "utf8"
        ).toString("base64url");

        const signature = sign(encodedPayload, secret)
        .toString("base64url");

        return Object.freeze({
            token: `${encodedPayload}.${signature}`,
            expiresAt,
            expiresInSeconds: expiresAt - issuedAt
        });
    }

    function verify({ token, trackId } = {}) {
        const normalizedTrackId = canonicalTrackId(trackId);

        if (
            !normalizedTrackId ||
            typeof token !== "string" ||
            token.length > 2048
        ) {
            return null;
        }

        const parts = token.split(".");

        if (
            parts.length !== 2 ||
            !BASE64URL.test(parts[0]) ||
            !BASE64URL.test(parts[1])
        ) {
            return null;
        }

        const signature = Buffer.from(parts[1], "base64url");

        if (signature.length !== 32) {
            return null;
        }

        const expected = sign(parts[0], secret);

        if (!timingSafeEqual(signature, expected)) {
            return null;
        }

        let claims;

        try {
            claims = JSON.parse(
                Buffer.from(parts[0], "base64url").toString("utf8")
            );
        } catch {
            return null;
        }

        const currentTime = currentSeconds();

        if (
            !claims ||
            typeof claims !== "object" ||
            Array.isArray(claims) ||
            claims.v !== 1 ||
            claims.iss !== TICKET_ISSUER ||
            claims.aud !== TICKET_AUDIENCE ||
            claims.purpose !== TICKET_PURPOSE ||
            typeof claims.sub !== "string" ||
            !claims.sub.trim() ||
            claims.sub !== claims.sub.trim() ||
            claims.trackId !== normalizedTrackId ||
            !UUID_V4.test(claims.sourceJti ?? "") ||
            !UUID_V4.test(claims.nonce ?? "") ||
            !Number.isSafeInteger(claims.iat) ||
            !Number.isSafeInteger(claims.exp) ||
            claims.iat > currentTime ||
            claims.exp <= currentTime ||
            claims.exp <= claims.iat ||
            claims.exp - claims.iat > lifetimeSeconds
        ) {
            return null;
        }

        return Object.freeze({
            userId: claims.sub,
            trackId: normalizedTrackId,
            sourceJti: claims.sourceJti,
            expiresAt: claims.exp
        });
    }

    function createSetCookieHeader({ issued, trackId } = {}) {
        const normalizedTrackId = canonicalTrackId(trackId);

        if (
            !normalizedTrackId ||
            !issued ||
            !Number.isSafeInteger(issued.expiresInSeconds) ||
            issued.expiresInSeconds < 1 ||
            !verify({
                token: issued.token,
                trackId: normalizedTrackId
            })
        ) {
            throw new TypeError(
                "A valid, unexpired ticket and matching track ID are required."
            );
        }

        const attributes = [
            `${COOKIE_NAME}=${issued.token}`,
            `Path=/api/tracks/${normalizedTrackId}/stream`,
            `Max-Age=${issued.expiresInSeconds}`,
            "HttpOnly",
            "SameSite=Lax"
        ];

        if (secureCookies) {
            attributes.push("Secure");
        }

        return attributes.join("; ");
    }

    function ticketFromRequest(request) {
        const cookieHeader = request?.headers?.cookie;

        if (
            typeof cookieHeader !== "string" ||
            cookieHeader.length > 8192
        ) {
            return null;
        }

        let result = null;

        for (const part of cookieHeader.split(";")) {
            const item = part.trim();
            const index = item.indexOf("=");

            if (
                index < 0 ||
                item.slice(0, index).trim() !== COOKIE_NAME
            ) {
                continue;
            }

            // Reject ambiguous duplicate media cookies.
            if (result !== null) {
                return null;
            }

            result = item.slice(index + 1);
        }

        return result || null;
    }

    async function authenticateCookieRequest({
        request,
        trackId,
        tokenRevocationRepository
    } = {}) {
        if (
            !tokenRevocationRepository ||
            typeof tokenRevocationRepository.isTokenRevoked !== "function"
        ) {
            throw new TypeError(
                "A token revocation repository is required."
            );
        }

        const principal = verify({
            token: ticketFromRequest(request),
                                 trackId
        });

        if (!principal) {
            return null;
        }

        // Every streaming request checks the original session.
        const revoked =
        await tokenRevocationRepository.isTokenRevoked(
            principal.sourceJti
        );

        if (typeof revoked !== "boolean") {
            throw new TypeError(
                "Revocation lookup must return a boolean."
            );
        }

        return revoked ? null : principal;
    }

    return Object.freeze({
        issue,
        verify,
        createSetCookieHeader,
        ticketFromRequest,
        authenticateCookieRequest
    });
}
