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

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("Library recently-added browse", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn()
        );
    });

    test(
        "shows login-required state when no access token is provided",
        () => {
            render(
                <Library accessToken="" />
            );

            expect(
                screen.getByText(
                    "Login required"
                )
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    "Log in to view your recently-added Library."
                )
            ).toBeInTheDocument();

            expect(fetch).not.toHaveBeenCalled();
        }
    );

    test(
        "shows loading state while recently-added tracks are being requested",
        async () => {
            fetch.mockImplementation(
                () =>
                    new Promise(() => { })
            );

            render(
                <Library accessToken="test-token" />
            );

            expect(
                screen.getByText(
                    "Loading recently added tracks..."
                )
            ).toBeInTheDocument();

            expect(fetch).toHaveBeenCalledWith(
                "/api/library/recently-added",
                {
                    headers: {
                        Authorization:
                            "Bearer test-token"
                    }
                }
            );
        }
    );

    test(
        "renders recently-added tracks after a successful request",
        async () => {
            fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        id: 3004,
                        title: "Fixture Track Four",
                        durationMs: 222000,
                        createdAt:
                            "2026-09-24T12:00:00.000Z",
                        album: {
                            id: 2002,
                            title:
                                "Fixture Album Beta"
                        },
                        artist: {
                            id: 1002,
                            name:
                                "Fixture Artist Two"
                        }
                    }
                ]
            });

            render(
                <Library accessToken="test-token" />
            );

            expect(
                await screen.findByText(
                    "Fixture Track Four"
                )
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    /Fixture Artist Two/
                )
            ).toBeInTheDocument();

            expect(
                screen.getByText(
                    /Fixture Album Beta/
                )
            ).toBeInTheDocument();

            expect(
                screen.getByText("3:42")
            ).toBeInTheDocument();
        }
    );

    test(
        "shows empty state when no recently-added tracks are returned",
        async () => {
            fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => []
            });

            render(
                <Library accessToken="test-token" />
            );

            expect(
                await screen.findByText(
                    "No recently-added tracks are available yet."
                )
            ).toBeInTheDocument();
        }
    );

    test(
        "shows unauthorized message when the API returns 401",
        async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 401,
                json: async () => ({
                    error: "Unauthorized"
                })
            });

            render(
                <Library accessToken="expired-token" />
            );

            expect(
                await screen.findByRole(
                    "alert"
                )
            ).toHaveTextContent(
                "Your session is not authorized. Please log in again."
            );
        }
    );

    test(
        "shows an error state when the Library API fails",
        async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 500,
                json: async () => ({
                    error:
                        "library_unavailable"
                })
            });

            render(
                <Library accessToken="test-token" />
            );

            expect(
                await screen.findByRole(
                    "alert"
                )
            ).toHaveTextContent(
                "Library request failed with HTTP 500"
            );
        }
    );

    test(
        "does not update the page after unmounting during an in-flight request",
        async () => {
            let resolveRequest;

            fetch.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveRequest = resolve;
                    })
            );

            const {
                unmount
            } = render(
                <Library accessToken="test-token" />
            );

            unmount();

            resolveRequest({
                ok: true,
                status: 200,
                json: async () => []
            });

            await waitFor(() => {
                expect(fetch).toHaveBeenCalled();
            });
        }
    );

    test(
        "selects a recently-added track for playback",
        async () => {
            const onSelectTrack =
                vi.fn();

            fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        id: 3004,
                        title:
                            "Fixture Track Four",
                        durationMs: 222000,
                        album: {
                            id: 2002,
                            title:
                                "Fixture Album Beta"
                        },
                        artist: {
                            id: 1002,
                            name:
                                "Fixture Artist Two"
                        }
                    }
                ]
            });

            render(
                <Library
                    accessToken="test-token"
                    onSelectTrack={
                        onSelectTrack
                    }
                />
            );

            const track =
                await screen.findByRole(
                    "button",
                    {
                        name:
                            /Fixture Track Four/i
                    }
                );

            track.click();

            expect(
                onSelectTrack
            ).toHaveBeenCalledTimes(1);

            expect(
                onSelectTrack
            ).toHaveBeenCalledWith(
                3004
            );
        }
    );
});