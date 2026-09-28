import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  MemoryRouter
} from "react-router-dom";

import Search from "./Search";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSearch() {
  render(
    <MemoryRouter>
      <Search />
    </MemoryRouter>
  );
}

function mockSearchResponse(
  overrides = {}
) {
  return {
    query: "fixture",

    tracks: [
      {
        id: 3001,
        title:
          "Fixture Track One",
        durationMs: 180000,

        album: {
          id: 2001,
          title:
            "Fixture Album Alpha"
        },

        artist: {
          id: 1001,
          name:
            "Fixture Artist One"
        }
      }
    ],

    artists: [
      {
        id: 1001,
        name:
          "Fixture Artist One"
      }
    ],

    albums: [
      {
        id: 2001,
        title:
          "Fixture Album Alpha",

        artist: {
          id: 1001,
          name:
            "Fixture Artist One"
        }
      }
    ],

    ...overrides
  };
}

describe("Search", () => {
  it(
    "renders the initial search state",
    () => {
      renderSearch();

      expect(
        screen.getByRole(
          "heading",
          {
            name: "Search"
          }
        )
      ).toBeTruthy();

      expect(
        screen.getByText(
          "Enter a search term to explore the catalog."
        )
      ).toBeTruthy();

      expect(
        screen.getByLabelText(
          "Search the catalog"
        )
      ).toBeTruthy();

      expect(
        screen.getByLabelText(
          "Filter"
        )
      ).toBeTruthy();
    }
  );

  it(
    "renders grouped search results",
    async () => {
      vi.spyOn(
        globalThis,
        "fetch"
      ).mockResolvedValue({
        ok: true,

        json: async () =>
          mockSearchResponse()
      });

      renderSearch();

      fireEvent.change(
        screen.getByLabelText(
          "Search the catalog"
        ),
        {
          target: {
            value: "fixture"
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
          /3 results for/
        )
      ).toBeTruthy();

      expect(
        screen.getByText(
          "Fixture Track One"
        )
      ).toBeTruthy();

      expect(
        screen.getAllByText(
          "Fixture Artist One"
        ).length
      ).toBeGreaterThan(0);

      expect(
        screen.getAllByText(
          "Fixture Album Alpha"
        ).length
      ).toBeGreaterThan(0);

      expect(
        screen.getByText("3:00")
      ).toBeTruthy();

      expect(globalThis.fetch)
        .toHaveBeenCalledWith(
          "/api/search?q=fixture&type=all",
          expect.objectContaining({
            signal:
              expect.anything()
          })
        );
    }
  );

  it(
    "uses the selected search filter",
    async () => {
      vi.spyOn(
        globalThis,
        "fetch"
      ).mockResolvedValue({
        ok: true,

        json: async () =>
          mockSearchResponse({
            tracks: [],
            artists: [],
            albums: [
              {
                id: 2001,
                title:
                  "Fixture Album Alpha",

                artist: {
                  id: 1001,
                  name:
                    "Fixture Artist One"
                }
              }
            ]
          })
      });

      renderSearch();

      fireEvent.change(
        screen.getByLabelText(
          "Search the catalog"
        ),
        {
          target: {
            value: "alpha"
          }
        }
      );

      fireEvent.change(
        screen.getByLabelText(
          "Filter"
        ),
        {
          target: {
            value: "album"
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

      await waitFor(() => {
        expect(
          globalThis.fetch
        ).toHaveBeenCalledWith(
          "/api/search?q=alpha&type=album",
          expect.objectContaining({
            signal:
              expect.anything()
          })
        );
      });
    }
  );

  it(
    "renders the no-results state",
    async () => {
      vi.spyOn(
        globalThis,
        "fetch"
      ).mockResolvedValue({
        ok: true,

        json: async () => ({
          query: "nothing",
          tracks: [],
          artists: [],
          albums: []
        })
      });

      renderSearch();

      fireEvent.change(
        screen.getByLabelText(
          "Search the catalog"
        ),
        {
          target: {
            value: "nothing"
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
          /No results found for/
        )
      ).toBeTruthy();
    }
  );

  it(
    "rejects a blank search without calling the API",
    async () => {
      const fetchSpy =
        vi.spyOn(
          globalThis,
          "fetch"
        );

      renderSearch();

      fireEvent.click(
        screen.getByRole(
          "button",
          {
            name: "Search"
          }
        )
      );

      expect(
        await screen.findByRole(
          "alert"
        )
      ).toBeTruthy();

      expect(
        screen.getByText(
          "Enter a search term before searching."
        )
      ).toBeTruthy();

      expect(
        fetchSpy
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "renders an error when the request fails",
    async () => {
      vi.spyOn(
        globalThis,
        "fetch"
      ).mockResolvedValue({
        ok: false,
        status: 500
      });

      renderSearch();

      fireEvent.change(
        screen.getByLabelText(
          "Search the catalog"
        ),
        {
          target: {
            value: "fixture"
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
        await screen.findByRole(
          "alert"
        )
      ).toBeTruthy();

      expect(
        screen.getByText(
          /Search request failed with HTTP 500/
        )
      ).toBeTruthy();
    }
  );
});
