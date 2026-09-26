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
    },

    async listArtists() {
      if (
        typeof repository.listArtists !== "function"
      ) {
        throw new TypeError(
          "Catalog repository does not support listArtists()."
        );
      }

      const rows =
        await repository.listArtists();

      return rows.map((row) => ({
        id: Number(row.artist_id),
        name: row.artist_name
      }));
    },

    async getArtistById(artistId) {
      if (
        !Number.isInteger(artistId) ||
        artistId <= 0
      ) {
        throw new TypeError(
          "Artist ID must be a positive integer."
        );
      }

      if (
        typeof repository.findArtistById !== "function" ||
        typeof repository.listAlbumsByArtistId !== "function"
      ) {
        throw new TypeError(
          "Catalog repository does not support artist detail queries."
        );
      }

      const artistRow =
        await repository.findArtistById(
          artistId
        );

      if (!artistRow) {
        return null;
      }

      const albumRows =
        await repository.listAlbumsByArtistId(
          artistId
        );

      return {
        id: Number(artistRow.artist_id),
        name: artistRow.artist_name,

        albums: albumRows.map((row) => ({
          id: Number(row.album_id),
          title: row.album_title
        }))
      };
    },

    async listAlbums() {
      if (
        typeof repository.listAlbums !== "function"
      ) {
        throw new TypeError(
          "Catalog repository does not support listAlbums()."
        );
      }

      const rows =
        await repository.listAlbums();

      return rows.map((row) => ({
        id: Number(row.album_id),
        title: row.album_title,

        artist: {
          id: Number(row.artist_id),
          name: row.artist_name
        }
      }));
    },

    async getAlbumById(albumId) {
      if (
        !Number.isInteger(albumId) ||
        albumId <= 0
      ) {
        throw new TypeError(
          "Album ID must be a positive integer."
        );
      }

      if (
        typeof repository.findAlbumById !== "function" ||
        typeof repository.listTracksByAlbumId !== "function"
      ) {
        throw new TypeError(
          "Catalog repository does not support album detail queries."
        );
      }

      const albumRow =
        await repository.findAlbumById(
          albumId
        );

      if (!albumRow) {
        return null;
      }

      const trackRows =
        await repository.listTracksByAlbumId(
          albumId
        );

      return {
        id: Number(albumRow.album_id),
        title: albumRow.album_title,

        artist: {
          id: Number(albumRow.artist_id),
          name: albumRow.artist_name
        },

        tracks: trackRows.map((row) => ({
          id: Number(row.track_id),
          title: row.track_title,
          durationMs: Number(
            row.duration_ms
          )
        }))
      };
    }
  };
}