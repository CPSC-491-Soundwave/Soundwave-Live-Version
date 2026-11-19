import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { importMp3Directory } from "../lib/media-importer.js";

function createFakeDatabase() {
  let saved = { artists: [], albums: [], tracks: [], nextId: 4000 };
  let transaction = null;
  const calls = [];
  const state = () => transaction ?? saved;

  return {
    calls,
    rows() { return structuredClone(saved); },
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, " ").toUpperCase();
      calls.push({ sql: normalized, params });
      if (normalized === "BEGIN") {
        assert.equal(transaction, null, "nested transaction");
        transaction = structuredClone(saved);
        return { rows: [] };
      }
      if (normalized === "COMMIT") {
        assert.ok(transaction, "cannot commit outside transaction");
        saved = transaction;
        transaction = null;
        return { rows: [] };
      }
      if (normalized === "ROLLBACK") {
        assert.ok(transaction, "cannot rollback outside transaction");
        transaction = null;
        return { rows: [] };
      }
      const current = state();
      if (normalized.startsWith("SELECT ID FROM TRACKS WHERE MEDIA_PATH")) {
        return { rows: current.tracks.filter((t) => t.mediaPath === params[0]).map(({ id }) => ({ id })).slice(0, 1) };
      }
      if (normalized.startsWith("SELECT ID FROM ARTISTS")) {
        return { rows: current.artists.filter((a) => a.name.toLowerCase() === params[0].toLowerCase()).map(({ id }) => ({ id })).slice(0, 1) };
      }
      if (normalized.startsWith("SELECT ID FROM ALBUMS")) {
        return { rows: current.albums.filter((a) => a.artistId === params[0] && a.title.toLowerCase() === params[1].toLowerCase()).map(({ id }) => ({ id })).slice(0, 1) };
      }
      if (normalized.startsWith("INSERT INTO ARTISTS")) {
        const id = ++current.nextId;
        current.artists.push({ id, name: params[0] });
        return { rows: [{ id }] };
      }
      if (normalized.startsWith("INSERT INTO ALBUMS")) {
        const id = ++current.nextId;
        current.albums.push({ id, artistId: params[0], title: params[1] });
        return { rows: [{ id }] };
      }
      if (normalized.startsWith("INSERT INTO TRACKS")) {
        if (params[1] === "DB-FAIL") throw new Error("Simulated database insert failure");
        const id = ++current.nextId;
        current.tracks.push({ id, albumId: params[0], title: params[1], durationMs: params[2], mediaPath: params[3] });
        return { rows: [{ id }] };
      }
      throw new Error(`Unexpected SQL in fake DB: ${sql}`);
    }
  };
}

async function tempMedia(t) {
  const mediaRoot = await mkdtemp(path.join(os.tmpdir(), "soundwave-import-test-"));
  const sourceDir = path.join(mediaRoot, "mediaFiles");
  await mkdir(sourceDir);
  t.after(() => rm(mediaRoot, { recursive: true, force: true }));
  return { mediaRoot, sourceDir };
}

function metadataReader(_filename) {
  return Promise.resolve({ title: "Test song", artist: "Test artist", album: "Test album", duration: 32.555 });
}

test("imports two MP3 files, reuses artist and album, and skips repeated paths", async (t) => {
  const { mediaRoot, sourceDir } = await tempMedia(t);
  await writeFile(path.join(sourceDir, "one.mp3"), "test fixture");
  await writeFile(path.join(sourceDir, "two.MP3"), "test fixture");
  const database = createFakeDatabase();
  const read = async (filename) => ({ ...await metadataReader(filename), title: path.parse(filename).name });

  const first = await importMp3Directory({ sourceDir, mediaRoot, database, metadataReader: read });
  assert.deepEqual([first.imported, first.skipped, first.failed], [2, 0, 0]);
  assert.deepEqual(database.rows().tracks.map((row) => row.mediaPath).sort(), ["mediaFiles/one.mp3", "mediaFiles/two.MP3"]);
  assert.deepEqual(database.rows().tracks.map((row) => row.durationMs), [32555, 32555]);
  assert.equal(database.rows().artists.length, 1);
  assert.equal(database.rows().albums.length, 1);

  const second = await importMp3Directory({ sourceDir, mediaRoot, database, metadataReader: () => { throw new Error("duplicates must skip metadata parsing"); } });
  assert.deepEqual([second.imported, second.skipped, second.failed], [0, 2, 0]);
  assert.equal(database.rows().tracks.length, 2);
});

