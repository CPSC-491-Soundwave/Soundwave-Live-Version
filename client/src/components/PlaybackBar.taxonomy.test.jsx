import {
    act,
    cleanup,
    fireEvent,
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
    loadTrack,
    playMusic
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

const TOKEN = "scrum267-secret-test-token";

const PRIVATE_DETAILS =
    "token=private-server-token " +
    "/srv/private/music/track.mp3 " +
    "internal-media-server.local";

const TRACK = {
    id: 3005,
    title: "Taxonomy Baseline Track",
    artist: {
        id: 1003,
        name: "Test Artist"
    },
    album: {
        id: 2003,
        title: "Test Album"
    }
};

const NEXT_TRACK = {
    ...TRACK,
    id: 3006,
    title: "Authorized Recovery Track"
};

function metadataResponse(track = TRACK) {
    return {
        ok: true,
        status: 200,
        json: async () => track
    };
}

function mediaResponse(status) {
    return {
        ok: status >= 200 && status < 300,
        status
    };
}

function mountPlayer({
    trackId = TRACK.id,
    accessToken = TOKEN,
    onSessionInvalidated = vi.fn()
} = {}) {
    return render(
        <PlaybackBar
            trackId={trackId}
            accessToken={accessToken}
            onSessionInvalidated={onSessionInvalidated}
        />
    );
}

describe("SCRUM-267 protected-stream failure taxonomy", () => {
    let infoSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        clearPlaybackDiagnostics();

        vi.stubGlobal("fetch", vi.fn());

        infoSpy = vi.spyOn(console, "info")
            .mockImplementation(() => {});

        playMusic.mockReturnValue(true);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        clearPlaybackDiagnostics();
    });

    function expectNoSensitiveOutput() {
        const output = JSON.stringify({
            diagnostics: getPlaybackDiagnostics(),
            consoleInfo: infoSpy.mock.calls
        });

        expect(output).not.toContain(TOKEN);
        expect(output).not.toContain("private-server-token");
        expect(output).not.toContain("/srv/private/");
        expect(output).not.toContain(
            "internal-media-server.local"
        );
        expect(output).not.toContain("Bearer");
    }

    function expectFailureOracle({
        message,
        code,
        retryable,
        invalidated,
        onSessionInvalidated
    }) {
        expect(
            screen.getByRole("alert").textContent
        ).toBe(message);

        const retryButton = screen.queryByRole(
            "button",
            { name: "Retry playback" }
        );

        if (retryable) {
            expect(retryButton).not.toBeNull();
        } else {
            expect(retryButton).toBeNull();
        }

        // An unauthorized or failed media-access request
        // must not prepare playable audio in the client.
        expect(loadTrack).not.toHaveBeenCalled();

        expect(onSessionInvalidated).toHaveBeenCalledTimes(
            invalidated ? 1 : 0
        );

        const events = getPlaybackDiagnostics();

        expect(events).toHaveLength(1);
        expect(events[0].code).toBe(code);

        expectNoSensitiveOutput();
    }

    it("records successful protected playback as the baseline", async () => {
        fetch
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(204));

        const onSessionInvalidated = vi.fn();

        mountPlayer({ onSessionInvalidated });

        expect(
            await screen.findByText(TRACK.title)
        ).toBeTruthy();

        expect(fetch).toHaveBeenNthCalledWith(
            1,
            `/api/catalog/tracks/${TRACK.id}`
        );

        expect(fetch).toHaveBeenNthCalledWith(
            2,
            `/api/tracks/${TRACK.id}/media-access`,
            expect.objectContaining({
                method: "POST",
                credentials: "same-origin",
                headers: {
                    Authorization: `Bearer ${TOKEN}`
                }
            })
        );

        expect(loadTrack).toHaveBeenCalledWith(
            TRACK.id,
            expect.objectContaining({
                onLoad: expect.any(Function),
                onPlay: expect.any(Function)
            })
        );

        const callbacks = loadTrack.mock.calls[0][1];

        act(() => {
            callbacks.onLoad();
        });

        expect(
            screen.getByRole("status").textContent
        ).toContain("Ready to play");

        fireEvent.click(
            screen.getByRole("button", {
                name: "Play"
            })
        );

        expect(playMusic).toHaveBeenCalledTimes(1);

        act(() => {
            callbacks.onPlay();
        });

        expect(
            screen.getByRole("status").textContent
        ).toContain("Playing");

        expect(onSessionInvalidated).not.toHaveBeenCalled();

        // Successful playback is the baseline.
        // It should not produce a failure diagnostic.
        expect(getPlaybackDiagnostics()).toEqual([]);
    });

    it("blocks playback locally when no session is available", async () => {
        const onSessionInvalidated = vi.fn();

        mountPlayer({
            accessToken: "",
            onSessionInvalidated
        });

        expect(
            await screen.findByRole("alert")
        ).toBeTruthy();

        expect(
            screen.getByRole("alert").textContent
        ).toBe("Please log in to play this track.");

        expect(fetch).not.toHaveBeenCalled();
        expect(loadTrack).not.toHaveBeenCalled();

        expect(
            screen.queryByRole("button", {
                name: "Retry playback"
            })
        ).toBeNull();

        expect(onSessionInvalidated).not.toHaveBeenCalled();

        // A locally absent session is not a server denial.
        expect(getPlaybackDiagnostics()).toEqual([]);
    });

    it.each([
        {
            status: 401,
            code: "AUTHENTICATION_REQUIRED",
            message: "Please log in to play this track.",
            retryable: false,
            invalidated: true
        },
        {
            status: 403,
            code: "ACCESS_DENIED",
            message: "You do not have access to play this track.",
            retryable: false,
            invalidated: false
        },
        {
            status: 404,
            code: "MEDIA_UNAVAILABLE",
            message: "Unable to prepare playback.",
            retryable: false,
            invalidated: false
        },
        {
            status: 502,
            code: "TEMPORARY_SERVER_FAILURE",
            message: "Playback service is temporarily unavailable.",
            retryable: true,
            invalidated: false
        },
        {
            status: 503,
            code: "SERVICE_UNAVAILABLE",
            message:
                "Playback authentication is temporarily unavailable.",
            retryable: true,
            invalidated: false
        },
        {
            status: 504,
            code: "TEMPORARY_SERVER_FAILURE",
            message: "Playback service is temporarily unavailable.",
            retryable: true,
            invalidated: false
        }
    ])(
        "enforces the UI and safety oracle for HTTP $status",
        async ({
            status,
            code,
            message,
            retryable,
            invalidated
        }) => {
            const onSessionInvalidated = vi.fn();

            fetch
                .mockResolvedValueOnce(metadataResponse())
                .mockResolvedValueOnce(mediaResponse(status));

            mountPlayer({ onSessionInvalidated });

            await screen.findByRole("alert");

            expectFailureOracle({
                message,
                code,
                retryable,
                invalidated,
                onSessionInvalidated
            });

            expect(fetch).toHaveBeenCalledTimes(2);

            expect(fetch).toHaveBeenNthCalledWith(
                2,
                `/api/tracks/${TRACK.id}/media-access`,
                expect.objectContaining({
                    method: "POST"
                })
            );
        }
    );

    it.each([
        {
            name: "network interruption",
            errorName: "TypeError"
        },
        {
            name: "timeout-like request rejection",
            errorName: "TimeoutError"
        }
    ])(
        "enforces the network-failure oracle for $name",
        async ({ errorName }) => {
            const onSessionInvalidated = vi.fn();

            const requestError = new Error(
                PRIVATE_DETAILS
            );

            requestError.name = errorName;

            fetch
                .mockResolvedValueOnce(metadataResponse())
                .mockRejectedValueOnce(requestError);

            mountPlayer({ onSessionInvalidated });

            await screen.findByRole("alert");

            expectFailureOracle({
                message: "Unable to prepare playback.",
                code: "NETWORK_FAILURE",
                retryable: true,
                invalidated: false,
                onSessionInvalidated
            });

            // Failure classification must not copy raw
            // request exception details into the UI.
            expect(
                screen.getByRole("alert").textContent
            ).not.toContain(PRIVATE_DETAILS);

            expect(fetch).toHaveBeenCalledTimes(2);
        }
    );

    it("successfully loads another track after an access denial", async () => {
        const onSessionInvalidated = vi.fn();

        fetch
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(403))
            .mockResolvedValueOnce(
                metadataResponse(NEXT_TRACK)
            )
            .mockResolvedValueOnce(mediaResponse(204));

        const { rerender } = mountPlayer({
            onSessionInvalidated
        });

        expect(
            await screen.findByRole("alert")
        ).toBeTruthy();

        expect(loadTrack).not.toHaveBeenCalled();

        expect(
            screen.queryByRole("button", {
                name: "Retry playback"
            })
        ).toBeNull();

        rerender(
            <PlaybackBar
                trackId={NEXT_TRACK.id}
                accessToken={TOKEN}
                onSessionInvalidated={onSessionInvalidated}
            />
        );

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledWith(
                NEXT_TRACK.id,
                expect.any(Object)
            );
        });

        expect(
            await screen.findByText(NEXT_TRACK.title)
        ).toBeTruthy();

        expect(screen.queryByRole("alert")).toBeNull();

        expect(
            screen.queryByText(
                "You do not have access to play this track."
            )
        ).toBeNull();

        expect(onSessionInvalidated).not.toHaveBeenCalled();
        expect(loadTrack).toHaveBeenCalledTimes(1);

        const callbacks = loadTrack.mock.calls[0][1];

        act(() => {
            callbacks.onLoad();
        });

        expect(
            screen.getByRole("status").textContent
        ).toContain("Ready to play");

        expect(fetch).toHaveBeenCalledTimes(4);

        expectNoSensitiveOutput();
    });
});
