import { useEffect, useState } from "react";

import {
    loadTrack,
    playMusic,
    pauseMusic,
    unloadMusic,
    setMusicVolume
} from "../playback/playback.js";

import {
    canRetryPlayback,
    classifyMediaAccessRequestError,
    classifyMediaAccessStatus
} from "../playback/streamFailure.js";

import {
    recordPlaybackDiagnostic
} from "../playback/playbackDiagnostics.js";

import "./PlaybackBar.css";

export default function PlaybackBar({
    trackId = null,
    accessToken = "",
    onSessionInvalidated
}) {
    const [track, setTrack] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [failureState, setFailureState] = useState(null);
    const [playbackStatus, setPlaybackStatus] = useState("ready");
    const [volume, setVolume] = useState(0.5);
    const [retryAttempt, setRetryAttempt] = useState(0);

    const isPlaying = playbackStatus === "playing";

    useEffect(() => {
        if (!trackId) {
            return;
        }

        let cancelled = false;

        // A late response must not affect a newer track or session.
        // Record that the obsolete result was discarded.
        function dropStaleResult() {
            if (!cancelled) {
                return false;
            }

            recordPlaybackDiagnostic(
                "STALE_OPERATION_DROPPED"
            );

            return true;
        }

        function showFailure(
            failure,
            { recordDiagnostic = true } = {}
        ) {
            if (cancelled) {
                return;
            }

            unloadMusic();
            setTrack(null);
            setPlaybackStatus("ready");
            setFailureState(failure);
            setError(failure.message);

            if (recordDiagnostic) {
                recordPlaybackDiagnostic(failure.code);
            }

            if (
                failure.invalidateSession &&
                typeof onSessionInvalidated === "function"
            ) {
                onSessionInvalidated(accessToken);
            }
        }

        async function loadSelectedTrack() {
            setLoading(true);
            setError(null);
            setFailureState(null);
            setTrack(null);
            setPlaybackStatus("ready");

            if (!accessToken) {
                // Missing client session is already known locally.
                // Do not count it as another server-side 401 response.
                showFailure(
                    {
                        ...classifyMediaAccessStatus(401),
                        invalidateSession: false
                    },
                    { recordDiagnostic: false }
                );

                setLoading(false);
                return;
            }

            try {
                const metadataResponse = await fetch(
                    `/api/catalog/tracks/${trackId}`
                );

                if (dropStaleResult()) {
                    return;
                }

                if (!metadataResponse.ok) {
                    throw new Error("metadata_request_failed");
                }

                const metadata = await metadataResponse.json();

                if (dropStaleResult()) {
                    return;
                }

                let mediaAccessResponse;

                try {
                    mediaAccessResponse = await fetch(
                        `/api/tracks/${metadata.id}/media-access`,
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${accessToken}`
                            },
                            credentials: "same-origin"
                        }
                    );
                } catch (requestError) {
                    if (dropStaleResult()) {
                        return;
                    }

                    const failure =
                        classifyMediaAccessRequestError(
                            requestError
                        );

                    if (failure.code !== "REQUEST_CANCELLED") {
                        showFailure(failure);
                    }

                    return;
                }

                if (dropStaleResult()) {
                    return;
                }

                if (mediaAccessResponse.status !== 204) {
                    showFailure(
                        classifyMediaAccessStatus(
                            mediaAccessResponse.status
                        )
                    );

                    return;
                }

                setTrack(metadata);

                loadTrack(metadata.id, {
                    onPlay: () => {
                        if (!cancelled) {
                            setPlaybackStatus("playing");
                        }
                    },

                    onPause: () => {
                        if (!cancelled) {
                            setPlaybackStatus("paused");
                        }
                    },

                    onEnd: () => {
                        if (!cancelled) {
                            setPlaybackStatus("finished");
                        }
                    },

                    onError: () => {
                        if (cancelled) {
                            return;
                        }

                        unloadMusic();
                        setPlaybackStatus("ready");
                        setFailureState(null);
                        setError("Unable to play this track.");
                    }
                });
            } catch {
                if (dropStaleResult()) {
                    return;
                }

                showFailure({
                    code: "TRACK_METADATA_FAILED",
                    message: "Unable to load track.",
                    retryable: false,
                    invalidateSession: false
                });
            } finally {
                if (!cancelled) {
                    setLoading(false);
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
        onSessionInvalidated,
        retryAttempt
    ]);

    function handleRetry() {
        if (
            !trackId ||
            !accessToken ||
            !canRetryPlayback(failureState, loading)
        ) {
            return;
        }

        // Manual retry only; no automatic retry timers.
        setRetryAttempt((current) => current + 1);
    }

    function handlePlayPause() {
        if (!track) {
            return;
        }

        if (isPlaying) {
            pauseMusic();
            return;
        }

        const started = playMusic();

        if (!started) {
            setPlaybackStatus("ready");
            setFailureState(null);
            setError("Unable to play this track.");
        }
    }

    function handleVolumeChange(event) {
        const nextVolume = Number(event.target.value);

        setVolume(nextVolume);
        setMusicVolume(nextVolume);
    }

    if (!trackId) {
        return (
            <footer className="playback-bar">
                <div className="track-info">
                    <div className="track-placeholder" />

                    <div>
                        <strong>Nothing Playing</strong>
                        <p>Select a track</p>
                    </div>
                </div>

                <div className="playback-controls">
                    <button disabled aria-label="Previous track">
                        ⏮
                    </button>

                    <button disabled aria-label="Play">
                        ▶
                    </button>

                    <button disabled aria-label="Next track">
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
                    <strong>Loading track...</strong>
                </div>
            </footer>
        );
    }

    if (error) {
        return (
            <footer className="playback-bar">
                <div className="track-info">
                    <strong>Playback unavailable</strong>

                    <p role="alert">{error}</p>

                    {canRetryPlayback(failureState, loading) && (
                        <button
                            type="button"
                            onClick={handleRetry}
                            aria-label="Retry playback"
                        >
                            Retry playback
                        </button>
                    )}
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
                <div className="track-placeholder" />

                <div>
                    <strong>{track.title}</strong>

                    <p>
                        {track.artist.name}
                        {" • "}
                        {track.album.title}
                    </p>

                    <p role="status" aria-live="polite">
                        {playbackStatus === "playing"
                            ? "Playing"
                            : playbackStatus === "paused"
                            ? "Paused"
                            : playbackStatus === "finished"
                            ? "Finished"
                            : "Ready to play"}
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
                    onClick={handlePlayPause}
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? "⏸" : "▶"}
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
                    onChange={handleVolumeChange}
                />
            </label>
        </footer>
    );
}
