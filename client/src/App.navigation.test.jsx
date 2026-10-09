
import {
    render,
    screen,
    waitFor,
    fireEvent,
    cleanup
} from "@testing-library/react";

import {
    MemoryRouter,
    useLocation,
    useNavigate
} from "react-router-dom";

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi
} from "vitest";

import App from "./App";

vi.mock("./components/PlaybackBar", () => ({
    default: ({ trackId }) => (
        <div data-testid="playback-bar">
            Selected track: {trackId ?? "none"}
        </div>
    )
}));

vi.mock("./components/BackendStatus", () => ({
    default: () => (
        <div data-testid="backend-status">
            Backend status mocked
        </div>
    )
}));

vi.mock("./pages/Home", () => ({
    default: () => <h1>Home Page</h1>
}));

vi.mock("./pages/Search", () => ({
    default: () => <h1>Search Page</h1>
}));

vi.mock("./pages/Artists", () => ({
    default: () => <h1>Artists Page</h1>
}));

vi.mock("./pages/ArtistDetail", () => ({
    default: () => <h1>Artist Detail Page</h1>
}));

vi.mock("./pages/Albums", () => ({
    default: () => <h1>Albums Page</h1>
}));

vi.mock("./pages/AlbumDetail", () => ({
    default: () => <h1>Album Detail Page</h1>
}));

vi.mock("./pages/CatalogDebug", () => ({
    default: () => <h1>Catalog Debug Page</h1>
}));

function NavigationControls() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div>
            <p data-testid="current-path">
                {location.pathname}
            </p>

            <button
                type="button"
                onClick={() => navigate(-1)}
            >
                Go Back
            </button>

            <button
                type="button"
                onClick={() => navigate(1)}
            >
                Go Forward
            </button>
        </div>
    );
}

function renderApp(initialEntries = ["/"]) {
    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <NavigationControls />
            <App />
        </MemoryRouter>
    );
}

const successfulLogin = {
    ok: true,
    status: 200,
    json: async () => ({
        accessToken: "navigation-test-token"
    })
};

const successfulIdentity = {
    ok: true,
    status: 200,
    json: async () => ({
        user: {
            id: 42,
            username: "navigation-user",
            role: "user"
        }
    })
};

const successfulProfile = {
    ok: true,
    status: 200,
    json: async () => ({
        user: {
            id: 42,
            username: "navigation-user",
            role: "user"
        },
        preferences: {
            audioQualityPreference: "high"
        }
    })
};

