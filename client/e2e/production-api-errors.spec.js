
import { test, expect } from "@playwright/test";

// SCRUM-260: Production-build API error regression tests.
// These tests run against the compiled Soundwave client
// while intercepting selected backend API responses.

async function mockLogin(page) {
    await page.route("**/auth/login", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                accessToken: "scrum260-test-token"
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
                    username: "scrum260-user",
                    role: "user"
                }
            })
        });
    });

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

    await page.goto("/login");

    await page.getByLabel("Username").fill(
        "scrum260-user"
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

test.describe("SCRUM-260 production API error handling", () => {
    test(
        "Library handles HTTP 503 without crashing",
        async ({ page }) => {
            await mockLogin(page);

            await page.route(
                "**/api/library/recently-added",
                async (route) => {
                    await route.fulfill({
                        status: 503,
                        contentType: "application/json",
                        body: JSON.stringify({
                            error: "SERVICE_UNAVAILABLE"
                        })
                    });
                }
            );

            await page.getByRole("link", {
                name: "Library",
                exact: true
            }).click();

            await expect(
                page.getByText(
                    "Library request failed with HTTP 503"
                )
            ).toBeVisible();

            await expect(
                page.getByText("Your Library")
            ).toBeVisible();

            await expect(
                page.getByText("Soundwave").first()
            ).toBeVisible();

            console.log(
                "PASS: HTTP 503 produced controlled Library error."
            );
        }
    );

    test(
        "Library rejects an unexpected API response",
        async ({ page }) => {
            await mockLogin(page);

            await page.route(
                "**/api/library/recently-added",
                async (route) => {
                    await route.fulfill({
                        status: 200,
                        contentType: "application/json",
                        body: JSON.stringify({
                            tracks: []
                        })
                    });
                }
            );

            await page.getByRole("link", {
                name: "Library",
                exact: true
            }).click();

            await expect(
                page.getByText(
                    "Library response was not an array."
                )
            ).toBeVisible();

            await expect(
                page.getByText("Your Library")
            ).toBeVisible();

            console.log(
                "PASS: Unexpected API response handled safely."
            );
        }
    );
});
