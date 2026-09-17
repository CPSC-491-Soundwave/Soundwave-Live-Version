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
    if (
      request.method !== "GET" ||
      request.url !== "/api/catalog/tracks"
    ) {
      return false;
    }

    try {
      const tracks =
        await catalogService.listTracks();

      response.writeHead(200, {
        "Content-Type":
          "application/json; charset=utf-8"
      });

      response.end(
        JSON.stringify(tracks)
      );

      return true;
    } catch (error) {
      console.error(
        "Catalog request failed:",
        error
      );

      response.writeHead(500, {
        "Content-Type":
          "application/json; charset=utf-8"
      });

      response.end(
        JSON.stringify({
          error: "catalog_unavailable"
        })
      );

      return true;
    }
  };
}