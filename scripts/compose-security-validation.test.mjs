
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseFile = join(root, "compose.yml");
const ciFile = join(root, "compose.ci.yml");

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "sw-security-")
);

// Only these existing CI test credentials are exempt.
// This is not an exception for production secrets.
const allowedCiCredentials = new Map([
  ["POSTGRES_PASSWORD", "soundwave_ci_only_password"],
  ["PGPASSWORD", "soundwave_ci_only_password"]
]);

function runCompose(files, options = []) {
  const args = [
    "compose",
    ...files.flatMap((file) => ["-f", file]),
    "config",
    ...options
  ];

  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      "Docker Compose configuration validation failed."
    );
  }

  return result.stdout;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getEffectiveConfig(files) {
  return JSON.parse(
    runCompose(files, [
      "--format",
      "json",
      "--no-interpolate"
    ])
  );
}

function isPublicBinding(port) {
  const host = String(port.host_ip ?? "");

  return (
    host === "" ||
    host === "0.0.0.0" ||
    host === "::"
  );
}

function inspectContainerSecurity(config) {
  const findings = [];

  for (const [name, service] of Object.entries(
    config.services ?? {}
  )) {
    if (service.privileged === true) {
      findings.push(
        `${name}: privileged container prohibited`
      );
    }

    if (
      service.network_mode === "host" ||
      service.pid === "host"
    ) {
      findings.push(
        `${name}: host namespace sharing prohibited`
      );
    }

    const databaseService =
      name === "database" ||
      name === "postgres" ||
      name === "postgresql";

    for (const port of service.ports ?? []) {
      const target = Number(port.target);

      if (databaseService && isPublicBinding(port)) {
        findings.push(
          `${name}: public database port prohibited`
        );
      } else if (
        target === 5432 &&
        isPublicBinding(port)
      ) {
        findings.push(
          `${name}: public PostgreSQL port prohibited`
        );
      }
    }
  }

  return findings;
}

function inspectLiteralSecrets(files) {
  const findings = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const match = line.match(
        /^\s*-?\s*([A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY))\s*[:=]\s*(.*?)\s*$/
      );

      if (!match) {
        continue;
      }

      const key = match[1].toUpperCase();

      const value = match[2]
        .trim()
        .replace(/^["']|["']$/g, "");

      if (
        !value ||
        value === "null" ||
        value.startsWith("${")
      ) {
        continue;
      }

      const isApprovedCiCredential =
        resolve(file) === resolve(ciFile) &&
        allowedCiCredentials.get(key) === value;

      if (!isApprovedCiCredential) {
        findings.push(
          `${key}: literal secret-like value prohibited`
        );
      }
    }
  }

  return findings;
}

function validateSecurity(files) {
  const config = getEffectiveConfig(files);

  return [
    ...inspectContainerSecurity(config),
    ...inspectLiteralSecrets(files)
  ];
}

function expectPass(label, files) {
  const findings = validateSecurity(files);

  assert(
    findings.length === 0,
    `${label}: security findings detected`
  );

  console.log(`PASS: ${label}`);
}

function expectReject(label, files, expected) {
  const findings = validateSecurity(files);

  assert(
    findings.some((finding) =>
      finding.includes(expected)
    ),
    `${label}: expected violation not detected`
  );

  console.log(`PASS: ${label} rejected`);
}

function writeFixture(name, content) {
  const file = join(temporaryDirectory, name);

  writeFileSync(file, content);

  return file;
}

function runTests() {
  console.log(
    "SCRUM-313 Docker Compose Security Validation"
  );

  console.log(
    "SEC-KR-03: Compose syntax validation"
  );

  runCompose([baseFile, ciFile], ["--quiet"]);

  console.log(
    "PASS: Existing Compose configuration valid."
  );

  console.log(
    "SEC-KR-04: Security configuration inspection"
  );

  expectPass(
    "Existing Compose security baseline",
    [baseFile, ciFile]
  );

  console.log(
    "PASS: No public database ports or privileged containers."
  );

  console.log(
    "NOTE: Only known CI test credentials are exempt."
  );

  console.log(
    "NOTE: Application ports 8080 and 5173 are published."
  );

  console.log(
    "SEC-KR-05: Controlled unsafe configuration tests"
  );

  const unsafeDatabase = writeFixture(
    "unsafe-database.yml",
    `services:
  database:
    ports:
      - "5432:5432"
`
  );

  const unsafePrivileged = writeFixture(
    "unsafe-privileged.yml",
    `services:
  server:
    privileged: true
`
  );

  const unsafeSecret = writeFixture(
    "unsafe-secret.yml",
    `services:
  server:
    environment:
      API_SECRET: "temporary-test-value"
`
  );

  const unsafeCiSecret = writeFixture(
    "unsafe-ci-secret.yml",
    `services:
  server:
    environment:
      NEW_API_SECRET: "temporary-test-value"
`
  );

  const corrected = writeFixture(
    "corrected.yml",
    `services:
  database:
    ports: !override []
  server:
    privileged: false
`
  );

  expectReject(
    "Public PostgreSQL exposure",
    [baseFile, ciFile, unsafeDatabase],
    "public database port"
  );

  expectReject(
    "Privileged container",
    [baseFile, ciFile, unsafePrivileged],
    "privileged container"
  );

  expectReject(
    "Literal secret configuration",
    [baseFile, ciFile, unsafeSecret],
    "literal secret-like value"
  );

  expectReject(
    "Additional unapproved secret",
    [baseFile, ciFile, unsafeCiSecret],
    "literal secret-like value"
  );

  expectPass(
    "Corrected configuration",
    [baseFile, ciFile, corrected]
  );

  console.log("SCRUM-313: PASS");
}

function runIndependentValidation(files) {
  console.log(
    "SCRUM-313 Independent Security Validation"
  );

  const findings = validateSecurity(files);

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`REJECTED: ${finding}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    "PASS: Configuration security validation."
  );
}

try {
  if (process.argv[2] === "--validate") {
    const files = process.argv.slice(3).map(
      (file) => resolve(file)
    );

    assert(
      files.length > 0,
      "At least one Compose file is required."
    );

    runIndependentValidation(files);
  } else if (process.argv.length === 2) {
    runTests();
  } else {
    throw new Error(
      "Invalid arguments. Use --validate with Compose files."
    );
  }
} catch (error) {
  console.error(
    `SCRUM-313: FAIL - ${error.message}`
  );

  process.exitCode = 1;
} finally {
  rmSync(temporaryDirectory, {
    recursive: true,
    force: true
  });
}
