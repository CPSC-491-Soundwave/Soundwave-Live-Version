
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const project = `sw-prod-${randomUUID().slice(0, 8)}`;
const temp = mkdtempSync(join(tmpdir(), "sw-prod-"));
const override = join(temp, "production.yml");

const port = Number(process.env.PROD_SMOKE_PORT ?? 15174);
const backendPort = Number(
    process.env.PROD_SMOKE_BACKEND_PORT ?? 18084
);
const timeoutMs = Number(
    process.env.PROD_SMOKE_TIMEOUT_MS ?? 30000
);

if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(backendPort) ||
    backendPort < 1 ||
    backendPort > 65535 ||
    port === backendPort ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
) {
    throw new Error("Invalid production smoke configuration.");
}

writeFileSync(
    override,
    `services:
  server:
    ports: !override
      - "127.0.0.1:${backendPort}:8080"
  client:
    build:
      context: ${JSON.stringify(join(root, "client"))}
      dockerfile: Dockerfile.production
    ports: !override
      - "127.0.0.1:${port}:80"
`
);

const composeArgs = [
    "compose",
    "-p", project,
    "-f", join(root, "compose.yml"),
    "-f", join(root, "compose.ci.yml"),
    "-f", override
];

function docker(args, allowFailure = false) {
    const result = spawnSync("docker", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180000
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error || (result.status !== 0 && !allowFailure)) {
        throw new Error(
            `Docker command failed: ${result.error?.message ?? result.status}`
        );
    }

    return result;
}

const compose = (args, allowFailure = false) =>
    docker([...composeArgs, ...args], allowFailure);

const wait = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

async function check(path, expectedStatus, expectedType = null) {
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        3000
    );

    try {
        const response = await fetch(
            `http://127.0.0.1:${port}${path}`,
            { signal: controller.signal }
        );

        if (response.status !== expectedStatus) {
            throw new Error(
                `${path}: expected ${expectedStatus}, got ${response.status}`
            );
        }

        if (
            expectedType &&
            !response.headers.get("content-type")?.includes(expectedType)
        ) {
            throw new Error(
                `${path}: unexpected content type`
            );
        }

        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

async function waitForClient() {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await check("/", 200, "text/html");
            return;
        } catch {
            await wait(1000);
        }
    }

    throw new Error("Production client did not become ready.");
}

let failed = false;

try {
    console.log("SCRUM-257 Production Client Smoke Test");

    compose(["up", "-d", "--build"]);

    await waitForClient();
    console.log("PASS: Production client started.");

    const html = await check("/", 200, "text/html");
    console.log("PASS: Homepage HTTP 200.");

    const js = html.match(/src="([^"]+\.js)"/)?.[1];
    const css = html.match(/href="([^"]+\.css)"/)?.[1];

    if (!js || !css) {
        throw new Error("Missing production asset references.");
    }

    await check(js, 200, "javascript");
    console.log("PASS: JavaScript asset HTTP 200.");

    await check(css, 200, "text/css");
    console.log("PASS: CSS asset HTTP 200.");

    await check("/library", 200, "text/html");
    console.log("PASS: Library route HTTP 200.");

    await check("/search", 200, "text/html");
    console.log("PASS: Search route HTTP 200.");

    await check("/assets/missing-file.js", 404);
    console.log("PASS: Missing asset HTTP 404.");

    const health = await check(
        "/health",
        200,
        "application/json"
    );

    if (JSON.parse(health).status !== "ok") {
        throw new Error("Unexpected backend health response.");
    }

    console.log("PASS: Backend health proxy.");

    console.log("SCRUM-257 Smoke Test PASSED.");
} catch (error) {
    failed = true;
    console.error("SCRUM-257 Smoke Test FAILED.");
    console.error(error.message);
} finally {
    console.log("Cleaning up isolated Compose project...");

    try {
        compose(["down", "--remove-orphans"]);
    } catch (error) {
        failed = true;
        console.error("Cleanup failed:", error.message);
    }

    rmSync(temp, { recursive: true, force: true });
}

if (failed) {
    process.exitCode = 1;
}
