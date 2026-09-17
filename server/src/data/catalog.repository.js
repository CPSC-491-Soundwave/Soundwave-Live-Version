const LIST_TRACKS_SQL = `
  SELECT
    t.id AS track_id,
    t.title AS track_title,
    t.duration_ms,
    a.id AS album_id,
    a.title AS album_title,
    ar.id AS artist_id,
    ar.name AS artist_name
  FROM tracks t
  JOIN albums a
    ON a.id = t.album_id
  JOIN artists ar
    ON ar.id = a.artist_id
  ORDER BY t.id
`;

export function createCatalogRepository(database) {
  if (
    !database ||
    typeof database.query !== "function"
  ) {
    throw new TypeError(
      "Catalog repository requires a database with query()."
    );
  }

  return {
    async listTracks() {
      const result = await database.query(
        LIST_TRACKS_SQL
      );

      return result.rows;
    }
  };
}