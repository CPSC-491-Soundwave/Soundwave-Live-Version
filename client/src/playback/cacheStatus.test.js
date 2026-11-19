
import { describe, expect, it } from "vitest";

import {
    CACHE_AVAILABILITY,
    getCacheAvailabilityLabel,
    getTrackCacheAvailability,
    normalizeCacheAvailability
} from "./cacheStatus.js";

describe("MC-T51: cache-availability state contract", () => {
    it.each([
        [CACHE_AVAILABILITY.UNKNOWN, "Cache status unknown"],
        [CACHE_AVAILABILITY.LOADING, "Checking cache..."],
        [CACHE_AVAILABILITY.PRESENT, "Cached"],
        [CACHE_AVAILABILITY.EVICTED, "Removed from cache"]
    ])("maps %s to the correct accessible label", (status, label) => {
        expect(normalizeCacheAvailability(status)).toBe(status);
        expect(normalizeCacheAvailability({ status })).toBe(status);
        expect(getCacheAvailabilityLabel(status)).toBe(label);
    });

    it.each([undefined, null, "cached", "invalid", 206, {}, { status: 200 }])(
        "fails closed to unknown for unsupported provider result %s",
        (result) => {
            expect(normalizeCacheAvailability(result)).toBe(CACHE_AVAILABILITY.UNKNOWN);
            expect(getCacheAvailabilityLabel(result)).toBe("Cache status unknown");
        }
    );

    it("does not claim durable offline storage when no provider is connected", async () => {
        expect(await getTrackCacheAvailability({
            trackId: 3005,
            accessToken: "test-token"
        })).toBe(CACHE_AVAILABILITY.UNKNOWN);
    });
});
