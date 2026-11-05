
/**
 * SCRUM-297 | Matthew Choi
 * Submit a confirmed player event using the SCRUM-296 authenticated API.
 * A reporting failure never prevents or pauses audio playback.
 *
 * The optional clientEventId lets a future retry reuse the same logical
 * event identifier, consistent with the server's idempotency contract.
 */
export async function reportPlaybackEvent({
    trackId,
    accessToken,
    eventType = "play",
    clientEventId,
    occurredAt,
    fetchImpl = globalThis.fetch
} = {}) {
    if (
        !Number.isSafeInteger(trackId) ||
        trackId <= 0 ||
        typeof accessToken !== "string" ||
        !accessToken.trim() ||
        typeof eventType !== "string" ||
        !eventType.trim() ||
        eventType.trim().length > 128
    ) {
        return { ok: false, reason: "invalid_event_context" };
    }

    const id = clientEventId ?? globalThis.crypto?.randomUUID?.();
    const time = occurredAt ?? new Date().toISOString();

    if (typeof id !== "string" || !id) {
        // crypto.randomUUID() is available on HTTPS and localhost.
        return { ok: false, reason: "event_id_unavailable" };
    }

    const payload = {
        clientEventId: id,
        trackId,
        eventType: eventType.trim(),
        occurredAt: time
    };

    try {
        const response = await fetchImpl("/api/playback-events", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        return {
            ok: response.status === 201 || response.status === 200,
            status: response.status,
            clientEventId: id
        };
    } catch {
        // Deliberately do not log credentials or interrupt the player.
        return {
            ok: false,
            reason: "request_failed",
            clientEventId: id
        };
    }
}
