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

import PlaybackBar from "./PlaybackBar";
import {
    loadTrack,
    playMusic,
    pauseMusic
} from "../playback/playback.js";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn()
}));

const TRACK = {
    id: 3005,
    title: "Kontekst",
    artist: { id: 1003, name: "Buddha" },
    album: { id: 2003, title: "No Copyright" }
};

function mountPlayer() {
    return render(
        <PlaybackBar
            trackId={3005}
            accessToken="test-token"
            onSessionInvalidated={vi.fn()}
        />
    );
}

beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => TRACK
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 204
        })
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("SCRUM-293 buffering indicator", () => {
    it("shows loading until the audio is ready", async () => {
        mountPlayer();

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledTimes(1);
        });

        expect(
            await screen.findByRole("status")
        ).toHaveTextContent("Loading audio...");

        const callbacks = loadTrack.mock.calls[0][1];

        act(() => {
            callbacks.onLoad();
        });

        expect(
            screen.getByRole("status")
        ).toHaveTextContent("Ready to play");

        expect(
            screen.getByRole("button", { name: "Play" })
        ).toBeInTheDocument();

        expect(fetch).toHaveBeenCalledWith(
            "/api/tracks/3005/media-access",
            expect.objectContaining({
                method: "POST",
                credentials: "same-origin"
            })
        );
    });

    it("shows a stall and recovers without restarting playback", async () => {
        mountPlayer();

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledTimes(1);
        });

        const callbacks = loadTrack.mock.calls[0][1];

        fireEvent.click(
            screen.getByRole("button", { name: "Play" })
        );

        expect(playMusic).toHaveBeenCalledTimes(1);

        act(() => {
            callbacks.onPlay();
        });

        expect(
            screen.getByRole("status")
        ).toHaveTextContent("Playing");

        act(() => {
            callbacks.onBuffering();
        });

        expect(
            screen.getByRole("status")
        ).toHaveTextContent("Buffering...");

        expect(
            screen.getByRole("button", { name: "Pause" })
        ).toBeInTheDocument();

        act(() => {
            callbacks.onRecovered();
        });

        expect(
            screen.getByRole("status")
        ).toHaveTextContent("Playing");

        expect(loadTrack).toHaveBeenCalledTimes(1);
        expect(playMusic).toHaveBeenCalledTimes(1);

        fireEvent.click(
            screen.getByRole("button", { name: "Pause" })
        );

        expect(pauseMusic).toHaveBeenCalledTimes(1);

        act(() => {
            callbacks.onPause();
            callbacks.onRecovered();
        });

        expect(
            screen.getByRole("status")
        ).toHaveTextContent("Paused");
    });
});