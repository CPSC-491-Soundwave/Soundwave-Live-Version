import {
  act,
  cleanup,
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
import { loadTrack } from "./playback/playback.js";

vi.mock("./playback/playback.js", () => ({
  loadTrack: vi.fn(),
  playMusic: vi.fn(() => true),
  pauseMusic: vi.fn(),
  unloadMusic: vi.fn(),
  setMusicVolume: vi.fn(),
}));

vi.mock("./pages/Login", () => ({
  default: ({ setAccessToken }) => (
    <button
      type="button"
      onClick={() => setAccessToken("ci-fixture-token")}
    >
      Set test session
    </button>
  ),
}));

vi.mock("./components/SessionStatus", () => ({
  default: ({ accessToken }) => (
    <span data-testid="session-token">
      {accessToken || "none"}
    </span>
  ),
}));

import App from "./App.jsx";

const TRACK = {
  id: 3005,
  title: "Kontekst",
  durationMs: 12345,
  artist: {
    id: 1003,
    name: "Buddha",
  },
  album: {
    id: 2003,
    title: "No Copyright",
  },
};

const MEDIA_PATH =
  `/api/tracks/${TRACK.id}/media-access`;

function mockProtectedPlaybackWithOne503() {
  let mediaAttempts = 0;

  const fetchMock = vi.fn(async (url) => {
    if (
      url === "/api/search?q=Kontekst&type=all"
    ) {
      return {
        ok: true,
        json: async () => ({
          query: "Kontekst",
          tracks: [TRACK],
          artists: [],
          albums: [],
        }),
      };
    }

    if (
      url === `/api/catalog/tracks/${TRACK.id}`
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => TRACK,
      };
    }

    if (url === MEDIA_PATH) {
      mediaAttempts += 1;

      return {
        status: mediaAttempts === 1 ? 503 : 204,
      };
    }

    throw new Error(
      `Unexpected test request: ${url}`
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe(
  "SCRUM-290 Search-to-Play recovery integration",
  () => {
    it(
      "preserves selected Track identity through a 503 and successful manual retry",
      async () => {
        const fetchMock =
          mockProtectedPlaybackWithOne503();

        render(
          <MemoryRouter
            initialEntries={["/login"]}
          >
            <App />
          </MemoryRouter>
        );

        fireEvent.click(
          screen.getByRole("button", {
            name: "Set test session",
          })
        );

        fireEvent.click(
          screen.getByRole("link", {
            name: "Search",
          })
        );

        fireEvent.change(
          screen.getByLabelText(
            "Search the catalog"
          ),
          {
            target: {
              value: "Kontekst",
            },
          }
        );

        fireEvent.click(
          screen.getByRole("button", {
            name: "Search",
          })
        );

        expect(
          await screen.findByText("Kontekst")
        ).toBeInTheDocument();

        fireEvent.click(
          screen.getByRole("button", {
            name: "Play Kontekst",
          })
        );

        expect(
          await screen.findByText(
            "Playback authentication is temporarily unavailable."
          )
        ).toBeInTheDocument();

        // The first protected-media request fails.
        // Playable audio must not be initialized.
        expect(
          loadTrack
        ).not.toHaveBeenCalled();

        const mediaCallsBeforeRetry =
          fetchMock.mock.calls.filter(
            ([url]) => url === MEDIA_PATH
          );

        expect(
          mediaCallsBeforeRetry
        ).toHaveLength(1);

        // Recovery requires explicit user action.
        fireEvent.click(
          screen.getByRole("button", {
            name: "Retry playback",
          })
        );

        await waitFor(() => {
          expect(
            loadTrack
          ).toHaveBeenCalledTimes(1);
        });

        // The original selected Track must remain
        // the Track loaded after successful recovery.
        expect(
          loadTrack
        ).toHaveBeenCalledWith(
          TRACK.id,
          expect.any(Object)
        );

        const mediaCalls =
          fetchMock.mock.calls.filter(
            ([url]) => url === MEDIA_PATH
          );

        // Exactly one initial request and one
        // user-initiated retry.
        expect(mediaCalls).toHaveLength(2);

        // Both requests use the selected Track
        // and the existing protected-media contract.
        for (const [, options] of mediaCalls) {
          expect(options).toMatchObject({
            method: "POST",
            credentials: "same-origin",
            headers: {
              Authorization:
                "Bearer ci-fixture-token",
            },
          });
        }

        // Previous failure feedback is cleared.
        expect(
          screen.queryByRole("alert")
        ).toBeNull();

        // A successful HTTP response does not
        // mean the audio is ready yet.
        expect(
          screen.getByText(
            "Loading audio..."
          )
        ).toBeInTheDocument();

        // The existing playback callback confirms
        // that audio has finished loading.
        act(() => {
          loadTrack.mock.calls[0][1].onLoad();
        });

        expect(
          screen.getByText("Ready to play")
        ).toBeInTheDocument();

        expect(
          screen.getByText("Buddha")
        ).toBeInTheDocument();

        expect(
          screen.getByTestId(
            "session-token"
          )
        ).toHaveTextContent(
          "ci-fixture-token"
        );
      }
    );
  }
);
