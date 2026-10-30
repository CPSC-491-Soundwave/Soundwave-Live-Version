import {
    act,
    fireEvent,
    render,
    screen,
    waitFor
} from "@testing-library/react";

import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import PlaybackBar from "./PlaybackBar";

import {
    loadTrack,
    playMusic
} from "../playback/playback.js";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn()
}));

const TOKEN = "test-token";

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

function renderPlayback(
    trackId = 3005,
    token = TOKEN,
    invalidate = vi.fn()
) {
    return render(
        <PlaybackBar
            trackId={trackId}
            accessToken={token}
            onSessionInvalidated={invalidate}
        />
    );
}

describe("SCRUM-288 PlaybackBar manual recovery", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn();
        playMusic.mockReturnValue(true);
    });

    it("retries 503 only after the user requests it", async () => {
        const invalidate = vi.fn();

        globalThis.fetch
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce({ status: 503 })
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce({ status: 204 });

        renderPlayback(3005, TOKEN, invalidate);

        expect(
            await screen.findByText(
                "Playback authentication is temporarily unavailable."
            )
        ).toBeInTheDocument();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(loadTrack).not.toHaveBeenCalled();
        expect(invalidate).not.toHaveBeenCalled();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Retry playback"
            })
        );

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledWith(
                3005,
                expect.objectContaining({
                    onError: expect.any(Function)
                })
            );
        });

        expect(globalThis.fetch).toHaveBeenCalledTimes(4);

        expect(
            screen.queryByText("Playback unavailable")
        ).not.toBeInTheDocument();
    });

    it("recovers from a failed media-access network request", async () => {
        globalThis.fetch
            .mockResolvedValueOnce(metadataResponse())
            .mockRejectedValueOnce(
                new TypeError("network unavailable")
            )
            .mockResolvedValueOnce(metadataResponse())
            .mockResolvedValueOnce({ status: 204 });

        renderPlayback();

        expect(
            await screen.findByRole("button", {
                name: "Retry playback"
            })
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Retry playback"
            })
        );

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledTimes(1);
        });

        expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    });

    it.each([401, 403, 404])(
        "does not offer retry for HTTP %i",
        async (status) => {
            const invalidate = vi.fn();

            globalThis.fetch
                .mockResolvedValueOnce(metadataResponse())
                .mockResolvedValueOnce({ status });

            renderPlayback(3005, TOKEN, invalidate);

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.queryByRole("button", {
                    name: "Retry playback"
                })
            ).not.toBeInTheDocument();

            expect(loadTrack).not.toHaveBeenCalled();

            expect(invalidate).toHaveBeenCalledTimes(
                status === 401 ? 1 : 0
            );
        }
    );

    it("ignores an old metadata response after track replacement", async () => {
        let resolveOldRequest;

        const oldRequest = new Promise((resolve) => {
            resolveOldRequest = resolve;
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

        const { rerender } = renderPlayback(
            3005,
            TOKEN,
            invalidate
        );

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        });

        rerender(
            <PlaybackBar
                trackId={3006}
                accessToken={TOKEN}
                onSessionInvalidated={invalidate}
            />
        );

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledWith(
                3006,
                expect.any(Object)
            );
        });

        await act(async () => {
            resolveOldRequest(metadataResponse());
        });

        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        expect(loadTrack).toHaveBeenCalledTimes(1);

        expect(
            screen.getByText("Second Track")
        ).toBeInTheDocument();
    });
});
