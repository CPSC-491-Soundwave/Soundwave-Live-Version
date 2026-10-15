
import {
    mkdtempSync,
    writeFileSync,
    rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import net from "node:net";

const project = `swcleanup${randomBytes(6).toString("hex")}`;
const tempDir = mkdtempSync(
    join(tmpdir(), "soundwave-cleanup-")
);

const results = [];

function run(command, args, timeout = 120000) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout,
        maxBuffer: 10 * 1024 * 1024
    });

    if (result.error) {
        throw result.error;
    }

    return result;
}

function docker(args) {
    return run("docker", args);
}

function requireSuccess(result, operation) {
    if (result.status !== 0) {
        throw new Error(
            `${operation} failed:\n${result.stderr || result.stdout}`
        );
    }

    return result.stdout.trim();
}

function listResources(type) {
    const args = type === "container"
        ? ["ps", "-aq"]
        : type === "network"
            ? ["network", "ls", "-q"]
            : ["volume", "ls", "-q"];

    return requireSuccess(
        docker([
            ...args,
            "--filter",
            `label=com.docker.compose.project=${project}`
        ]),
        `List ${type} resources`
    ).split(/\s+/).filter(Boolean);
}

function resourceExists(type, id) {
    const args = type === "container"
        ? ["container", "inspect", id]
        : type === "network"
            ? ["network", "inspect", id]
            : ["volume", "inspect", id];

    return docker(args).status === 0;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once("error", reject);

        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

function composeArgs(file) {
    return [
        "compose",
        "-p",
        project,
        "-f",
        "compose.yml",
        "-f",
        "compose.ci.yml",
        "-f",
        file
    ];
}

async function verifyHealth(url, expectedHealthy) {
    let healthy = false;

    for (let attempt = 0; attempt < 15; attempt++) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(3000)
            });

            const body = await response.text();

            if (
                response.status === 200 &&
                body.trim() === '{"status":"ok"}'
            ) {
                healthy = true;
                break;
            }
        } catch {
            // Readiness may take several attempts.
        }

        await new Promise((resolve) =>
            setTimeout(resolve, 1000)
        );
    }

    if (healthy !== expectedHealthy) {
        throw new Error(
            `Unexpected backend readiness: ${healthy}`
        );
    }
}

function attachedVolumeIds(containerIds) {
    const volumeIds = new Set();

    for (const id of containerIds) {
        const result = docker([
            "container",
            "inspect",
            id,
            "--format",
            "{{json .Mounts}}"
        ]);

        const mounts = JSON.parse(
            requireSuccess(result, "Inspect container mounts")
        );

        for (const mount of mounts) {
            if (mount.Type === "volume") {
                volumeIds.add(mount.Name);
            }
        }
    }

    return [...volumeIds];
}

function captureResources() {
    const containers = listResources("container");

    return {
        containers,
        networks: listResources("network"),
        volumes: [
            ...new Set([
                ...listResources("volume"),
                ...attachedVolumeIds(containers)
            ])
        ]
    };
}

function verifyRemoved(snapshot) {
    const remaining = {
        containers: listResources("container"),
        networks: listResources("network"),
        volumes: listResources("volume")
    };

    for (const [type, ids] of [
        ["container", snapshot.containers],
        ["network", snapshot.networks],
        ["volume", snapshot.volumes]
    ]) {
        for (const id of ids) {
            if (resourceExists(type, id)) {
                throw new Error(
                    `${type} still exists after cleanup: ${id}`
                );
            }
        }
    }

    if (
        remaining.containers.length ||
        remaining.networks.length ||
        remaining.volumes.length
    ) {
        throw new Error(
            `Compose resources remain: ${JSON.stringify(remaining)}`
        );
    }

    return true;
}

async function runScenario(name, expectedHealthy) {
    console.log(`\nRunning ${name}...`);

    const serverPort = await freePort();
    const clientPort = await freePort();

    const override = join(
        tempDir,
        `${name}.yml`
    );

    const failureCommand = expectedHealthy
        ? ""
        : `    command:
      - node
      - -e
      - "setInterval(() => {}, 1000)"
`;

    writeFileSync(
        override,
        `services:
  server:
    ports: !override
      - "127.0.0.1:${serverPort}:8080"
${failureCommand}  client:
    ports: !override
      - "127.0.0.1:${clientPort}:5173"
`
    );

    const args = composeArgs(override);

    let snapshot = {
        containers: [],
        networks: [],
        volumes: []
    };

    let scenarioPassed = false;
    let cleanupPassed = false;

    try {
        requireSuccess(
            docker([...args, "config", "--quiet"]),
            "Compose validation"
        );

        requireSuccess(
            run("docker", [...args, "up", "-d", "--build"], 180000),
            "Compose startup"
        );

        await verifyHealth(
            `http://127.0.0.1:${serverPort}/health`,
            expectedHealthy
        );

        snapshot = captureResources();

        if (
            snapshot.containers.length < 3 ||
            snapshot.networks.length < 1
        ) {
            throw new Error(
                "Expected Compose containers or network missing."
            );
        }

        console.log(
            `Containers recorded: ${snapshot.containers.length}`
        );
        console.log(
            `Networks recorded: ${snapshot.networks.length}`
        );
        console.log(
            `Volumes recorded: ${snapshot.volumes.length}`
        );

        scenarioPassed = true;
    } catch (error) {
        console.error(error.message);

        try {
            snapshot = captureResources();
        } catch (captureError) {
            console.error(captureError.message);
        }
    } finally {
        console.log("Stopping isolated Compose project...");

        const down = docker([
            ...args,
            "down",
            "--volumes",
            "--remove-orphans"
        ]);

        if (down.status !== 0) {
            console.error(
                down.stderr || down.stdout
            );
        }

        try {
            cleanupPassed =
                down.status === 0 &&
                verifyRemoved(snapshot);
        } catch (error) {
            console.error(error.message);
        }

        const passed =
            scenarioPassed && cleanupPassed;

        results.push({
            name,
            passed
        });

        console.log(
            `Cleanup verified: ${cleanupPassed}`
        );

        console.log(
            `${passed ? "PASS" : "FAIL"}: ${name}`
        );
    }
}

try {
    requireSuccess(
        docker(["info", "--format", "{{.ServerVersion}}"]),
        "Docker availability"
    );

    await runScenario("successful-startup", true);
    await runScenario("backend-failure", false);
    await runScenario("repeat-startup", true);

    console.log("\nSCRUM-185 Cleanup Test Summary");

    for (const result of results) {
        console.log(
            `${result.passed ? "PASS" : "FAIL"}: ${result.name}`
        );
    }

    if (results.some((result) => !result.passed)) {
        process.exitCode = 1;
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    rmSync(tempDir, {
        recursive: true,
        force: true
    });
}
