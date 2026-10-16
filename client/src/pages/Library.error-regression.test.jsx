
import {
    cleanup,
    render,
    screen,
    waitFor
} from "@testing-library/react";

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi
} from "vitest";

import Library from "./Library";

vi.mock("../components/FavoritesSection.jsx", () => ({
    default: () => null
}));

const OLD_TRACK = {
    id: 3001,
    title: "Old Session Track",
    durationMs: 180000,
    artist: { name: "Old Artist" },
    album: { title: "Old Album" }
};

const NEW_TRACK = {
    id: 3004,
    title: "New Session Track",
    durationMs: 222000,
    artist: { name: "New Artist" },
    album: { title: "New Album" }
};

function response(status, data) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data
    };
}

function deferred() {
    let resolve;

    const promise = new Promise((done) => {
        resolve = done;
    });

    return { promise, resolve };
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("SCRUM-180 Library error-state regression", () => {
    test("shows controlled error for malformed Library response", async () => {
        fetch.mockResolvedValue(
            response(200, { tracks: [] })
        );

        render(
            <Library accessToken="test-token" />
        );

        expect(
            await screen.findByRole("alert")
        ).toHaveTextContent(
            "Library response was not an array."
        );

        expect(
            screen.queryByLabelText("Recently added tracks")
        ).not.toBeInTheDocument();
    });

    test("shows controlled error when Library network request fails", async () => {
        fetch.mockRejectedValue(
            new Error("Network request failed")
        );

        render(
            <Library accessToken="test-token" />
        );

        expect(
            await screen.findByRole("alert")
        ).toHaveTextContent(
            "Network request failed"
        );

        expect(
            screen.getByText("Your Library")
        ).toBeInTheDocument();
    });

    test("ignores stale response after access token changes", async () => {
        const oldRequest = deferred();

        fetch.mockImplementation((url, options) => {
            if (url !== "/api/library/recently-added") {
                throw new Error(`Unexpected request: ${url}`);
            }

            if (
                options.headers.Authorization ===
                "Bearer old-token"
            ) {
                return oldRequest.promise;
            }

            if (
                options.headers.Authorization ===
                "Bearer new-token"
            ) {
                return Promise.resolve(
                    response(200, [NEW_TRACK])
                );
            }

            throw new Error("Unexpected token");
        });

        const { rerender } = render(
            <Library accessToken="old-token" />
        );

        rerender(
            <Library accessToken="new-token" />
        );

        expect(
            await screen.findByText("New Session Track")
        ).toBeInTheDocument();

        oldRequest.resolve(
            response(200, [OLD_TRACK])
        );

        await waitFor(() => {
            expect(
                screen.queryByText("Old Session Track")
            ).not.toBeInTheDocument();
        });

        expect(
            screen.getByText("New Session Track")
        ).toBeInTheDocument();
    });
});
