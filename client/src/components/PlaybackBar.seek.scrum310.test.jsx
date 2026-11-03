/**
 * SCRUM-310 / Christian McGowan / Sprint 4 Block B3
 *
 * Seek and playback timeline contract tests.
 *
 * Uses the existing shared PlaybackBar and playback module.
 * Does not replace queue, buffering, authentication,
 * streaming, or error/retry ownership.
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
    setMusicProgress
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

const TOKEN = "scrum310-synthetic-token";

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

function installFetchFixture() {
    globalThis.fetch = vi.fn(async (url) => {
        const metadataMatch =
            /^\/api\/catalog\/tracks\/(\d+)$/.exec(url);

        if (metadataMatch) {
            const track = TRACKS.get(Number(metadataMatch[1]));
            return {
                ok: Boolean(track),
                status: track ? 200 : 404,
                json: async () => track
            };
        }

        if (/^\/api\/tracks\/\d+\/media-access$/.test(url)) {
            return { ok: true, status: 204 };
        }

        throw new Error(`Unexpected URL: ${url}`);
    });
}

async function prepareTrack(trackId = 3005) {
    const view = render(
        <PlaybackBar
            trackId={trackId}
            accessToken={TOKEN}
        />
    );

    await waitFor(() => {
        expect(loadTrack).toHaveBeenCalledTimes(1);
    });

    await screen.findByRole("button", { name: "Play" });

    return {
        ...view,
        callbacks: loadTrack.mock.calls[0][1]
    };
}

function reportProgress(callbacks, positionSeconds, durationSeconds) {
    act(() => {
        callbacks.onProgress({
            positionSeconds,
            durationSeconds
        });
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    setMusicProgress.mockReturnValue(true);
    installFetchFixture();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("SCRUM-310 playback timeline and seek", () => {
    it("B3-T01: displays actual media duration instead of fixture metadata", async () => {
        const { callbacks } = await prepareTrack();

        reportProgress(callbacks, 37, 209);

        const slider = screen.getByRole("slider", {
            name: "Seek position"
        });

        expect(slider.value).toBe("37");
        expect(screen.getByText("0:37")).toBeInTheDocument();
        expect(screen.getByText("3:29")).toBeInTheDocument();

        // Metadata claims 12.345 seconds.
        // The timeline must use the real 209-second media duration.
        expect(Number(slider.max)).toBe(209);
    });

    it("B3-T02: seeking updates the real player without reloading", async () => {
        const { callbacks } = await prepareTrack();

        reportProgress(callbacks, 12, 209);

        fireEvent.change(
            screen.getByRole("slider", {
                name: "Seek position"
            }),
            { target: { value: "95" } }
        );

        expect(setMusicProgress).toHaveBeenCalledWith(95);
        expect(loadTrack).toHaveBeenCalledTimes(1);
        expect(screen.getByText("1:35")).toBeInTheDocument();
    });

    it("B3-T03: seek values remain inside the valid media range", async () => {
        const { callbacks } = await prepareTrack();

        reportProgress(callbacks, 20, 209);

        const slider = screen.getByRole("slider", {
            name: "Seek position"
        });

        fireEvent.change(slider, {
            target: { value: "999" }
        });

        expect(setMusicProgress).toHaveBeenLastCalledWith(209);

        fireEvent.change(slider, {
            target: { value: "-20" }
        });

        expect(setMusicProgress).toHaveBeenLastCalledWith(0);
    });

    it("B3-T04: seeking while paused does not play or pause the track", async () => {
        const { callbacks } = await prepareTrack();

        reportProgress(callbacks, 30, 209);

        act(() => callbacks.onPause());

        fireEvent.change(
            screen.getByRole("slider", {
                name: "Seek position"
            }),
            { target: { value: "75" } }
        );

        expect(setMusicProgress).toHaveBeenCalledWith(75);
        expect(playMusic).not.toHaveBeenCalled();
        expect(pauseMusic).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent(
            "Paused"
        );
    });

    it("B3-T05: rejects obsolete progress after a track change", async () => {
        const { rerender, callbacks: oldCallbacks } =
            await prepareTrack(3005);

        reportProgress(oldCallbacks, 100, 209);

        rerender(
            <PlaybackBar
                trackId={3004}
                accessToken={TOKEN}
            />
        );

        await waitFor(() => {
            expect(loadTrack).toHaveBeenCalledTimes(2);
        });

        const newCallbacks = loadTrack.mock.calls[1][1];

        reportProgress(newCallbacks, 14, 222);

        reportProgress(oldCallbacks, 180, 209);

        expect(
            screen.getByText("Fixture Track Four")
        ).toBeInTheDocument();

        expect(
            screen.getByRole("slider", {
                name: "Seek position"
            }).value
        ).toBe("14");

        expect(screen.getByText("0:14")).toBeInTheDocument();
    });

    it("B3-T06: disables seeking when real duration is unavailable", async () => {
        const { callbacks } = await prepareTrack();

        reportProgress(callbacks, 0, 0);

        const slider = screen.getByRole("slider", {
            name: "Seek position"
        });

        expect(slider).toBeDisabled();
        expect(screen.getByText("--:--")).toBeInTheDocument();
        expect(setMusicProgress).not.toHaveBeenCalled();
    });

    it("B3-T07: does not display a false position after failed seek", async () => {
        const { callbacks } = await prepareTrack();

        reportProgress(callbacks, 14, 209);

        setMusicProgress.mockReturnValueOnce(false);

        fireEvent.change(
            screen.getByRole("slider", {
                name: "Seek position"
            }),
            { target: { value: "90" } }
        );

        expect(setMusicProgress).toHaveBeenCalledWith(90);

        expect(
            screen.getByRole("slider", {
                name: "Seek position"
            }).value
        ).toBe("14");

        expect(screen.getByText("0:14")).toBeInTheDocument();
    });
});
