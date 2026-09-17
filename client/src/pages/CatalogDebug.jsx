import {
  useEffect,
  useState
} from "react";

export default function CatalogDebug() {
  const [tracks, setTracks] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      try {
        const response =
          await fetch(
            "/api/catalog/tracks"
          );

        if (!response.ok) {
          throw new Error(
            `Catalog request failed with HTTP ${response.status}`
          );
        }

        const data =
          await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "Catalog response was not an array."
          );
        }

        if (active) {
          setTracks(data);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unknown catalog error"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <section>
        <h1>Catalog Debug</h1>

        <p>Loading catalog...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <h1>Catalog Debug</h1>

        <p>
          Failed to load catalog:
          {" "}
          {error}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>Catalog Debug</h1>

      <p>
        Loaded {tracks.length} tracks.
      </p>

      <table>
        <thead>
          <tr>
            <th scope="col">
              Track ID
            </th>
            <th scope="col">
              Track
            </th>
            <th scope="col">
              Artist
            </th>
            <th scope="col">
              Album
            </th>
            <th scope="col">
              Duration
            </th>
          </tr>
        </thead>

        <tbody>
          {tracks.map((track) => (
            <tr key={track.id}>
              <td>
                {track.id}
              </td>

              <td>
                {track.title}
              </td>

              <td>
                {track.artist?.name}
              </td>

              <td>
                {track.album?.title}
              </td>

              <td>
                {track.durationMs} ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}