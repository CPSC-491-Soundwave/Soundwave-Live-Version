import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { MemoryRouter } from "react-router-dom";

import Search from "./Search";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

function renderSearch(props = {}) {
  return render(
    <MemoryRouter>
      <Search {...props} />
    </MemoryRouter>
  );
}

function fixture(overrides = {}) {
  return {
    query: "fixture",

    tracks: [
      {
        id: 3001,
        title: "Fixture Track One",
        durationMs: 180000,

        album: {
          id: 2001,
          title: "Fixture Album Alpha",
        },

        artist: {
          id: 1001,
          name: "Fixture Artist One",
        },
      },
    ],

    artists: [
      {
        id: 1001,
        name: "Fixture Artist One",
      },
    ],

    albums: [
      {
        id: 2001,
        title: "Fixture Album Alpha",

        artist: {
          id: 1001,
          name: "Fixture Artist One",
        },
      },
    ],

    ...overrides,
  };
}

function ok(data) {
  return {
    ok: true,
    json: async () => data,
  };
}

function typeQuery(value = "fixture") {
  fireEvent.change(
    screen.getByLabelText("Search the catalog"),
    {
      target: { value },
    }
  );
}

function selectType(value) {
  fireEvent.change(
    screen.getByLabelText("Filter"),
    {
      target: { value },
    }
  );
}

function submitSearch() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Search",
    })
  );
}

