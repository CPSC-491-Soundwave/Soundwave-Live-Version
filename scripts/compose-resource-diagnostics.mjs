
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function runDocker(args) {
    const result = spawnSync("docker", args, {
        cwd: root,
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024
    });

    if (result.error || result.status !== 0) {
        throw new Error(
            `Docker ${args[0]} failed: ${result.error?.message ??
            result.stderr?.trim() ??
            result.status
            }`
        );
    }

    return result.stdout.trim();
}

export function collectResourceDiagnostics(project) {
    if (
        typeof project !== "string" ||
        !/^[a-z0-9][a-z0-9_-]*$/.test(project)
    ) {
        throw new Error("Invalid Compose project name.");
    }

    const ids = runDocker([
        "ps",
        "-a",
        "--filter",
        `label=com.docker.compose.project=${project}`,
        "--format",
        "{{.ID}}"
    ])
        .split(/\r?\n/)
        .filter(Boolean);

    if (ids.length === 0) {
        throw new Error(
            "No Compose containers found."
        );
    }

    const containers = ids.map((id) => {
        const raw = runDocker([
            "inspect",
            "--format",
            "{{json .State}}",
            id
        ]);

        const state = JSON.parse(raw);

        const labels = JSON.parse(
            runDocker([
                "inspect",
                "--format",
                "{{json .Config.Labels}}",
                id
            ])
        );

        const restartCount = Number(
            runDocker([
                "inspect",
                "--format",
                "{{.RestartCount}}",
                id
            ])
        );

        return {
            id,
            service:
                labels?.["com.docker.compose.service"] ??
                "unknown",
            status: state.Status ?? "unknown",
            running: state.Running === true,
            health:
                state.Health?.Status ??
                "not_configured",
            restartCount
        };
    });

    const runningIds = containers
        .filter((container) => container.running)
        .map((container) => container.id);

    const statsById = new Map();

    if (runningIds.length > 0) {
        const output = runDocker([
            "stats",
            "--no-stream",
            "--format",
            "{{json .}}",
            ...runningIds
        ]);

        for (const line of output.split(/\r?\n/)) {
            if (!line.trim()) continue;

            const stat = JSON.parse(line);

            statsById.set(stat.ID, {
                cpu: stat.CPUPerc,
                memory: stat.MemUsage,
                memoryPercent: stat.MemPerc
            });
        }
    }

    return containers.map((container) => {
        const stats =
            statsById.get(container.id) ??
            statsById.get(container.id.slice(0, 12));

        return {
            service: container.service,
            status: container.status,
            running: container.running,
            health: container.health,
            restartCount: container.restartCount,
            cpu: stats?.cpu ?? "N/A",
            memory: stats?.memory ?? "N/A",
            memoryPercent:
                stats?.memoryPercent ?? "N/A"
        };
    });
}

export function printResourceDiagnostics(project) {
    console.log(
        `SCRUM-249 Container Resource Diagnostics: ${project}`
    );

    const results =
        collectResourceDiagnostics(project);

    for (const container of results) {
        console.log(
            JSON.stringify(container)
        );
    }

    console.log(
        `SCRUM-249: Collected diagnostics for ${results.length} containers.`
    );

    return results;
}

const invokedDirectly =
    process.argv[1] &&
    resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (invokedDirectly) {
    try {
        const project = process.argv[2];

        if (!project) {
            throw new Error(
                "Usage: node scripts/compose-resource-diagnostics.mjs <project>"
            );
        }

        printResourceDiagnostics(project);
    } catch {
        // Avoid printing raw Docker errors that might
        // contain sensitive runtime information.
        console.error(
            "SCRUM-249: Diagnostics collection failed."
        );

        process.exitCode = 1;
    }
}
