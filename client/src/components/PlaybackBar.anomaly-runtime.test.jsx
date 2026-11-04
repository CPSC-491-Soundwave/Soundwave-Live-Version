import {
    cleanup,
    render,
    screen,
    waitFor
} from "@testing-library/react";

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import PlaybackBar from "./PlaybackBar.jsx";

import {
    loadTrack
} from "../playback/playback.js";

import {
    clearPlaybackDiagnostics,
    getPlaybackDiagnostics
} from "../playback/playbackDiagnostics.js";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn()
}));

const TOKEN = "soc2-test-token";

const START = Date.parse(
    "2026-11-02T10:00:00-08:00"
);

const MESSAGES = {
    401: "Please log in to play this track.",
    403: "You do not have access to play this track.",
    503: "Playback authentication is temporarily unavailable."
};

function metadataResponse(id) {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            id,
            title: `Test Track ${id}`,
            artist: {
                name: "Test Artist"
            },
            album: {
                title: "Test Album"
            }
        })
    };
}

function anomalyMarkers() {
    return getPlaybackDiagnostics().filter(
        (record) =>
            record.code === "REPEATED_ACCESS_DENIAL"
    );
}

describe("SOC 2 CC7.2 runtime denial monitoring", () => {
    let fetchMock;
    let clock;
    let infoSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        clearPlaybackDiagnostics();

        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        clock = vi.spyOn(Date, "now");
        infoSpy = vi.spyOn(console, "info")
            .mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        clearPlaybackDiagnostics();
    });

    async function exerciseSequence(statuses) {
        const onSessionInvalidated = vi.fn();
        const markerCounts = [];

        let view;

        for (let index = 0; index < statuses.length; index++) {
            const id = 3005 + index;
            const status = statuses[index];

            // Control diagnostic timestamps without replacing
            // React Testing Library's asynchronous timers.
            clock.mockReturnValue(
                START + index * 1000
            );

            fetchMock
                .mockResolvedValueOnce(
                    metadataResponse(id)
                )
                .mockResolvedValueOnce({
                    status
                });

            const component = (
                <PlaybackBar
                    trackId={id}
                    accessToken={TOKEN}
                    onSessionInvalidated={
                        onSessionInvalidated
                    }
                />
            );

            if (index === 0) {
                view = render(component);
            } else {
                view.rerender(component);
            }

            await waitFor(() => {
                expect(
                    fetchMock
                ).toHaveBeenCalledTimes(
                    (index + 1) * 2
                );

                expect(
                    screen.getByRole("alert").textContent
                ).toBe(MESSAGES[status]);
            });

            // No denied or unavailable media response
            // may initialize playable audio.
            expect(
                loadTrack
            ).not.toHaveBeenCalled();

            markerCounts.push(
                anomalyMarkers().length
            );
        }

        return {
            markerCounts,
            onSessionInvalidated
        };
    }

    it("detects a denial burst from actual PlaybackBar failures", async () => {
        const result = await exerciseSequence([
            403,
            403,
            403,
            403
        ]);

        // No anomaly after the first or second denial.
        // Exactly one marker after the third denial.
        // No duplicate marker after the fourth.
        expect(result.markerCounts).toEqual([
            0,
            0,
            1,
            1
        ]);

        expect(anomalyMarkers()).toHaveLength(1);

        expect(anomalyMarkers()[0]).toMatchObject({
            code: "REPEATED_ACCESS_DENIAL",
            category: "repeated_denial_burst",
            preliminaryDisposition:
                "potential_security_event",
            reviewStatus: "not_reviewed"
        });

        expect(
            result.onSessionInvalidated
        ).not.toHaveBeenCalled();

        expect(fetchMock).toHaveBeenCalledTimes(8);

        expect(loadTrack).not.toHaveBeenCalled();
    });

    it("excludes 503 faults while combining 401 and 403 denials", async () => {
        const result = await exerciseSequence([
            403,
            503,
            403,
            401
        ]);

        // The 503 must not count as a denial.
        // The final 401 is the third qualifying event.
        expect(result.markerCounts).toEqual([
            0,
            0,
            0,
            1
        ]);

        expect(anomalyMarkers()).toHaveLength(1);

        expect(
            result.onSessionInvalidated
        ).toHaveBeenCalledTimes(1);

        expect(
            result.onSessionInvalidated
        ).toHaveBeenCalledWith(TOKEN);

        const records = getPlaybackDiagnostics();

        expect(
            records.filter(
                (record) =>
                    record.code === "SERVICE_UNAVAILABLE"
            )
        ).toHaveLength(1);

        expect(
            records.filter(
                (record) =>
                    record.code === "ACCESS_DENIED"
            )
        ).toHaveLength(2);

        expect(
            records.filter(
                (record) =>
                    record.code === "AUTHENTICATION_REQUIRED"
            )
        ).toHaveLength(1);

        // Only predefined diagnostic fields may appear
        // in the emitted monitoring information.
        const output = JSON.stringify({
            records,
            emitted: infoSpy.mock.calls
        });

        expect(output).not.toContain(TOKEN);
        expect(output).not.toContain("Bearer");

        expect(loadTrack).not.toHaveBeenCalled();
    });
});
