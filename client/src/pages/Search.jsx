import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import AlbumCard from "../components/AlbumCard";
import ArtistCard from "../components/ArtistCard";
import "./Search.css";

const SEARCH_TYPES = [
  { value: "all", label: "All" },
  { value: "track", label: "Tracks" },
  { value: "artist", label: "Artists" },
  { value: "album", label: "Albums" },
];

const EMPTY_RESULTS = {
  query: "",
  tracks: [],
  artists: [],
  albums: [],
};

function formatDuration(durationMs) {
  const value = Number(durationMs);

  if (!Number.isFinite(value) || value < 0) {
    return "--:--";
  }

  const seconds = Math.floor(value / 1000);

  return `${Math.floor(seconds / 60)}:${String(
    seconds % 60
  ).padStart(2, "0")}`;
}

function isSearchResponse(data) {
  return Boolean(
    data &&
      typeof data === "object" &&
      typeof data.query === "string" &&
      Array.isArray(data.tracks) &&
      Array.isArray(data.artists) &&
      Array.isArray(data.albums)
  );
}

export default function Search({ onSelectTrack }) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputRef = useRef(null);
  const requestControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Invalidate aborted requests and responses that arrive
  // after a newer request has already been started.
  function cancelPendingSearch() {
    requestIdRef.current += 1;

    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  }

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      requestControllerRef.current?.abort();
    };
  }, []);

  async function runSearch(rawQuery, type) {
    const normalizedQuery = rawQuery.trim();

    if (!normalizedQuery || normalizedQuery.length > 100) {
      cancelPendingSearch();

      setLoading(false);
      setHasSearched(false);
      setResults(EMPTY_RESULTS);

      setError(
        !normalizedQuery
          ? "Enter a search term before searching."
          : "Search terms must be 100 characters or fewer."
      );

      return;
    }

    cancelPendingSearch();

    const requestId = requestIdRef.current;
    const controller = new AbortController();

    requestControllerRef.current = controller;

    setLoading(true);
    setError("");
    setHasSearched(false);
    setResults(EMPTY_RESULTS);

    try {
      const params = new URLSearchParams({
        q: normalizedQuery,
        type,
      });

      const response = await fetch(`/api/search?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Search request failed with HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (!isSearchResponse(data)) {
        throw new Error(
          "Search response had an unexpected format."
        );
      }

      if (
        requestId !== requestIdRef.current ||
        controller.signal.aborted
      ) {
        return;
      }

      setResults(data);
      setHasSearched(true);
    } catch (searchError) {
      if (
        requestId !== requestIdRef.current ||
        controller.signal.aborted
      ) {
        return;
      }

      setResults(EMPTY_RESULTS);
      setHasSearched(true);

      // Preserve controlled HTTP/response errors.
      // Do not expose raw fetch exceptions or private URLs.
      const knownError =
        searchError instanceof Error &&
        (searchError.message.startsWith(
          "Search request failed with HTTP "
        ) ||
          searchError.message ===
            "Search response had an unexpected format.");

      setError(
        knownError
          ? searchError.message
          : "Unable to search the catalog right now. Please try again."
      );
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    void runSearch(query, searchType);
  }

  function handleQueryChange(event) {
    // A changed query invalidates results from the old query.
    cancelPendingSearch();

    setQuery(event.target.value);
    setLoading(false);
    setError("");
    setResults(EMPTY_RESULTS);
    setHasSearched(false);
  }

  function handleTypeChange(event) {
    const nextType = event.target.value;

    setSearchType(nextType);

    // Sprint 5 Discovery enhancement:
    // After a search, changing the category refreshes
    // results without requiring another Search click.
    //
    // Before the first search, changing the dropdown
    // only selects the desired category.
    if (hasSearched || loading) {
      void runSearch(query, nextType);
    }
  }

  function handleClear() {
    cancelPendingSearch();

    setQuery("");
    setSearchType("all");
    setResults(EMPTY_RESULTS);
    setHasSearched(false);
    setLoading(false);
    setError("");

    inputRef.current?.focus();
  }

  const totalResults =
    results.tracks.length +
    results.artists.length +
    results.albums.length;

  const currentTypeLabel = SEARCH_TYPES.find(
    (type) => type.value === searchType
  )?.label;

  const canClear = Boolean(
    query || searchType !== "all" || hasSearched || error
  );

  return (
    <section className="search-page">
      <header className="search-page__header">
        <h1>Search</h1>

        <p>
          Search Soundwave tracks, artists, and albums.
        </p>
      </header>

      <form
        className="search-form"
        onSubmit={handleSubmit}
        role="search"
      >
        <div className="search-form__field">
          <label htmlFor="catalog-search">
            Search the catalog
          </label>

          <input
            id="catalog-search"
            ref={inputRef}
            type="search"
            value={query}
            maxLength={100}
            onChange={handleQueryChange}
            placeholder="Track, artist, or album"
            autoComplete="off"
          />
        </div>

        <div className="search-form__field search-form__field--type">
          <label htmlFor="search-type">
            Filter
          </label>

          <select
            id="search-type"
            value={searchType}
            onChange={handleTypeChange}
          >
            {SEARCH_TYPES.map((type) => (
              <option
                key={type.value}
                value={type.value}
              >
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <button
          className="search-form__submit"
          type="submit"
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {canClear && (
        <p className="search-page__status">
          <button
            type="button"
            onClick={handleClear}
          >
            Clear search and filters
          </button>
        </p>
      )}

      {loading && (
        <p
          className="search-page__status"
          role="status"
        >
          Searching {currentTypeLabel?.toLowerCase()} for
          {" "}“{query.trim()}”...
        </p>
      )}

      {error && (
        <p
          className="search-page__status search-page__status--error"
          role="alert"
        >
          {error}
        </p>
      )}

      {!error && !loading && !hasSearched && (
        <p className="search-page__status">
          Enter a search term to explore the catalog.
        </p>
      )}

      {!error &&
        !loading &&
        hasSearched &&
        totalResults === 0 && (
          <p
            className="search-page__status"
            role="status"
          >
            No results found for “{results.query}”.
          </p>
        )}

      {!error &&
        !loading &&
        hasSearched &&
        totalResults > 0 && (
          <div className="search-results">
            <p
              className="search-results__summary"
              role="status"
            >
              {totalResults}{" "}
              {totalResults === 1
                ? "result"
                : "results"}{" "}
              for “{results.query}”
              {searchType === "all"
                ? ""
                : ` in ${currentTypeLabel}`}
            </p>

            {results.tracks.length > 0 && (
              <section
                className="search-results__section"
                aria-labelledby="search-tracks-heading"
              >
                <div className="search-results__heading">
                  <h2 id="search-tracks-heading">
                    Tracks
                  </h2>

                  <span>
                    {results.tracks.length}
                  </span>
                </div>

                <div
                  className="search-track-list"
                  aria-label="Track search results"
                >
                  {results.tracks.map((track) => (
                    <article
                      className="search-track"
                      key={track.id}
                    >
                      <div className="search-track__identity">
                        <strong className="search-track__title">
                          {track.title}
                        </strong>

                        <span className="search-track__metadata">
                          <Link
                            to={`/artists/${track.artist.id}`}
                          >
                            {track.artist.name}
                          </Link>

                          <span aria-hidden="true">
                            {" • "}
                          </span>

                          <Link
                            to={`/albums/${track.album.id}`}
                          >
                            {track.album.title}
                          </Link>
                        </span>
                      </div>

                      <button
                        type="button"
                        aria-label={`Play ${track.title}`}
                        onClick={() =>
                          onSelectTrack?.(track.id)
                        }
                      >
                        Play
                      </button>

                      <span className="search-track__duration">
                        {formatDuration(
                          track.durationMs
                        )}
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {results.artists.length > 0 && (
              <section
                className="search-results__section"
                aria-labelledby="search-artists-heading"
              >
                <div className="search-results__heading">
                  <h2 id="search-artists-heading">
                    Artists
                  </h2>

                  <span>
                    {results.artists.length}
                  </span>
                </div>

                <div
                  className="catalog-browse-grid"
                  aria-label="Artist search results"
                >
                  {results.artists.map((artist) => (
                    <ArtistCard
                      key={artist.id}
                      id={artist.id}
                      name={artist.name}
                      artworkUrl={artist.artworkUrl}
                    />
                  ))}
                </div>
              </section>
            )}

            {results.albums.length > 0 && (
              <section
                className="search-results__section"
                aria-labelledby="search-albums-heading"
              >
                <div className="search-results__heading">
                  <h2 id="search-albums-heading">
                    Albums
                  </h2>

                  <span>
                    {results.albums.length}
                  </span>
                </div>

                <div
                  className="catalog-browse-grid"
                  aria-label="Album search results"
                >
                  {results.albums.map((album) => (
                    <AlbumCard
                      key={album.id}
                      id={album.id}
                      title={album.title}
                      artistName={album.artist?.name}
                      artworkUrl={album.artworkUrl}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
    </section>
  );
}
