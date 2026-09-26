import {
  useEffect,
  useState,
} from "react";
import {
  Link,
  useParams,
} from "react-router-dom";

import "./ArtistAlbumDetail.css";

function formatDuration(durationMs) {
  if (
    !Number.isFinite(durationMs) ||
    durationMs < 0
  ) {
    return "";
  }

  const totalSeconds = Math.floor(
    durationMs / 1000
  );

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export default function AlbumDetail() {
  const { id } = useParams();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAlbum() {
      try {
        const response = await fetch(
          `/api/catalog/albums/${id}`
        );

        if (!response.ok) {
          throw new Error(
            `Album request failed with HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data)
        ) {
          throw new Error(
            "Album response was not an object."
          );
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

  if (loading) {
    return (
      <section className="catalog-detail-page">
        <p className="catalog-detail-page__status">
          Loading album...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="catalog-detail-page">
        <Link
          className="catalog-detail-page__back"
          to="/albums"
        >
          ← Back to Albums
        </Link>

        <p
          className="catalog-detail-page__status"
          role="alert"
        >
          Failed to load album: {error}
        </p>
      </section>
    );
  }

  const tracks = Array.isArray(album?.tracks)
    ? album.tracks
    : [];

  const artistName =
    album?.artist?.name || "Unknown Artist";

  return (
    <section className="catalog-detail-page">
      <Link
        className="catalog-detail-page__back"
        to="/albums"
      >
        ← Back to Albums
      </Link>

      <header className="catalog-detail-header">
        <div className="catalog-detail-header__artwork">
          <span aria-hidden="true">♪</span>
        </div>

        <div className="catalog-detail-header__content">
          <span className="catalog-detail-header__eyebrow">
            Album
          </span>

          <h1>
            {album.title || "Untitled Album"}
          </h1>

          <p>
            {artistName}
          </p>

          <span className="catalog-detail-header__metadata">
            {tracks.length}{" "}
            {tracks.length === 1
              ? "track"
              : "tracks"}
          </span>
        </div>
      </header>

      <section className="catalog-detail-section">
        <h2>Tracks</h2>

        {tracks.length === 0 ? (
          <p className="catalog-detail-page__status">
            No tracks are available for this album.
          </p>
        ) : (
          <ol className="album-track-list">
            {tracks.map((track) => (
              <li
                className="album-track-list__item"
                key={track.id}
              >
                <div>
                  <strong>
                    {track.title || "Untitled Track"}
                  </strong>

                  <span>
                    {artistName}
                  </span>
                </div>

                <span className="album-track-list__duration">
                  {formatDuration(
                    track.durationMs
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}