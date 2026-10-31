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
            this.active = false;
            fake.instances.push(this);
        }

        play() {
            this.active = true;
            return 1;
        }

        playing() {
            return this.active;
        }

        seek() {
            return this.position;
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

describe("SCRUM-293 playback progress monitor", () => {
    it("detects stalled progress and recovery", () => {
        const onBuffering = vi.fn();
        const onRecovered = vi.fn();

        loadTrack(3005, {
            onBuffering,
            onRecovered
        });

        const sound = fake.instances[0];

        playMusic();
        sound.options.onplay();

        vi.advanceTimersByTime(1000);

        sound.position = 1;
        vi.advanceTimersByTime(500);

        expect(onBuffering).not.toHaveBeenCalled();

        // 2.5 seconds without progress.
        vi.advanceTimersByTime(2500);

        expect(onBuffering).toHaveBeenCalledTimes(1);

        // Simulate media progress resuming.
        sound.position = 2;
        vi.advanceTimersByTime(500);

        expect(onRecovered).toHaveBeenCalledTimes(1);

        // Do not report a second stall immediately.
        expect(onBuffering).toHaveBeenCalledTimes(1);
    });

    it("stops monitoring when playback is unloaded", () => {
        const onBuffering = vi.fn();

        loadTrack(3005, { onBuffering });

        const sound = fake.instances[0];

        playMusic();
        sound.options.onplay();

        unloadMusic();

        vi.advanceTimersByTime(5000);

        expect(onBuffering).not.toHaveBeenCalled();
    });
});