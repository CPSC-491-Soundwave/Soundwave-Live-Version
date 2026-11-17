import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

const { createdHowls } = vi.hoisted(() => ({
    createdHowls: []
}));

vi.mock("howler", () => ({
    Howl: class MockHowl {
        constructor(options) {
            this.options = options;
            createdHowls.push(this);
        }

        unload() {}
    }
}));

import {
    loadTrack,
    unloadMusic
} from "./playback.js";

const SYNTHETIC_SECRET =
    "SYNTHETIC_TOKEN_DO_NOT_LOG";

const SYNTHETIC_PATH =
    "/private/synthetic/media/path";

afterEach(() => {
    unloadMusic();
    createdHowls.length = 0;
    vi.restoreAllMocks();
});

describe(
    "SOC 2 AC-07 — Native playback diagnostic confidentiality",
    () => {
        it.each([
            [
                "load",
                "onloaderror",
                "MEDIA_LOAD_FAILED"
            ],
            [
                "play",
                "onplayerror",
                "MEDIA_PLAY_FAILED"
            ]
        ])(
            "does not expose synthetic secrets in %s errors",
            (errorType, eventName, expectedCode) => {
                const errorSpy = vi
                    .spyOn(console, "error")
                    .mockImplementation(() => {});

                const onError = vi.fn();

                loadTrack(3005, {
                    onError
                });

                const howl = createdHowls[0];

                expect(howl).toBeDefined();

                const syntheticError = new Error(
                    `Synthetic failure: ${SYNTHETIC_SECRET} ${SYNTHETIC_PATH}`
                );

                // Simulate a native Howler failure.
                howl.options[eventName](
                    17,
                    syntheticError
                );

                // The callback still receives the
                // existing playback event context.
                expect(onError).toHaveBeenCalledTimes(1);

                expect(onError).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: errorType,
                        trackId: 3005,
                        soundId: 17,
                        error: {
                            code: expectedCode,
                            message: "Unable to play this track."
                        }
                    })
                );

                // Inspect every argument provided
                // to console.error.
                const loggedOutput = errorSpy.mock.calls
                    .flatMap((args) =>
                        args.map((value) =>
                            String(value)
                        )
                    )
                    .join(" ");

                expect(loggedOutput).toContain(
                    expectedCode
                );

                expect(loggedOutput).not.toContain(
                    SYNTHETIC_SECRET
                );

                expect(loggedOutput).not.toContain(
                    SYNTHETIC_PATH
                );

                // Inspect the callback output too.
                // Sanitizing console logs alone
                // would not satisfy this assertion.
                const callbackOutput = JSON.stringify(
                    onError.mock.calls[0][0]
                );

                expect(callbackOutput).not.toContain(
                    SYNTHETIC_SECRET
                );

                expect(callbackOutput).not.toContain(
                    SYNTHETIC_PATH
                );

                expect(callbackOutput).toContain(
                    expectedCode
                );
            }
        );
    }
);
