import {
  useEffect,
  useState,
} from "react";

import AlbumCard from "../components/AlbumCard";
import "./ArtistAlbumBrowse.css";

export default function Albums() {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAlbums() {
      try {
        const response = await fetch(
          "/api/catalog/albums"
        );

        if (!response.ok) {
          throw new Error(
            `Album request failed with HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "Album response was not an array."
          );
        }

        if (active) {
          setAlbums(data);
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

    loadAlbums();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="catalog-browse-page">
      <header className="catalog-browse-page__header">
        <div>
          <h1>Albums</h1>

          <p>
            Browse albums in the Soundwave catalog.
          </p>
        </div>
      </header>

      {loading && (
        <p className="catalog-browse-page__status">
          Loading albums...
        </p>
      )}

      {!loading && error && (
        <p
          className="catalog-browse-page__status catalog-browse-page__status--error"
          role="alert"
        >
          Failed to load albums: {error}
        </p>
      )}

      {!loading &&
        !error &&
        albums.length === 0 && (
          <p className="catalog-browse-page__status">
            No albums are available yet.
          </p>
        )}

      {!loading &&
        !error &&
        albums.length > 0 && (
          <div
            className="catalog-browse-grid"
            aria-label="Albums"
          >
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                id={album.id}
                title={album.title}
                artistName={album.artist?.name}
                artworkUrl={album.artworkUrl}
              />
            ))}
          </div>
        )}
    </section>
  );
}