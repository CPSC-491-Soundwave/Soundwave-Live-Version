import { execSync } from "node:child_process";

const wait = (ms) =>
    new Promise((resolve) =>
        setTimeout(resolve, ms)
    );

function run(command) {
    execSync(command, {
        stdio: "inherit",
    });
}

async function checkUrl(
    url,
    {
        expectedStatus = 200,
        expectedText = null,
        expectedHeader = null,
        attempts = 15,
    } = {}
) {
    let lastError;

    for (
        let attempt = 1;
        attempt <= attempts;
        attempt += 1
    ) {
        try {
            const response =
                await fetch(url);

            if (
                response.status !==
                expectedStatus
            ) {
                throw new Error(
                    `${url} returned HTTP ${response.status}; expected ${expectedStatus}`
                );
            }

            if (expectedHeader) {
                const actualValue =
                    response.headers.get(
                        expectedHeader.name
                    );

                if (
                    actualValue !==
                    expectedHeader.value
                ) {
                    throw new Error(
                        `${url} returned unexpected ${expectedHeader.name} header: ${actualValue}`
                    );
                }
            }

            const body =
                await response.text();

            if (
                expectedText &&
                body.trim() !==
                expectedText
            ) {
                throw new Error(
                    `${url} returned unexpected response: ${body}`
                );
            }

            return;
        } catch (error) {
            lastError = error;

            console.log(
                `Attempt ${attempt}/${attempts} failed. Retrying in 1 second...`
            );

            await wait(1000);
        }
    }

    throw lastError;
}

console.log(
    "Starting Soundwave Docker Compose smoke test..."
);

try {
    run(
        "docker compose up -d --build"
    );

    console.log(
        "Waiting for backend to become ready..."
    );

    await checkUrl(
        "http://localhost:8080/health",
        {
            expectedText:
                '{"status":"ok"}',
        }
    );

    console.log(
        "Backend health check passed."
    );

    console.log(
        "Checking protected Library API..."
    );

    await checkUrl(
        "http://localhost:8080/api/library/recently-added",
        {
            expectedStatus: 401,
            expectedText:
                '{"error":"Unauthorized"}',
            expectedHeader: {
                name:
                    "www-authenticate",
                value: "Bearer",
            },
        }
    );

    console.log(
        "Library API authentication boundary passed."
    );

    console.log(
        "Checking client..."
    );

    await checkUrl(
        "http://localhost:5173"
    );

    console.log(
        "Client check passed."
    );

    console.log(
        "Soundwave Compose smoke test passed."
    );
} catch (error) {
    console.error(
        "Soundwave Compose smoke test failed."
    );

    console.error(
        error.message
    );

    process.exitCode = 1;
} finally {
    console.log(
        "Stopping Compose services..."
    );

    try {
        run(
            "docker compose down"
        );
    } catch {
        console.error(
            "Unable to stop Compose services."
        );
    }
}