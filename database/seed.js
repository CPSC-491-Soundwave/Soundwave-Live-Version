import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const requiredDatabaseVariables = [
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
];

const missingDatabaseVariables = requiredDatabaseVariables.filter(
  (name) =>
    typeof process.env[name] !== "string" ||
    process.env[name].length === 0
);

if (missingDatabaseVariables.length > 0) {
  console.error(
    `Missing required PostgreSQL environment variables: ${missingDatabaseVariables.join(", ")}`
  );
  process.exit(1);
}

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const seedPath = path.join(
  currentDirectory,
  "seeds",
  "20260915_ayu_catalog_seed.sql"
);

const client = new Client();

async function seed() {
  console.log(`Seeding database: ${process.env.PGDATABASE}`);
  console.log(`Reading seed file: ${seedPath}`);

  await client.connect();

  const sql = await readFile(seedPath, "utf8");

  try {
    await client.query("BEGIN");

    await client.query(sql);

    await client.query("COMMIT");

    console.log("Catalog seed complete.");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Catalog seed transaction rolled back.");
    throw error;
  }
}

try {
  await seed();
} catch (error) {
  console.error("Seed failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}