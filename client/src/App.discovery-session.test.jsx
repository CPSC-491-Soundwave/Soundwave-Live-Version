import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  loadTrack,
  unloadMusic,
} from "./playback/playback.js";

vi.mock("./playback/playback.js", () => ({
  loadTrack: vi.fn(),
  playMusic: vi.fn(() => true),
  pauseMusic: vi.fn(),
  setMusicVolume: vi.fn(),
  unloadMusic: vi.fn(),
}));

import App from "./App";

const TRACK = {
  id: 3005,
  title: "Kontekst",
  durationMs: 12345,
  album: { id: 2003, title: "No Copyright" },
  artist: { id: 1003, name: "Buddha" },
};

const SEARCH_URL = "/api/search?q=Kontekst&type=all";
const METADATA_URL = "/api/catalog/tracks/3005";
const MEDIA_ACCESS_URL = "/api/tracks/3005/media-access";

function renderGuestDiscovery() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("link", { name: "Search" }));
}

describe("SCRUM-238 Discovery guest session integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async (url) => {
      if (url === SEARCH_URL) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            query: "Kontekst",
            tracks: [TRACK],
            artists: [],
            albums: [],
          }),
        };
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
  });

  it("allows a signed-out visitor to open Discovery", () => {
    renderGuestDiscovery();

    expect(
      screen.getByLabelText("Search the catalog")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Search" })
    ).toBeInTheDocument();
  });

  it("allows guest Search but stops protected playback before media access", async () => {
    renderGuestDiscovery();

    fireEvent.change(screen.getByLabelText("Search the catalog"), {
      target: { value: "Kontekst" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Kontekst")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      SEARCH_URL,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );

    // The missing-token path in PlaybackBar invokes unloadMusic.
    // Clear any effects from the initial render before selecting the track.
    vi.mocked(unloadMusic).mockClear();

    fireEvent.click(
      screen.getByRole("button", { name: "Play Kontekst" })
    );

    await waitFor(() => {
      expect(unloadMusic).toHaveBeenCalled();
    });

    const requestedURLs = globalThis.fetch.mock.calls.map(([url]) =>
      String(url)
    );
    expect(requestedURLs).not.toContain(METADATA_URL);
    expect(requestedURLs).not.toContain(MEDIA_ACCESS_URL);
    expect(loadTrack).not.toHaveBeenCalled();
  });
});
