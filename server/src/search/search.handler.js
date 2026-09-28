const ALLOWED_SEARCH_TYPES =
  new Set([
    "all",
    "track",
    "artist",
    "album"
  ]);

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

export function createSearchHandler(
  searchService
) {
  if (
    !searchService ||
    typeof searchService.search !== "function"
  ) {
    throw new TypeError(
      "Search handler requires a search service with search()."
    );
  }

  return async function handleSearchRequest(
    request,
    response
  ) {
    if (request.method !== "GET") {
      return false;
    }

    const url =
      new URL(
        request.url,
        "http://localhost"
      );

    if (url.pathname !== "/api/search") {
      return false;
    }

    const rawQuery =
      url.searchParams.get("q");

    if (rawQuery === null) {
      writeJson(
        response,
        400,
        {
          error:
            "invalid_search_query"
        }
      );

      return true;
    }

    const query =
      rawQuery.trim();

    if (
      query.length === 0 ||
      query.length > 100
    ) {
      writeJson(
        response,
        400,
        {
          error:
            "invalid_search_query"
        }
      );

      return true;
    }

    const type =
      url.searchParams.get("type") ??
      "all";

    if (
      !ALLOWED_SEARCH_TYPES.has(type)
    ) {
      writeJson(
        response,
        400,
        {
          error:
            "invalid_search_type"
        }
      );

      return true;
    }

    try {
      const result =
        await searchService.search(
          query,
          type
        );

      writeJson(
        response,
        200,
        result
      );

      return true;
    } catch (error) {
      console.error(
        "Search request failed:",
        error
      );

      writeJson(
        response,
        500,
        {
          error:
            "search_unavailable"
        }
      );

      return true;
    }
  };
}
