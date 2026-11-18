
import {
  useEffect,
  useRef,
  useState
} from "react";

import {
  Link,
  useParams
} from "react-router-dom";

import "./ArtistAlbumDetail.css";

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function favoriteError(status, removing) {
  if (status === 401) {
    return "Your session expired. Please sign in again.";
  }
  if (status === 403) {
    return "You do not have permission to update Favorites.";
  }
  if (status === 404) {
    return "This track is no longer available.";
  }
  if (status === 503) {
    return "Favorites are temporarily unavailable. Please retry.";
  }

  return removing
    ? "Unable to remove this Favorite. Please retry."
    : "Unable to add this track to Favorites. Please retry.";
}

export default function AlbumDetail({
  onSelectTrack,
  accessToken = "",
  favoritesVersion = 0,
  onFavoritesChanged
}) {
  const { id } = useParams();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [localFavoritesRevision, setLocalFavoritesRevision] = useState(0);
  const favoritesRefreshKey = `${favoritesVersion}:${localFavoritesRevision}`;

  const [favoritesSnapshot, setFavoritesSnapshot] = useState({
    token: null,
    revision: null,
    status: "loading",
    ids: [],
    message: ""
  });

  const [pendingMutation, setPendingMutation] = useState(null);
  const [writeError, setWriteError] = useState(null);
  const mutationControllerRef = useRef(null);

  const mutationScope = `${accessToken}:${id}`;
  const writing = pendingMutation?.scope === mutationScope;

  const tracks = Array.isArray(album?.tracks)
    ? album.tracks
    : [];

  const shouldReadFavorites = Boolean(
    accessToken && !loading && !error && tracks.length > 0
  );

  useEffect(() => {
    let active = true;

    async function loadAlbum() {
      try {
        const response = await fetch(`/api/catalog/albums/${id}`);

        if (!response.ok) {
          throw new Error(
            `Album request failed with HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("Album response was not an object.");
        }

        if (active) {
          setAlbum(data);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unknown album error"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAlbum();

    return () => {
      active = false;
    };
  }, [id]);

  // One GET covers all song hearts; do not fetch once per track.
  useEffect(() => {
    if (!shouldReadFavorites) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function loadFavorites() {
      try {
        const response = await fetch("/api/library/favorites", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(favoriteError(response.status, false));
        }

        const favorites = await response.json();

        if (!Array.isArray(favorites)) {
          throw new Error("Favorites response was invalid.");
        }

        if (active && !controller.signal.aborted) {
          setFavoritesSnapshot({
            token: accessToken,
            revision: favoritesRefreshKey,
            status: "ready",
            ids: favorites.map((item) => Number(item?.id)),
            message: ""
          });
        }
      } catch (loadError) {
        if (active && !controller.signal.aborted) {
          setFavoritesSnapshot({
            token: accessToken,
            revision: favoritesRefreshKey,
            status: "error",
            ids: [],
            message: loadError instanceof Error
              ? loadError.message
              : "Unable to load Favorites."
          });
        }
      }
    }

    loadFavorites();

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, id, favoritesRefreshKey, shouldReadFavorites]);

  // A write for a previous account or album must not update this view.
  useEffect(() => {
    return () => {
      mutationControllerRef.current?.abort();
      mutationControllerRef.current = null;
    };
  }, [accessToken, id]);

  const currentFavorites =
    favoritesSnapshot.token === accessToken &&
    favoritesSnapshot.revision === favoritesRefreshKey
      ? favoritesSnapshot
      : { status: "loading", ids: [], message: "" };

  const savedTrackIds = new Set(currentFavorites.ids);

  const visibleWriteError =
    writeError?.scope === mutationScope ? writeError.message : "";

  async function toggleFavorite(track) {
    if (
      !accessToken ||
      currentFavorites.status !== "ready" ||
      writing ||
      mutationControllerRef.current
    ) {
      return;
    }

    const removing = savedTrackIds.has(track.id);
    const controller = new AbortController();

    mutationControllerRef.current = controller;

    setPendingMutation({
      scope: mutationScope,
      trackId: track.id
    });

    setWriteError(null);

    try {
      const response = await fetch(
        `/api/library/favorites/${track.id}`,
        {
          method: removing ? "DELETE" : "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(favoriteError(response.status, removing));
      }

      if (!controller.signal.aborted) {
        // Server state is authoritative; re-fetch after successful write.
        setLocalFavoritesRevision((revision) => revision + 1);
        onFavoritesChanged?.();
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setWriteError({
          scope: mutationScope,
          message: requestError instanceof Error
            ? requestError.message
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

  if (loading) {
    return (
      <section className="catalog-detail-page">
        <p className="catalog-detail-page__status">Loading album...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="catalog-detail-page">
        <Link className="catalog-detail-page__back" to="/albums">
          ← Back to Albums
        </Link>

        <p className="catalog-detail-page__status" role="alert">
          Failed to load album: {error}
        </p>
      </section>
    );
  }

  const artistName = album?.artist?.name || "Unknown Artist";
  const favoritesReady = currentFavorites.status === "ready";

  return (
    <section className="catalog-detail-page">
      <Link className="catalog-detail-page__back" to="/albums">
        ← Back to Albums
      </Link>

      <header className="catalog-detail-header">
        <div className="catalog-detail-header__artwork">
          <span aria-hidden="true">♪</span>
        </div>

        <div className="catalog-detail-header__content">
          <span className="catalog-detail-header__eyebrow">Album</span>

          <h1>{album.title || "Untitled Album"}</h1>

          <p>{artistName}</p>

          <span className="catalog-detail-header__metadata">
            {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
          </span>
        </div>
      </header>

      <section className="catalog-detail-section">
        <h2>Tracks</h2>

        {accessToken && currentFavorites.status === "error" && (
          <div className="album-track-list__feedback">
            <p role="alert">{currentFavorites.message}</p>

            <button
              type="button"
              onClick={() => {
                setWriteError(null);
                setLocalFavoritesRevision((revision) => revision + 1);
              }}
            >
              Retry Favorites
            </button>
          </div>
        )}

        {visibleWriteError && (
          <p className="album-track-list__feedback" role="alert">
            {visibleWriteError}
          </p>
        )}

        {tracks.length === 0 ? (
          <p className="catalog-detail-page__status">
            No tracks are available for this album.
          </p>
        ) : (
          <ol className="album-track-list" aria-label="Album tracks">
            {tracks.map((track) => {
              const title = track.title || "Untitled Track";
              const isSaved =
                favoritesReady && savedTrackIds.has(track.id);

              const favoriteLabel = !accessToken
                ? `Log in to add ${title} to Favorites`
                : !favoritesReady
                  ? `Favorites unavailable for ${title}`
                  : isSaved
                    ? `Unfavorite ${title}`
                    : `Add ${title} to Favorites`;

              return (
                <li className="album-track-list__item" key={track.id}>
                  <div className="album-track-list__track">
                    <strong>{title}</strong>
                    <span>{artistName}</span>
                  </div>

                  <div className="album-track-list__actions">
                    <span className="album-track-list__duration">
                      {formatDuration(track.durationMs)}
                    </span>

                    <button
                      type="button"
                      className="album-track-list__favorite"
                      onClick={() => toggleFavorite(track)}
                      aria-label={favoriteLabel}
                      title={favoriteLabel}
                      aria-pressed={favoritesReady ? isSaved : undefined}
                      aria-busy={
                        writing ||
                        (Boolean(accessToken) &&
                          currentFavorites.status === "loading")
                      }
                      data-saved={isSaved ? "true" : "false"}
                      disabled={!accessToken || !favoritesReady || writing}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill={isSaved ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (typeof onSelectTrack === "function") {
                          onSelectTrack(track.id);
                        }
                      }}
                      aria-label={`Play ${track.title || "track"}`}
                    >
                      ▶
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </section>
  );
}