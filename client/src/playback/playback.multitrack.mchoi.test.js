/**
 * Matthew Choi - multi-track lifecycle regression for the existing Howler seam.
 * Verifies actual replacement/unload behavior against a mocked Howl object.
 * Does not modify the buffering implementation owned by Allison Yu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeHowler = vi.hoisted(() => ({ instances: [] }));

vi.mock("howler", () => ({
    Howl: class MockHowl {
        constructor(config) {
            this.config = config;
            this.unload = vi.fn();
            this.play = vi.fn();
            this.pause = vi.fn();
            this.seek = vi.fn(() => 0);
            this.playing = vi.fn(() => false);
            this.duration = vi.fn(() => 180);
            this.volume = vi.fn();
            fakeHowler.instances.push(this);
        }
    }
}));

import { getLoadedTrackId, loadTrack, unloadMusic } from "./playback.js";

beforeEach(() => {
    // Previous tests should not leave an active module-level sound.
    unloadMusic();
    fakeHowler.instances.length = 0;
    vi.clearAllMocks();
});

afterEach(() => {
    unloadMusic();
    vi.useRealTimers();
});

describe("Matthew: single Howler instance across multiple tracks", () => {
    it("unloads each former sound when loading tracks 3005, 3006 and 3007", () => {
        loadTrack(3005);
        const first = fakeHowler.instances[0];
        expect(getLoadedTrackId()).toBe(3005);

        loadTrack(3006);
        const second = fakeHowler.instances[1];
        expect(first.unload).toHaveBeenCalledTimes(1);
        expect(getLoadedTrackId()).toBe(3006);

        loadTrack(3007);
        const third = fakeHowler.instances[2];
        expect(second.unload).toHaveBeenCalledTimes(1);
        expect(third.unload).not.toHaveBeenCalled();
        expect(getLoadedTrackId()).toBe(3007);
        expect(fakeHowler.instances.map((sound) => sound.config.src[0]))
            .toEqual([
                "/api/tracks/3005/stream",
                "/api/tracks/3006/stream",
                "/api/tracks/3007/stream"
            ]);
    });

    it("ignores the old Howl's events after a replacement is loaded", () => {
        const oldCallbacks = {
            onLoad: vi.fn(), onPlay: vi.fn(), onPause: vi.fn(),
            onEnd: vi.fn(), onProgress: vi.fn(), onError: vi.fn()
        };
        const newCallbacks = { onLoad: vi.fn(), onProgress: vi.fn() };
        loadTrack(3005, oldCallbacks);
        const old = fakeHowler.instances[0];
        loadTrack(3006, newCallbacks);
        const current = fakeHowler.instances[1];

        old.config.onload();
        old.config.onplay();
        old.config.onpause();
        old.config.onend();
        old.config.onseek();
        old.config.onloaderror(1);
        old.config.onplayerror(1);

        for (const callback of Object.values(oldCallbacks)) {
            expect(callback).not.toHaveBeenCalled();
        }
        expect(getLoadedTrackId()).toBe(3006);
        expect(current.unload).not.toHaveBeenCalled();
        current.config.onload();
        expect(newCallbacks.onLoad).toHaveBeenCalledTimes(1);
    });

    it("stops the previous playback progress timer on track replacement", () => {
        vi.useFakeTimers();
        loadTrack(3005);
        const old = fakeHowler.instances[0];
        old.config.onplay();
        expect(vi.getTimerCount()).toBe(1);

        loadTrack(3006);
        expect(old.unload).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("does not disturb the current track when an invalid ID is supplied", () => {
        loadTrack(3005);
        const active = fakeHowler.instances[0];
        expect(() => loadTrack(-1)).toThrow(TypeError);
        expect(getLoadedTrackId()).toBe(3005);
        expect(active.unload).not.toHaveBeenCalled();
        expect(fakeHowler.instances).toHaveLength(1);
    });

    it("clears the loaded ID and unloads the active instance on cleanup", () => {
        loadTrack(3007);
        const active = fakeHowler.instances[0];
        unloadMusic();
        expect(active.unload).toHaveBeenCalledTimes(1);
        expect(getLoadedTrackId()).toBeNull();
    });
});
