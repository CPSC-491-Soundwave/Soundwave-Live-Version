
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
    mkdtempSync,
    rmSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
    printResourceDiagnostics
} from "./compose-resource-diagnostics.mjs";

const root = resolve(import.meta.dirname, "..");
const project = `sw-client-${randomUUID().slice(0, 8)}`;
const tempDirectory = mkdtempSync(
    join(tmpdir(), "sw-client-")
);
const overrideFile = join(
    tempDirectory,
    "client-recovery.yml"
);

const clientPort = Number(
    process.env.CLIENT_RECOVERY_PORT ?? 15173
);
const backendPort = Number(
    process.env.CLIENT_RECOVERY_BACKEND_PORT ?? 18082
);
const timeoutMs = Number(
    process.env.CLIENT_RECOVERY_TIMEOUT_MS ?? 30000
);
const forceFailure =
    process.env.CLIENT_RECOVERY_FORCE_FAILURE === "1";

if (
    !Number.isInteger(clientPort) ||
    clientPort < 1 ||
    clientPort > 65535 ||
    !Number.isInteger(backendPort) ||
    backendPort < 1 ||
    backendPort > 65535 ||
    clientPort === backendPort ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
) {
    throw new Error(
        "Invalid client recovery configuration."
    );
}

writeFileSync(
    overrideFile,
    `services:
  server:
    ports: !override
      - "127.0.0.1:${backendPort}:8080"
  client:
    ports: !override
      - "127.0.0.1:${clientPort}:5173"
`
);

const composeArgs = [
    "compose",
    "-p", project,
    "-f", join(root, "compose.yml"),
    "-f", join(root, "compose.ci.yml"),
    "-f", overrideFile
];

function docker(
    args,
    { allowFailure = false } = {}
) {
    const result = spawnSync(
        "docker",
        args,
        {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 180000
        }
    );

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
            `Docker command failed: ${result.error?.message ??
            result.status
            }`
        );
    }

    return result;
}

const compose = (args, options) =>
    docker([...composeArgs, ...args], options);

const wait = (ms) =>
    new Promise((resolve) =>
        setTimeout(resolve, ms)
    );

function inspect(service) {
    const id = compose([
        "ps", "-a", "-q", service
    ]).stdout.trim();

    if (!id) {
        throw new Error(
            `Missing container: ${service}`
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

async function checkHttp(
    port,
    path,
    expectedText = null
) {
    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        1500
    );

    try {
        const response = await fetch(
            `http://127.0.0.1:${port}${path}`,
            { signal: controller.signal }
        );

        if (response.status !== 200) {
            return false;
        }

        if (expectedText !== null) {
            const body = await response.text();
            return body.trim() === expectedText;
        }

        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

const clientReady = () =>
    checkHttp(clientPort, "/");

const backendReady = () =>
    checkHttp(
        backendPort,
        "/health",
        '{"status":"ok"}'
    );

async function waitForReady(check, service) {
    const start = performance.now();

    while (performance.now() - start < timeoutMs) {
        if (await check()) {
            return Math.round(
                performance.now() - start
            );
        }

        await wait(500);
    }

    throw new Error(
        `${service} did not become ready within ${timeoutMs}ms`
    );
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertDependenciesHealthy() {
    const server = inspect("server");
    const database = inspect("database");

    assert(
        server.Running === true,
        "Backend container is not running."
    );

    assert(
        database.Running === true &&
        database.Health?.Status === "healthy",
        "Database is not running and healthy."
    );
}

async function main() {
    let failed = false;

    try {
        console.log(
            "SCRUM-248 Client Restart Verification"
        );
        console.log(
            `Isolated project: ${project}`
        );

        compose(["config", "--quiet"]);

        console.log("Starting isolated services...");
        compose(["up", "-d", "--build"]);

        await waitForReady(backendReady, "Backend");

        const initialClientMs = await waitForReady(
            clientReady,
            "Client"
        );

        assertDependenciesHealthy();

        console.log(
            `PASS: Initial client available in ${initialClientMs}ms.`
        );
        console.log(
            "PASS: Backend and database operational."
        );

        const backendBefore = compose([
            "ps", "-q", "server"
        ]).stdout.trim();

        const databaseBefore = compose([
            "ps", "-q", "database"
        ]).stdout.trim();

        console.log("Stopping only the client...");
        compose(["stop", "client"]);

        assert(
            inspect("client").Running === false,
            "Client container did not stop."
        );

        assert(
            !(await clientReady()),
            "Client remained available after stop."
        );

        console.log(
            "PASS: Temporary client unavailability detected."
        );

        assertDependenciesHealthy();

        assert(
            await backendReady(),
            "Backend became unavailable during client interruption."
        );

        console.log(
            "PASS: Backend and database remained operational."
        );

        console.log(
            "Restarting client without rebuilding services..."
        );

        const start = performance.now();

        if (forceFailure) {
            console.log(
                "TEST INJECTION: Preventing client recovery."
            );
        } else {
            compose(["start", "client"]);
        }

        const recoveryMs = await waitForReady(
            clientReady,
            "Client recovery"
        );

        const totalRecoveryMs = Math.round(
            performance.now() - start
        );

        assertDependenciesHealthy();

        assert(
            await backendReady(),
            "Backend unavailable after client restart."
        );

        const backendAfter = compose([
            "ps", "-q", "server"
        ]).stdout.trim();

        const databaseAfter = compose([
            "ps", "-q", "database"
        ]).stdout.trim();

        assert(
            backendBefore === backendAfter &&
            databaseBefore === databaseAfter,
            "Backend or database container was replaced."
        );

        console.log(
            "PASS: Backend and database containers unchanged."
        );

        console.log(
            `PASS: Client recovered in ${totalRecoveryMs}ms.`
        );

        console.log(
            `Health polling duration: ${recoveryMs}ms`
        );

        console.log("SCRUM-248: PASS");
    } catch (error) {
        failed = true;

        console.error(
            `SCRUM-248: FAIL - ${error.message}`
        );

        console.error(
            "Collecting resource diagnostics..."
        );

        try {
            printResourceDiagnostics(project);
        } catch {
            console.error(
                "Resource diagnostics unavailable."
            );
        }

        console.error(
            "Collecting Compose diagnostics..."
        );

        try {
            compose(
                ["ps", "-a"],
                { allowFailure: true }
            );

            compose(
                ["logs", "--tail", "60"],
                { allowFailure: true }
            );
        } catch {
            console.error(
                "Compose diagnostics unavailable."
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

        try {
            rmSync(
                tempDirectory,
                {
                    recursive: true,
                    force: true
                }
            );
        } catch (error) {
            failed = true;
            console.error(
                `Temporary file cleanup failed: ${error.message}`
            );
        }

        if (failed) {
            process.exitCode = 1;
        }
    }
}

await main();
