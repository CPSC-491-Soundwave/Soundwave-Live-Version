import {
    useEffect,
    useState
} from "react";

import "./Library.css";

function formatDuration(durationMs) {
    const totalSeconds =
        Math.floor(durationMs / 1000);

    const minutes =
        Math.floor(totalSeconds / 60);

    const seconds =
        totalSeconds % 60;

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function Library({
    accessToken,
    onSelectTrack
}) {
    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(
        Boolean(accessToken)
    );
    const [error, setError] = useState("");

    useEffect(() => {
        if (!accessToken) {
            return;
        }

        let active = true;

        async function loadRecentlyAdded() {
            try {
                const response = await fetch(
                    "/api/library/recently-added",
                    {
                        headers: {
                            Authorization:
                                `Bearer ${accessToken}`
                        }
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

                const data =
                    await response.json();

                if (!Array.isArray(data)) {
                    throw new Error(
                        "Library response was not an array."
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
                            : "Unable to load the Library."
                    );
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        loadRecentlyAdded();

        return () => {
            active = false;
        };
    }, [accessToken]);

    if (!accessToken) {
        return (
            <section className="library-page">
                <header className="library-page__header">
                    <div>
                        <h1>Your Library</h1>

                        <p>
                            Browse tracks recently added to Soundwave.
                        </p>
                    </div>
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
                <div>
                    <h1>Your Library</h1>

                    <p>
                        Browse tracks recently added to Soundwave.
                    </p>
                </div>
            </header>

            {loading && (
                <p className="library-status">
                    Loading recently added tracks...
                </p>
            )}

            {!loading && error && (
                <p
                    className="library-status library-status--error"
                    role="alert"
                >
                    {error}
                </p>
            )}

            {!loading &&
                !error &&
                tracks.length === 0 && (
                    <p className="library-status">
                        No recently-added tracks are available yet.
                    </p>
                )}

            {!loading &&
                !error &&
                tracks.length > 0 && (
                    <div
                        className="library-track-list"
                        aria-label="Recently added tracks"
                    >
                        {tracks.map((track) => (
                            <button
                                type="button"
                                className="library-track"
                                key={track.id}
                                onClick={() => {
                                    onSelectTrack?.(track.id);
                                }}
                            >
                                <div className="library-track__details">
                                    <h2>{track.title}</h2>

                                    <p>
                                        {track.artist?.name ??
                                            "Unknown artist"}
                                        {" · "}
                                        {track.album?.title ??
                                            "Unknown album"}
                                    </p>
                                </div>

                                <span className="library-track__duration">
                                    {formatDuration(
                                        track.durationMs
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
        </section>
    );
}