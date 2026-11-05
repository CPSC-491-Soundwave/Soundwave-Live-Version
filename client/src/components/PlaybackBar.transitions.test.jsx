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
    playMusic,
    unloadMusic
} from "../playback/playback.js";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn()
}));

const TOKEN = "scrum235-test-token";

const TRACK = {
    id: 3005,
    title: "Original Track",
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
    title: "Replacement Track"
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

function deferred() {
    let resolve;

    const promise = new Promise((complete) => {
        resolve = complete;
    });

    return {
        promise,
        resolve
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

describe("SCRUM-235 retry and cancellation transitions", () => {
    let fetchMock;

    beforeEach(() => {
        vi.clearAllMocks();

        fetchMock = vi.fn();

        vi.stubGlobal("fetch", fetchMock);

        playMusic.mockReturnValue(true);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("remains in a bounded error state after a persistent 503", async () => {
        const onSessionInvalidated = vi.fn();

        fetchMock
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(503))
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(503));

        mountPlayer({ onSessionInvalidated });

        const retryButton = await screen.findByRole(
            "button",
            { name: "Retry playback" }
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(loadTrack).not.toHaveBeenCalled();

        fireEvent.click(retryButton);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        expect(
            await screen.findByRole("alert")
        ).toBeTruthy();

        expect(
            screen.getByRole("alert").textContent
        ).toContain(
            "Playback authentication is temporarily unavailable."
        );

        // The implemented policy permits another manual retry,
        // but does not automatically start one.
        expect(
            screen.getByRole("button", {
                name: "Retry playback"
            })
        ).toBeTruthy();

        expect(
            screen.queryByText("Retrying playback...")
        ).toBeNull();

        expect(loadTrack).not.toHaveBeenCalled();
        expect(playMusic).not.toHaveBeenCalled();

        expect(onSessionInvalidated).not.toHaveBeenCalled();

        // Two explicitly requested operations:
        // initial metadata + media access,
        // then retry metadata + media access.
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("recovers once without duplicate requests and synchronizes the UI", async () => {
        const retryMetadata = deferred();

        fetchMock
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(503))
            .mockReturnValueOnce(retryMetadata.promise)
            .mockResolvedValueOnce(mediaResponse(204));

        mountPlayer();

        const retryButton = await screen.findByRole(
            "button",
            { name: "Retry playback" }
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);

        fireEvent.click(retryButton);

        expect(
            screen.getByRole("status").textContent
        ).toContain("Retrying playback...");

        expect(
            screen.queryByRole("button", {
                name: "Retry playback"
            })
        ).toBeNull();

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        // Recovery is pending. It must not create duplicate
        // media-access requests or start playable audio.
        expect(loadTrack).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(3);

        await act(async () => {
            retryMetadata.resolve(metadataResponse());
        });

        expect(
            await screen.findByText(TRACK.title)
        ).toBeTruthy();

        expect(fetchMock).toHaveBeenCalledTimes(4);

        expect(loadTrack).toHaveBeenCalledTimes(1);
        expect(loadTrack).toHaveBeenCalledWith(
            TRACK.id,
            expect.any(Object)
        );

        expect(
            screen.queryByRole("alert")
        ).toBeNull();

        expect(
            screen.getByRole("status").textContent
        ).toContain("Loading audio...");

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

        expect(
            screen.getByRole("button", {
                name: "Pause"
            })
        ).toBeTruthy();

        // SCRUM-235: Preserve the original request count.
        const originalRequests = fetchMock.mock.calls.filter(
            ([url]) => url !== "/api/playback-events"
        );

        expect(originalRequests).toHaveLength(4);

        // SCRUM-297: One additional playback event request.
        const playbackEventRequests = fetchMock.mock.calls.filter(
            ([url]) => url === "/api/playback-events"
        );

        expect(playbackEventRequests).toHaveLength(1);
        expect(loadTrack).toHaveBeenCalledTimes(1);
    });

    it("ignores a pending retry response after logout", async () => {
        const pendingMediaAccess = deferred();
        const onSessionInvalidated = vi.fn();

        fetchMock
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(503))
            .mockResolvedValueOnce(metadataResponse())
            .mockReturnValueOnce(pendingMediaAccess.promise);

        const { rerender } = mountPlayer({
            onSessionInvalidated
        });

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Retry playback"
            })
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        expect(loadTrack).not.toHaveBeenCalled();

        // Simulate logout by removing the access token.
        rerender(
            <PlaybackBar
                trackId={TRACK.id}
                accessToken=""
                onSessionInvalidated={onSessionInvalidated}
            />
        );

        expect(
            await screen.findByRole("alert")
        ).toBeTruthy();

        expect(
            screen.getByRole("alert").textContent
        ).toContain("Please log in");

        expect(
            screen.queryByRole("button", {
                name: "Retry playback"
            })
        ).toBeNull();

        // The old request resolves successfully after logout.
        // Its result must not prepare playable media.
        await act(async () => {
            pendingMediaAccess.resolve(mediaResponse(204));
        });

        expect(loadTrack).not.toHaveBeenCalled();
        expect(playMusic).not.toHaveBeenCalled();

        expect(fetchMock).toHaveBeenCalledTimes(4);

        expect(
            screen.getByRole("alert").textContent
        ).toContain("Please log in");

        expect(onSessionInvalidated).not.toHaveBeenCalled();
    });

    it("prevents an old retry from replacing a newly selected track", async () => {
        const pendingOldMediaAccess = deferred();
        const onSessionInvalidated = vi.fn();

        fetchMock
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(503))
            .mockResolvedValueOnce(metadataResponse())
            .mockReturnValueOnce(
                pendingOldMediaAccess.promise
            )
            .mockResolvedValueOnce(
                metadataResponse(NEXT_TRACK)
            )
            .mockResolvedValueOnce(mediaResponse(204));

        const { rerender } = mountPlayer({
            onSessionInvalidated
        });

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Retry playback"
            })
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        expect(
            screen.getByRole("status").textContent
        ).toContain("Retrying playback...");

        // Replace the selected track while the retry is pending.
        rerender(
            <PlaybackBar
                trackId={NEXT_TRACK.id}
                accessToken={TOKEN}
                onSessionInvalidated={onSessionInvalidated}
            />
        );

        expect(
            screen.queryByRole("alert")
        ).toBeNull();

        expect(
            await screen.findByText(NEXT_TRACK.title)
        ).toBeTruthy();

        expect(loadTrack).toHaveBeenCalledTimes(1);
        expect(loadTrack).toHaveBeenCalledWith(
            NEXT_TRACK.id,
            expect.any(Object)
        );

        // Old authorization result arrives after the new track.
        await act(async () => {
            pendingOldMediaAccess.resolve(
                mediaResponse(204)
            );
        });

        expect(fetchMock).toHaveBeenCalledTimes(6);

        // The stale response must not load the original track.
        expect(loadTrack).toHaveBeenCalledTimes(1);

        expect(
            screen.getByText(NEXT_TRACK.title)
        ).toBeTruthy();

        expect(
            screen.queryByText(TRACK.title)
        ).toBeNull();

        expect(
            screen.queryByRole("alert")
        ).toBeNull();

        const callbacks = loadTrack.mock.calls[0][1];

        act(() => {
            callbacks.onLoad();
        });

        expect(
            screen.getByRole("status").textContent
        ).toContain("Ready to play");

        expect(onSessionInvalidated).not.toHaveBeenCalled();
    });

    it("does not prepare playback after unmount during a retry", async () => {
        const pendingMediaAccess = deferred();

        fetchMock
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce(mediaResponse(503))
            .mockResolvedValueOnce(metadataResponse())
            .mockReturnValueOnce(pendingMediaAccess.promise);

        const { unmount } = mountPlayer();

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Retry playback"
            })
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        expect(loadTrack).not.toHaveBeenCalled();

        // Simulates navigation that unmounts the player.
        unmount();

        expect(unloadMusic).toHaveBeenCalled();

        // The completed HTTP response is obsolete.
        await act(async () => {
            pendingMediaAccess.resolve(mediaResponse(204));
        });

        expect(loadTrack).not.toHaveBeenCalled();
        expect(playMusic).not.toHaveBeenCalled();

        // No additional requests were initiated.
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });
});
