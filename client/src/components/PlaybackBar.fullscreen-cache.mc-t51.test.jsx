// @vitest-environment jsdom
/**
 * Matthew Choi - MC-T51 / Sprint 5.
 * Fullscreen and cache-availability UI regression tests.
 *
 * Place next to PlaybackBar.jsx. These mocks are UI-only: they do not
 * create stored audio, bypass media authorization, or contact a real server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

vi.mock("../playback/streamFailure.js", () => ({
    canRetryPlayback: vi.fn(() => false),
    classifyMediaAccessRequestError: vi.fn(() => ({
        code: "REQUEST_FAILED", message: "Media access failed.", retryable: false
    })),
    classifyMediaAccessStatus: vi.fn(() => ({
        code: "UNAUTHORIZED", message: "Unauthorized.", retryable: false
    }))
}));

vi.mock("../playback/playbackDiagnostics.js", () => ({
    recordPlaybackDiagnostic: vi.fn()
}));

vi.mock("../playback/playbackEvents.js", () => ({
    reportPlaybackEvent: vi.fn(async () => undefined)
}));

vi.mock("./PlaybackFavoriteButton.jsx", () => ({
    default: () => null
}));

import PlaybackBar from "./PlaybackBar.jsx";

function makeDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function renderPlayer({
    trackId = 3005,
    accessToken = "test-token",
    cacheStatusProvider,
    ...props
} = {}) {
    return render(
        <PlaybackBar
            trackId={trackId}
            accessToken={accessToken}
            cacheStatusProvider={cacheStatusProvider}
            {...props}
        />
    );
}

async function waitForTrack(title = "Kontekst") {
    await screen.findByText(title);
    await waitFor(() => expect(audio.loadTrack).toHaveBeenCalled());
}

function cacheLabel() {
    return document.querySelector(".playback-cache-status");
}

beforeEach(() => {
    vi.clearAllMocks();
    audio.callbacks.clear();
    document.body.style.overflow = "";

    audio.playMusic.mockReturnValue(true);
    audio.pauseMusic.mockReturnValue(true);
    audio.setMusicProgress.mockReturnValue(true);
    audio.loadTrack.mockImplementation((id, callbacks) => {
        audio.callbacks.set(id, callbacks);
        callbacks.onLoad?.();
        callbacks.onProgress?.({ positionSeconds: 35, durationSeconds: 180 });
    });

    vi.stubGlobal("fetch", vi.fn(async (input) => {
        const url = String(input);
        const detail = url.match(/^\/api\/catalog\/tracks\/(\d+)$/);
        if (detail) {
            const id = Number(detail[1]);
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    id,
                    title: id === 3005 ? "Kontekst" : "Second track",
                    artist: { name: "Buddha" },
                    album: { title: "No Copyright" }
                })
            };
        }
        if (/^\/api\/tracks\/\d+\/media-access$/.test(url)) {
            return { ok: true, status: 204 };
        }
        throw new Error(`Unexpected test request: ${url}`);
    }));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
});

describe("MC-T51: fullscreen player", () => {
    it("expands/collapses without reloading audio or losing track metadata", async () => {
        renderPlayer();
        await waitForTrack();
        const initialLoadCount = audio.loadTrack.mock.calls.length;
        const initialUnloadCount = audio.unloadMusic.mock.calls.length;

        fireEvent.click(screen.getByRole("button", { name: "Expand player" }));
        const dialog = screen.getByRole("dialog", { name: "Expanded playback player" });
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.classList.contains("playback-bar--expanded")).toBe(true);
        expect(screen.getByText("Kontekst")).toBeTruthy();
        expect(screen.getByText(/Buddha/)).toBeTruthy();
        expect(screen.getByLabelText("Elapsed time").textContent).toBe("0:35");

        fireEvent.click(screen.getByRole("button", { name: "Collapse player" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByLabelText("Elapsed time").textContent).toBe("0:35");
        expect(audio.loadTrack).toHaveBeenCalledTimes(initialLoadCount);
        expect(audio.unloadMusic).toHaveBeenCalledTimes(initialUnloadCount);
    });

    it("keeps confirmed playback active while expanding, seeking and adjusting volume", async () => {
        renderPlayer();
        await waitForTrack();

        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        await act(async () => audio.callbacks.get(3005).onPlay());
        expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Expand player" }));
        fireEvent.change(screen.getByRole("slider", { name: "Seek position" }), {
            target: { value: "90" }
        });
        expect(audio.setMusicProgress).toHaveBeenCalledWith(90);
        expect(screen.getByLabelText("Elapsed time").textContent).toBe("1:30");

        fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
            target: { value: "0.8" }
        });
        expect(audio.setMusicVolume).toHaveBeenCalledWith(0.8);
        expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
        expect(audio.loadTrack).toHaveBeenCalledTimes(1);
    });

    it("closes with Escape and restores the compact player", async () => {
        renderPlayer();
        await waitForTrack();
        fireEvent.click(screen.getByRole("button", { name: "Expand player" }));
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(document.body.style.overflow).toBe("hidden");

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.body.style.overflow).toBe("");
        expect(screen.getByRole("button", { name: "Expand player" })).toBeTruthy();
    });
});

describe("MC-T51: cache-status integration", () => {
    it("defaults to Unknown; successful media authorization is not offline-cache proof", async () => {
        renderPlayer();
        await waitForTrack();
        await screen.findByText("Cache status unknown");
        expect(cacheLabel().getAttribute("data-cache-status")).toBe("unknown");
        expect(screen.queryByText("Cached")).toBeNull();
    });

    it("shows Loading while a provider lookup is unfinished", async () => {
        const pending = makeDeferred();
        const provider = vi.fn(() => pending.promise);
        renderPlayer({ cacheStatusProvider: provider });
        await waitForTrack();
        await waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
        expect(screen.getByText("Checking cache...")).toBeTruthy();
        expect(cacheLabel().getAttribute("data-cache-status")).toBe("loading");

        await act(async () => pending.resolve("unknown"));
        expect(screen.getByText("Cache status unknown")).toBeTruthy();
    });

    it.each([
        ["present", "Cached"],
        ["evicted", "Removed from cache"],
        ["unknown", "Cache status unknown"]
    ])("renders confirmed provider result %s as %s", async (status, label) => {
        const provider = vi.fn(async () => ({ status }));
        renderPlayer({ cacheStatusProvider: provider });
        await waitForTrack();
        await screen.findByText(label);
        expect(cacheLabel().getAttribute("data-cache-status")).toBe(status);
        expect(provider).toHaveBeenCalledWith({
            trackId: 3005,
            accessToken: "test-token"
        });

        const nodeBeforeExpand = cacheLabel();
        fireEvent.click(screen.getByRole("button", { name: "Expand player" }));
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(cacheLabel()).toBe(nodeBeforeExpand);
        expect(screen.getByText(label)).toBeTruthy();
    });

    it("falls back to Unknown on cache-provider rejection without breaking playback", async () => {
        const provider = vi.fn(async () => { throw new Error("storage unavailable"); });
        renderPlayer({ cacheStatusProvider: provider });
        await waitForTrack();
        await screen.findByText("Cache status unknown");
        expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
        expect(audio.unloadMusic).not.toHaveBeenCalled();
    });

    it("does not show a stale Cached label after switching tracks", async () => {
        const deferredByTrack = new Map();
        const provider = vi.fn(({ trackId }) => {
            const deferred = makeDeferred();
            deferredByTrack.set(trackId, deferred);
            return deferred.promise;
        });

        const view = renderPlayer({ cacheStatusProvider: provider });
        await waitForTrack();
        await waitFor(() => expect(deferredByTrack.has(3005)).toBe(true));

        view.rerender(
            <PlaybackBar trackId={3006} accessToken="test-token" cacheStatusProvider={provider} />
        );
        await screen.findByText("Second track");
        await waitFor(() => expect(deferredByTrack.has(3006)).toBe(true));
        expect(screen.getByText("Checking cache...")).toBeTruthy();

        await act(async () => deferredByTrack.get(3005).resolve("present"));
        expect(screen.queryByText("Cached")).toBeNull();
        expect(screen.getByText("Checking cache...")).toBeTruthy();

        await act(async () => deferredByTrack.get(3006).resolve("evicted"));
        expect(screen.getByText("Removed from cache")).toBeTruthy();
        expect(cacheLabel().getAttribute("data-cache-status")).toBe("evicted");
    });

    it("does not leak a previous session's cache availability", async () => {
        const deferredByToken = new Map();
        const provider = vi.fn(({ accessToken }) => {
            const deferred = makeDeferred();
            deferredByToken.set(accessToken, deferred);
            return deferred.promise;
        });

        const view = renderPlayer({ cacheStatusProvider: provider });
        await waitForTrack();
        await waitFor(() => expect(deferredByToken.has("test-token")).toBe(true));

        view.rerender(
            <PlaybackBar trackId={3005} accessToken="other-session" cacheStatusProvider={provider} />
        );
        await screen.findByText("Kontekst");
        await waitFor(() => expect(deferredByToken.has("other-session")).toBe(true));
        await screen.findByText("Checking cache...");

        await act(async () => deferredByToken.get("test-token").resolve("present"));
        expect(screen.queryByText("Cached")).toBeNull();

        await act(async () => deferredByToken.get("other-session").resolve("unknown"));
        expect(screen.getByText("Cache status unknown")).toBeTruthy();
    });
});
