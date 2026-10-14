
import {
    mkdtempSync,
    readFileSync,
    writeFileSync,
    rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import net from "node:net";

const root = process.cwd();
const source = readFileSync(
    resolve(root, "scripts/compose-smoke-test.mjs"),
    "utf8"
);

const tempDir = mkdtempSync(
    join(tmpdir(), "soundwave-failure-")
);

const project = `swfailure${process.pid}`;
const results = [];

function execute(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        ...options
    });
}

function freePort() {
    return new Promise((resolvePort, reject) => {
        const server = net.createServer();

        server.once("error", reject);

        server.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            server.close(() => resolvePort(port));
        });
    });
}

function yamlQuote(value) {
    return JSON.stringify(value);
}

function overrideFor(scenario, serverPort, clientPort) {
    const scenarios = {
        "backend-unavailable": {
            service: "server",
            command: [
                "node",
                "-e",
                "setInterval(() => {}, 1000)"
            ]
        },

        "client-unavailable": {
            service: "client",
            command: [
                "node",
                "-e",
                "setInterval(() => {}, 1000)"
            ]
        },

        "bad-health": {
            service: "server",
            command: [
                "node",
                "-e",
                "require('http').createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'unhealthy'}));}).listen(8080,'0.0.0.0')"
            ]
        },

        "startup-failure": {
            service: "server",
            image: "soundwave-invalid-startup-test:nonexistent",
            pull_policy: "always"
        }
    };

    const config = scenarios[scenario];

    if (!config) {
        throw new Error(`Unknown scenario: ${scenario}`);
    }

    const server = {
        ports: [`127.0.0.1:${serverPort}:8080`]
    };

    const client = {
        ports: [`127.0.0.1:${clientPort}:5173`]
    };

    if (config.service === "server") {
        if (config.command) {
            server.command = config.command;
        }

        if (config.image) {
            server.image = config.image;
            server.pull_policy = config.pull_policy;
        }
    } else if (config.command) {
        client.command = config.command;
    }

    const yaml = [
        "services:",
        "  server:",
        `    ports: !override ${JSON.stringify(server.ports)}`,
        "  client:",
        `    ports: !override ${JSON.stringify(client.ports)}`
    ];

    if (config.service === "server" && config.command) {
        yaml.splice(
            3,
            0,
            `    command: ${JSON.stringify(server.command)}`
        );
    }

    if (config.service === "client" && config.command) {
        yaml.push(
            `    command: ${JSON.stringify(client.command)}`
        );
    }

    if (config.image) {
        yaml.splice(
            3,
            0,
            `    image: ${JSON.stringify(config.image)}`,
            `    pull_policy: ${config.pull_policy}`,
            "    build: !reset null"
        );
    }

    return yaml.join("\n") + "\n";
}

function cleanup(composeArgs) {
    const result = execute("docker", [
        "compose",
        ...composeArgs,
        "down",
        "--volumes",
        "--remove-orphans"
    ]);

    const ps = execute("docker", [
        "compose",
        ...composeArgs,
        "ps",
        "-q"
    ]);

    return (
        result.status === 0 &&
        ps.status === 0 &&
        ps.stdout.trim() === ""
    );
}

async function runScenario(name) {
    console.log(`\nRunning ${name}...`);

    const serverPort = await freePort();
    const clientPort = await freePort();

    const overridePath = join(
        tempDir,
        `${name}.yml`
    );

    const scriptPath = join(
        tempDir,
        `${name}.mjs`
    );

    writeFileSync(
        overridePath,
        overrideFor(name, serverPort, clientPort)
    );

    const composeArgs = [
        "-p",
        project,
        "-f",
        "compose.yml",
        "-f",
        "compose.ci.yml",
        "-f",
        overridePath
    ];

    const composeCommand =
        `docker compose -p ${project} ` +
        `-f compose.yml -f compose.ci.yml ` +
        `-f ${yamlQuote(overridePath)}`;

    let modified = source.replace(
        /const composeCommand = process\.env\.CI[\s\S]*?: "docker compose";/,
        `const composeCommand = ${JSON.stringify(composeCommand)};`
    );

    if (modified === source) {
        throw new Error(
            "Could not locate the existing Compose command."
        );
    }

    modified = modified
        .replaceAll(
            "http://localhost:8080",
            `http://127.0.0.1:${serverPort}`
        )
        .replaceAll(
            "http://localhost:5173",
            `http://127.0.0.1:${clientPort}`
        );

    writeFileSync(scriptPath, modified);

    let passed = false;

    try {
        const validation = execute("docker", [
            "compose",
            ...composeArgs,
            "config",
            "--quiet"
        ]);

        if (validation.status !== 0) {
            throw new Error(
                `Compose validation failed: ${validation.stderr}`
            );
        }

        const result = execute(
            "node",
            [scriptPath],
            {
                env: {
                    ...process.env,
                    CI: "true"
                }
            }
        );

        const output =
            (result.stdout || "") +
            "\n" +
            (result.stderr || "");

        const expectedFailure =
            result.status === 1 &&
            output.includes(
                "Soundwave Compose smoke test failed."
            ) &&
            output.includes(
                "Collecting Compose diagnostics..."
            );

        const specificFailure =
            name === "startup-failure"
                ? output.includes("pull access denied") ||
                output.includes("not found") ||
                output.includes("manifest unknown")
                : name === "bad-health"
                    ? output.includes(
                        'returned unexpected response: {"status":"unhealthy"}'
                    )
                    : output.includes("Attempt 15/15 failed");

        passed =
            expectedFailure &&
            specificFailure;

        console.log(
            `Failure detected: ${expectedFailure}`
        );
        console.log(
            `Expected scenario detected: ${specificFailure}`
        );

        if (!passed) {
            console.error(output.slice(-6000));
        }
    } catch (error) {
        console.error(error.message);
    } finally {
        const cleaned = cleanup(composeArgs);

        console.log(
            `Cleanup verified: ${cleaned}`
        );

        passed = passed && cleaned;

        results.push({
            name,
            passed
        });

        console.log(
            `${passed ? "PASS" : "FAIL"}: ${name}`
        );
    }
}

try {
    const docker = execute("docker", [
        "info",
        "--format",
        "{{.ServerVersion}}"
    ]);

    if (docker.status !== 0) {
        throw new Error(
            "Docker Desktop must be running."
        );
    }

    for (const name of [
        "backend-unavailable",
        "client-unavailable",
        "bad-health",
        "startup-failure"
    ]) {
        await runScenario(name);
    }

    console.log("\nSCRUM-181 Test Summary");

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
