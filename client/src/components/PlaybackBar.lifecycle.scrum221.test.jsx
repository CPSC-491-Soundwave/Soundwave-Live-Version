/**
 * SCRUM-221 — Christian McGowan
 * Sprint 4 B5: Playback state integration verification.
 *
 * Complements existing transport, buffering, retry,
 * seek, authentication and queue tests without
 * changing their ownership or implementation.
 */
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
import {
    loadTrack,
    pauseMusic,
    playMusic,
    setMusicProgress,
    unloadMusic
} from "../playback/playback.js";
import PlaybackBar from "./PlaybackBar";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(() => true),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicProgress: vi.fn(() => true)
}));

const TOKEN = "scrum221-synthetic-token";

const TRACK = {
    id: 3005,
    title: "Kontekst",
    durationMs: 12345,
    artist: { id: 1003, name: "Buddha" },
    album: { id: 2003, title: "No Copyright" }
};

function player(token = TOKEN) {
    return (
        <PlaybackBar
            trackId={TRACK.id}
            accessToken={token}
        />
    );
}

async function preparePlayer() {
    const view = render(player());

    await waitFor(() => {
        expect(loadTrack).toHaveBeenCalledTimes(1);
    });

    await screen.findByRole("button", { name: "Play" });

    return {
        ...view,
        callbacks: loadTrack.mock.calls[0][1]
    };
}

function statusIs(value) {
    expect(screen.getByRole("status"))
        .toHaveTextContent(value);
}

beforeEach(() => {
    vi.clearAllMocks();

    playMusic.mockReturnValue(true);
    pauseMusic.mockReturnValue(true);
    setMusicProgress.mockReturnValue(true);

    vi.stubGlobal("fetch", vi.fn(async (url) => {
        if (url === "/api/catalog/tracks/3005") {
            return {
                ok: true,
                status: 200,
                json: async () => TRACK
            };
        }

        if (url === "/api/tracks/3005/media-access") {
            return { ok: true, status: 204 };
        }

        throw new Error(`Unexpected URL: ${url}`);
    }));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("SCRUM-221 playback lifecycle integration", () => {
    it("B5-T01: failed Pause does not falsely report Paused", async () => {
        const { callbacks } = await preparePlayer();

        fireEvent.click(
            screen.getByRole("button", { name: "Play" })
        );
        act(() => callbacks.onPlay());

        statusIs("Playing");

        pauseMusic.mockReturnValueOnce(false);

        fireEvent.click(
            screen.getByRole("button", { name: "Pause" })
        );

        expect(pauseMusic).toHaveBeenCalledTimes(1);
        statusIs("Playing");

        fireEvent.click(
            screen.getByRole("button", { name: "Pause" })
        );

        expect(pauseMusic).toHaveBeenCalledTimes(2);

        act(() => callbacks.onPause());

        statusIs("Paused");
        expect(loadTrack).toHaveBeenCalledTimes(1);
    });

    it("B5-T02: play, seek, pause, resume and replay share one loaded track", async () => {
        const { callbacks } = await preparePlayer();

        act(() => callbacks.onLoad());
        statusIs("Ready to play");

        fireEvent.click(
            screen.getByRole("button", { name: "Play" })
        );

        act(() => {
            callbacks.onPlay();
            callbacks.onProgress({
                positionSeconds: 24,
                durationSeconds: 209
            });
        });

        statusIs("Playing");

        fireEvent.click(
            screen.getByRole("button", { name: "Pause" })
        );
        act(() => callbacks.onPause());

        statusIs("Paused");

        fireEvent.change(
            screen.getByRole("slider", {
                name: "Seek position"
            }),
            { target: { value: "100" } }
        );

        expect(setMusicProgress).toHaveBeenCalledWith(100);
        statusIs("Paused");

        fireEvent.click(
            screen.getByRole("button", { name: "Play" })
        );
        act(() => callbacks.onPlay());

        statusIs("Playing");

        act(() => callbacks.onEnd());

        statusIs("Finished");
        expect(
            screen.getByRole("button", { name: "Play" })
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Play" })
        );
        act(() => callbacks.onPlay());

        statusIs("Playing");

        expect(playMusic).toHaveBeenCalledTimes(3);
        expect(loadTrack).toHaveBeenCalledTimes(1);
        // SCRUM-221: Original playback preparation requests.
        const originalRequests = fetch.mock.calls.filter(
            ([url]) => url !== "/api/playback-events"
        );

        expect(originalRequests).toHaveLength(2);

        // SCRUM-297: Three confirmed playback starts.
        const playbackEventRequests = fetch.mock.calls.filter(
            ([url]) => url === "/api/playback-events"
        );

        expect(playbackEventRequests).toHaveLength(3);
    });

    it("B5-T03: late buffering callbacks cannot overwrite Finished", async () => {
        const { callbacks } = await preparePlayer();

        act(() => {
            callbacks.onPlay();
            callbacks.onBuffering();
        });

        statusIs("Buffering...");

        act(() => callbacks.onEnd());
        statusIs("Finished");

        act(() => {
            callbacks.onRecovered();
            callbacks.onBuffering();
        });

        statusIs("Finished");

        expect(
            screen.getByRole("button", { name: "Play" })
        ).toBeInTheDocument();
        expect(loadTrack).toHaveBeenCalledTimes(1);
    });

    it("B5-T04: removing the session closes active playback", async () => {
        const { rerender, callbacks } = await preparePlayer();

        act(() => callbacks.onPlay());
        statusIs("Playing");

        rerender(player(""));

        expect(
            await screen.findByText("Playback unavailable")
        ).toBeInTheDocument();

        expect(
            screen.getByRole("alert")
        ).toHaveTextContent(
            "Please log in to play this track."
        );

        act(() => {
            callbacks.onPlay();
            callbacks.onEnd();
        });

        expect(
            screen.queryByRole("button", { name: "Pause" })
        ).not.toBeInTheDocument();

        expect(unloadMusic).toHaveBeenCalled();
        expect(loadTrack).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
