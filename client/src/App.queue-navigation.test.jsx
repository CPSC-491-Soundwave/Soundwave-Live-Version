import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within
} from "@testing-library/react";

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi
} from "vitest";

import { MemoryRouter } from "react-router-dom";
import App from "./App";

vi.mock("./playback/playback.js", () => ({
    loadTrack: vi.fn(),
    playMusic: vi.fn(() => true),
    pauseMusic: vi.fn(),
    unloadMusic: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicProgress: vi.fn(() => true)
}));

vi.mock("./components/SessionStatus", () => ({
    default: () => null
}));

vi.mock("./pages/Login", () => ({
    default: ({ setAccessToken }) => (
        <button
            type="button"
            onClick={() => setAccessToken("queue-test-token")}
        >
            Set test session
        </button>
    )
}));

const TRACK_ONE = {
    id: 3001,
    title: "Fixture Track One",
    durationMs: 180000,
    artist: { id: 1001, name: "Fixture Artist One" },
    album: { id: 2001, title: "Fixture Album Alpha" }
};

const TRACK_TWO = {
    id: 3004,
    title: "Fixture Track Four",
    durationMs: 222000,
    artist: { id: 1002, name: "Fixture Artist Two" },
    album: { id: 2002, title: "Fixture Album Beta" }
};

function response(status, data) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data
    };
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
        if (url === "/api/library/recently-added") {
            return response(200, [TRACK_TWO]);
        }

        if (url === "/api/library/favorites") {
            return response(200, [TRACK_ONE]);
        }

        if (url === "/api/catalog/tracks/3001") {
            return response(200, TRACK_ONE);
        }

        if (url === "/api/catalog/tracks/3004") {
            return response(200, TRACK_TWO);
        }

        if (
            url === "/api/tracks/3001/media-access" ||
            url === "/api/tracks/3004/media-access"
        ) {
            return response(204, null);
        }

        throw new Error(`Unexpected request: ${url}`);
    }));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function openLibrary() {
    render(
        <MemoryRouter initialEntries={["/login"]}>
            <App />
        </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", {
        name: "Set test session"
    }));

    fireEvent.click(screen.getByRole("link", {
        name: "Library"
    }));
}

async function selectTrackFour() {
    const recent = await screen.findByLabelText(
        "Recently added tracks"
    );

    fireEvent.click(within(recent).getByRole("button", {
        name: /Fixture Track Four/i
    }));

    await screen.findByText("Fixture Track Four", {
        selector: ".playback-bar .track-info strong"
    });
}

async function selectTrackOne() {
    const favorites = await screen.findByRole("region", {
        name: "Favorite Tracks"
    });

    fireEvent.click(within(favorites).getByRole("button", {
        name: "Select Fixture Track One"
    }));

    await screen.findByText("Fixture Track One", {
        selector: ".playback-bar .track-info strong"
    });
}

describe("SCRUM-323 queue navigation", () => {
    test("single-track queue disables navigation", async () => {
        openLibrary();
        await selectTrackFour();

        expect(screen.getByRole("button", {
            name: "Previous track"
        })).toBeDisabled();

        expect(screen.getByRole("button", {
            name: "Next track"
        })).toBeDisabled();
    });

    test("Previous and Next navigate selected tracks", async () => {
        openLibrary();
        await selectTrackFour();
        await selectTrackOne();

        const previous = screen.getByRole("button", {
            name: "Previous track"
        });

        expect(previous).toBeEnabled();

        fireEvent.click(previous);

        await waitFor(() => {
            expect(screen.getByText("Fixture Track Four", {
                selector: ".playback-bar .track-info strong"
            })).toBeInTheDocument();
        });

        expect(screen.getByRole("button", {
            name: "Previous track"
        })).toBeDisabled();

        const next = screen.getByRole("button", {
            name: "Next track"
        });

        expect(next).toBeEnabled();
        fireEvent.click(next);

        await waitFor(() => {
            expect(screen.getByText("Fixture Track One", {
                selector: ".playback-bar .track-info strong"
            })).toBeInTheDocument();
        });

        expect(screen.getByRole("button", {
            name: "Next track"
        })).toBeDisabled();
    });

    test("queue navigation persists across routes", async () => {
        openLibrary();
        await selectTrackFour();
        await selectTrackOne();

        fireEvent.click(screen.getByRole("link", {
            name: "Home"
        }));

        expect(screen.getByText("Fixture Track One", {
            selector: ".playback-bar .track-info strong"
        })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {
            name: "Previous track"
        }));

        await screen.findByText("Fixture Track Four", {
            selector: ".playback-bar .track-info strong"
        });
    });

    test("reselecting a queued track does not duplicate it", async () => {
        openLibrary();
        await selectTrackFour();
        await selectTrackOne();

        const recent = await screen.findByLabelText(
            "Recently added tracks"
        );

        fireEvent.click(within(recent).getByRole("button", {
            name: /Fixture Track Four/i
        }));

        await screen.findByText("Fixture Track Four", {
            selector: ".playback-bar .track-info strong"
        });

        expect(screen.getByRole("button", {
            name: "Previous track"
        })).toBeDisabled();

        expect(screen.getByRole("button", {
            name: "Next track"
        })).toBeEnabled();

        fireEvent.click(screen.getByRole("button", {
            name: "Next track"
        }));

        await screen.findByText("Fixture Track One", {
            selector: ".playback-bar .track-info strong"
        });

        expect(screen.getByRole("button", {
            name: "Next track"
        })).toBeDisabled();
    });
});
