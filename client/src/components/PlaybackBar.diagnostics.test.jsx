import {
    act,
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

import PlaybackBar from "./PlaybackBar";

import {
    loadTrack
} from "../playback/playback.js";

import {
    clearPlaybackDiagnostics,
    getPlaybackDiagnostics
} from "../playback/playbackDiagnostics.js";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn()
}));

const TOKEN = "test-token-should-not-be-logged";

const TRACK = {
    id: 3005,
    title: "Kontekst",
    artist: {
        id: 1003,
        name: "Buddha"
    },
    album: {
        id: 2003,
        title: "No Copyright"
    }
};

function metadataResponse(track = TRACK) {
    return {
        ok: true,
        json: async () => track
    };
}

function player(trackId, token, invalidate) {
    return (
        <PlaybackBar
            trackId={trackId}
            accessToken={token}
            onSessionInvalidated={invalidate}
        />
    );
}

describe("SCRUM-288 / CC7.2 runtime playback diagnostics", () => {
    let infoSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        clearPlaybackDiagnostics();

        globalThis.fetch = vi.fn();

        infoSpy = vi.spyOn(console, "info")
            .mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearPlaybackDiagnostics();
    });

    it.each([
        [401, "AUTHENTICATION_REQUIRED"],
        [403, "ACCESS_DENIED"],
        [404, "MEDIA_UNAVAILABLE"],
        [502, "TEMPORARY_SERVER_FAILURE"],
        [503, "SERVICE_UNAVAILABLE"],
        [504, "TEMPORARY_SERVER_FAILURE"]
    ])(
        "records a sanitized diagnostic for HTTP %i",
        async (status, expectedCode) => {
            const invalidate = vi.fn();

            globalThis.fetch
                .mockResolvedValueOnce(metadataResponse())
                .mockResolvedValueOnce({ status });

            render(player(3005, TOKEN, invalidate));

            expect(
                await screen.findByText(
                    "Playback unavailable"
                )
            ).toBeInTheDocument();

            const history = getPlaybackDiagnostics();

            expect(history).toHaveLength(1);
            expect(history[0].code).toBe(expectedCode);

            expect(infoSpy).toHaveBeenCalledTimes(1);

            expect(loadTrack).not.toHaveBeenCalled();

            expect(invalidate).toHaveBeenCalledTimes(
                status === 401 ? 1 : 0
            );

            const serialized = JSON.stringify({
                history,
                emitted: infoSpy.mock.calls
            });

            expect(serialized).not.toContain(TOKEN);
            expect(serialized).not.toContain("Bearer");
        }
    );

    it("records a network failure without leaking the exception", async () => {
        globalThis.fetch
            .mockResolvedValueOnce(metadataResponse())
            .mockRejectedValueOnce(
                new TypeError(
                    "connection failed: private-secret-value"
                )
            );

        render(player(3005, TOKEN, vi.fn()));

        expect(
            await screen.findByText(
                "Unable to prepare playback."
            )
        ).toBeInTheDocument();

        expect(getPlaybackDiagnostics()).toHaveLength(1);

        expect(
            getPlaybackDiagnostics()[0].code
        ).toBe("NETWORK_FAILURE");

        const emitted = JSON.stringify(
            infoSpy.mock.calls
        );

        expect(emitted).not.toContain(
            "private-secret-value"
        );

        expect(emitted).not.toContain(TOKEN);
    });

    it("records a stale result after a track is replaced", async () => {
        let rejectOldRequest;

        const oldRequest = new Promise((resolve, reject) => {
            rejectOldRequest = reject;
        });

        globalThis.fetch
            .mockReturnValueOnce(oldRequest)
            .mockResolvedValueOnce(
                metadataResponse({
                    ...TRACK,
                    id: 3006,
                    title: "Second Track"
                })
            )
            .mockResolvedValueOnce({ status: 204 });

        const invalidate = vi.fn();

        const { rerender } = render(
            player(3005, TOKEN, invalidate)
        );

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        });

        rerender(player(3006, TOKEN, invalidate));

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledWith(
                3006,
                expect.any(Object)
            );
        });

        await act(async () => {
            rejectOldRequest(
                new TypeError("obsolete request")
            );
        });

        const history = getPlaybackDiagnostics();

        expect(history).toHaveLength(1);

        expect(history[0].code).toBe(
            "STALE_OPERATION_DROPPED"
        );

        expect(loadTrack).toHaveBeenCalledTimes(1);

        expect(
            screen.getByText("Second Track")
        ).toBeInTheDocument();
    });

    it("does not count a local no-session state as a server denial", async () => {
        render(player(3005, "", vi.fn()));

        expect(
            await screen.findByText(
                "Please log in to play this track."
            )
        ).toBeInTheDocument();

        expect(globalThis.fetch).not.toHaveBeenCalled();

        expect(getPlaybackDiagnostics()).toEqual([]);

        expect(infoSpy).not.toHaveBeenCalled();
    });
});
