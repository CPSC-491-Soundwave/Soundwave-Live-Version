import { Link } from "react-router-dom";
import "./ArtistAlbumCards.css";

export default function ArtistCard({
  id,
  name,
  artworkUrl = "",
}) {
  const displayName = name?.trim() || "Unknown Artist";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Link
      className="artist-card"
      to={`/artists/${id}`}
      aria-label={`View artist ${displayName}`}
    >
      <div className="artist-card__artwork">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            className="artist-card__image"
          />
        ) : (
          <span
            className="artist-card__placeholder"
            aria-hidden="true"
          >
            {initial}
          </span>
        )}
      </div>

      <div className="artist-card__content">
        <strong className="artist-card__name">
          {displayName}
        </strong>

        <span className="artist-card__type">
          Artist
        </span>
      </div>
    </Link>
  );
}