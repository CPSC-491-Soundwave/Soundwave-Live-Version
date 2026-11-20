// @vitest-environment jsdom
/**
 * Matthew Choi - multi-track switching regression.
 * Scope: the existing selected-track -> PlaybackBar integration.
 * This suite does not replace Konner's queue, Christian's transport controls,
 * or Allison's buffering/Howler implementation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    act, cleanup, fireEvent, render, screen, waitFor
} from "@testing-library/react";

const audio = vi.hoisted(() => ({
    callbacks: new Map(),
    loadTrack: vi.fn(),
    playMusic: vi.fn(),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicProgress: vi.fn()
}));

vi.mock("../playback/playback.js", () => ({
    loadTrack: audio.loadTrack,
    playMusic: audio.playMusic,
    pauseMusic: audio.pauseMusic,
    unloadMusic: audio.unloadMusic,
    setMusicVolume: audio.setMusicVolume,
    setMusicProgress: audio.setMusicProgress
}));

vi.mock("../playback/playbackEvents.js", () => ({
    reportPlaybackEvent: vi.fn(async () => ({ ok: true, status: 201 }))
}));

vi.mock("../playback/playbackDiagnostics.js", () => ({
    recordPlaybackDiagnostic: vi.fn()
}));

vi.mock("./PlaybackFavoriteButton.jsx", () => ({
    default: () => null
}));

import { reportPlaybackEvent } from "../playback/playbackEvents.js";
import PlaybackBar from "./PlaybackBar.jsx";

const TOKEN = "multitrack-test-token";
const cacheStatusProvider = async () => "unknown";
const TRACKS = new Map([
    [3005, {
        id: 3005, title: "Kontekst",
        artist: { id: 1003, name: "Buddha" },
        album: { id: 2003, title: "No Copyright" }
    }],
    [3006, {
        id: 3006, title: "Goat Chill",
        artist: { id: 1004, name: "Artist Six" },
        album: { id: 2004, title: "Album Six" }
    }],
    [3007, {
        id: 3007, title: "Chicken on Tree",
        artist: { id: 1005, name: "Artist Seven" },
        album: { id: 2005, title: "Album Seven" }
    }]
]);

// These names are test-only metadata; the database's extracted metadata wins.
function metadataResponse(id) {
    const track = TRACKS.get(id);
    return {
        ok: Boolean(track),
        status: track ? 200 : 404,
        json: async () => track
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((complete) => { resolve = complete; });
    return { promise, resolve };
}

function player(trackId) {
    return (
        <PlaybackBar
            trackId={trackId}
            accessToken={TOKEN}
            cacheStatusProvider={cacheStatusProvider}
        />
    );
}

function mockSuccessfulRequests() {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
        const url = String(input);
        const detail = /^\/api\/catalog\/tracks\/(\d+)$/.exec(url);
        if (detail) {
            return metadataResponse(Number(detail[1]));
        }
        if (/^\/api\/tracks\/\d+\/media-access$/.test(url)) {
            return { ok: true, status: 204 };
        }
        throw new Error(`Unexpected test request: ${url}`);
    }));
}

async function expectActiveTrack(id) {
    const track = TRACKS.get(id);
    expect(track).toBeDefined();
    await screen.findByText(track.title);
    await waitFor(() => {
        expect(audio.loadTrack).toHaveBeenCalledWith(id, expect.any(Object));
    });
    expect(screen.getByText(track.artist.name + " • " + track.album.title))
        .toBeInTheDocument();
}

beforeEach(() => {
    vi.clearAllMocks();
    audio.callbacks.clear();
    audio.playMusic.mockReturnValue(true);
    audio.pauseMusic.mockReturnValue(true);
    audio.setMusicProgress.mockReturnValue(true);
    audio.loadTrack.mockImplementation((id, callbacks) => {
        audio.callbacks.set(id, callbacks);
        callbacks.onLoad?.();
        callbacks.onProgress?.({ positionSeconds: 0, durationSeconds: 180 });
    });
    mockSuccessfulRequests();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("Matthew: multi-track PlaybackBar integration", () => {
    it("loads 3005 -> 3006 -> 3007 once each, unloading on selection changes", async () => {
        const view = render(player(3005));
        await expectActiveTrack(3005);
        const afterFirstLoad = audio.unloadMusic.mock.calls.length;

        view.rerender(player(3006));
        await expectActiveTrack(3006);
        expect(audio.unloadMusic.mock.calls.length).toBe(afterFirstLoad + 1);
        expect(screen.queryByText("Kontekst")).not.toBeInTheDocument();

        view.rerender(player(3007));
        await expectActiveTrack(3007);
        expect(audio.unloadMusic.mock.calls.length).toBe(afterFirstLoad + 2);
        expect(screen.queryByText("Goat Chill")).not.toBeInTheDocument();

        expect(audio.loadTrack.mock.calls.map(([id]) => id))
            .toEqual([3005, 3006, 3007]);
        expect(audio.playMusic).not.toHaveBeenCalled();

        for (const id of [3005, 3006, 3007]) {
            expect(globalThis.fetch).toHaveBeenCalledWith(
                `/api/catalog/tracks/${id}`
            );
            expect(globalThis.fetch).toHaveBeenCalledWith(
                `/api/tracks/${id}/media-access`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${TOKEN}` },
                    credentials: "same-origin"
                }
            );
        }
    });

    it("ignores obsolete play, progress, error and completion events after switching", async () => {
        const view = render(player(3005));
        await expectActiveTrack(3005);
        const oldCallbacks = audio.callbacks.get(3005);

        act(() => {
            oldCallbacks.onProgress({ positionSeconds: 52, durationSeconds: 180 });
        });
        expect(screen.getByLabelText("Elapsed time")).toHaveTextContent("0:52");

        view.rerender(player(3006));
        await expectActiveTrack(3006);
        const newCallbacks = audio.callbacks.get(3006);
        act(() => {
            newCallbacks.onProgress({ positionSeconds: 12, durationSeconds: 210 });
        });
        const unloadsAfterSwitch = audio.unloadMusic.mock.calls.length;

        act(() => {
            oldCallbacks.onProgress({ positionSeconds: 100, durationSeconds: 180 });
            oldCallbacks.onPlay();
            oldCallbacks.onPause();
            oldCallbacks.onEnd();
            oldCallbacks.onError();
        });

        expect(screen.getByText("Goat Chill")).toBeInTheDocument();
        expect(screen.getByLabelText("Elapsed time")).toHaveTextContent("0:12");
        expect(screen.getByRole("status")).toHaveTextContent("Ready to play");
        expect(screen.queryByText("Playback unavailable")).not.toBeInTheDocument();
        expect(audio.unloadMusic).toHaveBeenCalledTimes(unloadsAfterSwitch);
        expect(reportPlaybackEvent).not.toHaveBeenCalled();
    });

    it("discards old pending metadata during rapid 3005 -> 3006 -> 3007 changes", async () => {
        const oldMetadata = deferred();
        const middleMetadata = deferred();
        const fetchMock = vi.fn(async (input) => {
            const url = String(input);
            if (url === "/api/catalog/tracks/3005") return oldMetadata.promise;
            if (url === "/api/catalog/tracks/3006") return middleMetadata.promise;
            if (url === "/api/catalog/tracks/3007") return metadataResponse(3007);
            if (url === "/api/tracks/3007/media-access") {
                return { ok: true, status: 204 };
            }
            throw new Error(`Obsolete or unexpected request: ${url}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const view = render(player(3005));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
            "/api/catalog/tracks/3005"
        ));

        view.rerender(player(3006));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
            "/api/catalog/tracks/3006"
        ));
        view.rerender(player(3007));
        await expectActiveTrack(3007);

        await act(async () => {
            middleMetadata.resolve(metadataResponse(3006));
            oldMetadata.resolve(metadataResponse(3005));
        });

        expect(audio.loadTrack.mock.calls.map(([id]) => id)).toEqual([3007]);
        expect(screen.getByText("Chicken on Tree")).toBeInTheDocument();
        expect(screen.queryByText("Kontekst")).not.toBeInTheDocument();
        expect(screen.queryByText("Goat Chill")).not.toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalledWith(
            "/api/tracks/3005/media-access", expect.anything()
        );
        expect(fetchMock).not.toHaveBeenCalledWith(
            "/api/tracks/3006/media-access", expect.anything()
        );
    });

    it("preserves one fullscreen player across a track switch and view toggles", async () => {
        const view = render(player(3005));
        await expectActiveTrack(3005);
        const unloadsBeforeExpand = audio.unloadMusic.mock.calls.length;

        fireEvent.click(screen.getByRole("button", { name: "Expand player" }));
        expect(screen.getByRole("dialog", {
            name: "Expanded playback player"
        })).toBeInTheDocument();
        expect(audio.loadTrack).toHaveBeenCalledTimes(1);
        expect(audio.unloadMusic).toHaveBeenCalledTimes(unloadsBeforeExpand);

        view.rerender(player(3007));
        await expectActiveTrack(3007);
        expect(screen.getByRole("dialog", {
            name: "Expanded playback player"
        })).toBeInTheDocument();
        expect(audio.loadTrack.mock.calls.map(([id]) => id)).toEqual([3005, 3007]);
        expect(audio.unloadMusic).toHaveBeenCalledTimes(unloadsBeforeExpand + 1);

        fireEvent.click(screen.getByRole("button", { name: "Collapse player" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(audio.loadTrack).toHaveBeenCalledTimes(2);
        expect(audio.unloadMusic).toHaveBeenCalledTimes(unloadsBeforeExpand + 1);
    });

    it("records a confirmed Play only for the newly selected track", async () => {
        const view = render(player(3005));
        await expectActiveTrack(3005);
        const oldCallbacks = audio.callbacks.get(3005);

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        view.rerender(player(3006));
        await expectActiveTrack(3006);

        act(() => oldCallbacks.onPlay());
        expect(reportPlaybackEvent).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        act(() => audio.callbacks.get(3006).onPlay());

        expect(reportPlaybackEvent).toHaveBeenCalledTimes(1);
        expect(reportPlaybackEvent).toHaveBeenCalledWith({
            trackId: 3006,
            accessToken: TOKEN,
            eventType: "play"
        });
    });
});
