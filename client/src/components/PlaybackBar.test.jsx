
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor
} from "@testing-library/react";

import {
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
    pauseMusic,
    setMusicVolume,
    unloadMusic
} from "../playback/playback.js";

vi.mock("../playback/playback.js", () => ({
    loadTrack: vi.fn(),
                                          playMusic: vi.fn(),
                                          pauseMusic: vi.fn(),
                                          setMusicVolume: vi.fn(),
                                          unloadMusic: vi.fn()
}));

import {
    reportPlaybackEvent
} from "../playback/playbackEvents.js";

vi.mock("../playback/playbackEvents.js", () => ({
    reportPlaybackEvent: vi.fn()
}));

vi.mock("../playback/playbackEvents.js", () => ({
    reportPlaybackEvent: vi.fn().mockResolvedValue({
        ok: true,
        status: 201
    })
}));

const ACCESS_TOKEN = "test-access-token";

const TRACK_METADATA = {
    id: 3005,
    title: "Kontekst",
    durationMs: 12345,
    album: {
        id: 2003,
        title: "No Copyright"
    },
    artist: {
        id: 1003,
        name: "Buddha"
    }
};

function queueSuccessfulPlaybackPreparation() {
    globalThis.fetch
    .mockResolvedValueOnce({
        ok: true,
        json: async () => TRACK_METADATA
    })
    .mockResolvedValueOnce({
        ok: true,
        status: 204
    });
}

