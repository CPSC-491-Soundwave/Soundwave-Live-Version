export function createCatalogService(repository) {
  if (
    !repository ||
    typeof repository.listTracks !== "function"
  ) {
    throw new TypeError(
      "Catalog service requires a repository with listTracks()."
    );
  }

  return {
    async listTracks() {
      const rows = await repository.listTracks();

      return rows.map((row) => ({
        id: Number(row.track_id),
        title: row.track_title,
        durationMs: row.duration_ms,

        album: {
          id: Number(row.album_id),
          title: row.album_title
        },

        artist: {
          id: Number(row.artist_id),
          name: row.artist_name
        }
      }));
    }
  };
}