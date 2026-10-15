import {
    useEffect,
    useState
} from "react";

import {
    loadTrack,
    playMusic,
    pauseMusic,
    unloadMusic,
    setMusicVolume
} from "../playback/playback.js";

import "./PlaybackBar.css";

export default function PlaybackBar({
    trackId = null,
    accessToken = "",
    onSessionInvalidated
}) {
    const [track, setTrack] =
    useState(null);

    const [loading, setLoading] =
    useState(false);

    const [error, setError] =
    useState(null);

    const [isPlaying, setIsPlaying] =
    useState(false);

    const [volume, setVolume] =
    useState(0.5);

    useEffect(() => {
        if (!trackId) {
            return;
        }

        let cancelled = false;

        async function loadSelectedTrack() {
            setLoading(
                true
            );

            setError(
                null
            );

            setIsPlaying(
                false
            );

            if (!accessToken) {
                unloadMusic();

                setTrack(
                    null
                );

                setError(
                    "Please log in to play this track."
                );

                setLoading(
                    false
                );

                return;
            }

            try {
                const metadataResponse =
                await fetch(
                    `/api/catalog/tracks/${trackId}`
                );

                if (
                    !metadataResponse.ok
                ) {
                    throw new Error(
                        "metadata_request_failed"
                    );
                }

                const metadata =
                await metadataResponse.json();

                if (cancelled) {
                    return;
                }

                let mediaAccessResponse;

                try {
                    mediaAccessResponse =
                    await fetch(
                        `/api/tracks/${metadata.id}/media-access`,
                        {
                            method:
                                "POST",

                            headers: {
                                Authorization:
                                    `Bearer ${accessToken}`
                            },

                            credentials:
                                "same-origin"
                        }
                    );
                } catch {
                    if (
                        cancelled
                    ) {
                        return;
                    }

                    unloadMusic();

                    setTrack(
                        null
                    );

                    setError(
                        "Unable to prepare playback."
                    );

                    return;
                }

                if (cancelled) {
                    return;
                }

                if (
                    mediaAccessResponse.status ===
                    401
                ) {
                    unloadMusic();

                    setTrack(
                        null
                    );

                    setIsPlaying(
                        false
                    );

                    if (
                        typeof onSessionInvalidated ===
                        "function"
                    ) {
                        onSessionInvalidated(
                            accessToken
                        );
                    }

                    setError(
                        "Please log in to play this track."
                    );

                    return;
                }

                if (
                    mediaAccessResponse.status ===
                    403
                ) {
                    unloadMusic();

                    setTrack(
                        null
                    );

                    setIsPlaying(
                        false
                    );

                    setError(
                        "You do not have access to play this track."
                    );

                    return;
                }

                if (
                    mediaAccessResponse.status ===
                    503
                ) {
                    unloadMusic();

                    setTrack(
                        null
                    );

                    setIsPlaying(
                        false
                    );

                    setError(
                        "Playback authentication is temporarily unavailable."
                    );

                    return;
                }

                if (
                    mediaAccessResponse.status !==
                    204
                ) {
                    unloadMusic();

                    setTrack(
                        null
                    );

                    setIsPlaying(
                        false
                    );

                    setError(
                        "Unable to prepare playback."
                    );

                    return;
                }

                setTrack(
                    metadata
                );

                loadTrack(
                    metadata.id,
                    {
                        onError: () => {
                            if (
                                cancelled
                            ) {
                                return;
                            }

                            unloadMusic();

                            setIsPlaying(
                                false
                            );

                            setError(
                                "Unable to play this track."
                            );
                        }
                    }
                );
            } catch {
                if (
                    cancelled
                ) {
                    return;
                }

                unloadMusic();

                setTrack(
                    null
                );

                setIsPlaying(
                    false
                );

                setError(
                    "Unable to load track."
                );
            } finally {
                if (
                    !cancelled
                ) {
                    setLoading(
                        false
                    );
                }
            }
        }

        loadSelectedTrack();

        return () => {
            cancelled = true;

            unloadMusic();
        };
    }, [
        trackId,
        accessToken,
        onSessionInvalidated
    ]);

    function handlePlayPause() {
        if (!track) {
            return;
        }

        if (isPlaying) {
            pauseMusic();

            setIsPlaying(
                false
            );

            return;
        }

        const started =
            playMusic();

        if (started) {
            setIsPlaying(
                true
            );
        }
    }

    function handleVolumeChange(
        event
    ) {
        const nextVolume =
            Number(
                event.target.value
            );

        setVolume(
            nextVolume
        );

        setMusicVolume(
            nextVolume
        );
    }

    if (!trackId) {
        return (
            <footer className="playback-bar">
                <div className="track-info">
                    <div
                        className="track-placeholder"
                    />

                    <div>
                        <strong>
                            Nothing Playing
                        </strong>

                        <p>
                            Select a track
                        </p>
                    </div>
                </div>

                <div className="playback-controls">
                    <button
                        disabled
                        aria-label="Previous track"
                    >
                        ⏮
                    </button>

                    <button
                        disabled
                        aria-label="Play"
                    >
                        ▶
                    </button>

                    <button
                        disabled
                        aria-label="Next track"
                    >
                        ⏭
                    </button>
                </div>

                <div className="volume-placeholder">
                    Volume
                </div>
            </footer>
        );
    }

    if (loading) {
        return (
            <footer className="playback-bar">
                <div className="track-info">
                    <strong>
                        Loading track...
                    </strong>
                </div>
            </footer>
        );
    }

    if (error) {
        return (
            <footer className="playback-bar">
                <div className="track-info">
                    <strong>
                        Playback unavailable
                    </strong>

                    <p>
                        {error}
                    </p>
                </div>
            </footer>
        );
    }

    if (!track) {
        return null;
    }

    return (
        <footer className="playback-bar">
            <div className="track-info">
                <div
                    className="track-placeholder"
                />

                <div>
                    <strong>
                        {track.title}
                    </strong>

                    <p>
                        {track.artist.name}
                        {" • "}
                        {track.album.title}
                    </p>
                </div>
            </div>

            <div className="playback-controls">
                <button
                    disabled
                    aria-label="Previous track"
                >
                    ⏮
                </button>

                <button
                    onClick={
                        handlePlayPause
                    }
                    aria-label={
                        isPlaying
                            ? "Pause"
                            : "Play"
                    }
                >
                    {isPlaying
                        ? "⏸"
                        : "▶"}
                </button>

                <button
                    disabled
                    aria-label="Next track"
                >
                    ⏭
                </button>
            </div>

            <label className="volume-placeholder">
                Volume

                <input
                    aria-label="Volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={
                        handleVolumeChange
                    }
                />
            </label>
        </footer>
    );
}