test("skips non-MP3 files and directories without changing the catalog", async (t) => {
  const { mediaRoot, sourceDir } = await tempMedia(t);
  await writeFile(path.join(sourceDir, "license.txt"), "license test");
  await mkdir(path.join(sourceDir, "album"));
  const database = createFakeDatabase();
  const summary = await importMp3Directory({ sourceDir, mediaRoot, database, metadataReader });
  assert.deepEqual([summary.imported, summary.skipped, summary.failed], [0, 2, 0]);
  assert.match(summary.results.find((result) => result.file === "license.txt").reason, /not an MP3/i);
  assert.equal(database.rows().tracks.length, 0);
});

test("continues past invalid metadata and rolls back the failed file", async (t) => {
  const { mediaRoot, sourceDir } = await tempMedia(t);
  for (const name of ["bad.mp3", "good.mp3"]) await writeFile(path.join(sourceDir, name), "test fixture");
  const database = createFakeDatabase();
  const read = (filename) => {
    if (filename.endsWith("bad.mp3")) throw new Error("Cannot decode file");
    return metadataReader(filename);
  };
  const summary = await importMp3Directory({ sourceDir, mediaRoot, database, metadataReader: read });
  assert.deepEqual([summary.imported, summary.skipped, summary.failed], [1, 0, 1]);
  assert.match(summary.results.find((row) => row.file === "bad.mp3").reason, /Cannot decode/);
  assert.equal(database.rows().tracks.length, 1);
  assert.ok(database.calls.some((call) => call.sql === "ROLLBACK"));
});

test("rejects missing or invalid duration without inserting any row", async (t) => {
  const { mediaRoot, sourceDir } = await tempMedia(t);
  await writeFile(path.join(sourceDir, "noduration.mp3"), "test fixture");
  const database = createFakeDatabase();
  const summary = await importMp3Directory({ sourceDir, mediaRoot, database, metadataReader: async () => ({ title: "No duration", duration: null }) });
  assert.deepEqual([summary.imported, summary.skipped, summary.failed], [0, 0, 1]);
  assert.match(summary.results[0].reason, /positive duration/);
  assert.equal(database.rows().tracks.length, 0);
});

test("rolls back database insertion failure and keeps processing other tracks", async (t) => {
  const { mediaRoot, sourceDir } = await tempMedia(t);
  for (const name of ["bad.mp3", "good.mp3"]) await writeFile(path.join(sourceDir, name), "test fixture");
  const database = createFakeDatabase();
  const read = async (filename) => ({ ...await metadataReader(filename), title: filename.endsWith("bad.mp3") ? "DB-FAIL" : "Working" });
  const summary = await importMp3Directory({ sourceDir, mediaRoot, database, metadataReader: read });
  assert.deepEqual([summary.imported, summary.skipped, summary.failed], [1, 0, 1]);
  assert.equal(database.rows().tracks.length, 1);
  assert.equal(database.rows().tracks[0].title, "Working");
  assert.equal(database.rows().artists.length, 1, "artist inserted in failed transaction is rolled back");
});

test("rejects a source folder outside mediaFiles", async (t) => {
  const { mediaRoot } = await tempMedia(t);
  const sourceDir = path.join(mediaRoot, "other");
  await mkdir(sourceDir);
  await assert.rejects(
    importMp3Directory({ sourceDir, mediaRoot, database: createFakeDatabase(), metadataReader }),
    /must be inside MEDIA_ROOT\/mediaFiles/
  );
});

test("does not follow symbolic links", async (t) => {
  const { mediaRoot, sourceDir } = await tempMedia(t);
  const external = path.join(mediaRoot, "outside.mp3");
  await writeFile(external, "test fixture");
  await symlink(external, path.join(sourceDir, "link.mp3"));
  const database = createFakeDatabase();
  const summary = await importMp3Directory({ sourceDir, mediaRoot, database, metadataReader });
  assert.deepEqual([summary.imported, summary.skipped, summary.failed], [0, 1, 0]);
  assert.equal(database.rows().tracks.length, 0);
});
