# Soundwave multi-file MP3 importer (Matthew Choi)

## Purpose and boundaries

This local Node.js CLI imports the regular `.mp3` files directly inside a specified folder into Soundwave's existing PostgreSQL artists/albums/tracks catalog. It does not upload or copy audio, follow symlinks, search subdirectories, transcode audio, or expose an API endpoint. Use only MP3 files you have rights to include in your project and demonstrations.

For safety and playback compatibility, the source directory MUST be within `<MEDIA_ROOT>/mediaFiles`. When `MEDIA_ROOT` is unset, it defaults to the repository root (matching the existing server's default). If the backend uses a custom `MEDIA_ROOT`, configure the same absolute path in `database/.env`. Stored `media_path` values are relative to `MEDIA_ROOT`, such as `mediaFiles/example.mp3`.

## Setup

1. Ensure database migrations and the normal catalog seed were applied; the `tracks.media_path` column must exist.
2. Place two rights-cleared MP3 files in `<MEDIA_ROOT>/mediaFiles`. Do not replace `test.mp3` or `license.txt`.
3. Ensure `database/.env` has the same `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` as the Soundwave server; never commit this file.
4. Run from `database/`:

```bash
npm run test:import
npm run import:media
```

To scan a specific subfolder (nonrecursive):

```bash
npm run import:media -- ../mediaFiles/demo
```

## Output

The command prints an itemized status for every direct child entry and a summary:

```text
[IMPORTED] demo1.mp3 (track ID ...)
[IMPORTED] demo2.mp3 (track ID ...)
[SKIPPED] license.txt: Not an MP3 file
[SKIPPED] test.mp3 (track ID 3005)
Summary: 2 imported, 2 skipped, 0 failed
```

Actual rows, filenames, and counts vary. Re-running the same import should skip already-registered paths, not duplicate them. Each file uses a separate database transaction; failures roll back and subsequent files continue processing. A nonzero failure count causes a nonzero exit code.

## Verification

- Query the `tracks` table for newly imported rows (`id`, `title`, `duration_ms`, `media_path`).
- Verify the new tracks appear in the catalog/Search UI and play using existing authenticated media access (`204`) and valid HTTP Range requests (`206`).
- Switch between the new tracks and the existing Kontekst fixture; check for correct metadata and no overlapping audio.
- Re-run the import and verify the row count does not increase.
- Execute relevant server and client regression tests and document the actual results in Jira.

## Known limits

- Deduplication is by exact normalized media path, not file contents; renaming/copying a file to a new path can import it again.
- The existing schema does not enforce unique `media_path`, artist name, or album title. This CLI is sequential, and parallel imports or other database writers may still create duplicates. Do not run concurrent imports.
- Existing metadata extraction must report a positive duration. Corrupted files or audio with missing duration are marked failed, rather than creating an invalid row.
- Files are not copied and must remain accessible at their registered location for playback.
- The importer does not manage licensing or upload authentication; access is limited to an operator with filesystem and database credentials.
- Only direct-child MP3 files are scanned. Subdirectories and symbolic links are skipped deliberately.

## Architecture

`import-media.js` is the CLI and connects using `pg` with `database/.env`. `lib/media-importer.js` handles scanning, metadata mapping, database transactions, and summaries. The CLI reuses `server/src/media/metadata.js` for extraction. The existing seed and catalog repository files are unchanged.
