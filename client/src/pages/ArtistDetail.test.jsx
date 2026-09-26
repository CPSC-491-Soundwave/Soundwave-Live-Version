import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  render,
  screen,
} from "@testing-library/react";

import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";

import ArtistDetail from "./ArtistDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderArtistDetail() {
  render(
    <MemoryRouter
      initialEntries={["/artists/1001"]}
    >
      <Routes>
        <Route
          path="/artists/:id"
          element={<ArtistDetail />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ArtistDetail", () => {
  it("loads and renders artist detail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1001,
          name: "Fixture Artist One",
          albums: [
            {
              id: 2001,
              title: "Fixture Album Alpha",
            },
          ],
        }),
      });

    renderArtistDetail();

    expect(
      screen.getByText("Loading artist...")
    ).toBeTruthy();

    expect(
      await screen.findByRole("heading", {
        name: "Fixture Artist One",
      })
    ).toBeTruthy();

    expect(
      screen.getByText("Fixture Album Alpha")
    ).toBeTruthy();

    expect(globalThis.fetch)
      .toHaveBeenCalledWith(
        "/api/catalog/artists/1001"
      );
  });

  it("renders an empty-album state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1001,
          name: "Fixture Artist One",
          albums: [],
        }),
      });

    renderArtistDetail();

    expect(
      await screen.findByText(
        "No albums are available for this artist."
      )
    ).toBeTruthy();
  });

  it("renders an error state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: false,
        status: 404,
      });

    renderArtistDetail();

    expect(
      await screen.findByRole("alert")
    ).toBeTruthy();

    expect(
      screen.getByText(
        /Failed to load artist/
      )
    ).toBeTruthy();
  });
});