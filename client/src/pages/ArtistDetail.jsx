import {
  useEffect,
  useState,
} from "react";
import {
  Link,
  useParams,
} from "react-router-dom";

import AlbumCard from "../components/AlbumCard";
import "./ArtistAlbumDetail.css";

export default function ArtistDetail() {
  const { id } = useParams();

  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadArtist() {
      try {
        const response = await fetch(
          `/api/catalog/artists/${id}`
        );

        if (!response.ok) {
          throw new Error(
            `Artist request failed with HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data)
        ) {
          throw new Error(
            "Artist response was not an object."
          );
        }

        if (active) {
          setArtist(data);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unknown artist error"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadArtist();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <section className="catalog-detail-page">
        <p className="catalog-detail-page__status">
          Loading artist...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="catalog-detail-page">
        <Link
          className="catalog-detail-page__back"
          to="/artists"
        >
          ← Back to Artists
        </Link>

        <p
          className="catalog-detail-page__status"
          role="alert"
        >
          Failed to load artist: {error}
        </p>
      </section>
    );
  }

  const albums = Array.isArray(artist?.albums)
    ? artist.albums
    : [];

  return (
    <section className="catalog-detail-page">
      <Link
        className="catalog-detail-page__back"
        to="/artists"
      >
        ← Back to Artists
      </Link>

      <header className="catalog-detail-header">
        <div className="catalog-detail-header__artwork catalog-detail-header__artwork--artist">
          <span aria-hidden="true">
            {artist.name?.charAt(0).toUpperCase() || "?"}
          </span>
        </div>

        <div className="catalog-detail-header__content">
          <span className="catalog-detail-header__eyebrow">
            Artist
          </span>

          <h1>
            {artist.name || "Unknown Artist"}
          </h1>

          <p>
            {albums.length}{" "}
            {albums.length === 1
              ? "album"
              : "albums"}
          </p>
        </div>
      </header>

      <section className="catalog-detail-section">
        <h2>Albums</h2>

        {albums.length === 0 ? (
          <p className="catalog-detail-page__status">
            No albums are available for this artist.
          </p>
        ) : (
          <div
            className="catalog-detail-grid"
            aria-label="Artist albums"
          >
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                id={album.id}
                title={album.title}
                artistName={artist.name}
                artworkUrl={album.artworkUrl}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}