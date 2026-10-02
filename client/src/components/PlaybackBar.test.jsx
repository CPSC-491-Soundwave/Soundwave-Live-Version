import {
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

vi.mock(
    "../playback/playback.js",
    () => ({
        loadTrack: vi.fn(),
           playMusic: vi.fn(),
           pauseMusic: vi.fn(),
           setMusicVolume: vi.fn(),
           unloadMusic: vi.fn()
    })
);

describe("PlaybackBar", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        globalThis.fetch =
        vi.fn();
    });

    it(
        "renders the empty playback state",
       () => {
           render(
               <PlaybackBar />
           );

           expect(
               screen.getByText(
                   "Nothing Playing"
               )
           ).toBeInTheDocument();

           expect(
               screen.getByText(
                   "Select a track"
               )
           ).toBeInTheDocument();
       }
    );

    it(
        "fetches and displays Track metadata",
       async () => {
           fetch.mockResolvedValue({
               ok: true,

               json: async () => ({
                   id: 3005,
                   title: "Kontekst",
                   durationMs: 209136,

                   album: {
                       id: 2003,
                       title: "No Copyright"
                   },

                   artist: {
                       id: 1003,
                       name: "Buddha"
                   }
               })
           });

           render(
               <PlaybackBar
               trackId={3005}
               />
           );

           await waitFor(() => {
               expect(
                   screen.getByText(
                       "Kontekst"
                   )
               ).toBeInTheDocument();
           });

           expect(fetch).toHaveBeenCalledWith(
               "/api/catalog/tracks/3005"
           );

           expect(
               screen.getByText(
                   /Buddha/
               )
           ).toBeInTheDocument();

           expect(
               screen.getByText(
                   /No Copyright/
               )
           ).toBeInTheDocument();

           expect(
               loadTrack
           ).toHaveBeenCalledWith(
               3005
           );
       }
    );

    it(
        "plays and pauses the selected Track",
        async () => {
            fetch.mockResolvedValue({
                ok: true,

                json: async () => ({
                    id: 3005,
                    title: "Kontekst",
                    durationMs: 209136,

                    album: {
                        id: 2003,
                        title: "No Copyright"
                    },

                    artist: {
                        id: 1003,
                        name: "Buddha"
                    }
                })
            });

            render(
                <PlaybackBar
                trackId={3005}
                />
            );

            const playButton =
            await screen.findByRole(
                "button",
                {
                    name: "Play"
                }
            );

            fireEvent.click(
                playButton
            );

            expect(
                playMusic
            ).toHaveBeenCalledTimes(1);

            const pauseButton =
            screen.getByRole(
                "button",
                {
                    name: "Pause"
                }
            );

            fireEvent.click(
                pauseButton
            );

            expect(
                pauseMusic
            ).toHaveBeenCalledTimes(1);
        }
    );

    it(
        "updates playback volume",
        async () => {
            fetch.mockResolvedValue({
                ok: true,

                json: async () => ({
                    id: 3005,
                    title: "Kontekst",
                    durationMs: 209136,

                    album: {
                        id: 2003,
                        title: "No Copyright"
                    },

                    artist: {
                        id: 1003,
                        name: "Buddha"
                    }
                })
            });

            render(
                <PlaybackBar
                trackId={3005}
                />
            );

            const volume =
            await screen.findByRole(
                "slider",
                {
                    name: "Volume"
                }
            );

            fireEvent.change(
                volume,
                {
                    target: {
                        value: "0.8"
                    }
                }
            );

            expect(
                setMusicVolume
            ).toHaveBeenCalledWith(
                0.8
            );
        }
    );

    it(
        "shows a controlled error when metadata retrieval fails",
        async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 404
            });

            render(
                <PlaybackBar
                trackId={999999}
                />
            );

            expect(
                await screen.findByText(
                    "Playback unavailable"
                )
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    "Unable to load track."
                )
            ).toBeInTheDocument();

            expect(
                loadTrack
            ).not.toHaveBeenCalled();
        }
    );

    it(
        "unloads playback when the selected Track changes or the component unmounts",
        async () => {
            fetch.mockResolvedValue({
                ok: true,

                json: async () => ({
                    id: 3005,
                    title: "Kontekst",
                    durationMs: 209136,

                    album: {
                        id: 2003,
                        title: "No Copyright"
                    },

                    artist: {
                        id: 1003,
                        name: "Buddha"
                    }
                })
            });

            const {
                unmount
            } = render(
                <PlaybackBar
                trackId={3005}
                />
            );

            await waitFor(() => {
                expect(
                    loadTrack
                ).toHaveBeenCalledWith(
                    3005
                );
            });

            unmount();

            expect(
                unloadMusic
            ).toHaveBeenCalled();
        }
    );
});
