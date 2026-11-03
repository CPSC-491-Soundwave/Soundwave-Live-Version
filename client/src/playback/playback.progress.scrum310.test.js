/**
 * SCRUM-310 / Christian McGowan / Sprint 4 Block B3
 * Real playback-module progress and seek lifecycle contracts.
 *
 * Exercises the production playback.js module through a
 * controlled Howler mock. No backend, queue, or buffering
 * implementation changes.
 */
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

const fake = vi.hoisted(() => ({
    instances: []
}));

vi.mock("howler", () => ({
    Howl: class {
        constructor(options) {
            this.options = options;
            this.position = 0;
            this.mediaDuration = 209;
            this.active = false;
            fake.instances.push(this);
        }

        duration() {
            return this.mediaDuration;
        }

        seek(value) {
            if (arguments.length === 0) {
                return this.position;
            }

            this.position = value;
            this.options.onseek?.();
            return this.position;
        }

        playing() {
            return this.active;
        }

        play() {
            this.active = true;
            return 1;
        }

        pause() {
            this.active = false;
            this.options.onpause?.();
        }

        unload() {
            this.active = false;
        }
    }
}));

import {
    loadTrack,
    playMusic,
    setMusicProgress,
    unloadMusic
} from "./playback.js";

beforeEach(() => {
    vi.useFakeTimers();
    fake.instances.length = 0;
});

afterEach(() => {
    unloadMusic();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("SCRUM-310 real playback progress lifecycle", () => {
    it("B3-T08: reports actual duration when audio loads", () => {
        const onProgress = vi.fn();
        loadTrack(3005, { onProgress });

        const sound = fake.instances[0];
        sound.options.onload();

        expect(onProgress).toHaveBeenLastCalledWith({
            positionSeconds: 0,
            durationSeconds: 209
        });
    });

    it("B3-T09: reports advancing position using existing monitor", () => {
        const onProgress = vi.fn();
        loadTrack(3005, { onProgress });

        const sound = fake.instances[0];

        playMusic();
        sound.options.onplay();

        sound.position = 3.25;
        vi.advanceTimersByTime(500);

        expect(onProgress).toHaveBeenLastCalledWith({
            positionSeconds: 3.25,
            durationSeconds: 209
        });
    });

    it("B3-T10: emits progress for seeking while paused", () => {
        const onProgress = vi.fn();
        loadTrack(3005, { onProgress });

        const sound = fake.instances[0];

        expect(sound.active).toBe(false);
        expect(setMusicProgress(73)).toBe(true);

        expect(sound.position).toBe(73);
        expect(sound.active).toBe(false);
        expect(onProgress).toHaveBeenLastCalledWith({
            positionSeconds: 73,
            durationSeconds: 209
        });
    });

    it("B3-T11: drops obsolete progress after track replacement", () => {
        const oldProgress = vi.fn();
        const newProgress = vi.fn();

        loadTrack(3005, { onProgress: oldProgress });
        const oldSound = fake.instances[0];

        oldSound.options.onload();
        playMusic();
        oldSound.options.onplay();

        loadTrack(3004, { onProgress: newProgress });
        const newSound = fake.instances[1];

        const oldCallCount = oldProgress.mock.calls.length;

        oldSound.seek(180);
        oldSound.options.onload();
        oldSound.options.onplay();
        vi.advanceTimersByTime(1000);

        expect(oldProgress).toHaveBeenCalledTimes(oldCallCount);

        newSound.mediaDuration = 222;
        newSound.options.onload();

        expect(newProgress).toHaveBeenLastCalledWith({
            positionSeconds: 0,
            durationSeconds: 222
        });
    });

    it("B3-T12: stops progress after player unload", () => {
        const onProgress = vi.fn();

        loadTrack(3005, { onProgress });
        const sound = fake.instances[0];

        playMusic();
        sound.options.onplay();

        unloadMusic();
        const count = onProgress.mock.calls.length;

        sound.seek(90);
        sound.options.onload();
        vi.advanceTimersByTime(2000);

        expect(onProgress).toHaveBeenCalledTimes(count);
    });

    it("B3-T13: rejects invalid seek positions", () => {
        expect(setMusicProgress(12)).toBe(false);

        loadTrack(3005);

        expect(() => setMusicProgress(-1)).toThrow(RangeError);
        expect(() => setMusicProgress(Infinity)).toThrow(RangeError);
        expect(() => setMusicProgress(NaN)).toThrow(RangeError);

        expect(fake.instances[0].position).toBe(0);
    });
});
