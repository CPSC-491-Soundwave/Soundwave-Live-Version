import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import FavoritesSection from "../components/FavoritesSection.jsx";
import "./Library.css";

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function mutationError(status, removing) {
  if (status === 401) {
    return "Your session is no longer authorized. Please sign in again.";
  }

  if (status === 403) {
    return "You do not have permission to update Favorites.";
  }

  if (status === 404) {
    return "That track is no longer available.";
  }

  if (status === 503) {
    return "Favorites are temporarily unavailable. Please retry.";
  }

  return removing
    ? "Unable to remove this Favorite. Please retry."
    : "Unable to add this track to Favorites. Please retry.";
}

export default function Library({
  accessToken,
  onSelectTrack,
  favoritesVersion = 0,
  onFavoritesChanged
}) {
  const [recentResult, setRecentResult] = useState({
    token: null,
    status: "loading",
    tracks: [],
    error: ""
  });

  const [favoritesRevision, setFavoritesRevision] =
    useState(0);

  /*
   * SCRUM-362:
   * The Library can refresh because of its own write
   * or because another view (Playback Bar) changed
   * the saved Favorites collection.
   */
  const favoritesRefreshKey =
    `${favoritesVersion}:${favoritesRevision}`;

  const [favoritesSnapshot, setFavoritesSnapshot] =
    useState({
      token: null,
      revision: null,
      status: "loading",
      ids: []
    });

  const [pendingMutation, setPendingMutation] =
    useState(null);

  const [mutationFailure, setMutationFailure] =
    useState(null);

  const mutationControllerRef = useRef(null);

  // Load Recently Added using the existing Bearer token.
  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function loadRecentlyAdded() {
      try {
        const response = await fetch(
          "/api/library/recently-added",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            signal: controller.signal
          }
        );

        if (response.status === 401) {
          throw new Error(
            "Your session is not authorized. Please log in again."
          );
        }

        if (!response.ok) {
          throw new Error(
            `Library request failed with HTTP ${response.status}`
          );
        }

        const tracks = await response.json();

        if (!Array.isArray(tracks)) {
          throw new Error(
            "Library response was not an array."
          );
        }

        if (active && !controller.signal.aborted) {
          setRecentResult({
            token: accessToken,
            status: "ready",
            tracks,
            error: ""
          });
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setRecentResult({
            token: accessToken,
            status: "error",
            tracks: [],
            error: error instanceof Error
              ? error.message
              : "Unable to load the Library."
          });
        }
      }
    }

    loadRecentlyAdded();

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken]);

  // Cancel an obsolete Favorite write on logout
  // or when this Library component unmounts.
  useEffect(() => {
    return () => {
      mutationControllerRef.current?.abort();
      mutationControllerRef.current = null;
    };
  }, [accessToken]);

  // FavoritesSection reports results of its GET request.
  // These IDs determine the Recently Added heart states.
  const handleFavoritesResult = useCallback((snapshot) => {
    setFavoritesSnapshot({
      token: snapshot.token,
      revision: snapshot.revision,
      status: snapshot.status,
      ids: snapshot.status === "ready"
        ? snapshot.tracks.map((track) => track.id)
        : []
    });
  }, []);

  /*
   * Refresh when a Library heart successfully writes,
   * or FavoritesSection successfully removes a track.
   *
   * Notify App so the Playback Bar also updates.
   */
  const refreshFavorites = useCallback(() => {
    setMutationFailure(null);

    setFavoritesRevision((revision) => revision + 1);

    onFavoritesChanged?.();
  }, [onFavoritesChanged]);

  const recentStatus =
    recentResult.token === accessToken
      ? recentResult.status
      : "loading";

  const tracks =
    recentStatus === "ready"
      ? recentResult.tracks
      : [];

  // A snapshot from an older refresh may not be used
  // to display an incorrect saved or unsaved heart.
  const currentFavorites =
    favoritesSnapshot.token === accessToken &&
    favoritesSnapshot.revision === favoritesRefreshKey
      ? favoritesSnapshot
      : {
          status: "loading",
          ids: []
        };

  const savedTrackIds = new Set(currentFavorites.ids);

  const mutationBusy =
    pendingMutation?.token === accessToken;

  const visibleFailure =
    mutationFailure?.token === accessToken
      ? mutationFailure.message
      : "";

  async function toggleFavorite(track) {
    if (
      !accessToken ||
      mutationControllerRef.current ||
      currentFavorites.status !== "ready"
    ) {
      return;
    }

    const removing = savedTrackIds.has(track.id);
    const method = removing ? "DELETE" : "PUT";

    const controller = new AbortController();

    mutationControllerRef.current = controller;

    setPendingMutation({
      token: accessToken,
      trackId: track.id
    });

    setMutationFailure(null);

    try {
      const response = await fetch(
        `/api/library/favorites/${track.id}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(
          mutationError(response.status, removing)
        );
      }

      if (!controller.signal.aborted) {
        // The confirmed mutation invalidates every view.
        // A fresh GET determines the next heart state.
        refreshFavorites();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMutationFailure({
          token: accessToken,
          message: error instanceof Error
            ? error.message
            : "Unable to update Favorites."
        });
      }
    } finally {
      if (mutationControllerRef.current === controller) {
        mutationControllerRef.current = null;
      }

      if (!controller.signal.aborted) {
        setPendingMutation(null);
      }
    }
  }

  if (!accessToken) {
    return (
      <section className="library-page">
        <header className="library-page__header">
          <h1>Your Library</h1>

          <p>
            Browse tracks recently added to Soundwave.
          </p>
        </header>

        <div className="library-status">
          <h2>Login required</h2>

          <p>
            Log in to view your recently-added Library.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="library-page">
      <header className="library-page__header">
        <h1>Your Library</h1>

        <p>
          Browse tracks recently added to Soundwave.
        </p>
      </header>

      {recentStatus === "loading" && (
        <p className="library-status">
          Loading recently added tracks...
        </p>
      )}

      {recentStatus === "error" && (
        <p
          className="library-status library-status--error"
          role="alert"
        >
          {recentResult.error}
        </p>
      )}

      {recentStatus === "ready" &&
        tracks.length === 0 && (
          <p className="library-status">
            No recently-added tracks are available yet.
          </p>
        )}

      {recentStatus === "ready" &&
        tracks.length > 0 && (
          <>
            <h2 className="library-page__section-heading">
              Recently Added
            </h2>

            <div
              className="library-track-list"
              aria-label="Recently added tracks"
            >
              {tracks.map((track) => {
                const isSaved =
                  savedTrackIds.has(track.id);

                const duration =
                  formatDuration(track.durationMs);

                const actionName = isSaved
                  ? `Unfavorite ${track.title}`
                  : `Add ${track.title} to Favorites`;

                return (
                  <div
                    className="library-track"
                    key={track.id}
                  >
                    <button
                      type="button"
                      className="library-track__select"
                      onClick={() => {
                        onSelectTrack?.(track.id);
                      }}
                      aria-label={`Select ${track.title}`}
                    >
                      <span
                        className="library-track__artwork"
                        aria-hidden="true"
                      >
                        ♪
                      </span>

                      <span className="library-track__details">
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

                    <span className="library-track__aside">
                      <button
                        type="button"
                        className="library-track__favorite"
                        onClick={() => {
                          toggleFavorite(track);
                        }}
                        aria-label={actionName}
                        title={actionName}
                        disabled={
                          currentFavorites.status !== "ready" ||
                          mutationBusy
                        }
                        data-saved={
                          isSaved ? "true" : "false"
                        }
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill={
                            isSaved
                              ? "currentColor"
                              : "none"
                          }
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
                        <span className="library-track__duration">
                          {duration}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

      {visibleFailure && (
        <p
          className="library-favorite-feedback"
          role="alert"
        >
          {visibleFailure}
        </p>
      )}

      <FavoritesSection
        accessToken={accessToken}
        onSelectTrack={onSelectTrack}
        refreshKey={favoritesRefreshKey}
        onFavoritesResult={handleFavoritesResult}
        onMutationSuccess={refreshFavorites}
      />
    </section>
  );
}