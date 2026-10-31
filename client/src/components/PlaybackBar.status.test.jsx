import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    act,
    cleanup,
    fireEvent,
    render,
    screen
} from "@testing-library/react";

import PlaybackBar from "./PlaybackBar.jsx";

import {
    loadTrack
} from "../playback/playback.js";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn()
}));

vi.mock("../playback/playbackDiagnostics.js", () => ({
    recordPlaybackDiagnostic: vi.fn()
}));

function metadataResponse(id) {
    return {
        ok: true,
        json: async () => ({
            id,
            title: `Track ${id}`,
            artist: {
                name: "Test Artist"
            },
            album: {
                title: "Test Album"
            }
        })
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

describe("SCRUM-289 PlaybackBar interface states", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("shows initial loading feedback while metadata is pending", () => {
        const request = deferred();

        vi.stubGlobal(
            "fetch",
            vi.fn(() => request.promise)
        );

        render(
            <PlaybackBar
                trackId="track-1"
                accessToken="test-token"
            />
        );

        expect(
            screen.getByRole("status").textContent
        ).toContain("Loading track...");

        expect(
            screen.queryByText("Retrying playback...")
        ).toBeNull();
    });

    it("shows retrying feedback and clears errors after recovery", async () => {
        const retryRequest = deferred();

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(
                metadataResponse("track-1")
            )
            .mockResolvedValueOnce(
                mediaResponse(503)
            )
            .mockResolvedValueOnce(
                metadataResponse("track-1")
            )
            .mockImplementationOnce(
                () => retryRequest.promise
            );

        vi.stubGlobal("fetch", fetchMock);

        render(
            <PlaybackBar
                trackId="track-1"
                accessToken="test-token"
            />
        );

        const retryButton = await screen.findByRole(
            "button",
            { name: "Retry playback" }
        );

        expect(
            screen.getByRole("alert")
        ).toBeTruthy();

        fireEvent.click(retryButton);

        expect(
            screen.getByRole("status").textContent
        ).toContain("Retrying playback...");

        expect(
            screen.getByText(
                "Attempting to recover playback."
            )
        ).toBeTruthy();

        expect(
            screen.queryByRole("alert")
        ).toBeNull();

        expect(
            screen.queryByRole(
                "button",
                { name: "Retry playback" }
            )
        ).toBeNull();

        await act(async () => {
            retryRequest.resolve(
                mediaResponse(204)
            );
        });

        expect(
            await screen.findByText("Track track-1")
        ).toBeTruthy();

        expect(
            screen.queryByRole("alert")
        ).toBeNull();

        // SCRUM-293: Audio loading continues after authorization.
        expect(
            screen.getByRole("status").textContent
        ).toContain("Loading audio...");

        expect(loadTrack).toHaveBeenCalledWith(
            "track-1",
            expect.any(Object)
        );

        // Audio-ready callback completes recovery.
        const callbacks = loadTrack.mock.calls[0][1];

        act(() => {
            callbacks.onLoad();
        });

        expect(
            screen.getByRole("status").textContent
        ).toContain("Ready to play");

        expect(
            screen.queryByRole("alert")
        ).toBeNull();
    });

    it("does not offer Retry for a permanent authorization denial", async () => {
        const onSessionInvalidated = vi.fn();

        vi.stubGlobal(
            "fetch",
            vi.fn()
                .mockResolvedValueOnce(
                    metadataResponse("track-1")
                )
                .mockResolvedValueOnce(
                    mediaResponse(403)
                )
        );

        render(
            <PlaybackBar
                trackId="track-1"
                accessToken="test-token"
                onSessionInvalidated={onSessionInvalidated}
            />
        );

        expect(
            await screen.findByRole("alert")
        ).toBeTruthy();

        expect(
            screen.queryByRole(
                "button",
                { name: "Retry playback" }
            )
        ).toBeNull();

        expect(
            onSessionInvalidated
        ).not.toHaveBeenCalled();
    });

    it("hides a previous track error immediately after replacement", async () => {
        const nextMetadata = deferred();

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(
                metadataResponse("track-1")
            )
            .mockResolvedValueOnce(
                mediaResponse(503)
            )
            .mockImplementationOnce(
                () => nextMetadata.promise
            )
            .mockResolvedValueOnce(
                mediaResponse(204)
            );

        vi.stubGlobal("fetch", fetchMock);

        const { rerender } = render(
            <PlaybackBar
                trackId="track-1"
                accessToken="test-token"
            />
        );

        expect(
            await screen.findByRole(
                "button",
                { name: "Retry playback" }
            )
        ).toBeTruthy();

        rerender(
            <PlaybackBar
                trackId="track-2"
                accessToken="test-token"
            />
        );

        expect(
            screen.getByRole("status").textContent
        ).toContain("Loading track...");

        expect(
            screen.queryByRole("alert")
        ).toBeNull();

        expect(
            screen.queryByRole(
                "button",
                { name: "Retry playback" }
            )
        ).toBeNull();

        await act(async () => {
            nextMetadata.resolve(
                metadataResponse("track-2")
            );
        });

        expect(
            await screen.findByText("Track track-2")
        ).toBeTruthy();

        expect(
            screen.queryByText("Track track-1")
        ).toBeNull();

        expect(
            screen.queryByRole("alert")
        ).toBeNull();

        expect(
            screen.getByRole("status").textContent
        ).toContain("Loading audio...");
    });
});