function mockAuthenticatedRequests() {
    fetch.mockImplementation(async (url) => {
        if (url === "/auth/login") {
            return successfulLogin;
        }

        if (url === "/auth/me") {
            return successfulIdentity;
        }

        if (url === "/account/profile") {
            return successfulProfile;
        }

        if (url === "/api/library/recently-added") {
            return {
                ok: true,
                status: 200,
                json: async () => []
            };
        }

        throw new Error(`Unexpected request: ${url}`);
    });
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("SCRUM-201 client navigation", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    test("guest direct Library navigation shows login-required state", () => {
        renderApp(["/library"]);

        expect(
            screen.getByText("Login required")
        ).toBeInTheDocument();

        expect(
            screen.getByTestId("current-path")
        ).toHaveTextContent("/library");

        expect(fetch).not.toHaveBeenCalled();
    });

    test("guest direct Profile navigation shows login-required state", () => {
        renderApp(["/profile"]);

        expect(
            screen.getByText(
                "Log in to view your account profile."
            )
        ).toBeInTheDocument();

        expect(
            screen.getByRole("link", {
                name: "Go to Login"
            })
        ).toHaveAttribute("href", "/login");

        expect(fetch).not.toHaveBeenCalled();
    });

    test("guest can navigate between public pages", () => {
        renderApp(["/"]);

        fireEvent.click(
            screen.getByRole("link", {
                name: "Search"
            })
        );

        expect(
            screen.getByText("Search Page")
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("link", {
                name: "Home"
            })
        );

        expect(
            screen.getByText("Home Page")
        ).toBeInTheDocument();
    });

    test("Sidebar navigation preserves guest protection state", () => {
        renderApp(["/"]);

        fireEvent.click(
            screen.getByRole("link", {
                name: "Library"
            })
        );

        expect(
            screen.getByText("Login required")
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("link", {
                name: "Profile"
            })
        );

        expect(
            screen.getByText(
                "Log in to view your account profile."
            )
        ).toBeInTheDocument();
    });

    test("Profile login link navigates to login form", () => {
        renderApp(["/profile"]);

        fireEvent.click(
            screen.getByRole("link", {
                name: "Go to Login"
            })
        );

        expect(
            screen.getByTestId("current-path")
        ).toHaveTextContent("/login");

        expect(
            screen.getByRole("button", {
                name: "Login"
            })
        ).toBeInTheDocument();
    });

    test("successful login allows authenticated Library navigation", async () => {
        mockAuthenticatedRequests();

        renderApp(["/login"]);

        fireEvent.change(
            screen.getByLabelText("Username"),
            {
                target: {
                    value: "navigation-user"
                }
            }
        );

        fireEvent.change(
            screen.getByLabelText("Password"),
            {
                target: {
                    value: "test-password"
                }
            }
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Login"
            })
        );

        expect(
            await screen.findByText(
                "You are successfully authenticated."
            )
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("link", {
                name: "Library"
            })
        );

        expect(
            await screen.findByText(
                "No recently-added tracks are available yet."
            )
        ).toBeInTheDocument();

        expect(fetch).toHaveBeenCalledWith(
            "/api/library/recently-added",
            {
                headers: {
                    Authorization:
                        "Bearer navigation-test-token"
                }
            }
        );
    });

    test("successful login allows authenticated Profile navigation", async () => {
        mockAuthenticatedRequests();

        renderApp(["/login"]);

        fireEvent.change(
            screen.getByLabelText("Username"),
            {
                target: {
                    value: "navigation-user"
                }
            }
        );

        fireEvent.change(
            screen.getByLabelText("Password"),
            {
                target: {
                    value: "test-password"
                }
            }
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Login"
            })
        );

        await screen.findByText(
            "You are successfully authenticated."
        );

        fireEvent.click(
            screen.getByRole("link", {
                name: "Profile"
            })
        );

        expect(
            await screen.findByText(
                "navigation-user"
            )
        ).toBeInTheDocument();

        expect(fetch).toHaveBeenCalledWith(
            "/account/profile",
            {
                method: "GET",
                headers: {
                    Authorization:
                        "Bearer navigation-test-token"
                },
                cache: "no-store"
            }
        );
    });

    test("back and forward navigation restores route-specific guest views", () => {
        renderApp(["/"]);

        fireEvent.click(
            screen.getByRole("link", {
                name: "Library"
            })
        );

        expect(
            screen.getByText("Login required")
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("link", {
                name: "Profile"
            })
        );

        expect(
            screen.getByText(
                "Log in to view your account profile."
            )
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Go Back"
            })
        );

        expect(
            screen.getByText("Login required")
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Go Forward"
            })
        );

        expect(
            screen.getByText(
                "Log in to view your account profile."
            )
        ).toBeInTheDocument();
    });

    test("remounting App resets in-memory authentication state", async () => {
        mockAuthenticatedRequests();

        const { unmount } = renderApp(["/login"]);

        fireEvent.change(
            screen.getByLabelText("Username"),
            {
                target: {
                    value: "navigation-user"
                }
            }
        );

        fireEvent.change(
            screen.getByLabelText("Password"),
            {
                target: {
                    value: "test-password"
                }
            }
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Login"
            })
        );

        await screen.findByText(
            "You are successfully authenticated."
        );

        unmount();

        renderApp(["/library"]);

        expect(
            screen.getByText("Login required")
        ).toBeInTheDocument();

        await waitFor(() => {
            expect(
                screen.getByTestId("current-path")
            ).toHaveTextContent("/library");
        });
    });
});
