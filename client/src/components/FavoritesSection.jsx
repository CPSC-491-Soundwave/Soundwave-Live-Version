
import { useEffect, useState } from "react";

import "./FavoritesSection.css";

// Convert milliseconds into minutes:seconds.
function formatDuration(durationMs) {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  ) {
    return null;
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function FavoritesSection({
  accessToken,
  onSelectTrack
}) {
  const [retryCount, setRetryCount] = useState(0);

  const [result, setResult] = useState({
    requestKey: null,
    status: "loading",
    tracks: []
  });

  // Identify the current request. This also prevents
  // results from an earlier token or retry from displaying.
  const requestKey = accessToken
    ? `${accessToken}:${retryCount}`
    : null;

  useEffect(() => {
    // Do not request protected data when signed out.
    if (!accessToken) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    const currentRequestKey =
      `${accessToken}:${retryCount}`;

    // Update state only when an async request settles.
    function publish(status, tracks = []) {
      if (!active || controller.signal.aborted) {
        return;
      }

      setResult({
        requestKey: currentRequestKey,
        status,
        tracks
      });
    }

    async function loadFavorites() {
      try {
        const response = await fetch(
          "/api/library/favorites",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            signal: controller.signal
          }
        );

        if (!active || controller.signal.aborted) {
          return;
        }

        // Expired, missing, or revoked authorization.
        if (response.status === 401) {
          publish("unauthorized");
          return;
        }

        // Authenticated but insufficient permissions.
        if (response.status === 403) {
          publish("forbidden");
          return;
        }

        // Temporary backend or dependency failure.
        if (response.status === 503) {
          publish("unavailable");
          return;
        }

        // Other unsuccessful HTTP responses.
        if (!response.ok) {
          throw new Error(
            `Favorites request failed: ${response.status}`
          );
        }

        const tracks = await response.json();

        // The Favorites API contract returns an array.
        if (!Array.isArray(tracks)) {
          throw new Error(
            "Favorites response must be an array."
          );
        }

        publish("ready", tracks);
      } catch (error) {
        // Ignore cancellation and outdated requests.
        if (!active || controller.signal.aborted) {
          return;
        }

        console.error(
          "Failed to load favorites:",
          error
        );

        publish("error");
      }
    }

    loadFavorites();

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, retryCount]);

  // Derive the visible status without synchronously
  // setting state inside useEffect.
  const status = !accessToken
    ? "signedOut"
    : result.requestKey === requestKey
      ? result.status
      : "loading";

  const tracks = status === "ready"
    ? result.tracks
    : [];

  function retry() {
    setRetryCount((count) => count + 1);
  }

  return (
    <section
      className="favorites-section"
      aria-labelledby="favorites-heading"
    >
      <h2 id="favorites-heading">
        Favorite Tracks
      </h2>

      {/* Loading state */}
      {status === "loading" && (
        <p role="status">
          Loading favorites...
        </p>
      )}

      {/* Signed-out state */}
      {status === "signedOut" && (
        <p>
          Sign in to view your favorite tracks.
        </p>
      )}

      {/* Unauthorized or expired token */}
      {status === "unauthorized" && (
        <p role="alert">
          Your session is no longer authorized.
          Please sign in again.
        </p>
      )}

      {/* Insufficient permissions */}
      {status === "forbidden" && (
        <p role="alert">
          You do not have permission to view favorites.
        </p>
      )}

      {/* Temporary backend service failure */}
      {status === "unavailable" && (
        <div role="alert">
          <p>
            Favorites are temporarily unavailable.
          </p>

          <button
            type="button"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      )}

      {/* Unexpected HTTP or network failure */}
      {status === "error" && (
        <div role="alert">
          <p>
            Unable to load favorites.
          </p>

          <button
            type="button"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      )}

      {/* Successful request with no saved tracks */}
      {status === "ready" &&
        tracks.length === 0 && (
          <p>
            You have no favorite tracks yet.
          </p>
        )}

      {/* Successful request with saved tracks */}
      {status === "ready" &&
        tracks.length > 0 && (
          <ul
            className="favorites-section__list"
            aria-label="Favorite tracks"
          >
            {tracks.map((track) => {
              const duration =
                formatDuration(track.durationMs);

              return (
                <li key={track.id}>
                  <button
                    type="button"
                    className="favorites-section__track"
                    onClick={() => {
                      onSelectTrack?.(track.id);
                    }}
                    disabled={
                      typeof onSelectTrack !== "function"
                    }
                    aria-label={`Select ${track.title}`}
                  >
                    {/* Artwork placeholder */}
                    <span
                      className="favorites-section__artwork"
                      aria-hidden="true"
                    >
                      ♪
                    </span>

                    {/* Track information */}
                    <span className="favorites-section__details">
                      <strong>
                        {track.title}
                      </strong>

                      <p>
                        {track.artist?.name ??
                          "Unknown artist"}
                        {" · "}
                        {track.album?.title ??
                          "Unknown album"}
                      </p>
                    </span>

                    {/* Favorite indicator and duration */}
                    <span className="favorites-section__aside">
                      <span
                        className="favorites-section__heart"
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path
                            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
                          />
                        </svg>
                      </span>

                      {duration !== null && (
                        <span className="favorites-section__duration">
                          {duration}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
