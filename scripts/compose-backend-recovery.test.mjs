
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
const project = `sw-recovery-${randomUUID().slice(0, 8)}`;
const tempDirectory = mkdtempSync(
    join(tmpdir(), "sw-recovery-")
);
const overrideFile = join(
    tempDirectory,
    "recovery.yml"
);

const port = Number(
    process.env.RECOVERY_PORT ?? 18080
);

const timeoutMs = Number(
    process.env.RECOVERY_TIMEOUT_MS ?? 30000
);

const forceRecoveryFailure =
    process.env.RECOVERY_FORCE_FAILURE === "1";

if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
) {
    throw new Error(
        "Invalid recovery test configuration."
    );
}

// Replace the original host port mapping rather than
// publishing both 8080 and 18080.
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
            stdio: [
                "ignore",
                "pipe",
                "pipe"
            ],
            timeout: 120000
        }
    );

    if (result.stdout) {
        process.stdout.write(
            result.stdout
        );
    }

    if (result.stderr) {
        process.stderr.write(
            result.stderr
        );
    }

    if (
        result.error ||
        (
            result.status !== 0 &&
            !allowFailure
        )
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
    docker(
        [...composeArgs, ...args],
        options
    );

const wait = (ms) =>
    new Promise((resolve) =>
        setTimeout(resolve, ms)
    );

async function isHealthy() {
    const controller =
        new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        1500
    );

    try {
        const response = await fetch(
            `http://127.0.0.1:${port}/health`,
            {
                signal: controller.signal
            }
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

async function waitForHealth(phase = "recovery") {
    const start = performance.now();

    while (
        performance.now() - start < timeoutMs
    ) {
        if (await isHealthy()) {
            return Math.round(
                performance.now() - start
            );
        }

        await wait(500);
    }

    throw new Error(
        `Backend ${phase} failed within ${timeoutMs}ms timeout`
    );
}

async function main() {
    let failed = false;

    try {
        console.log(
            "SCRUM-247 Backend Recovery Test"
        );

        console.log(
            `Isolated project: ${project}`
        );

        compose([
            "config",
            "--quiet"
        ]);

        console.log(
            "Starting isolated database and backend..."
        );

        compose([
            "up",
            "-d",
            "--build",
            "server"
        ]);

        await waitForHealth("initial readiness");

        console.log(
            "PASS: Initial backend health verified."
        );

        console.log(
            "Stopping backend..."
        );

        compose([
            "stop",
            "server"
        ]);

        const stopped = compose([
            "ps",
            "-a",
            "--status",
            "exited",
            "--services"
        ]);

        if (
            !stopped.stdout
                .split(/\r?\n/)
                .includes("server")
        ) {
            throw new Error(
                "Backend stop state was not observed."
            );
        }

        if (await isHealthy()) {
            throw new Error(
                "Backend remained reachable after stop."
            );
        }

        console.log(
            "PASS: Temporary unavailability detected."
        );

        console.log(
            "Restarting backend..."
        );

        const start = performance.now();

        if (forceRecoveryFailure) {
            console.log(
                "TEST INJECTION: Simulating permanent backend recovery failure."
            );

            // Deliberately leave the isolated backend
            // stopped so bounded health polling must fail.
            // This does not modify backend application code.
        } else {
            compose([
                "start",
                "server"
            ]);
        }

        const elapsed =
            await waitForHealth("recovery");

        const totalRecoveryMs = Math.round(
            performance.now() - start
        );

        console.log(
            `PASS: Backend recovered in ${totalRecoveryMs}ms`
        );

        console.log(
            `Health polling duration: ${elapsed}ms`
        );

        console.log(
            "SCRUM-247: PASS"
        );
    } catch (error) {
        failed = true;

        console.error(
            `SCRUM-247: FAIL - ${error.message}`
        );

        console.error(
            "Collecting diagnostics..."
        );

        try {
            compose(
                ["ps", "-a"],
                { allowFailure: true }
            );

            compose(
                [
                    "logs",
                    "--tail",
                    "60",
                    "server"
                ],
                { allowFailure: true }
            );
        } catch (diagnosticError) {
            console.error(
                `Diagnostics failed: ${diagnosticError.message}`
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

        rmSync(
            tempDirectory,
            {
                recursive: true,
                force: true
            }
        );

        if (failed) {
            process.exitCode = 1;
        }
    }
}

await main();
