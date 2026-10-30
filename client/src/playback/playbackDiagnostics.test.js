import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    recordPlaybackDiagnostic,
    getPlaybackDiagnostics,
    clearPlaybackDiagnostics
} from "./playbackDiagnostics.js";

describe("SCRUM-288 / CC7.2 playback diagnostics", () => {
    beforeEach(() => {
        clearPlaybackDiagnostics();
    });

    it("records a sanitized authentication denial", () => {
        const emit = vi.fn();

        const record = recordPlaybackDiagnostic(
            "AUTHENTICATION_REQUIRED",
            {
                now: Date.parse(
                    "2026-10-29T20:30:00-07:00"
                ),
                emit
            }
        );

        expect(record).toEqual({
            sequence: 1,
            observedAt: "2026-10-30T03:30:00.000Z",
            code: "AUTHENTICATION_REQUIRED",
            category: "authentication_denial",
            preliminaryDisposition: "expected_denial",
            reviewStatus: "not_reviewed"
        });

        expect(emit).toHaveBeenCalledTimes(1);

        expect(getPlaybackDiagnostics()).toEqual([
            record
        ]);
    });

    it("distinguishes authorization denial from service failure", () => {
        const emit = vi.fn();

        const denied = recordPlaybackDiagnostic(
            "ACCESS_DENIED",
            { emit }
        );

        const outage = recordPlaybackDiagnostic(
            "SERVICE_UNAVAILABLE",
            { emit }
        );

        expect(denied.category).toBe(
            "authorization_denial"
        );

        expect(denied.preliminaryDisposition).toBe(
            "expected_denial"
        );

        expect(outage.category).toBe(
            "authentication_service_outage"
        );

        expect(outage.preliminaryDisposition).toBe(
            "service_fault"
        );
    });

    it("does not include arbitrary sensitive input", () => {
        const emit = vi.fn();

        const record = recordPlaybackDiagnostic(
            "NETWORK_FAILURE",
            {
                emit,
                authorization: "Bearer fake-secret",
                rawError: new Error("fake-secret"),
                filesystemPath: "/private/audio.mp3"
            }
        );

        const serialized = JSON.stringify({
            record,
            history: getPlaybackDiagnostics(),
            emitted: emit.mock.calls
        });

        expect(serialized).not.toContain(
            "fake-secret"
        );

        expect(serialized).not.toContain(
            "/private/audio.mp3"
        );

        expect(Object.keys(record)).toEqual([
            "sequence",
            "observedAt",
            "code",
            "category",
            "preliminaryDisposition",
            "reviewStatus"
        ]);
    });

    it("rejects unknown diagnostic classifications", () => {
        const emit = vi.fn();

        const result = recordPlaybackDiagnostic(
            "Bearer fake-secret",
            { emit }
        );

        expect(result).toBeNull();

        expect(getPlaybackDiagnostics()).toEqual([]);

        expect(emit).not.toHaveBeenCalled();
    });

    it("retains a maximum of 25 diagnostic records", () => {
        const emit = vi.fn();

        for (let index = 0; index < 30; index++) {
            recordPlaybackDiagnostic(
                "SERVICE_UNAVAILABLE",
                {
                    now: index,
                    emit
                }
            );
        }

        const history = getPlaybackDiagnostics();

        expect(history).toHaveLength(25);

        expect(history[0].sequence).toBe(6);

        expect(history[24].sequence).toBe(30);
    });

    it("clears retained diagnostic records", () => {
        const emit = vi.fn();

        recordPlaybackDiagnostic(
            "ACCESS_DENIED",
            { emit }
        );

        expect(getPlaybackDiagnostics()).toHaveLength(1);

        clearPlaybackDiagnostics();

        expect(getPlaybackDiagnostics()).toEqual([]);
    });
});
