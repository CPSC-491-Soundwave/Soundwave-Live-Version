
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";

import FavoritesSection from "./FavoritesSection.jsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

test("does not fetch when signed out", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(
    <FavoritesSection accessToken={null} />
  );

  expect(
    await screen.findByText(
      "Sign in to view your favorite tracks."
    )
  ).toBeTruthy();

  expect(fetchMock).not.toHaveBeenCalled();
});

test("loads favorites with Bearer token", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    mockResponse(200, [{
      id: 3001,
      title: "Fixture Track One",
      artist: { name: "Fixture Artist One" },
      album: { title: "Fixture Album Alpha" }
    }])
  );

  vi.stubGlobal("fetch", fetchMock);

  const onSelectTrack = vi.fn();

  render(
    <FavoritesSection
      accessToken="test-token"
      onSelectTrack={onSelectTrack}
    />
  );

  expect(
    await screen.findByText("Fixture Track One")
  ).toBeTruthy();

  expect(
    screen.getByText(
      /Fixture Artist One.*Fixture Album Alpha/
    )
  ).toBeTruthy();

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/library/favorites",
    expect.objectContaining({
      method: "GET",
      headers: {
        Authorization: "Bearer test-token"
      }
    })
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Select Fixture Track One"
    })
  );

  expect(onSelectTrack).toHaveBeenCalledWith(3001);
});

test("displays an empty favorites state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      mockResponse(200, [])
    )
  );

  render(
    <FavoritesSection accessToken="test-token" />
  );

  expect(
    await screen.findByText(
      "You have no favorite tracks yet."
    )
  ).toBeTruthy();
});

test("handles expired or invalid sessions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      mockResponse(401, {
        error: "unauthorized"
      })
    )
  );

  render(
    <FavoritesSection accessToken="expired-token" />
  );

  expect(
    await screen.findByRole("alert")
  ).toBeTruthy();

  expect(
    screen.getByText(/Please sign in again/)
  ).toBeTruthy();
});

test("handles temporary service failures", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(
      mockResponse(503, {
        error: "service_unavailable"
      })
    )
    .mockResolvedValueOnce(
      mockResponse(200, [])
    );

  vi.stubGlobal("fetch", fetchMock);

  render(
    <FavoritesSection accessToken="test-token" />
  );

  expect(
    await screen.findByText(
      "Favorites are temporarily unavailable."
    )
  ).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Retry"
    })
  );

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  expect(
    await screen.findByText(
      "You have no favorite tracks yet."
    )
  ).toBeTruthy();
});
