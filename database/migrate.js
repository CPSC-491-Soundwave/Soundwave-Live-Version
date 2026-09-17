import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const migrationsDirectory = path.join(currentDirectory, "migrations");

const client = new Client();

async function migrate() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  const result = await client.query(
    "SELECT filename FROM schema_migrations ORDER BY filename"
  );

  const applied = new Set(result.rows.map((row) => row.filename));

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`skip ${filename}`);
      continue;
    }

    const fullPath = path.join(migrationsDirectory, filename);
    const sql = await readFile(fullPath, "utf8");

    console.log(`apply ${filename}`);

    try {
      await client.query("BEGIN");
      await client.query(sql);

      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [filename]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log("Database migrations complete.");
}

try {
  await migrate();
} catch (error) {
  console.error("Migration failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}