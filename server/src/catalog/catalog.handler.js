function writeJson(
  response,
  statusCode,
  payload
) {
  response.writeHead(statusCode, {
    "Content-Type":
      "application/json; charset=utf-8"
  });

  response.end(
    JSON.stringify(payload)
  );
}

function parsePositiveIntegerId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    return null;
  }

  return id;
}

export function createCatalogHandler(
  catalogService
) {
  if (
    !catalogService ||
    typeof catalogService.listTracks !== "function"
  ) {
    throw new TypeError(
      "Catalog handler requires a catalog service with listTracks()."
    );
  }

  return async function handleCatalogRequest(
    request,
    response
  ) {
    if (request.method !== "GET") {
      return false;
    }

    if (
      request.url === "/api/catalog/tracks"
    ) {
      try {
        const tracks =
          await catalogService.listTracks();

        writeJson(
          response,
          200,
          tracks
        );

        return true;
      } catch (error) {
        console.error(
          "Catalog request failed:",
          error
        );

        writeJson(
          response,
          500,
          {
            error: "catalog_unavailable"
          }
        );

        return true;
      }
    }

    if (
      request.url === "/api/catalog/artists"
    ) {
      try {
        if (
          typeof catalogService.listArtists !==
          "function"
        ) {
          throw new TypeError(
            "Catalog service does not support listArtists()."
          );
        }

        const artists =
          await catalogService.listArtists();

        writeJson(
          response,
          200,
          artists
        );

        return true;
      } catch (error) {
        console.error(
          "Catalog request failed:",
          error
        );

        writeJson(
          response,
          500,
          {
            error: "catalog_unavailable"
          }
        );

        return true;
      }
    }

    const artistDetailMatch =
      request.url.match(
        /^\/api\/catalog\/artists\/([^/?]+)$/
      );

    if (artistDetailMatch) {
      const artistId =
        parsePositiveIntegerId(
          artistDetailMatch[1]
        );

      if (artistId === null) {
        writeJson(
          response,
          400,
          {
            error: "invalid_artist_id"
          }
        );

        return true;
      }

      try {
        if (
          typeof catalogService.getArtistById !==
          "function"
        ) {
          throw new TypeError(
            "Catalog service does not support getArtistById()."
          );
        }

        const artist =
          await catalogService.getArtistById(
            artistId
          );

        if (!artist) {
          writeJson(
            response,
            404,
            {
              error: "artist_not_found"
            }
          );

          return true;
        }

        writeJson(
          response,
          200,
          artist
        );

        return true;
      } catch (error) {
        console.error(
          "Catalog request failed:",
          error
        );

        writeJson(
          response,
          500,
          {
            error: "catalog_unavailable"
          }
        );

        return true;
      }
    }

    if (
      request.url === "/api/catalog/albums"
    ) {
      try {
        if (
          typeof catalogService.listAlbums !==
          "function"
        ) {
          throw new TypeError(
            "Catalog service does not support listAlbums()."
          );
        }

        const albums =
          await catalogService.listAlbums();

        writeJson(
          response,
          200,
          albums
        );

        return true;
      } catch (error) {
        console.error(
          "Catalog request failed:",
          error
        );

        writeJson(
          response,
          500,
          {
            error: "catalog_unavailable"
          }
        );

        return true;
      }
    }

    const albumDetailMatch =
      request.url.match(
        /^\/api\/catalog\/albums\/([^/?]+)$/
      );

    if (albumDetailMatch) {
      const albumId =
        parsePositiveIntegerId(
          albumDetailMatch[1]
        );

      if (albumId === null) {
        writeJson(
          response,
          400,
          {
            error: "invalid_album_id"
          }
        );

        return true;
      }

      try {
        if (
          typeof catalogService.getAlbumById !==
          "function"
        ) {
          throw new TypeError(
            "Catalog service does not support getAlbumById()."
          );
        }

        const album =
          await catalogService.getAlbumById(
            albumId
          );

        if (!album) {
          writeJson(
            response,
            404,
            {
              error: "album_not_found"
            }
          );

          return true;
        }

        writeJson(
          response,
          200,
          album
        );

        return true;
      } catch (error) {
        console.error(
          "Catalog request failed:",
          error
        );

        writeJson(
          response,
          500,
          {
            error: "catalog_unavailable"
          }
        );

        return true;
      }
    }

    return false;
  };
}