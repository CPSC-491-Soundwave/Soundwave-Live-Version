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
  waitFor,
} from "@testing-library/react";

import { MemoryRouter } from "react-router-dom";

import Albums from "./Albums";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Albums", () => {
  it("renders albums returned by the catalog API", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 2001,
            title: "Fixture Album Alpha",
            artist: {
              id: 1001,
              name: "Fixture Artist One",
            },
          },
        ],
      });

    render(
      <MemoryRouter>
        <Albums />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Loading albums...")
    ).toBeTruthy();

    expect(
      await screen.findByText(
        "Fixture Album Alpha"
      )
    ).toBeTruthy();

    expect(
      screen.getByText(
        "Fixture Artist One"
      )
    ).toBeTruthy();

    expect(globalThis.fetch)
      .toHaveBeenCalledWith(
        "/api/catalog/albums"
      );
  });

  it("renders the empty state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => [],
      });

    render(
      <MemoryRouter>
        <Albums />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        "No albums are available yet."
      )
    ).toBeTruthy();
  });

  it("renders an error state when the request fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: false,
        status: 500,
      });

    render(
      <MemoryRouter>
        <Albums />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole("alert")
      ).toBeTruthy();
    });

    expect(
      screen.getByText(
        /Failed to load albums/
      )
    ).toBeTruthy();
  });
});