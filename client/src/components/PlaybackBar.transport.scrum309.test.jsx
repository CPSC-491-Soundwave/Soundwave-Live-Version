/**
 * SCRUM-309 / Christian McGowan / Sprint 4 Block B2
 * Transport command characterization against the existing shared PlaybackBar.
 *
 * Scope: duplicate Play/Pause dispatch, resume, stale transport callbacks,
 * and command failure. No queue, retry, credential, event persistence,
 * seek/scrub, or Howler ownership changes.
 *
 * The duplicate-input tests are intended as BEFORE-fix reproducers.
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
    playMusic
} from "../playback/playback.js";
import PlaybackBar from "./PlaybackBar";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(() => true),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn()
}));

const TOKEN = "scrum309-synthetic-access-token";
const TRACKS = new Map([
    [3005, {
        id: 3005,
        title: "Kontekst",
        durationMs: 12345,
        album: { id: 2003, title: "No Copyright" },
        artist: { id: 1003, name: "Buddha" }
    }],
    [3004, {
        id: 3004,
        title: "Fixture Track Four",
        durationMs: 222000,
        album: { id: 2002, title: "Fixture Album Beta" },
        artist: { id: 1002, name: "Fixture Artist Two" }
    }]
]);

function installSuccessfulPreparation() {
    globalThis.fetch = vi.fn(async (url) => {
        const metadataMatch = /^\/api\/catalog\/tracks\/(\d+)$/.exec(url);
        if (metadataMatch) {
            const metadata = TRACKS.get(Number(metadataMatch[1]));
            return {
                ok: Boolean(metadata),
                status: metadata ? 200 : 404,
                json: async () => metadata
            };
        }

        const ticketMatch = /^\/api\/tracks\/(\d+)\/media-access$/.exec(url);
        if (ticketMatch) {
            return { ok: true, status: 204 };
        }

        throw new Error(`Unexpected request in SCRUM-309 test: ${url}`);
    });
}

async function prepareTrack(trackId = 3005) {
    const rendered = render(
        <PlaybackBar trackId={trackId} accessToken={TOKEN} />
    );
    await waitFor(() => {
        expect(loadTrack).toHaveBeenCalledTimes(1);
    });
    await screen.findByRole("button", { name: "Play" });

    return {
        ...rendered,
        callbacks: loadTrack.mock.calls[0][1]
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    playMusic.mockReturnValue(true);
    pauseMusic.mockReturnValue(true);
    installSuccessfulPreparation();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("SCRUM-309 shared-player transport command safety", () => {
    it("B2-T01: sends one Play command while the initial onPlay event is pending", async () => {
        const { callbacks } = await prepareTrack();
        const playButton = screen.getByRole("button", { name: "Play" });

        fireEvent.click(playButton);
        fireEvent.click(playButton);

        expect(playMusic).toHaveBeenCalledTimes(1);
        // Do not claim playback is confirmed until the actual Howler event.
        expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

        act(() => callbacks.onPlay());
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("B2-T02: sends one Pause command until onPause, then resumes on the same player", async () => {
        const { callbacks } = await prepareTrack();

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        act(() => callbacks.onPlay());

        const pauseButton = screen.getByRole("button", { name: "Pause" });
        fireEvent.click(pauseButton);
        fireEvent.click(pauseButton);

        expect(pauseMusic).toHaveBeenCalledTimes(1);

        act(() => callbacks.onPause());
        expect(screen.getByRole("status")).toHaveTextContent("Paused");
        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        expect(playMusic).toHaveBeenCalledTimes(2);
        expect(loadTrack).toHaveBeenCalledTimes(1);
    });

    it("B2-T03: ignores obsolete transport events after a different track is selected", async () => {
        const { rerender, callbacks: oldCallbacks } = await prepareTrack(3005);
        fireEvent.click(screen.getByRole("button", { name: "Play" }));

        rerender(<PlaybackBar trackId={3004} accessToken={TOKEN} />);
        await waitFor(() => expect(loadTrack).toHaveBeenCalledTimes(2));
        expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();

        act(() => {
            oldCallbacks.onPlay();
            oldCallbacks.onPause();
            oldCallbacks.onEnd();
        });

        expect(screen.getByText("Fixture Track Four")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
        expect(screen.getByRole("status")).not.toHaveTextContent(/Playing|Paused|Finished/);
    });

    it("B2-T04: a failed Play command presents an error rather than a false Playing state", async () => {
        await prepareTrack();
        playMusic.mockReturnValueOnce(false);

        fireEvent.click(screen.getByRole("button", { name: "Play" }));

        expect(await screen.findByText("Playback unavailable")).toBeInTheDocument();
        expect(screen.getByText("Unable to play this track.")).toBeInTheDocument();
        expect(playMusic).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    });
});
