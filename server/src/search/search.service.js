const ALLOWED_SEARCH_TYPES =
  new Set([
    "all",
    "track",
    "artist",
    "album"
  ]);

function mapTrack(row) {
  return {
    id: Number(row.track_id),
    title: row.track_title,
    durationMs: Number(row.duration_ms),

    album: {
      id: Number(row.album_id),
      title: row.album_title
    },

    artist: {
      id: Number(row.artist_id),
      name: row.artist_name
    }
  };
}

function mapArtist(row) {
  return {
    id: Number(row.artist_id),
    name: row.artist_name
  };
}

function mapAlbum(row) {
  return {
    id: Number(row.album_id),
    title: row.album_title,

    artist: {
      id: Number(row.artist_id),
      name: row.artist_name
    }
  };
}

export function createSearchService(repository) {
  if (
    !repository ||
    typeof repository.searchTracks !== "function" ||
    typeof repository.searchArtists !== "function" ||
    typeof repository.searchAlbums !== "function"
  ) {
    throw new TypeError(
      "Search service requires a complete search repository."
    );
  }

  return {
    async search(query, type = "all") {
      if (typeof query !== "string") {
        throw new TypeError(
          "Search query must be a string."
        );
      }

      const normalizedQuery =
        query.trim();

      if (
        normalizedQuery.length === 0 ||
        normalizedQuery.length > 100
      ) {
        throw new TypeError(
          "Search query must contain between 1 and 100 characters."
        );
      }

      if (
        !ALLOWED_SEARCH_TYPES.has(type)
      ) {
        throw new TypeError(
          "Search type is invalid."
        );
      }

      const trackPromise =
        type === "all" ||
        type === "track"
          ? repository.searchTracks(
              normalizedQuery
            )
          : Promise.resolve([]);

      const artistPromise =
        type === "all" ||
        type === "artist"
          ? repository.searchArtists(
              normalizedQuery
            )
          : Promise.resolve([]);

      const albumPromise =
        type === "all" ||
        type === "album"
          ? repository.searchAlbums(
              normalizedQuery
            )
          : Promise.resolve([]);

      const [
        trackRows,
        artistRows,
        albumRows
      ] = await Promise.all([
        trackPromise,
        artistPromise,
        albumPromise
      ]);

      return {
        query: normalizedQuery,

        tracks:
          trackRows.map(mapTrack),

        artists:
          artistRows.map(mapArtist),

        albums:
          albumRows.map(mapAlbum)
      };
    }
  };
}
