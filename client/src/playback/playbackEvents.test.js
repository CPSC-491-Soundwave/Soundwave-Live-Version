
import { describe, expect, it, vi } from "vitest";
import { reportPlaybackEvent } from "./playbackEvents.js";

const EVENT_ID = "d88892fc-4cdd-47e3-8d75-d282863f2ab5";
const OCCURRED_AT = "2026-11-04T02:15:04.000Z";
const TOKEN = "fixture-token-only";

function validEvent(overrides = {}) {
    return {
        trackId: 3005,
        accessToken: TOKEN,
        eventType: "play",
        clientEventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        ...overrides
    };
}

describe("SCRUM-297 playback event reporter", () => {
    it("submits the confirmed event with the existing Bearer token", async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ status: 201 });

        const result = await reportPlaybackEvent(
            validEvent({ fetchImpl })
        );

        expect(result).toEqual({
            ok: true,
            status: 201,
            clientEventId: EVENT_ID
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            "/api/playback-events",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    clientEventId: EVENT_ID,
                    trackId: 3005,
                    eventType: "play",
                    occurredAt: OCCURRED_AT
                })
            }
        );
    });

    it("accepts a replay result without creating a new event ID", async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });
        const result = await reportPlaybackEvent(validEvent({ fetchImpl }));

        expect(result.ok).toBe(true);
        expect(result.clientEventId).toBe(EVENT_ID);
    });

    it("does not send a request without a valid session or track", async () => {
        const fetchImpl = vi.fn();

        expect((await reportPlaybackEvent(validEvent({
            accessToken: "",
            fetchImpl
        }))).ok).toBe(false);

        expect((await reportPlaybackEvent(validEvent({
            trackId: 0,
            fetchImpl
        }))).ok).toBe(false);

        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns an error result rather than throwing on HTTP failure", async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ status: 503 });
        const result = await reportPlaybackEvent(validEvent({ fetchImpl }));

        expect(result).toEqual({
            ok: false,
            status: 503,
            clientEventId: EVENT_ID
        });
    });

    it("returns an error result rather than throwing on network failure", async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
        const result = await reportPlaybackEvent(validEvent({ fetchImpl }));

        expect(result).toEqual({
            ok: false,
            reason: "request_failed",
            clientEventId: EVENT_ID
        });
    });
});
