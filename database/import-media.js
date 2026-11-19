import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { readMetadata } from "../server/src/media/metadata.js";
import { importMp3Directory } from "./lib/media-importer.js";

const { Client } = pg;
const databaseDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(databaseDir, "..");

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run import:media -- [path-to-folder-inside-mediaFiles]");
    console.log("Default folder: <MEDIA_ROOT>/mediaFiles");
    return;
  }
  if (args.length > 1 || args.some((arg) => arg.startsWith("--"))) {
    throw new Error("Expected zero or one source directory argument. Run with --help for usage.");
  }

  const required = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing PostgreSQL variables: ${missing.join(", ")}`);

  const mediaRoot = process.env.MEDIA_ROOT || repositoryRoot;
  const sourceDir = args[0] ? path.resolve(process.cwd(), args[0]) : path.join(mediaRoot, "mediaFiles");
  const client = new Client();
  try {
    await client.connect();
    const summary = await importMp3Directory({
      sourceDir,
      mediaRoot,
      database: client,
      metadataReader: readMetadata
    });

    for (const result of summary.results) {
      const extra = result.trackId ? ` (track ID ${result.trackId})` : result.reason ? `: ${result.reason}` : "";
      console.log(`[${result.status.toUpperCase()}] ${result.file}${extra}`);
    }
    console.log(`Summary: ${summary.imported} imported, ${summary.skipped} skipped, ${summary.failed} failed`);
    if (summary.failed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(`Media import failed: ${error.message}`);
  process.exitCode = 1;
}
