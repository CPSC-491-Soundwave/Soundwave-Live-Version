import {
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import AlbumCard from "../components/AlbumCard";
import ArtistCard from "../components/ArtistCard";
import "./Search.css";

const SEARCH_TYPES = [
  {
    value: "all",
    label: "All",
  },
  {
    value: "track",
    label: "Tracks",
  },
  {
    value: "artist",
    label: "Artists",
  },
  {
    value: "album",
    label: "Albums",
  },
];

const EMPTY_RESULTS = {
  query: "",
  tracks: [],
  artists: [],
  albums: [],
};

function formatDuration(durationMs) {
  const numericDuration =
    Number(durationMs);

  if (
    !Number.isFinite(numericDuration) ||
    numericDuration < 0
  ) {
    return "--:--";
  }

  const totalSeconds =
    Math.floor(numericDuration / 1000);

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isSearchResponse(data) {
  return (
    data &&
    typeof data === "object" &&
    typeof data.query === "string" &&
    Array.isArray(data.tracks) &&
    Array.isArray(data.artists) &&
    Array.isArray(data.albums)
  );
}

export default function Search() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] =
    useState("all");
  const [results, setResults] =
    useState(EMPTY_RESULTS);
  const [hasSearched, setHasSearched] =
    useState(false);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState("");

  const requestControllerRef =
    useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedQuery =
      query.trim();

    if (!normalizedQuery) {
      setError(
        "Enter a search term before searching."
      );
      return;
    }

    if (normalizedQuery.length > 100) {
      setError(
        "Search terms must be 100 characters or fewer."
      );
      return;
    }

    requestControllerRef.current?.abort();

    const controller =
      new AbortController();

    requestControllerRef.current =
      controller;

    setLoading(true);
    setError("");

    try {
      const searchParams =
        new URLSearchParams({
          q: normalizedQuery,
          type: searchType,
        });

      const response =
        await fetch(
          `/api/search?${searchParams.toString()}`,
          {
            signal: controller.signal,
          }
        );

      if (!response.ok) {
        throw new Error(
          `Search request failed with HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      if (!isSearchResponse(data)) {
        throw new Error(
          "Search response had an unexpected format."
        );
      }

      setResults(data);
      setHasSearched(true);
    } catch (searchError) {
      if (
        searchError instanceof DOMException &&
        searchError.name === "AbortError"
      ) {
        return;
      }

      setResults(EMPTY_RESULTS);
      setHasSearched(true);

      setError(
        searchError instanceof Error
          ? searchError.message
          : "Unknown search error"
      );
    } finally {
      if (
        requestControllerRef.current ===
        controller
      ) {
        requestControllerRef.current =
          null;

        setLoading(false);
      }
    }
  }

  const totalResults =
    results.tracks.length +
    results.artists.length +
    results.albums.length;

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
      >
        <div className="search-form__field">
          <label htmlFor="catalog-search">
            Search the catalog
          </label>

          <input
            id="catalog-search"
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => {
              setQuery(event.target.value);

              if (error) {
                setError("");
              }
            }}
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
            onChange={(event) => {
              setSearchType(
                event.target.value
              );
            }}
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
          {loading
            ? "Searching..."
            : "Search"}
        </button>
      </form>

      {error && (
        <p
          className="search-page__status search-page__status--error"
          role="alert"
        >
          {error}
        </p>
      )}

      {!error &&
        !loading &&
        !hasSearched && (
          <p className="search-page__status">
            Enter a search term to explore the catalog.
          </p>
        )}

      {!error &&
        !loading &&
        hasSearched &&
        totalResults === 0 && (
          <p className="search-page__status">
            No results found for &ldquo;{results.query}&rdquo;.
          </p>
        )}

      {!error &&
        !loading &&
        hasSearched &&
        totalResults > 0 && (
          <div className="search-results">
            <p className="search-results__summary">
              {totalResults}{" "}
              {totalResults === 1
                ? "result"
                : "results"}{" "}
              for &ldquo;{results.query}&rdquo;
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
                  {results.tracks.map(
                    (track) => (
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

                            <span
                              aria-hidden="true"
                            >
                              {" "}
                              •{" "}
                            </span>

                            <Link
                              to={`/albums/${track.album.id}`}
                            >
                              {track.album.title}
                            </Link>
                          </span>
                        </div>

                        <span className="search-track__duration">
                          {formatDuration(
                            track.durationMs
                          )}
                        </span>
                      </article>
                    )
                  )}
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
                  {results.artists.map(
                    (artist) => (
                      <ArtistCard
                        key={artist.id}
                        id={artist.id}
                        name={artist.name}
                        artworkUrl={
                          artist.artworkUrl
                        }
                      />
                    )
                  )}
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
                  {results.albums.map(
                    (album) => (
                      <AlbumCard
                        key={album.id}
                        id={album.id}
                        title={album.title}
                        artistName={
                          album.artist?.name
                        }
                        artworkUrl={
                          album.artworkUrl
                        }
                      />
                    )
                  )}
                </div>
              </section>
            )}
          </div>
        )}
    </section>
  );
}