describe("PlaybackBar", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        globalThis.fetch = vi.fn();

        playMusic.mockReturnValue(true);
        reportPlaybackEvent.mockResolvedValue({ ok: true, status: 201 });
    });

    it("renders the empty playback state", () => {
        render(
            <PlaybackBar accessToken={ACCESS_TOKEN} />
        );

        expect(
            screen.getByText("Nothing Playing")
        ).toBeInTheDocument();

        expect(
            screen.getByText("Select a track")
        ).toBeInTheDocument();

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    // SCRUM-171: Unavailable media produces a visible error.
    it(
        "shows a visible error when a catalog track has no playable media",
       async () => {
           const onSessionInvalidated = vi.fn();

           globalThis.fetch
           .mockResolvedValueOnce({
               ok: true,
               json: async () => ({
                   ...TRACK_METADATA,
                   id: 3001,
                   title: "Fixture Track One"
               })
           })
           .mockResolvedValueOnce({
               ok: false,
               status: 404
           });

           render(
               <PlaybackBar
               trackId={3001}
               accessToken={ACCESS_TOKEN}
               onSessionInvalidated={onSessionInvalidated}
               />
           );

           expect(
               await screen.findByText("Playback unavailable")
           ).toBeInTheDocument();

           expect(
               screen.getByText("Unable to prepare playback.")
           ).toBeInTheDocument();

           expect(
               globalThis.fetch
           ).toHaveBeenNthCalledWith(
               1,
               "/api/catalog/tracks/3001"
           );

           expect(
               globalThis.fetch
           ).toHaveBeenNthCalledWith(
               2,
               "/api/tracks/3001/media-access",
               expect.objectContaining({
                   method: "POST"
               })
           );

           expect(loadTrack).not.toHaveBeenCalled();

           expect(
               onSessionInvalidated
           ).not.toHaveBeenCalled();
       }
    );

    it(
        "requires a login before preparing protected playback",
        async () => {
            const onSessionInvalidated = vi.fn();

            render(
                <PlaybackBar
                trackId={3005}
                accessToken=""
                onSessionInvalidated={onSessionInvalidated}
                />
            );

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.getByText("Please log in to play this track.")
            ).toBeInTheDocument();

            expect(globalThis.fetch).not.toHaveBeenCalled();
            expect(loadTrack).not.toHaveBeenCalled();
            expect(onSessionInvalidated).not.toHaveBeenCalled();
        }
    );

    it(
        "loads Track metadata and starts playback preparation after media access is granted",
        async () => {
            queueSuccessfulPlaybackPreparation();

            render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                />
            );

            expect(
                await screen.findByText("Kontekst")
            ).toBeInTheDocument();

            expect(
                globalThis.fetch
            ).toHaveBeenNthCalledWith(
                1,
                "/api/catalog/tracks/3005"
            );

            expect(
                globalThis.fetch
            ).toHaveBeenNthCalledWith(
                2,
                "/api/tracks/3005/media-access",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${ACCESS_TOKEN}`
                    },
                    credentials: "same-origin"
                }
            );

            expect(
                screen.getByText(/Buddha/)
            ).toBeInTheDocument();

            expect(
                screen.getByText(/No Copyright/)
            ).toBeInTheDocument();

            expect(loadTrack).toHaveBeenCalledWith(
                3005,
                expect.objectContaining({
                    onError: expect.any(Function)
                })
            );
        }
    );


    it(
        "updates playing and paused states from Howler events",
        async () => {
            queueSuccessfulPlaybackPreparation();

            render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                />
            );

            const playButton =
            await screen.findByRole(
                "button",
                {
                    name: "Play"
                }
            );

            const callbacks =
            loadTrack.mock.calls[0][1];

            fireEvent.click(
                playButton
            );

            expect(
                playMusic
            ).toHaveBeenCalledTimes(1);

            // Clicking Play must not immediately
            // claim that audio has started.
            expect(
                screen.getByRole(
                    "button",
                    {
                        name: "Play"
                    }
                )
            ).toBeInTheDocument();

            act(() => {
                callbacks.onPlay();
            });

            expect(
                screen.getByRole(
                    "button",
                    {
                        name: "Pause"
                    }
                )
            ).toBeInTheDocument();

            expect(
                screen.getByRole("status")
            ).toHaveTextContent("Playing");

            fireEvent.click(
                screen.getByRole(
                    "button",
                    {
                        name: "Pause"
                    }
                )
            );

            expect(
                pauseMusic
            ).toHaveBeenCalledTimes(1);

            act(() => {
                callbacks.onPause();
            });

            expect(
                screen.getByRole("status")
            ).toHaveTextContent("Paused");

            expect(
                screen.getByRole(
                    "button",
                    {
                        name: "Play"
                    }
                )
            ).toBeInTheDocument();

            act(() => {
                callbacks.onPlay();
                callbacks.onEnd();
            });

            expect(
                screen.getByRole("status")
            ).toHaveTextContent("Finished");
        }
    );



    // SCRUM-297: Track a confirmed playback, never an unconfirmed click.
    it("records one play event only after Howler confirms the request", async () => {
        queueSuccessfulPlaybackPreparation();

        render(
            <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
            />
        );

        const playButton = await screen.findByRole("button", { name: "Play" });
        const callbacks = loadTrack.mock.calls[0][1];

        fireEvent.click(playButton);
        expect(reportPlaybackEvent).not.toHaveBeenCalled();

        act(() => {
            callbacks.onPlay();
        });

        expect(reportPlaybackEvent).toHaveBeenCalledTimes(1);
        expect(reportPlaybackEvent).toHaveBeenCalledWith({
            trackId: 3005,
            accessToken: ACCESS_TOKEN,
            eventType: "play"
        });

        // A repeated callback without a new Play command is ignored.
        act(() => {
            callbacks.onPlay();
        });

        expect(reportPlaybackEvent).toHaveBeenCalledTimes(1);
    });

    it("does not report a play event for an unconfirmed player command", async () => {
        queueSuccessfulPlaybackPreparation();
        playMusic.mockReturnValue(false);

        render(
            <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
            />
        );

        const playButton = await screen.findByRole("button", { name: "Play" });
        fireEvent.click(playButton);

        expect(reportPlaybackEvent).not.toHaveBeenCalled();
        expect(screen.getByText("Unable to play this track.")).toBeInTheDocument();
    });

    it("keeps audio playing when event reporting is unavailable", async () => {
        queueSuccessfulPlaybackPreparation();
        reportPlaybackEvent.mockResolvedValue({ ok: false, status: 503 });

        render(
            <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
            />
        );

        const playButton = await screen.findByRole("button", { name: "Play" });
        const callbacks = loadTrack.mock.calls[0][1];

        fireEvent.click(playButton);
        act(() => {
            callbacks.onPlay();
        });

        expect(reportPlaybackEvent).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("status")).toHaveTextContent("Playing");
        expect(unloadMusic).not.toHaveBeenCalled();
    });

    it("reports playback only after confirmed Play", async () => {
        queueSuccessfulPlaybackPreparation();

        render(
            <PlaybackBar
            trackId={3005}
            accessToken={ACCESS_TOKEN}
            />
        );

        const playButton = await screen.findByRole(
            "button",
            { name: "Play" }
        );

        const callbacks = loadTrack.mock.calls[0][1];

        fireEvent.click(playButton);

        // Clicking Play alone must not record an event.
        expect(reportPlaybackEvent).not.toHaveBeenCalled();

        act(() => {
            callbacks.onPlay();
            callbacks.onPlay();
        });

        // Duplicate callbacks must not create extra events.
        expect(reportPlaybackEvent).toHaveBeenCalledTimes(1);

        expect(reportPlaybackEvent).toHaveBeenCalledWith({
            trackId: 3005,
            accessToken: ACCESS_TOKEN,
            eventType: "play"
        });

        expect(
            screen.getByRole("status")
        ).toHaveTextContent("Playing");
    });

    it("updates playback volume", async () => {
        queueSuccessfulPlaybackPreparation();

        render(
            <PlaybackBar
            trackId={3005}
            accessToken={ACCESS_TOKEN}
            />
        );

        const volume = await screen.findByRole(
            "slider",
            { name: "Volume" }
        );

        fireEvent.change(volume, {
            target: {
                value: "0.8"
            }
        });

        expect(setMusicVolume).toHaveBeenCalledWith(0.8);
    });

    it(
        "shows a controlled error when metadata retrieval fails",
        async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404
            });

            render(
                <PlaybackBar
                trackId={999999}
                accessToken={ACCESS_TOKEN}
                />
            );

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.getByText("Unable to load track.")
            ).toBeInTheDocument();

            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            expect(loadTrack).not.toHaveBeenCalled();
        }
    );

    it(
        "invalidates the current session when media access returns 401",
        async () => {
            const onSessionInvalidated = vi.fn();

            globalThis.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => TRACK_METADATA
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 401
            });

            render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                onSessionInvalidated={onSessionInvalidated}
                />
            );

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.getByText("Please log in to play this track.")
            ).toBeInTheDocument();

            expect(
                onSessionInvalidated
            ).toHaveBeenCalledWith(ACCESS_TOKEN);

            expect(loadTrack).not.toHaveBeenCalled();
        }
    );

    it(
        "preserves the session when media access returns 403",
        async () => {
            const onSessionInvalidated = vi.fn();

            globalThis.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => TRACK_METADATA
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 403
            });

            render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                onSessionInvalidated={onSessionInvalidated}
                />
            );

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    "You do not have access to play this track."
                )
            ).toBeInTheDocument();

            expect(
                onSessionInvalidated
            ).not.toHaveBeenCalled();

            expect(loadTrack).not.toHaveBeenCalled();
        }
    );

    it(
        "preserves the session when playback authentication is temporarily unavailable",
        async () => {
            const onSessionInvalidated = vi.fn();

            globalThis.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => TRACK_METADATA
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 503
            });

            render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                onSessionInvalidated={onSessionInvalidated}
                />
            );

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    "Playback authentication is temporarily unavailable."
                )
            ).toBeInTheDocument();

            expect(
                onSessionInvalidated
            ).not.toHaveBeenCalled();

            expect(loadTrack).not.toHaveBeenCalled();
        }
    );

    it(
        "shows a controlled error for an unexpected media-access response",
        async () => {
            const onSessionInvalidated = vi.fn();

            globalThis.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => TRACK_METADATA
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                onSessionInvalidated={onSessionInvalidated}
                />
            );

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.getByText("Unable to prepare playback.")
            ).toBeInTheDocument();

            expect(
                onSessionInvalidated
            ).not.toHaveBeenCalled();

            expect(loadTrack).not.toHaveBeenCalled();
        }
    );

    it(
        "shows a controlled error when media playback fails after access is granted",
        async () => {
            queueSuccessfulPlaybackPreparation();

            render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                />
            );

            await waitFor(() => {
                expect(loadTrack).toHaveBeenCalledWith(
                    3005,
                    expect.objectContaining({
                        onError: expect.any(Function)
                    })
                );
            });

            const playbackOptions = loadTrack.mock.calls[0][1];

            act(() => {
                playbackOptions.onError({
                    type: "load",
                    trackId: 3005,
                    soundId: null,
                    error: "MEDIA_ERR_SRC_NOT_SUPPORTED"
                });
            });

            expect(
                await screen.findByText("Playback unavailable")
            ).toBeInTheDocument();

            expect(
                screen.getByText("Unable to play this track.")
            ).toBeInTheDocument();

            expect(unloadMusic).toHaveBeenCalled();
        }
    );

    it(
        "unloads playback when the selected Track changes or the component unmounts",
        async () => {
            queueSuccessfulPlaybackPreparation();

            const { unmount } = render(
                <PlaybackBar
                trackId={3005}
                accessToken={ACCESS_TOKEN}
                />
            );

            await waitFor(() => {
                expect(loadTrack).toHaveBeenCalledWith(
                    3005,
                    expect.objectContaining({
                        onError: expect.any(Function)
                    })
                );
            });

            unmount();

            expect(unloadMusic).toHaveBeenCalled();
        }
    );
});
