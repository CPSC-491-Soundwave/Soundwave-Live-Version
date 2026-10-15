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

vi.mock(
  "./pages/Login",
  () => ({
    default: ({
      setAccessToken
    }) => (
      <button
        type="button"
        onClick={() => {
          setAccessToken(
            "test-access-token"
          );
        }}
      >
        Set test session
      </button>
    ),
  })
);

vi.mock(
  "./components/SessionStatus",
  () => ({
    default: ({
      accessToken
    }) => (
      <span
        data-testid="session-token"
      >
        {accessToken || "none"}
      </span>
    ),
  })
);

import App from "./App";

const ACCESS_TOKEN =
  "test-access-token";

const TRACK_METADATA = {
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
};

function configureFetch({
  metadataStatus = 200,
  mediaAccessStatus = 204,
} = {}) {
  globalThis.fetch =
    vi.fn(
      async (
        url
      ) => {
        if (
          url ===
          "/api/search?q=Kontekst&type=all"
        ) {
          return {
            ok: true,

            json: async () => ({
              query: "Kontekst",

              tracks: [
                TRACK_METADATA,
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
          if (
            metadataStatus !==
            200
          ) {
            return {
              ok: false,
              status:
                metadataStatus,
            };
          }

          return {
            ok: true,
            status: 200,

            json: async () =>
              TRACK_METADATA,
          };
        }

        if (
          url ===
          "/api/tracks/3005/media-access"
        ) {
          return {
            ok:
              mediaAccessStatus >= 200 &&
              mediaAccessStatus < 300,

            status:
              mediaAccessStatus,
          };
        }

        throw new Error(
          `Unexpected request: ${url}`
        );
      }
    );
}

function renderAuthenticatedApp() {
  render(
    <MemoryRouter
      initialEntries={[
        "/login"
      ]}
    >
      <App />
    </MemoryRouter>
  );

  fireEvent.click(
    screen.getByRole(
      "button",
      {
        name:
          "Set test session"
      }
    )
  );

  expect(
    screen.getByTestId(
      "session-token"
    )
  ).toHaveTextContent(
    ACCESS_TOKEN
  );

  fireEvent.click(
    screen.getByRole(
      "link",
      {
        name: "Search"
      }
    )
  );
}

async function searchAndSelectTrack() {
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
        name:
          "Play Kontekst"
      }
    )
  );
}

describe(
  "App search-to-playback integration",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      configureFetch();
    });

    it(
      "moves an authenticated Search Track selection into protected playback",
      async () => {
        renderAuthenticatedApp();

        await searchAndSelectTrack();

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
          globalThis.fetch
        ).toHaveBeenCalledWith(
          "/api/tracks/3005/media-access",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${ACCESS_TOKEN}`
            },

            credentials:
              "same-origin"
          }
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

        expect(
          screen.getByTestId(
            "session-token"
          )
        ).toHaveTextContent(
          ACCESS_TOKEN
        );
      }
    );

    it(
      "surfaces a playback failure after protected media access and resets playing state",
      async () => {
        renderAuthenticatedApp();

        await searchAndSelectTrack();

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

        expect(
          screen.getByTestId(
            "session-token"
          )
        ).toHaveTextContent(
          ACCESS_TOKEN
        );
      }
    );

    it(
      "stops before media access when selected Track metadata retrieval fails",
      async () => {
        configureFetch({
          metadataStatus: 404,
        });

        renderAuthenticatedApp();

        await searchAndSelectTrack();

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
          globalThis.fetch
        ).not.toHaveBeenCalledWith(
          "/api/tracks/3005/media-access",
          expect.anything()
        );

        expect(
          loadTrack
        ).not.toHaveBeenCalled();

        expect(
          screen.getByTestId(
            "session-token"
          )
        ).toHaveTextContent(
          ACCESS_TOKEN
        );
      }
    );

    it(
      "clears the active session when protected media access returns 401",
      async () => {
        configureFetch({
          mediaAccessStatus: 401,
        });

        renderAuthenticatedApp();

        await searchAndSelectTrack();

        expect(
          await screen.findByText(
            "Playback unavailable"
          )
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "Please log in to play this track."
          )
        ).toBeInTheDocument();

        await waitFor(() => {
          expect(
            screen.getByTestId(
              "session-token"
            )
          ).toHaveTextContent(
            "none"
          );
        });

        expect(
          loadTrack
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "preserves the active session when protected media access returns 403",
      async () => {
        configureFetch({
          mediaAccessStatus: 403,
        });

        renderAuthenticatedApp();

        await searchAndSelectTrack();

        expect(
          await screen.findByText(
            "Playback unavailable"
          )
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "You do not have access to play this track."
          )
        ).toBeInTheDocument();

        expect(
          screen.getByTestId(
            "session-token"
          )
        ).toHaveTextContent(
          ACCESS_TOKEN
        );

        expect(
          loadTrack
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "preserves the active session when playback authentication is temporarily unavailable",
      async () => {
        configureFetch({
          mediaAccessStatus: 503,
        });

        renderAuthenticatedApp();

        await searchAndSelectTrack();

        expect(
          await screen.findByText(
            "Playback unavailable"
          )
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "Playback authentication is temporarily unavailable."
          )
        ).toBeInTheDocument();

        expect(
          screen.getByTestId(
            "session-token"
          )
        ).toHaveTextContent(
          ACCESS_TOKEN
        );

        expect(
          loadTrack
        ).not.toHaveBeenCalled();
      }
    );
  }
);
