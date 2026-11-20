
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// SCRUM-259: Production-build navigation and Library integration.

const TRACK = {
    id: 3005,
    title: "Kontekst",
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

const audioPath = fileURLToPath(
    new URL("../../mediaFiles/test.mp3", import.meta.url)
);

const audioFixture = readFileSync(audioPath);

function monitorPlayback(page) {
    page.on("response", (response) => {
        const url = response.url();

        if (
            url.includes("/api/catalog/tracks/") ||
            url.includes("/media-access") ||
            url.includes("/stream")
        ) {
            console.log(
                "Playback API:",
                response.status(),
                url
            );
        }
    });

    page.on("requestfailed", (request) => {
        console.log(
            "Failed request:",
            request.url(),
            request.failure()?.errorText
        );
    });

    page.on("console", (message) => {
        if (message.type() === "error") {
            console.log(
                "Browser error:",
                message.text()
            );
        }
    });

    page.on("pageerror", (error) => {
        console.log(
            "Page error:",
            error.message
        );
    });
}

async function mockAuthenticatedSession(
    page,
    tracks = [TRACK]
) {
    await page.route("**/auth/login", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                accessToken: "scrum259-test-token"
            })
        });
    });

    await page.route("**/auth/me", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                user: {
                    id: 42,
                    username: "scrum259-user",
                    role: "user"
                }
            })
        });
    });

    await page.route("**/account/profile", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                user: {
                    id: 42,
                    username: "scrum259-user",
                    role: "user"
                },
                preferences: {
                    audioQualityPreference: "high"
                }
            })
        });
    });

    await page.route(
        "**/api/library/recently-added",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(tracks)
            });
        }
    );

    await page.route(
        "**/api/library/favorites",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "[]"
            });
        }
    );

    await page.route(
        "**/api/catalog/tracks/3005",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(TRACK)
            });
        }
    );

    await page.route(
        "**/api/tracks/3005/media-access",
        async (route) => {
            await route.fulfill({
                status: 204,
                body: ""
            });
        }
    );

    // Controlled audio fixture for the production browser test.
    // Supports full and byte-range media requests.
    await page.route(
        "**/api/tracks/3005/stream",
        async (route) => {
            const requestRange =
                route.request().headers()["range"];

            const total = audioFixture.length;

            const match = requestRange?.match(
                /^bytes=(\d+)-(\d*)$/
            );

            if (requestRange && !match) {
                await route.fulfill({
                    status: 416,
                    headers: {
                        "Content-Range": `bytes */${total}`
                    },
                    body: ""
                });
                return;
            }

            if (match) {
                const start = Number(match[1]);
                const requestedEnd = match[2]
                    ? Number(match[2])
                    : total - 1;

                if (
                    !Number.isSafeInteger(start) ||
                    !Number.isSafeInteger(requestedEnd) ||
                    start >= total ||
                    requestedEnd < start
                ) {
                    await route.fulfill({
                        status: 416,
                        headers: {
                            "Content-Range": `bytes */${total}`
                        },
                        body: ""
                    });
                    return;
                }

                const end = Math.min(
                    requestedEnd,
                    total - 1
                );

                const body = audioFixture.subarray(
                    start,
                    end + 1
                );

                await route.fulfill({
                    status: 206,
                    contentType: "audio/mpeg",
                    headers: {
                        "Accept-Ranges": "bytes",
                        "Content-Range":
                            `bytes ${start}-${end}/${total}`
                    },
                    body
                });

                return;
            }

            await route.fulfill({
                status: 200,
                contentType: "audio/mpeg",
                headers: {
                    "Accept-Ranges": "bytes"
                },
                body: audioFixture
            });
        }
    );
}

async function login(page) {
    await page.goto("/login");

    await page.getByLabel("Username").fill(
        "scrum259-user"
    );

    await page.getByLabel("Password").fill(
        "test-password"
    );

    await page.getByRole("button", {
        name: "Login",
        exact: true
    }).click();

    await expect(
        page.getByText(
            "You are successfully authenticated."
        )
    ).toBeVisible();
}

test.describe("SCRUM-259 production navigation", () => {
    test(
        "direct route loading renders the application",
        async ({ page }) => {
            for (const route of [
                "/",
                "/search",
                "/library"
            ]) {
                await page.goto(route);

                await expect(
                    page.getByText("Soundwave").first()
                ).toBeVisible();

                await expect(page).toHaveURL(
                    route === "/"
                        ? /\/$/
                        : new RegExp(`${route}$`)
                );
            }
        }
    );

    test(
        "browser Back and Forward navigation works",
        async ({ page }) => {
            await page.goto("/");

            await page.getByRole("link", {
                name: "Search",
                exact: true
            }).click();

            await expect(page).toHaveURL(/\/search$/);

            await page.getByRole("link", {
                name: "Library",
                exact: true
            }).click();

            await expect(page).toHaveURL(/\/library$/);

            await page.goBack();
            await expect(page).toHaveURL(/\/search$/);

            await page.goForward();
            await expect(page).toHaveURL(/\/library$/);
        }
    );

    test(
        "guest Library displays login-required state",
        async ({ page }) => {
            await page.goto("/library");

            await expect(
                page.getByText("Login required")
            ).toBeVisible();
        }
    );
});

test.describe("SCRUM-259 production Library integration", () => {
    test(
        "authenticated Library displays fixture tracks",
        async ({ page }) => {
            await mockAuthenticatedSession(page);
            await login(page);

            await page.getByRole("link", {
                name: "Library",
                exact: true
            }).click();

            await expect(
                page.getByText("Kontekst").first()
            ).toBeVisible();

            await expect(
                page.getByRole("button", {
                    name: "Select Kontekst"
                })
            ).toBeVisible();
        }
    );

    test(
        "empty Library displays controlled empty state",
        async ({ page }) => {
            await mockAuthenticatedSession(page, []);
            await login(page);

            await page.getByRole("link", {
                name: "Library",
                exact: true
            }).click();

            await expect(
                page.getByText(
                    "No recently-added tracks are available yet."
                )
            ).toBeVisible();
        }
    );

    test(
        "selected track persists after route navigation",
        async ({ page }) => {
            monitorPlayback(page);

            await mockAuthenticatedSession(page);
            await login(page);

            await page.getByRole("link", {
                name: "Library",
                exact: true
            }).click();

            const selectTrack = page.getByRole(
                "button",
                { name: "Select Kontekst" }
            );

            await expect(selectTrack).toBeVisible();

            await selectTrack.click();

            const playbackTitle = page.locator(
                ".playback-bar .track-info strong"
            );

            await expect(playbackTitle).toHaveText(
                "Kontekst",
                { timeout: 10000 }
            );

            await page.getByRole("link", {
                name: "Home",
                exact: true
            }).click();

            await expect(page).toHaveURL(/\/$/);

            await expect(playbackTitle).toHaveText(
                "Kontekst"
            );

            console.log(
                "PASS: Selected track persisted across navigation."
            );
        }
    );
});
