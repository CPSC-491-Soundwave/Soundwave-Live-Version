
import { spawnSync } from "node:child_process";
import {
    mkdtempSync,
    writeFileSync,
    rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const project = `sw-health-${randomUUID().slice(0, 8)}`;

const tempDirectory = mkdtempSync(
    join(tmpdir(), "sw-health-")
);

const overrideFile = join(
    tempDirectory,
    "health.yml"
);

const port = Number(
    process.env.HEALTH_TEST_PORT ?? 18081
);

const timeoutMs = Number(
    process.env.HEALTH_TEST_TIMEOUT_MS ?? 30000
);

const forceFailure =
    process.env.HEALTH_TEST_FORCE_FAILURE === "1";

if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
) {
    throw new Error("Invalid health test configuration.");
}

writeFileSync(
    overrideFile,
    `services:
  server:
    ports: !override
      - "127.0.0.1:${port}:8080"
`
);

const composeArgs = [
    "compose",
    "-p", project,
    "-f", join(root, "compose.yml"),
    "-f", join(root, "compose.ci.yml"),
    "-f", overrideFile
];

function docker(args, { allowFailure = false } = {}) {
    const result = spawnSync("docker", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120000
    });

    if (result.stdout) {
        process.stdout.write(result.stdout);
    }

    if (result.stderr) {
        process.stderr.write(result.stderr);
    }

    if (
        result.error ||
        (result.status !== 0 && !allowFailure)
    ) {
        throw new Error(
            `Docker command failed: ${result.error?.message ?? result.status}`
        );
    }

    return result;
}

const compose = (args, options) =>
    docker([...composeArgs, ...args], options);

const wait = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

function inspect(service) {
    const id = compose(["ps", "-q", "-a", service])
        .stdout.trim();

    if (!id) {
        throw new Error(
            `No container found for service: ${service}`
        );
    }

    const result = docker([
        "inspect",
        "--format",
        "{{json .State}}",
        id
    ]);

    return JSON.parse(result.stdout.trim());
}

function assertState(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function backendReady() {
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        1500
    );

    try {
        const response = await fetch(
            `http://127.0.0.1:${port}/health`,
            { signal: controller.signal }
        );

        if (response.status !== 200) {
            return false;
        }

        const body = await response.json();

        return body.status === "ok";
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

async function waitForReady() {
    const start = performance.now();

    while (performance.now() - start < timeoutMs) {
        if (await backendReady()) {
            return Math.round(performance.now() - start);
        }

        await wait(500);
    }

    throw new Error(
        `Backend readiness failed within ${timeoutMs}ms timeout`
    );
}

async function main() {
    let failed = false;

    try {
        console.log(
            "SCRUM-246 Container Health-State Verification"
        );

        console.log(`Isolated project: ${project}`);

        compose(["config", "--quiet"]);

        console.log("Starting isolated services...");
        compose(["up", "-d", "--build", "server"]);

        const readinessMs = await waitForReady();

        const server = inspect("server");
        const database = inspect("database");

        assertState(
            server.Running === true,
            "Backend container is not running."
        );

        console.log(
            "PASS: Backend container running."
        );

        assertState(
            database.Running === true,
            "Database container is not running."
        );

        assertState(
            database.Health?.Status === "healthy",
            `Database health unexpected: ${database.Health?.Status}`
        );

        console.log(
            "PASS: Database container healthy."
        );

        console.log(
            `PASS: Backend /health ready in ${readinessMs}ms.`
        );

        if (forceFailure) {
            console.log(
                "TEST INJECTION: Expecting an invalid backend state."
            );

            assertState(
                server.Running === false,
                "Injected unexpected backend state detected."
            );
        }

        console.log("Stopping backend...");
        compose(["stop", "server"]);

        const stopped = inspect("server");

        assertState(
            stopped.Running === false,
            "Backend container remained running."
        );

        assertState(
            await backendReady() === false,
            "Backend remained HTTP-ready after stopping."
        );

        console.log(
            "PASS: Backend stopped and unavailable."
        );

        console.log("SCRUM-246: PASS");
    } catch (error) {
        failed = true;

        console.error(
            `SCRUM-246: FAIL - ${error.message}`
        );

        console.error("Collecting diagnostics...");

        try {
            compose(
                ["ps", "-a"],
                { allowFailure: true }
            );

            compose(
                ["logs", "--tail", "60"],
                { allowFailure: true }
            );
        } catch (error) {
            console.error(
                `Diagnostics failed: ${error.message}`
            );
        }
    } finally {
        console.log(
            "Cleaning up isolated Compose project..."
        );

        try {
            compose([
                "down",
                "--volumes",
                "--remove-orphans"
            ]);
        } catch (error) {
            failed = true;

            console.error(
                `Cleanup failed: ${error.message}`
            );
        }

        rmSync(tempDirectory, {
            recursive: true,
            force: true
        });

        if (failed) {
            process.exitCode = 1;
        }
    }
}

await main();
