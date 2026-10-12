
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within
} from "@testing-library/react";

import {
    afterEach,
    expect,
    test,
    vi
} from "vitest";

import Library from "./Library.jsx";

const recentlyAddedTrack = {
    id: 3004,
    title: "Fixture Track Four",
    durationMs: 222000,
    artist: {
        id: 1002,
        name: "Fixture Artist Two"
    },
    album: {
        id: 2002,
        title: "Fixture Album Beta"
    }
};

const favoriteTrack = {
    id: 3001,
    title: "Fixture Track One",
    durationMs: 180000,
    artist: {
        id: 1001,
        name: "Fixture Artist One"
    },
    album: {
        id: 2001,
        title: "Fixture Album Alpha"
    }
};

function createResponse(status, data) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data
    };
}

function mockLibraryEndpoints({
    recentlyAddedStatus = 200,
    favoritesStatus = 200
} = {}) {
    const fetchMock = vi.fn((url) => {
        if (url === "/api/library/recently-added") {
            return Promise.resolve(
                createResponse(
                    recentlyAddedStatus,
                    [recentlyAddedTrack]
                )
            );
        }

        if (url === "/api/library/favorites") {
            return Promise.resolve(
                createResponse(
                    favoritesStatus,
                    [favoriteTrack]
                )
            );
        }

        return Promise.reject(
            new Error(`Unexpected endpoint: ${url}`)
        );
    });

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

test(
    "Library and Favorites load using the same access token",
    async () => {
        const fetchMock = mockLibraryEndpoints();
        const onSelectTrack = vi.fn();

        render(
            <Library
                accessToken="integration-test-token"
                onSelectTrack={onSelectTrack}
            />
        );

        const recentlyAddedList =
            await screen.findByLabelText(
                "Recently added tracks"
            );

        expect(
            within(recentlyAddedList).getByRole(
                "button",
                { name: /Fixture Track Four/i }
            )
        ).toBeInTheDocument();

        const favoritesSection =
            screen.getByRole("region", {
                name: "Favorite Tracks"
            });

        expect(
            await within(favoritesSection).findByText(
                "Fixture Track One"
            )
        ).toBeInTheDocument();

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/library/recently-added",
            {
                headers: {
                    Authorization:
                        "Bearer integration-test-token"
                }
            }
        );

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/library/favorites",
            expect.objectContaining({
                method: "GET",
                headers: {
                    Authorization:
                        "Bearer integration-test-token"
                }
            })
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);

        fireEvent.click(
            within(favoritesSection).getByRole(
                "button",
                { name: "Select Fixture Track One" }
            )
        );

        expect(onSelectTrack).toHaveBeenCalledWith(3001);

        fireEvent.click(
            within(recentlyAddedList).getByRole(
                "button",
                { name: /Fixture Track Four/i }
            )
        );

        expect(onSelectTrack).toHaveBeenCalledWith(3004);
        expect(onSelectTrack).toHaveBeenCalledTimes(2);
    }
);

test(
    "Favorites service failure does not hide Recently Added",
    async () => {
        mockLibraryEndpoints({
            favoritesStatus: 503
        });

        render(
            <Library accessToken="integration-test-token" />
        );

        expect(
            await screen.findByText(
                "Fixture Track Four"
            )
        ).toBeInTheDocument();

        const favoritesSection =
            screen.getByRole("region", {
                name: "Favorite Tracks"
            });

        expect(
            await within(favoritesSection).findByText(
                "Favorites are temporarily unavailable."
            )
        ).toBeInTheDocument();

        expect(
            within(favoritesSection).getByRole(
                "button",
                { name: "Retry" }
            )
        ).toBeInTheDocument();
    }
);

test(
    "Recently Added failure does not hide Favorites",
    async () => {
        mockLibraryEndpoints({
            recentlyAddedStatus: 500
        });

        render(
            <Library accessToken="integration-test-token" />
        );

        expect(
            await screen.findByText(
                "Library request failed with HTTP 500"
            )
        ).toBeInTheDocument();

        const favoritesSection =
            screen.getByRole("region", {
                name: "Favorite Tracks"
            });

        expect(
            await within(favoritesSection).findByText(
                "Fixture Track One"
            )
        ).toBeInTheDocument();
    }
);
