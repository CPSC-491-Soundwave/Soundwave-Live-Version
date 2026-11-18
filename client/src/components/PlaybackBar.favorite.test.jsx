import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import PlaybackBar from "./PlaybackBar.jsx";

import {
  loadTrack,
  playMusic,
  pauseMusic
} from "../playback/playback.js";

vi.mock("../playback/playback.js", () => ({
  loadTrack: vi.fn(),
  playMusic: vi.fn(() => true),
  pauseMusic: vi.fn(),
  unloadMusic: vi.fn(),
  setMusicVolume: vi.fn(),
  setMusicProgress: vi.fn(() => true)
}));

const TRACK = {
  id: 3005,
  title: "Kontekst",
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

function installApi({
  initiallySaved = false,
  failedPut = false,
  pendingPut = null
} = {}) {
  const saved = new Set(
    initiallySaved ? [3005] : []
  );

  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? "GET";

    if (url === "/api/catalog/tracks/3005") {
      return response(200, TRACK);
    }

    if (url === "/api/tracks/3005/media-access") {
      return response(204, null);
    }

    if (
      url === "/api/library/favorites" &&
      method === "GET"
    ) {
      return response(
        200,
        saved.has(3005) ? [TRACK] : []
      );
    }

    if (
      url === "/api/library/favorites/3005" &&
      method === "PUT"
    ) {
      if (failedPut) {
        return response(503, null);
      }

      if (pendingPut) {
        await pendingPut;
      }

      saved.add(3005);
      return response(204, null);
    }

    if (
      url === "/api/library/favorites/3005" &&
      method === "DELETE"
    ) {
      saved.delete(3005);
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

function renderPlayer() {
  return render(
    <PlaybackBar
      trackId={3005}
      accessToken="playback-favorites-test-token"
      enableFavoriteControl
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlaybackBar Favorites integration", () => {
  it(
    "adds and removes the selected track without changing playback",
    async () => {
      const { saved, fetchMock } = installApi();

      renderPlayer();

      const add = await screen.findByRole("button", {
        name: "Add Kontekst to Favorites"
      });

      expect(add).toBeEnabled();

      fireEvent.click(add);

      const remove = await screen.findByRole(
        "button",
        {
          name: "Unfavorite Kontekst"
        }
      );

      expect(remove).toBeEnabled();
      expect(saved.has(3005)).toBe(true);

      fireEvent.click(remove);

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Add Kontekst to Favorites"
          })
        ).toBeEnabled();
      });

      expect(saved.has(3005)).toBe(false);

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

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/library/favorites",
        expect.objectContaining({
          method: "GET",
          headers: {
            Authorization:
              "Bearer playback-favorites-test-token"
          }
        })
      );

      expect(loadTrack).toHaveBeenCalledTimes(1);
      expect(playMusic).not.toHaveBeenCalled();
      expect(pauseMusic).not.toHaveBeenCalled();
    }
  );

  it(
    "starts filled when the selected track is already saved",
    async () => {
      const { saved } = installApi({
        initiallySaved: true
      });

      renderPlayer();

      const remove = await screen.findByRole(
        "button",
        {
          name: "Unfavorite Kontekst"
        }
      );

      expect(remove).toHaveAttribute(
        "aria-pressed",
        "true"
      );

      fireEvent.click(remove);

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Add Kontekst to Favorites"
          })
        ).toHaveAttribute(
          "aria-pressed",
          "false"
        );
      });

      expect(saved.has(3005)).toBe(false);
    }
  );

  it(
    "does not show false success when the Favorites API fails",
    async () => {
      const { saved } = installApi({
        failedPut: true
      });

      renderPlayer();

      const add = await screen.findByRole("button", {
        name: "Add Kontekst to Favorites"
      });

      fireEvent.click(add);

      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(
        "Favorites are temporarily unavailable."
      );

      expect(saved.has(3005)).toBe(false);

      expect(
        screen.getByRole("button", {
          name: "Add Kontekst to Favorites"
        })
      ).toHaveAttribute("aria-pressed", "false");

      expect(playMusic).not.toHaveBeenCalled();
    }
  );

  it(
    "blocks duplicate clicks while a write is pending",
    async () => {
      let finishPut;

      const pendingPut = new Promise((resolve) => {
        finishPut = resolve;
      });

      const { fetchMock } = installApi({
        pendingPut
      });

      renderPlayer();

      const add = await screen.findByRole("button", {
        name: "Add Kontekst to Favorites"
      });

      fireEvent.click(add);
      fireEvent.click(add);

      const putRequests = () =>
        fetchMock.mock.calls.filter(
          ([, options]) =>
            options?.method === "PUT"
        );

      expect(putRequests()).toHaveLength(1);

      await act(async () => {
        finishPut();
      });

      expect(
        await screen.findByRole("button", {
          name: "Unfavorite Kontekst"
        })
      ).toBeEnabled();

      expect(putRequests()).toHaveLength(1);
      expect(playMusic).not.toHaveBeenCalled();
    }
  );
});