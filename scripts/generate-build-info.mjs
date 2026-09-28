import {
  mkdirSync,
  writeFileSync,
} from "node:fs";

import {
  dirname,
} from "node:path";

const outputPath =
  process.argv[2] ??
  "artifacts/build-info.json";

const runNumber =
  process.env.GITHUB_RUN_NUMBER;

const commitSha =
  process.env.GITHUB_SHA;

const branch =
  process.env.GITHUB_HEAD_REF ||
  process.env.GITHUB_REF_NAME;

const runId =
  process.env.GITHUB_RUN_ID;

const eventName =
  process.env.GITHUB_EVENT_NAME;

const requiredEnvironment = {
  GITHUB_RUN_NUMBER: runNumber,
  GITHUB_SHA: commitSha,
  GITHUB_REF_NAME:
    process.env.GITHUB_REF_NAME,
  GITHUB_RUN_ID: runId,
  GITHUB_EVENT_NAME: eventName,
};

const missing =
  Object.entries(
    requiredEnvironment
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

if (missing.length > 0) {
  throw new Error(
    `Missing required build environment: ${missing.join(", ")}`
  );
}

if (!/^\d+$/.test(runNumber)) {
  throw new Error(
    "GITHUB_RUN_NUMBER must be numeric."
  );
}

if (
  !/^[0-9a-f]{7,40}$/i.test(
    commitSha
  )
) {
  throw new Error(
    "GITHUB_SHA must be a valid Git commit SHA."
  );
}

const shortSha =
  commitSha.slice(0, 7);

const version =
  `s2.${runNumber}+${shortSha}`;

const buildInfo = {
  version,
  commitSha,
  shortSha,
  runNumber:
    Number(runNumber),
  runId,
  branch,
  eventName,
  generatedAtUtc:
    new Date().toISOString(),
};

mkdirSync(
  dirname(outputPath),
  {
    recursive: true,
  }
);

writeFileSync(
  outputPath,
  `${JSON.stringify(
    buildInfo,
    null,
    2
  )}\n`,
  "utf8"
);

console.log(
  `Generated ${outputPath}`
);

console.log(
  `Build version: ${version}`
);
