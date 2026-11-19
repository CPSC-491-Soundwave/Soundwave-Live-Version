import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";

import Library from "./Library.jsx";

const tracks = [
  {
    id: 3001,
    title: "Fixture Track One",
    durationMs: 180000,
    artist: {
      id: 1001,
      name: "Fixture Artist One"
    },
    album: {
      id: 2001,
      title: "Fixture Album Alpha"
    }
  },
  {
    id: 3002,
    title: "Fixture Track Two",
    durationMs: 205000,
    artist: {
      id: 1001,
      name: "Fixture Artist One"
    },
    album: {
      id: 2001,
      title: "Fixture Album Alpha"
    }
  }
];

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data
  };
}

function makeApi({
  initial = [3001],
  failureStatus = null
} = {}) {
  const saved = new Set(initial);
  const requests = [];

  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? "GET";

    requests.push({
      url,
      method,
      authorization: options.headers?.Authorization
    });

    if (url === "/api/library/recently-added") {
      return jsonResponse(tracks);
    }

    if (
      url === "/api/library/favorites" &&
      method === "GET"
    ) {
      return jsonResponse(
        tracks.filter((track) => saved.has(track.id))
      );
    }

    if (
      url === "/api/library/favorites/3002" &&
      method === "PUT"
    ) {
      if (failureStatus) {
        return {
          ok: false,
          status: failureStatus
        };
      }

      saved.add(3002);

      return {
        ok: true,
        status: 204
      };
    }

    if (
      url === "/api/library/favorites/3002" &&
      method === "DELETE"
    ) {
      saved.delete(3002);

      return {
        ok: true,
        status: 204
      };
    }

    throw new Error(`Unexpected ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    requests,
    saved,
    fetchMock
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SCRUM-362 Favorites write integration", () => {
  it(
    "adds a Favorite, refreshes GET, and removes it",
    async () => {
      const { requests, saved } = makeApi();
      const onSelectTrack = vi.fn();

      render(
        <Library
          accessToken="test-jwt"
          onSelectTrack={onSelectTrack}
        />
      );

      const add = await screen.findByRole("button", {
        name: "Add Fixture Track Two to Favorites"
      });

      await waitFor(() => {
        expect(add).toBeEnabled();
      });

      fireEvent.click(add);

      const remove = await screen.findByRole("button", {
        name: "Remove Fixture Track Two from Favorites"
      });

      expect(remove).toBeEnabled();
      expect(saved.has(3002)).toBe(true);

      fireEvent.click(remove);

      await waitFor(() => {
        expect(
          screen.queryByRole("button", {
            name: "Remove Fixture Track Two from Favorites"
          })
        ).not.toBeInTheDocument();

        expect(
          screen.getByRole("button", {
            name: "Add Fixture Track Two to Favorites"
          })
        ).toBeEnabled();
      });

      expect(saved.has(3002)).toBe(false);

      expect(
        requests.filter((item) => item.method === "PUT")
      ).toEqual([
        {
          url: "/api/library/favorites/3002",
          method: "PUT",
          authorization: "Bearer test-jwt"
        }
      ]);

      expect(
        requests.filter((item) => item.method === "DELETE")
      ).toHaveLength(1);

      expect(
        requests.filter(
          (item) =>
            item.url === "/api/library/favorites" &&
            item.method === "GET"
        ).length
      ).toBeGreaterThanOrEqual(3);

      // Track selection still uses the shared callback.
      const recentlyAdded = screen.getByLabelText(
        "Recently added tracks"
      );

      fireEvent.click(
        within(recentlyAdded).getByRole("button", {
          name: "Select Fixture Track Two"
        })
      );

      expect(onSelectTrack).toHaveBeenCalledWith(3002);
    }
  );

  it(
    "shows an API error without falsely adding the track",
    async () => {
      const { saved } = makeApi({
        failureStatus: 503
      });

      render(<Library accessToken="test-jwt" />);

      const add = await screen.findByRole("button", {
        name: "Add Fixture Track Two to Favorites"
      });

      await waitFor(() => {
        expect(add).toBeEnabled();
      });

      fireEvent.click(add);

      expect(await screen.findByRole("alert"))
        .toHaveTextContent(
          "Favorites are temporarily unavailable"
        );

      expect(saved.has(3002)).toBe(false);

      expect(
        screen.queryByRole("button", {
          name: "Remove Fixture Track Two from Favorites"
        })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "reuses server-backed Favorites after remounting",
    async () => {
      const { saved } = makeApi({
        initial: [3001, 3002]
      });

      const first = render(
        <Library accessToken="test-jwt" />
      );

      await screen.findByRole("button", {
        name: "Remove Fixture Track Two from Favorites"
      });

      first.unmount();

      render(
        <Library accessToken="new-valid-jwt" />
      );

      expect(
        await screen.findByRole("button", {
          name: "Remove Fixture Track Two from Favorites"
        })
      ).toBeEnabled();

      expect(saved.has(3002)).toBe(true);
    }
  );

it(
  "toggles the Recently Added heart without changing playback",
  async () => {
    const { requests, saved } = makeApi();
    const onSelectTrack = vi.fn();

    render(
      <Library
        accessToken="test-jwt"
        onSelectTrack={onSelectTrack}
      />
    );

    const recentlyAdded = await screen.findByLabelText(
      "Recently added tracks"
    );

    // Initially unsaved: outlined heart.
    const addButton = within(recentlyAdded).getByRole(
      "button",
      {
        name: "Add Fixture Track Two to Favorites"
      }
    );

    await waitFor(() => {
      expect(addButton).toBeEnabled();
    });

    fireEvent.click(addButton);

    // After PUT and the refreshed GET:
    // the same card can now remove the Favorite.
    await waitFor(() => {
      expect(
        within(recentlyAdded).getByRole(
          "button",
          {
            name: "Unfavorite Fixture Track Two"
          }
        )
      ).toBeEnabled();
    });

    expect(saved.has(3002)).toBe(true);

    const unfavoriteButton =
      within(recentlyAdded).getByRole(
        "button",
        {
          name: "Unfavorite Fixture Track Two"
        }
      );

    fireEvent.click(unfavoriteButton);

    // After DELETE and another GET:
    // the heart returns to the Add state.
    await waitFor(() => {
      expect(
        within(recentlyAdded).getByRole(
          "button",
          {
            name: "Add Fixture Track Two to Favorites"
          }
        )
      ).toBeEnabled();
    });

    expect(saved.has(3002)).toBe(false);

    expect(
      requests.filter(
        (request) => request.method === "PUT"
      )
    ).toHaveLength(1);

    expect(
      requests.filter(
        (request) => request.method === "DELETE"
      )
    ).toHaveLength(1);

    // Heart clicks must not select or play a track.
    expect(onSelectTrack).not.toHaveBeenCalled();

    // The original Favorite Tracks list is synchronized.
    const favoriteTracks = screen.getByRole(
      "region",
      {
        name: "Favorite Tracks"
      }
    );

    expect(
      within(favoriteTracks).queryByRole(
        "button",
        {
          name: "Remove Fixture Track Two from Favorites"
        }
      )
    ).not.toBeInTheDocument();
  }
);
});