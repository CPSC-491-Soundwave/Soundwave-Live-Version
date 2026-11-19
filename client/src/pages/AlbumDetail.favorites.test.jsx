import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  MemoryRouter,
  Route,
  Routes
} from "react-router-dom";

import AlbumDetail from "./AlbumDetail.jsx";

const ALBUM = {
  id: 2001,
  title: "Fixture Album Alpha",
  artist: {
    id: 1001,
    name: "Fixture Artist One"
  },
  tracks: [
    {
      id: 3001,
      title: "Fixture Track One",
      durationMs: 180000
    },
    {
      id: 3002,
      title: "Fixture Track Two",
      durationMs: 190000
    }
  ]
};

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

function installApi({
  initiallySaved = [],
  putStatus = 204,
  pendingPut = null
} = {}) {
  const saved = new Set(initiallySaved);

  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? "GET";

    if (url === "/api/catalog/albums/2001") {
      return response(200, ALBUM);
    }

    if (
      url === "/api/library/favorites" &&
      method === "GET"
    ) {
      return response(
        200,
        ALBUM.tracks.filter((track) =>
          saved.has(track.id)
        )
      );
    }

    const match =
      /^\/api\/library\/favorites\/(\d+)$/.exec(url);

    if (match && method === "PUT") {
      if (putStatus !== 204) {
        return response(putStatus, null);
      }

      if (pendingPut) {
        await pendingPut;
      }

      saved.add(Number(match[1]));

      return response(204, null);
    }

    if (match && method === "DELETE") {
      saved.delete(Number(match[1]));

      return response(204, null);
    }

    throw new Error(
      `Unexpected ${method} ${url}`
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    saved,
    fetchMock
  };
}

