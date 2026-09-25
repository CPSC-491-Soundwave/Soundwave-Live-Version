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

import Artists from "./Artists";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Artists", () => {
  it("renders artists returned by the catalog API", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 1001,
            name: "Fixture Artist One",
          },
          {
            id: 1002,
            name: "Fixture Artist Two",
          },
        ],
      });

    render(
      <MemoryRouter>
        <Artists />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Loading artists...")
    ).toBeTruthy();

    expect(
      await screen.findByText(
        "Fixture Artist One"
      )
    ).toBeTruthy();

    expect(
      screen.getByText(
        "Fixture Artist Two"
      )
    ).toBeTruthy();

    expect(globalThis.fetch)
      .toHaveBeenCalledWith(
        "/api/catalog/artists"
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
        <Artists />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        "No artists are available yet."
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
        <Artists />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole("alert")
      ).toBeTruthy();
    });

    expect(
      screen.getByText(
        /Failed to load artists/
      )
    ).toBeTruthy();
  });
});