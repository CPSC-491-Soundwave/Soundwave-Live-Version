import {
  useEffect,
  useState,
} from "react";

import ArtistCard from "../components/ArtistCard";
import "./ArtistAlbumBrowse.css";

export default function Artists() {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadArtists() {
      try {
        const response = await fetch(
          "/api/catalog/artists"
        );

        if (!response.ok) {
          throw new Error(
            `Artist request failed with HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "Artist response was not an array."
          );
        }

        if (active) {
          setArtists(data);
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

    loadArtists();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="catalog-browse-page">
      <header className="catalog-browse-page__header">
        <div>
          <h1>Artists</h1>

          <p>
            Browse artists in the Soundwave catalog.
          </p>
        </div>
      </header>

      {loading && (
        <p className="catalog-browse-page__status">
          Loading artists...
        </p>
      )}

      {!loading && error && (
        <p
          className="catalog-browse-page__status catalog-browse-page__status--error"
          role="alert"
        >
          Failed to load artists: {error}
        </p>
      )}

      {!loading &&
        !error &&
        artists.length === 0 && (
          <p className="catalog-browse-page__status">
            No artists are available yet.
          </p>
        )}

      {!loading &&
        !error &&
        artists.length > 0 && (
          <div
            className="catalog-browse-grid"
            aria-label="Artists"
          >
            {artists.map((artist) => (
              <ArtistCard
                key={artist.id}
                id={artist.id}
                name={artist.name}
                artworkUrl={artist.artworkUrl}
              />
            ))}
          </div>
        )}
    </section>
  );
}