import {
  useEffect,
  useRef,
  useState
} from "react";

function favoriteError(status) {
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
    return "Favorites are temporarily unavailable.";
  }

  return "Unable to update Favorites. Please retry.";
}

export default function PlaybackFavoriteButton({
  trackId,
  trackTitle,
  accessToken,
  favoritesVersion = 0,
  onFavoritesChanged
}) {
  const [readRevision, setReadRevision] = useState(0);

  /*
   * SCRUM-362:
   * Refresh after writes from this button OR changes
   * made elsewhere in the mounted application.
   */
  const favoritesRefreshKey =
    `${favoritesVersion}:${readRevision}`;

  const [snapshot, setSnapshot] = useState({
    token: null,
    trackId: null,
    revision: null,
    status: "loading",
    saved: false,
    message: ""
  });

  const [pendingMutation, setPendingMutation] =
    useState(null);

  const [mutationError, setMutationError] =
    useState(null);

  // Used only in effects and event handlers.
  const mutationControllerRef = useRef(null);

  const validTrack =
    Number.isSafeInteger(trackId) &&
    trackId > 0;

  const scope = `${accessToken}:${trackId}`;

  // Read the server-confirmed saved state.
  useEffect(() => {
    if (!accessToken || !validTrack) {
      return;
    }

    const controller = new AbortController();
    let active = true;

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

        if (!response.ok) {
          throw new Error(
            favoriteError(response.status)
          );
        }

        const favorites = await response.json();

        if (!Array.isArray(favorites)) {
          throw new Error(
            "Favorites response was invalid."
          );
        }

        if (active && !controller.signal.aborted) {
          setSnapshot({
            token: accessToken,
            trackId,
            revision: favoritesRefreshKey,
            status: "ready",
            saved: favorites.some(
              (item) => Number(item?.id) === trackId
            ),
            message: ""
          });
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setSnapshot({
            token: accessToken,
            trackId,
            revision: favoritesRefreshKey,
            status: "error",
            saved: false,
            message:
              error instanceof Error
                ? error.message
                : "Favorites are unavailable."
          });
        }
      }
    }

    loadFavorites();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    accessToken,
    trackId,
    favoritesRefreshKey,
    validTrack
  ]);

  // Cancel an obsolete mutation after a track/account
  // change or when this component unmounts.
  useEffect(() => {
    return () => {
      mutationControllerRef.current?.abort();
      mutationControllerRef.current = null;
    };
  }, [accessToken, trackId]);

  // Do not show data fetched for a different account,
  // track, or Favorites revision.
  const current =
    snapshot.token === accessToken &&
    snapshot.trackId === trackId &&
    snapshot.revision === favoritesRefreshKey
      ? snapshot
      : {
          status: "loading",
          saved: false,
          message: ""
        };

  // React state controls rendering.
  // Never access mutationControllerRef.current here.
  const writing = pendingMutation === scope;

  const visibleError =
    mutationError?.scope === scope
      ? mutationError.message
      : "";

  function retryRead() {
    setMutationError(null);
    setReadRevision((revision) => revision + 1);
  }

  async function toggleFavorite() {
    if (
      current.status !== "ready" ||
      !accessToken ||
      !validTrack ||
      mutationControllerRef.current
    ) {
      return;
    }

    const removing = current.saved;
    const method = removing ? "DELETE" : "PUT";

    const controller = new AbortController();

    mutationControllerRef.current = controller;
    setPendingMutation(scope);
    setMutationError(null);

    try {
      const response = await fetch(
        `/api/library/favorites/${trackId}`,
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
          favoriteError(response.status)
        );
      }

      if (!controller.signal.aborted) {
        /*
         * Invalidate this control's snapshot so it
         * retrieves the confirmed state from the API.
         */
        setReadRevision((revision) => revision + 1);

        /*
         * Notify App after a successful write.
         * The mounted Library will re-read its Favorites
         * and update its visible hearts and saved list.
         */
        onFavoritesChanged?.();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMutationError({
          scope,
          message:
            error instanceof Error
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

  if (!validTrack) {
    return null;
  }

  const ready = current.status === "ready";
  const saved = ready && current.saved;

  const title = trackTitle || `Track ${trackId}`;

  const actionLabel =
    current.status === "error"
      ? `Retry Favorites for ${title}`
      : !ready
        ? `Checking Favorites for ${title}`
        : saved
          ? `Unfavorite ${title}`
          : `Add ${title} to Favorites`;

  return (
    <div className="playback-favorite">
      <button
        type="button"
        className="playback-favorite__button"
        data-state={current.status}
        data-saved={saved ? "true" : "false"}
        aria-label={actionLabel}
        aria-pressed={
          ready ? saved : undefined
        }
        aria-busy={
          writing ||
          current.status === "loading"
        }
        title={
          current.status === "error"
            ? current.message
            : actionLabel
        }
        disabled={
          !accessToken ||
          current.status === "loading" ||
          writing
        }
        onClick={
          current.status === "error"
            ? retryRead
            : toggleFavorite
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill={
            saved
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

      {visibleError && (
        <span
          className="playback-favorite__error"
          role="alert"
        >
          {visibleError}
        </span>
      )}
    </div>
  );
}