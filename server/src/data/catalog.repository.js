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

const LIST_ARTISTS_SQL = `
  SELECT
    ar.id AS artist_id,
    ar.name AS artist_name
  FROM artists ar
  ORDER BY ar.id
`;

const FIND_ARTIST_BY_ID_SQL = `
  SELECT
    ar.id AS artist_id,
    ar.name AS artist_name
  FROM artists ar
  WHERE ar.id = $1
`;

const LIST_ALBUMS_BY_ARTIST_ID_SQL = `
  SELECT
    a.id AS album_id,
    a.title AS album_title
  FROM albums a
  WHERE a.artist_id = $1
  ORDER BY a.id
`;

const LIST_RECENTLY_ADDED_TRACKS_SQL = `
  SELECT
    t.id AS track_id,
    t.title AS track_title,
    t.duration_ms,
    t.created_at AS track_created_at,
    a.id AS album_id,
    a.title AS album_title,
    ar.id AS artist_id,
    ar.name AS artist_name
  FROM tracks t
  JOIN albums a
    ON a.id = t.album_id
  JOIN artists ar
    ON ar.id = a.artist_id
  ORDER BY
    t.created_at DESC,
    t.id DESC
  LIMIT $1
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
    },
    
        async listArtists() {
      const result = await database.query(
        LIST_ARTISTS_SQL
      );

      return result.rows;
    },

    async findArtistById(artistId) {
      const result = await database.query(
        FIND_ARTIST_BY_ID_SQL,
        [artistId]
      );

      return result.rows[0] ?? null;
    },

    async listAlbumsByArtistId(artistId) {
      const result = await database.query(
        LIST_ALBUMS_BY_ARTIST_ID_SQL,
        [artistId]
      );

      return result.rows;
    },

    async listRecentlyAddedTracks(limit = 10) {
      if (
        !Number.isInteger(limit) ||
        limit <= 0
      ) {
        throw new TypeError(
          "Recently-added track limit must be a positive integer."
        );
      }

      const result = await database.query(
        LIST_RECENTLY_ADDED_TRACKS_SQL,
        [limit]
      );

      return result.rows;
    }
  };
}