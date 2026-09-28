const SEARCH_TRACKS_SQL = `
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
  WHERE t.title ILIKE '%' || $1 || '%'
  ORDER BY t.id
`;

const SEARCH_ARTISTS_SQL = `
  SELECT
    ar.id AS artist_id,
    ar.name AS artist_name
  FROM artists ar
  WHERE ar.name ILIKE '%' || $1 || '%'
  ORDER BY ar.id
`;

const SEARCH_ALBUMS_SQL = `
  SELECT
    a.id AS album_id,
    a.title AS album_title,
    ar.id AS artist_id,
    ar.name AS artist_name
  FROM albums a
  JOIN artists ar
    ON ar.id = a.artist_id
  WHERE a.title ILIKE '%' || $1 || '%'
  ORDER BY a.id
`;

export function createSearchRepository(database) {
  if (
    !database ||
    typeof database.query !== "function"
  ) {
    throw new TypeError(
      "Search repository requires a database with query()."
    );
  }

  return {
    async searchTracks(query) {
      const result = await database.query(
        SEARCH_TRACKS_SQL,
        [query]
      );

      return result.rows;
    },

    async searchArtists(query) {
      const result = await database.query(
        SEARCH_ARTISTS_SQL,
        [query]
      );

      return result.rows;
    },

    async searchAlbums(query) {
      const result = await database.query(
        SEARCH_ALBUMS_SQL,
        [query]
      );

      return result.rows;
    }
  };
}