function albumView({
  accessToken = "album-test-token",
  favoritesVersion = 0,
  onFavoritesChanged = vi.fn(),
  onSelectTrack = vi.fn()
} = {}) {
  return (
    <MemoryRouter initialEntries={["/albums/2001"]}>
      <Routes>
        <Route
          path="/albums/:id"
          element={
            <AlbumDetail
              accessToken={accessToken}
              favoritesVersion={favoritesVersion}
              onFavoritesChanged={onFavoritesChanged}
              onSelectTrack={onSelectTrack}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sprint 5 Album Detail Favorites", () => {
  it(
    "loads Favorites once and renders each track's confirmed heart",
    async () => {
      const { fetchMock } = installApi({
        initiallySaved: [3002]
      });

      render(albumView());

      expect(
        await screen.findByRole("button", {
          name: "Unfavorite Fixture Track Two"
        })
      ).toHaveAttribute(
        "aria-pressed",
        "true"
      );

      expect(
        screen.getByRole("button", {
          name: "Add Fixture Track One to Favorites"
        })
      ).toHaveAttribute(
        "aria-pressed",
        "false"
      );

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/library/favorites",
        expect.objectContaining({
          method: "GET",
          headers: {
            Authorization: "Bearer album-test-token"
          }
        })
      );

      expect(
        fetchMock.mock.calls.filter(
          ([url]) =>
            url === "/api/library/favorites"
        )
      ).toHaveLength(1);
    }
  );

  it(
    "toggles PUT and DELETE while keeping Play independent",
    async () => {
      const { saved, fetchMock } = installApi();

      const onFavoritesChanged = vi.fn();
      const onSelectTrack = vi.fn();

      render(
        albumView({
          onFavoritesChanged,
          onSelectTrack
        })
      );

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Add Fixture Track One to Favorites"
        })
      );

      expect(
        await screen.findByRole("button", {
          name: "Unfavorite Fixture Track One"
        })
      ).toBeEnabled();

      expect(saved.has(3001)).toBe(true);

      expect(
        onFavoritesChanged
      ).toHaveBeenCalledTimes(1);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Unfavorite Fixture Track One"
        })
      );

      expect(
        await screen.findByRole("button", {
          name: "Add Fixture Track One to Favorites"
        })
      ).toBeEnabled();

      expect(saved.has(3001)).toBe(false);

      expect(
        onFavoritesChanged
      ).toHaveBeenCalledTimes(2);

      expect(
        onSelectTrack
      ).not.toHaveBeenCalled();

      expect(
        fetchMock.mock.calls.filter(
          ([, options]) =>
            options?.method === "PUT"
        )
      ).toHaveLength(1);

      expect(
        fetchMock.mock.calls.filter(
          ([, options]) =>
            options?.method === "DELETE"
        )
      ).toHaveLength(1);
    }
  );

  it(
    "reflects Favorites changes made by the Playback Bar",
    async () => {
      const { saved } = installApi();

      const onFavoritesChanged = vi.fn();

      const { rerender } = render(
        albumView({
          onFavoritesChanged
        })
      );

      expect(
        await screen.findByRole("button", {
          name: "Add Fixture Track One to Favorites"
        })
      ).toBeEnabled();

      // Simulate a successful Favorite addition
      // originating from another component.
      saved.add(3001);

      // App increments the Favorites version.
      rerender(
        albumView({
          favoritesVersion: 1,
          onFavoritesChanged
        })
      );

      expect(
        await screen.findByRole("button", {
          name: "Unfavorite Fixture Track One"
        })
      ).toHaveAttribute(
        "aria-pressed",
        "true"
      );

      // A GET refresh must not create another
      // mutation notification.
      expect(
        onFavoritesChanged
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "preserves unsaved state and displays an error after failed PUT",
    async () => {
      const { saved } = installApi({
        putStatus: 503
      });

      const onFavoritesChanged = vi.fn();

      render(
        albumView({
          onFavoritesChanged
        })
      );

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Add Fixture Track One to Favorites"
        })
      );

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(
        "Favorites are temporarily unavailable."
      );

      expect(
        screen.getByRole("button", {
          name: "Add Fixture Track One to Favorites"
        })
      ).toHaveAttribute(
        "aria-pressed",
        "false"
      );

      expect(saved.has(3001)).toBe(false);

      expect(
        onFavoritesChanged
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "blocks duplicate heart clicks until the write finishes",
    async () => {
      let finishPut;

      const pendingPut = new Promise((resolve) => {
        finishPut = resolve;
      });

      const { fetchMock } = installApi({
        pendingPut
      });

      render(albumView());

      const add = await screen.findByRole(
        "button",
        {
          name: "Add Fixture Track One to Favorites"
        }
      );

      fireEvent.click(add);
      fireEvent.click(add);

      expect(
        fetchMock.mock.calls.filter(
          ([, options]) =>
            options?.method === "PUT"
        )
      ).toHaveLength(1);

      expect(add).toBeDisabled();

      await act(async () => {
        finishPut();
      });

      expect(
        await screen.findByRole("button", {
          name: "Unfavorite Fixture Track One"
        })
      ).toBeEnabled();
    }
  );

  it(
    "keeps guest hearts disabled without requesting protected Favorites",
    async () => {
      const { fetchMock } = installApi();

      const onSelectTrack = vi.fn();

      render(
        albumView({
          accessToken: "",
          onSelectTrack
        })
      );

      const heart = await screen.findByRole(
        "button",
        {
          name:
            "Log in to add Fixture Track One to Favorites"
        }
      );

      expect(heart).toBeDisabled();

      expect(
        fetchMock.mock.calls.filter(
          ([url]) =>
            url.startsWith("/api/library/favorites")
        )
      ).toHaveLength(0);

      // The existing Play control remains separate
      // from the disabled Favorite heart.
      fireEvent.click(
        screen.getByRole("button", {
          name: "Play Fixture Track One"
        })
      );

      expect(
        onSelectTrack
      ).toHaveBeenCalledWith(3001);
    }
  );
});