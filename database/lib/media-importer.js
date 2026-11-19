import { readdir, realpath } from "node:fs/promises";
import path from "node:path";

function isInside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function textOr(value, fallback) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function validDurationMs(seconds) {
  const milliseconds = Math.round(Number(seconds) * 1000);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 2147483647) {
    throw new Error("MP3 has no valid positive duration for tracks.duration_ms.");
  }
  return milliseconds;
}

async function findOrCreateArtist(database, name) {
  const existing = await database.query(
    "SELECT id FROM artists WHERE lower(name) = lower($1) ORDER BY id LIMIT 1",
    [name]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await database.query(
    "INSERT INTO artists (name) VALUES ($1) RETURNING id",
    [name]
  );
  return inserted.rows[0].id;
}

async function findOrCreateAlbum(database, artistId, title) {
  const existing = await database.query(
    "SELECT id FROM albums WHERE artist_id = $1 AND lower(title) = lower($2) ORDER BY id LIMIT 1",
    [artistId, title]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await database.query(
    "INSERT INTO albums (artist_id, title) VALUES ($1, $2) RETURNING id",
    [artistId, title]
  );
  return inserted.rows[0].id;
}

async function importOne({ database, metadataReader, absoluteFile, mediaPath, filename }) {
  let inTransaction = false;
  try {
    await database.query("BEGIN");
    inTransaction = true;

    const existing = await database.query(
      "SELECT id FROM tracks WHERE media_path = $1 ORDER BY id LIMIT 1",
      [mediaPath]
    );
    if (existing.rows.length > 0) {
      await database.query("COMMIT");
      inTransaction = false;
      return { file: filename, status: "skipped", reason: "Already imported (same media path)", trackId: existing.rows[0].id };
    }

    const metadata = await metadataReader(absoluteFile);
    const durationMs = validDurationMs(metadata?.duration);
    const title = textOr(metadata?.title, path.parse(filename).name);
    const artist = textOr(metadata?.artist, "Unknown Artist");
    const album = textOr(metadata?.album, "Unknown Album");
    const artistId = await findOrCreateArtist(database, artist);
    const albumId = await findOrCreateAlbum(database, artistId, album);

    const inserted = await database.query(
      "INSERT INTO tracks (album_id, title, duration_ms, media_path) VALUES ($1, $2, $3, $4) RETURNING id",
      [albumId, title, durationMs, mediaPath]
    );
    await database.query("COMMIT");
    inTransaction = false;
    return { file: filename, status: "imported", trackId: inserted.rows[0].id, mediaPath, title };
  } catch (error) {
    if (inTransaction) {
      try {
        await database.query("ROLLBACK");
      } catch (rollbackError) {
        const fatal = new Error(`Import failed and rollback failed: ${rollbackError.message}`, { cause: error });
        fatal.isFatalTransaction = true;
        throw fatal;
      }
    }
    throw error;
  }
}

/**
 * Import direct-child MP3 files within mediaRoot/mediaFiles.
 * Does not copy files or recurse into subdirectories.
 * Database operations are transactional per file, and tests can inject a fake database/metadataReader.
 */
export async function importMp3Directory({ sourceDir, mediaRoot, database, metadataReader }) {
  if (!database || typeof database.query !== "function") {
    throw new TypeError("database must provide query(sql, parameters).");
  }
  if (typeof metadataReader !== "function") {
    throw new TypeError("metadataReader must be a function.");
  }
  if (typeof sourceDir !== "string" || !sourceDir.trim()) {
    throw new TypeError("sourceDir must be a directory path.");
  }
  if (typeof mediaRoot !== "string" || !path.isAbsolute(mediaRoot)) {
    throw new TypeError("mediaRoot must be an absolute directory path.");
  }

  const canonicalRoot = await realpath(mediaRoot);
  const canonicalMediaFiles = await realpath(path.join(canonicalRoot, "mediaFiles"));
  const canonicalSource = await realpath(sourceDir);

  if (!isInside(canonicalRoot, canonicalMediaFiles)) {
    throw new Error("mediaFiles must be contained within MEDIA_ROOT.");
  }
  if (!isInside(canonicalMediaFiles, canonicalSource)) {
    throw new Error("Import source must be inside MEDIA_ROOT/mediaFiles.");
  }

  const entries = await readdir(canonicalSource, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const results = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      results.push({ file: entry.name, status: "skipped", reason: "Not a regular file (directories and links are not followed)" });
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".mp3")) {
      results.push({ file: entry.name, status: "skipped", reason: "Not an MP3 file" });
      continue;
    }

    try {
      const absoluteFile = await realpath(path.join(canonicalSource, entry.name));
      if (!isInside(canonicalMediaFiles, absoluteFile)) {
        results.push({ file: entry.name, status: "failed", reason: "File resolves outside mediaFiles" });
        continue;
      }
      const mediaPath = path.relative(canonicalRoot, absoluteFile).split(path.sep).join("/");
      results.push(await importOne({ database, metadataReader, absoluteFile, mediaPath, filename: entry.name }));
    } catch (error) {
      if (error.isFatalTransaction) throw error;
      results.push({ file: entry.name, status: "failed", reason: error.message });
    }
  }

  return {
    sourceDir: canonicalSource,
    imported: results.filter((result) => result.status === "imported").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    results
  };
}
