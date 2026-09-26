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

import AlbumDetail from "./AlbumDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAlbumDetail() {
  render(
    <MemoryRouter
      initialEntries={["/albums/2001"]}
    >
      <Routes>
        <Route
          path="/albums/:id"
          element={<AlbumDetail />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("AlbumDetail", () => {
  it("loads and renders album detail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 2001,
          title: "Fixture Album Alpha",
          artist: {
            id: 1001,
            name: "Fixture Artist One",
          },
          tracks: [
            {
              id: 3001,
              title: "Fixture Track One",
              durationMs: 180000,
            },
          ],
        }),
      });

    renderAlbumDetail();

    expect(
      screen.getByText("Loading album...")
    ).toBeTruthy();

    expect(
      await screen.findByRole("heading", {
        name: "Fixture Album Alpha",
      })
    ).toBeTruthy();

    expect(
        screen.getByText(
            "Fixture Artist One",
            { selector: "p" }
        )
    ).toBeTruthy();

    expect(
      screen.getByText("Fixture Track One")
    ).toBeTruthy();

    expect(
      screen.getByText("3:00")
    ).toBeTruthy();

    expect(globalThis.fetch)
      .toHaveBeenCalledWith(
        "/api/catalog/albums/2001"
      );
  });

  it("renders an empty-track state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 2001,
          title: "Fixture Album Alpha",
          artist: {
            id: 1001,
            name: "Fixture Artist One",
          },
          tracks: [],
        }),
      });

    renderAlbumDetail();

    expect(
      await screen.findByText(
        "No tracks are available for this album."
      )
    ).toBeTruthy();
  });

  it("renders an error state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: false,
        status: 404,
      });

    renderAlbumDetail();

    expect(
      await screen.findByRole("alert")
    ).toBeTruthy();

    expect(
      screen.getByText(
        /Failed to load album/
      )
    ).toBeTruthy();
  });
});