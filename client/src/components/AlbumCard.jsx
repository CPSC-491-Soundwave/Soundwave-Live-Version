import { Link } from "react-router-dom";
import "./ArtistAlbumCards.css";

export default function AlbumCard({
  id,
  title,
  artistName,
  artworkUrl = "",
}) {
  const displayTitle = title?.trim() || "Untitled Album";
  const displayArtist =
    artistName?.trim() || "Unknown Artist";

  return (
    <Link
      className="album-card"
      to={`/albums/${id}`}
      aria-label={`View album ${displayTitle}`}
    >
      <div className="album-card__artwork">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            className="album-card__image"
          />
        ) : (
          <span
            className="album-card__placeholder"
            aria-hidden="true"
          >
            ♪
          </span>
        )}
      </div>

      <div className="album-card__content">
        <strong className="album-card__title">
          {displayTitle}
        </strong>

        <span className="album-card__artist">
          {displayArtist}
        </span>
      </div>
    </Link>
  );
}