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

const START = Date.parse(
    "2026-10-30T20:00:00-07:00"
);

describe("SCRUM-288 / CC7.2 repeated-denial detection", () => {
    let emit;

    beforeEach(() => {
        clearPlaybackDiagnostics();
        emit = vi.fn();
    });

    function record(code, offsetMs) {
        return recordPlaybackDiagnostic(code, {
            now: START + offsetMs,
            emit
        });
    }

    function burstMarkers() {
        return getPlaybackDiagnostics().filter(
            (event) =>
                event.code === "REPEATED_ACCESS_DENIAL"
        );
    }

    it("does not trigger an anomaly after only two denials", () => {
        record("ACCESS_DENIED", 0);
        record("ACCESS_DENIED", 10_000);

        expect(burstMarkers()).toHaveLength(0);
        expect(getPlaybackDiagnostics()).toHaveLength(2);
    });

    it("detects three denials within sixty seconds", () => {
        record("ACCESS_DENIED", 0);
        record("ACCESS_DENIED", 10_000);
        record("AUTHENTICATION_REQUIRED", 20_000);

        expect(burstMarkers()).toHaveLength(1);

        expect(burstMarkers()[0]).toMatchObject({
            code: "REPEATED_ACCESS_DENIAL",
            category: "repeated_denial_burst",
            preliminaryDisposition: "potential_security_event",
            reviewStatus: "not_reviewed"
        });

        expect(emit).toHaveBeenCalledTimes(4);
    });

    it("emits no duplicate marker during one continuous burst", () => {
        record("ACCESS_DENIED", 0);
        record("ACCESS_DENIED", 1_000);
        record("ACCESS_DENIED", 2_000);
        record("ACCESS_DENIED", 3_000);
        record("ACCESS_DENIED", 4_000);

        expect(burstMarkers()).toHaveLength(1);
    });

    it("starts a new burst after the prior window expires", () => {
        record("ACCESS_DENIED", 0);
        record("ACCESS_DENIED", 1_000);
        record("ACCESS_DENIED", 2_000);

        expect(burstMarkers()).toHaveLength(1);

        record("ACCESS_DENIED", 70_000);
        record("ACCESS_DENIED", 71_000);
        record("ACCESS_DENIED", 72_000);

        expect(burstMarkers()).toHaveLength(2);
    });

    it("does not count service outages as authorization denials", () => {
        record("SERVICE_UNAVAILABLE", 0);
        record("SERVICE_UNAVAILABLE", 1_000);
        record("SERVICE_UNAVAILABLE", 2_000);

        expect(burstMarkers()).toHaveLength(0);

        record("ACCESS_DENIED", 3_000);
        record("ACCESS_DENIED", 4_000);

        expect(burstMarkers()).toHaveLength(0);
    });

    it("keeps anomaly output sanitized and resets on clear", () => {
        for (let index = 0; index < 3; index++) {
            recordPlaybackDiagnostic(
                "ACCESS_DENIED",
                {
                    now: START + index * 1_000,
                    emit,
                    token: "secret-test-token",
                    rawError: "private-error"
                }
            );
        }

        expect(burstMarkers()).toHaveLength(1);

        const serialized = JSON.stringify({
            records: getPlaybackDiagnostics(),
            output: emit.mock.calls
        });

        expect(serialized).not.toContain(
            "secret-test-token"
        );

        expect(serialized).not.toContain(
            "private-error"
        );

        expect(
            recordPlaybackDiagnostic(
                "REPEATED_ACCESS_DENIAL",
                {
                    now: START + 4_000,
                    emit
                }
            )
        ).toBeNull();

        clearPlaybackDiagnostics();

        expect(getPlaybackDiagnostics()).toEqual([]);

        record("ACCESS_DENIED", 100_000);
        record("ACCESS_DENIED", 101_000);

        expect(burstMarkers()).toHaveLength(0);
    });
});
