
/**
 * Matthew Choi - Sprint 5 cache-availability presentation contract.
 *
 * These states describe an actual cache provider's knowledge of a track.
 * HTTP 200/206 streaming or normal browser buffering is NOT proof that an
 * entire track is available offline.
 *
 * Sprint 5 ships without a connected offline-audio cache provider, so the
 * default adapter explicitly returns "unknown". Sprint 6 can replace this
 * function with a verified, session-scoped availability lookup.
 */
export const CACHE_AVAILABILITY = Object.freeze({
    UNKNOWN: "unknown",
    LOADING: "loading",
    PRESENT: "present",
    EVICTED: "evicted"
});

const CACHE_LABELS = Object.freeze({
    [CACHE_AVAILABILITY.UNKNOWN]: "Cache status unknown",
    [CACHE_AVAILABILITY.LOADING]: "Checking cache...",
    [CACHE_AVAILABILITY.PRESENT]: "Cached",
    [CACHE_AVAILABILITY.EVICTED]: "Removed from cache"
});

/**
 * Accept a state string, or a provider response shaped as { status }.
 * Anything unexpected, including an error or an absent result, is unknown.
 */
export function normalizeCacheAvailability(result) {
    const status =
    typeof result === "string" ? result : result?.status;

    return Object.hasOwn(CACHE_LABELS, status)
    ? status
    : CACHE_AVAILABILITY.UNKNOWN;
}

export function getCacheAvailabilityLabel(status) {
    return CACHE_LABELS[normalizeCacheAvailability(status)];
}

/**
 * Future provider contract:
 * getTrackCacheAvailability({ trackId, accessToken })
 *   -> Promise<"unknown" | "present" | "evicted"> (or {status}).
 *
 * A provider must only return "present" after verifying that the COMPLETE
 * track is available to the current user/session from durable offline storage.
 * "evicted" requires positive knowledge that a previously stored copy was
 * removed. A network stream response alone must never set either state.
 */
export async function getTrackCacheAvailability() {
    return CACHE_AVAILABILITY.UNKNOWN;
}