describe("Search / Sprint 5 Discovery", () => {
  it("renders labeled controls and initial guidance", () => {
    renderSearch();

    expect(
      screen.getByRole("heading", {
        name: "Search",
      })
    ).toBeTruthy();

    expect(
      screen.getByRole("search")
    ).toBeTruthy();

    expect(
      screen.getByLabelText("Search the catalog")
    ).toBeTruthy();

    expect(
      screen.getByLabelText("Filter")
    ).toBeTruthy();

    expect(
      screen.getByText(
        "Enter a search term to explore the catalog."
      )
    ).toBeTruthy();
  });

  it("renders grouped tracks, artists, and albums", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        ok(fixture())
      );

    renderSearch();

    typeQuery();
    submitSearch();

    expect(
      await screen.findByText(/3 results for/)
    ).toBeTruthy();

    expect(
      screen.getByText("Fixture Track One")
    ).toBeTruthy();

    expect(
      screen.getAllByText("Fixture Artist One").length
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText("Fixture Album Alpha").length
    ).toBeGreaterThan(0);

    expect(
      screen.getByText("3:00")
    ).toBeTruthy();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/search?q=fixture&type=all",
      expect.objectContaining({
        signal: expect.anything(),
      })
    );
  });

  it("hands the stable Track ID to the existing player", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok(
        fixture({
          artists: [],
          albums: [],
        })
      )
    );

    const onSelectTrack = vi.fn();

    renderSearch({ onSelectTrack });

    typeQuery();
    submitSearch();

    await screen.findByText(
      "Fixture Track One"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Play Fixture Track One",
      })
    );

    expect(onSelectTrack).toHaveBeenCalledTimes(1);

    expect(onSelectTrack).toHaveBeenCalledWith(
      3001
    );
  });

  it("sends a selected category to the Search API", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        ok(
          fixture({
            tracks: [],
            artists: [],
          })
        )
      );

    renderSearch();

    typeQuery("alpha");
    selectType("album");
    submitSearch();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/search?q=alpha&type=album",
        expect.objectContaining({
          signal: expect.anything(),
        })
      );
    });

    expect(
      await screen.findByText(/1 result for/)
    ).toBeTruthy();
  });

  it("automatically refines results when the category changes", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ok(fixture())
      )
      .mockResolvedValueOnce(
        ok(
          fixture({
            tracks: [],
            albums: [],
          })
        )
      );

    renderSearch();

    typeQuery();
    submitSearch();

    await screen.findByText(
      /3 results for/
    );

    selectType("artist");

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/search?q=fixture&type=artist",
      expect.objectContaining({
        signal: expect.anything(),
      })
    );

    expect(
      await screen.findByText(
        /1 result for.*in Artists/
      )
    ).toBeTruthy();

    expect(
      screen.queryByText("Fixture Track One")
    ).toBeNull();

    expect(
      screen.getAllByText("Fixture Artist One").length
    ).toBeGreaterThan(0);
  });

  it("restores all categories when the filter returns to All", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ok(
          fixture({
            artists: [],
            albums: [],
          })
        )
      )
      .mockResolvedValueOnce(
        ok(fixture())
      );

    renderSearch();

    typeQuery();
    selectType("track");
    submitSearch();

    await screen.findByText(
      /1 result for/
    );

    selectType("all");

    expect(
      await screen.findByText(/3 results for/)
    ).toBeTruthy();

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/search?q=fixture&type=all",
      expect.objectContaining({
        signal: expect.anything(),
      })
    );
  });

  it("shows an empty-result status instead of an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok(
        fixture({
          query: "nothing",
          tracks: [],
          artists: [],
          albums: [],
        })
      )
    );

    renderSearch();

    typeQuery("nothing");
    submitSearch();

    // Wait for the completed empty-result message,
    // not the temporary "Searching..." status.
    const emptyMessage = await screen.findByText(
      "No results found for “nothing”."
    );

    expect(emptyMessage).toBeTruthy();

    expect(
      emptyMessage.getAttribute("role")
    ).toBe("status");

    expect(
      screen.queryByRole("alert")
    ).toBeNull();

    expect(
      screen.queryByText(/Searching all for/)
    ).toBeNull();
  });

  it("rejects a blank query without calling the API", async () => {
    const fetchSpy = vi.spyOn(
      globalThis,
      "fetch"
    );

    renderSearch();

    submitSearch();

    expect(
      await screen.findByRole("alert")
    ).toHaveProperty(
      "textContent",
      "Enter a search term before searching."
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("separates an HTTP error from an empty result", async () => {
    vi.spyOn(
      globalThis,
      "fetch"
    ).mockResolvedValue({
      ok: false,
      status: 500,
    });

    renderSearch();

    typeQuery();
    submitSearch();

    expect(
      await screen.findByRole("alert")
    ).toHaveProperty(
      "textContent",
      "Search request failed with HTTP 500"
    );

    expect(
      screen.queryByText(/No results found/)
    ).toBeNull();
  });

  it("does not expose raw network exception details", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error(
        "private.test/path?token=do-not-display"
      )
    );

    renderSearch();

    typeQuery();
    submitSearch();

    const alert = await screen.findByRole(
      "alert"
    );

    expect(alert.textContent).toContain(
      "Unable to search the catalog right now"
    );

    expect(alert.textContent).not.toContain(
      "token="
    );
  });

  it("ignores a stale response after a newer category request", async () => {
    let finishOldRequest;

    const oldResponse = new Promise((resolve) => {
      finishOldRequest = resolve;
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () => oldResponse
      )
      .mockResolvedValueOnce(
        ok(
          fixture({
            tracks: [],
            artists: [],
            albums: [fixture().albums[0]],
          })
        )
      );

    renderSearch();

    typeQuery();
    submitSearch();

    expect(
      screen.getByText(/Searching all/)
    ).toBeTruthy();

    selectType("album");

    expect(
      await screen.findByText(
        /1 result for.*in Albums/
      )
    ).toBeTruthy();

    expect(
      fetchSpy.mock.calls[0][1].signal.aborted
    ).toBe(true);

    await act(async () => {
      finishOldRequest(
        ok(fixture())
      );
    });

    expect(
      screen.queryByText("Fixture Track One")
    ).toBeNull();

    expect(
      screen.getByText(/1 result for.*in Albums/)
    ).toBeTruthy();
  });

  it("clears the search, filter, and results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok(
        fixture({
          artists: [],
          albums: [],
        })
      )
    );

    renderSearch();

    typeQuery();
    selectType("track");
    submitSearch();

    await screen.findByText(
      /1 result for/
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear search and filters",
      })
    );

    expect(
      screen.getByLabelText("Search the catalog")
    ).toHaveProperty(
      "value",
      ""
    );

    expect(
      screen.getByLabelText("Filter")
    ).toHaveProperty(
      "value",
      "all"
    );

    expect(document.activeElement).toBe(
      screen.getByLabelText("Search the catalog")
    );

    expect(
      screen.queryByText("Fixture Track One")
    ).toBeNull();

    expect(
      screen.getByText(
        "Enter a search term to explore the catalog."
      )
    ).toBeTruthy();
  });

  it("aborts pending Search requests when unmounted", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        () => new Promise(() => {})
      );

    const { unmount } = renderSearch();

    typeQuery();
    submitSearch();

    const requestSignal =
      fetchSpy.mock.calls[0][1].signal;

    expect(
      requestSignal.aborted
    ).toBe(false);

    unmount();

    expect(
      requestSignal.aborted
    ).toBe(true);
  });
});
