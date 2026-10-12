import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  MemoryRouter
} from "react-router-dom";

import App from "./App";

import {
  loadTrack,
  unloadMusic,
} from "./playback/playback.js";

vi.mock(
  "./playback/playback.js",
  () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(),
    setMusicVolume: vi.fn(),
    unloadMusic: vi.fn(),
  })
);

describe(
  "App search-to-playback integration",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      globalThis.fetch =
        vi.fn(async (url) => {
          if (
            url ===
            "/api/search?q=Kontekst&type=all"
          ) {
            return {
              ok: true,

              json: async () => ({
                query: "Kontekst",

                tracks: [
                  {
                    id: 3005,
                    title: "Kontekst",
                    durationMs: 12345,

                    album: {
                      id: 2003,
                      title:
                        "No Copyright",
                    },

                    artist: {
                      id: 1003,
                      name: "Buddha",
                    },
                  },
                ],

                artists: [],
                albums: [],
              }),
            };
          }

          if (
            url ===
            "/api/catalog/tracks/3005"
          ) {
            return {
              ok: true,

              json: async () => ({
                id: 3005,
                title: "Kontekst",
                durationMs: 12345,

                album: {
                  id: 2003,
                  title: "No Copyright",
                },

                artist: {
                  id: 1003,
                  name: "Buddha",
                },
              }),
            };
          }

          throw new Error(
            `Unexpected request: ${url}`
          );
        });
    });

    it(
      "moves a Search Track selection into the shared PlaybackBar",
      async () => {
        render(
          <MemoryRouter
            initialEntries={[
              "/search"
            ]}
          >
            <App />
          </MemoryRouter>
        );

        fireEvent.change(
          screen.getByLabelText(
            "Search the catalog"
          ),
          {
            target: {
              value: "Kontekst"
            }
          }
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Search"
            }
          )
        );

        expect(
          await screen.findByText(
            "Kontekst"
          )
        ).toBeInTheDocument();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Play Kontekst"
            }
          )
        );

        await waitFor(() => {
          expect(
            loadTrack
          ).toHaveBeenCalledWith(
            3005,
            expect.objectContaining({
              onError:
                expect.any(
                  Function
                )
            })
          );
        });

        expect(
          globalThis.fetch
        ).toHaveBeenCalledWith(
          "/api/catalog/tracks/3005"
        );

        expect(
          screen.getByText(
            "Buddha"
          )
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "No Copyright"
          )
        ).toBeInTheDocument();
      }
    );

    it(
      "surfaces a playback failure for a Track selected from Search and resets playing state",
      async () => {
        render(
          <MemoryRouter
            initialEntries={[
              "/search"
            ]}
          >
            <App />
          </MemoryRouter>
        );

        fireEvent.change(
          screen.getByLabelText(
            "Search the catalog"
          ),
          {
            target: {
              value: "Kontekst"
            }
          }
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Search"
            }
          )
        );

        expect(
          await screen.findByText(
            "Kontekst"
          )
        ).toBeInTheDocument();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Play Kontekst"
            }
          )
        );

        await waitFor(() => {
          expect(
            loadTrack
          ).toHaveBeenCalledWith(
            3005,
            expect.objectContaining({
              onError:
                expect.any(
                  Function
                )
            })
          );
        });

        const playbackOptions =
          loadTrack.mock.calls[0][1];

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
          screen.getByRole(
            "button",
            {
              name: "Pause"
            }
          )
        ).toBeInTheDocument();

        act(() => {
          playbackOptions.onError({
            type: "play",
            trackId: 3005,
            soundId: null,
            error:
              "MEDIA_ERR_SRC_NOT_SUPPORTED"
          });
        });

        expect(
          await screen.findByText(
            "Playback unavailable"
          )
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "Unable to play this track."
          )
        ).toBeInTheDocument();

        expect(
          screen.queryByRole(
            "button",
            {
              name: "Pause"
            }
          )
        ).not.toBeInTheDocument();

        expect(
          unloadMusic
        ).toHaveBeenCalled();
      }
    );

    it(
      "stops before media loading when selected Track metadata retrieval fails",
      async () => {
        globalThis.fetch =
          vi.fn(async (url) => {
            if (
              url ===
              "/api/search?q=Kontekst&type=all"
            ) {
              return {
                ok: true,

                json: async () => ({
                  query: "Kontekst",

                  tracks: [
                    {
                      id: 3005,
                      title: "Kontekst",
                      durationMs: 12345,

                      album: {
                        id: 2003,
                        title:
                          "No Copyright",
                      },

                      artist: {
                        id: 1003,
                        name: "Buddha",
                      },
                    },
                  ],

                  artists: [],
                  albums: [],
                }),
              };
            }

            if (
              url ===
              "/api/catalog/tracks/3005"
            ) {
              return {
                ok: false,
                status: 404,
              };
            }

            throw new Error(
              `Unexpected request: ${url}`
            );
          });

        render(
          <MemoryRouter
            initialEntries={[
              "/search"
            ]}
          >
            <App />
          </MemoryRouter>
        );

        fireEvent.change(
          screen.getByLabelText(
            "Search the catalog"
          ),
          {
            target: {
              value: "Kontekst"
            }
          }
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Search"
            }
          )
        );

        expect(
          await screen.findByText(
            "Kontekst"
          )
        ).toBeInTheDocument();

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Play Kontekst"
            }
          )
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
          globalThis.fetch
        ).toHaveBeenCalledWith(
          "/api/catalog/tracks/3005"
        );

        expect(
          loadTrack
        ).not.toHaveBeenCalled();
      }
    );
  }
);
