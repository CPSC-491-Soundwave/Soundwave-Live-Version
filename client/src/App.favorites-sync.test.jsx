import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { MemoryRouter } from "react-router-dom";

import App from "./App.jsx";

import {
  loadTrack,
  playMusic,
  pauseMusic
} from "./playback/playback.js";

vi.mock("./playback/playback.js", () => ({
  loadTrack: vi.fn(),
  playMusic: vi.fn(() => true),
  pauseMusic: vi.fn(),
  unloadMusic: vi.fn(),
  setMusicVolume: vi.fn(),
  setMusicProgress: vi.fn(() => true)
}));

vi.mock("./components/SessionStatus", () => ({
  default: () => null
}));

vi.mock("./pages/Login", () => ({
  default: ({ setAccessToken }) => (
    <button
      type="button"
      onClick={() => setAccessToken("sync-test-token")}
    >
      Set test session
    </button>
  )
}));

const TRACK = {
  id: 3005,
  title: "Kontekst",
  durationMs: 12345,
  artist: {
    id: 1003,
    name: "Buddha"
  },
  album: {
    id: 2003,
    title: "No Copyright"
  }
};

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

function installApi() {
  const saved = new Set();

  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? "GET";

    if (url === "/api/library/recently-added") {
      return response(200, [TRACK]);
    }

    if (
      url === "/api/library/favorites" &&
      method === "GET"
    ) {
      return response(
        200,
        saved.has(TRACK.id) ? [TRACK] : []
      );
    }

    if (url === `/api/catalog/tracks/${TRACK.id}`) {
      return response(200, TRACK);
    }

    if (
      url === `/api/tracks/${TRACK.id}/media-access`
    ) {
      return response(204, null);
    }

    if (
      url === `/api/library/favorites/${TRACK.id}` &&
      method === "PUT"
    ) {
      saved.add(TRACK.id);
      return response(204, null);
    }

    if (
      url === `/api/library/favorites/${TRACK.id}` &&
      method === "DELETE"
    ) {
      saved.delete(TRACK.id);
      return response(204, null);
    }

    throw new Error(`Unexpected ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    saved,
    fetchMock
  };
}

function openAuthenticatedLibrary() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Set test session"
    })
  );

  fireEvent.click(
    screen.getByRole("link", {
      name: "Library"
    })
  );
}

async function selectKontekst() {
  const recentlyAdded =
    await screen.findByLabelText(
      "Recently added tracks"
    );

  fireEvent.click(
    within(recentlyAdded).getByRole("button", {
      name: "Select Kontekst"
    })
  );

  const player = screen.getByRole("contentinfo");

  await within(player).findByRole("button", {
    name: "Add Kontekst to Favorites"
  });

  return {
    recentlyAdded,
    player,
    favorites: screen.getByRole("region", {
      name: "Favorite Tracks"
    })
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SCRUM-362 cross-view Favorites synchronization", () => {
  it(
    "updates an already-mounted Library when the Playback Bar heart changes",
    async () => {
      const { saved, fetchMock } = installApi();

      openAuthenticatedLibrary();

      const {
        recentlyAdded,
        player,
        favorites
      } = await selectKontekst();

      // Playback Bar adds Kontekst to Favorites.
      const playerAdd =
        within(player).getByRole("button", {
          name: "Add Kontekst to Favorites"
        });

      expect(playerAdd).toBeEnabled();

      fireEvent.click(playerAdd);

      // Favorite Tracks updates without route navigation.
      expect(
        await within(favorites).findByRole(
          "button",
          {
            name: "Remove Kontekst from Favorites"
          }
        )
      ).toBeInTheDocument();

      // Recently Added updates its own heart.
      await waitFor(() => {
        expect(
          within(recentlyAdded).getByRole(
            "button",
            {
              name: "Unfavorite Kontekst"
            }
          )
        ).toBeEnabled();
      });

      expect(saved.has(TRACK.id)).toBe(true);

      // Playback Bar removes Kontekst.
      const playerRemove =
        await within(player).findByRole("button", {
          name: "Unfavorite Kontekst"
        });

      fireEvent.click(playerRemove);

      await waitFor(() => {
        expect(
          within(favorites).queryByRole(
            "button",
            {
              name: "Remove Kontekst from Favorites"
            }
          )
        ).not.toBeInTheDocument();

        expect(
          within(recentlyAdded).getByRole(
            "button",
            {
              name: "Add Kontekst to Favorites"
            }
          )
        ).toBeEnabled();
      });

      expect(saved.has(TRACK.id)).toBe(false);

      expect(
        fetchMock.mock.calls.filter(
          ([, options]) => options?.method === "PUT"
        )
      ).toHaveLength(1);

      expect(
        fetchMock.mock.calls.filter(
          ([, options]) => options?.method === "DELETE"
        )
      ).toHaveLength(1);

      // Favorite operations never restart audio.
      expect(loadTrack).toHaveBeenCalledTimes(1);
      expect(playMusic).not.toHaveBeenCalled();
      expect(pauseMusic).not.toHaveBeenCalled();
    }
  );

  it(
    "updates the Playback Bar when Library Favorites are changed",
    async () => {
      const { saved } = installApi();

      openAuthenticatedLibrary();

      const {
        recentlyAdded,
        player,
        favorites
      } = await selectKontekst();

      const recentAdd =
        within(recentlyAdded).getByRole("button", {
          name: "Add Kontekst to Favorites"
        });

      await waitFor(() => {
        expect(recentAdd).toBeEnabled();
      });

      // Add from Recently Added.
      fireEvent.click(recentAdd);

      await waitFor(() => {
        expect(
          within(player).getByRole("button", {
            name: "Unfavorite Kontekst"
          })
        ).toHaveAttribute(
          "aria-pressed",
          "true"
        );
      });

      expect(
        await within(favorites).findByRole(
          "button",
          {
            name: "Remove Kontekst from Favorites"
          }
        )
      ).toBeInTheDocument();

      expect(saved.has(TRACK.id)).toBe(true);

      // Remove using the existing Favorite Tracks UI.
      fireEvent.click(
        within(favorites).getByRole("button", {
          name: "Remove Kontekst from Favorites"
        })
      );

      await waitFor(() => {
        expect(
          within(player).getByRole("button", {
            name: "Add Kontekst to Favorites"
          })
        ).toHaveAttribute(
          "aria-pressed",
          "false"
        );

        expect(
          within(recentlyAdded).getByRole(
            "button",
            {
              name: "Add Kontekst to Favorites"
            }
          )
        ).toBeEnabled();
      });

      expect(saved.has(TRACK.id)).toBe(false);

      expect(loadTrack).toHaveBeenCalledTimes(1);
      expect(playMusic).not.toHaveBeenCalled();
      expect(pauseMusic).not.toHaveBeenCalled();
    }
  );
});