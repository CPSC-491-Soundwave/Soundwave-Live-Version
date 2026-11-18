import { useEffect, useRef, useState } from "react";

import "./FavoritesSection.css";

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

function removalError(status) {
  if (status === 401) {
    return "Your session is no longer authorized. Please sign in again.";
  }
  if (status === 403) {
    return "You do not have permission to remove Favorites.";
  }
  if (status === 503) {
    return "Favorites are temporarily unavailable. Please retry.";
  }

  return "Unable to remove this Favorite. Please retry.";
}

export default function FavoritesSection({
  accessToken,
  onSelectTrack,
  refreshKey = 0,
  onFavoritesResult,
  onMutationSuccess
}) {
  const [retryCount, setRetryCount] = useState(0);

  const [result, setResult] = useState({
    requestKey: null,
    status: "loading",
    tracks: []
  });

  const [removal, setRemoval] = useState({
    token: null,
    trackId: null,
    error: ""
  });

  const removeControllerRef = useRef(null);

  const requestKey = accessToken
    ? `${accessToken}:${refreshKey}:${retryCount}`
    : null;

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    const currentRequestKey =
      `${accessToken}:${refreshKey}:${retryCount}`;

    function publish(status, tracks = []) {
      if (!active || controller.signal.aborted) {
        return;
      }

      setResult({
        requestKey: currentRequestKey,
        status,
        tracks
      });

      onFavoritesResult?.({
        token: accessToken,
        revision: refreshKey,
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

        if (response.status === 401) {
          publish("unauthorized");
          return;
        }

        if (response.status === 403) {
          publish("forbidden");
          return;
        }

        if (response.status === 503) {
          publish("unavailable");
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Favorites request failed: ${response.status}`
          );
        }

        const tracks = await response.json();

        if (!Array.isArray(tracks)) {
          throw new Error(
            "Favorites response must be an array."
          );
        }

        publish("ready", tracks);
      } catch (error) {
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
  }, [
    accessToken,
    refreshKey,
    retryCount,
    onFavoritesResult
  ]);

  // Stop an in-flight removal when the authenticated
  // session changes or the component unmounts.
  useEffect(() => {
    return () => {
      removeControllerRef.current?.abort();
      removeControllerRef.current = null;
    };
  }, [accessToken]);

  const status = !accessToken
    ? "signedOut"
    : result.requestKey === requestKey
      ? result.status
      : "loading";

  const tracks = status === "ready"
    ? result.tracks
    : [];

  const removingTrackId = removal.token === accessToken
    ? removal.trackId
    : null;

  const removalErrorMessage = removal.token === accessToken
    ? removal.error
    : "";

  function retry() {
    setRetryCount((count) => count + 1);
  }

  async function removeFavorite(track) {
    if (
      !accessToken ||
      status !== "ready" ||
      removeControllerRef.current
    ) {
      return;
    }

    const controller = new AbortController();
    removeControllerRef.current = controller;

    setRemoval({
      token: accessToken,
      trackId: track.id,
      error: ""
    });

    try {
      const response = await fetch(
        `/api/library/favorites/${track.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(removalError(response.status));
      }

      if (!controller.signal.aborted) {
        if (typeof onMutationSuccess === "function") {
          // Library is responsible for coordinating the
          // new GET and updating Add button states.
          onMutationSuccess();
        } else {
          // Keep standalone component usage functional.
          setRetryCount((count) => count + 1);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setRemoval({
          token: accessToken,
          trackId: null,
          error: error instanceof Error
            ? error.message
            : "Unable to remove this Favorite."
        });
      }
    } finally {
      if (removeControllerRef.current === controller) {
        removeControllerRef.current = null;
      }

      if (!controller.signal.aborted) {
        setRemoval((state) => ({
          ...state,
          trackId: null
        }));
      }
    }
  }

  return (
    <section
      className="favorites-section"
      aria-labelledby="favorites-heading"
    >
      <h2 id="favorites-heading">
        Favorite Tracks
      </h2>

      {status === "loading" && (
        <p role="status">
          Loading favorites...
        </p>
      )}

      {status === "signedOut" && (
        <p>
          Sign in to view your favorite tracks.
        </p>
      )}

      {status === "unauthorized" && (
        <p role="alert">
          Your session is no longer authorized.
          Please sign in again.
        </p>
      )}

      {status === "forbidden" && (
        <p role="alert">
          You do not have permission to view favorites.
        </p>
      )}

      {status === "unavailable" && (
        <div role="alert">
          <p>Favorites are temporarily unavailable.</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === "error" && (
        <div role="alert">
          <p>Unable to load favorites.</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {removalErrorMessage && status === "ready" && (
        <p role="alert">
          {removalErrorMessage}
        </p>
      )}

      {status === "ready" && tracks.length === 0 && (
        <p>
          You have no favorite tracks yet.
        </p>
      )}

      {status === "ready" && tracks.length > 0 && (
        <ul
          className="favorites-section__list"
          aria-label="Favorite tracks"
        >
          {tracks.map((track) => {
            const duration =
              formatDuration(track.durationMs);

            const isRemoving =
              removingTrackId === track.id;

            return (
              <li key={track.id}>
                <div className="favorites-section__track">
                  {/* Existing track-selection contract. */}
                  <button
                    type="button"
                    className="favorites-section__select"
                    onClick={() => {
                      onSelectTrack?.(track.id);
                    }}
                    disabled={
                      typeof onSelectTrack !== "function"
                    }
                    aria-label={`Select ${track.title}`}
                  >
                    <span
                      className="favorites-section__artwork"
                      aria-hidden="true"
                    >
                      ♪
                    </span>

                    <span className="favorites-section__details">
                      <strong>
                        {track.title}
                      </strong>

                      <span>
                        {track.artist?.name ??
                          "Unknown artist"}
                        {" · "}
                        {track.album?.title ??
                          "Unknown album"}
                      </span>
                    </span>
                  </button>

                  {/* Separate DELETE action; no nested buttons. */}
                  <span className="favorites-section__aside">
                    <button
                      type="button"
                      className="favorites-section__remove"
                      aria-label={
                        isRemoving
                          ? `Removing ${track.title} from Favorites`
                          : `Remove ${track.title} from Favorites`
                      }
                      title={`Remove ${track.title} from Favorites`}
                      onClick={() => removeFavorite(track)}
                      disabled={removingTrackId !== null}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path
                          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
                        />
                      </svg>
                    </button>

                    {duration !== null && (
                      <span className="favorites-section__duration">
                        {duration}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}