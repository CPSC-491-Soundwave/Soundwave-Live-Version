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

    // SCRUM-289: Associate visible playback state with a track.
    const [requestedTrackId, setRequestedTrackId] = useState(null);

    // SCRUM-289: Distinguish initial loading from manual retry.
    const [retryingTrackId, setRetryingTrackId] = useState(null);

    // SCRUM-293: A buffering player is still actively playing.
    const isPlaying =
        playbackStatus === "playing" ||
        playbackStatus === "buffering";

    useEffect(() => {
        if (!trackId) {
            return;
        }

        let cancelled = false;

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
            setRequestedTrackId(trackId);
            setLoading(true);
            setError(null);
            setFailureState(null);
            setTrack(null);
            setPlaybackStatus("ready");

            if (!accessToken) {
                showFailure(
                    {
                        ...classifyMediaAccessStatus(401),
                        invalidateSession: false
                    },
                    { recordDiagnostic: false }
                );

                setLoading(false);
                setRetryingTrackId(null);
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

                // SCRUM-289: Successful authorization clears old errors.
                setError(null);
                setFailureState(null);
                setTrack(metadata);

                // SCRUM-293: Authorization success does not mean
                // the audio itself has finished loading.
                setPlaybackStatus("loading_audio");

                loadTrack(metadata.id, {
                    // SCRUM-293: The audio is ready.
                    onLoad: () => {
                        if (cancelled) {
                            return;
                        }

                        setPlaybackStatus((current) =>
                            current === "loading_audio"
                                ? "ready"
                                : current
                        );
                    },

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

                    // SCRUM-293: Report a stall during playback.
                    onBuffering: () => {
                        if (cancelled) {
                            return;
                        }

                        setPlaybackStatus((current) => {
                            if (
                                current === "playing" ||
                                current === "buffering"
                            ) {
                                return "buffering";
                            }

                            return current;
                        });
                    },

                    // SCRUM-293: Resume the displayed playing state
                    // without restarting the track.
                    onRecovered: () => {
                        if (cancelled) {
                            return;
                        }

                        setPlaybackStatus((current) =>
                            current === "buffering"
                                ? "playing"
                                : current
                        );
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
                    setRetryingTrackId(null);
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

        // SCRUM-289: Immediately show retry feedback.
        // SCRUM-288 still controls the actual retry operation.
        setRetryingTrackId(trackId);
        setLoading(true);
        setError(null);
        setFailureState(null);

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

    // SCRUM-289: Hide the previous track's state immediately
    // after selection changes.
    if (requestedTrackId !== trackId || loading) {
        const isRetrying =
            requestedTrackId === trackId &&
            retryingTrackId === trackId;

        return (
            <footer className="playback-bar">
                <div className="track-info">
                    <div>
                        <strong role="status" aria-live="polite">
                            {isRetrying
                                ? "Retrying playback..."
                                : "Loading track..."}
                        </strong>

                        {isRetrying && (
                            <p>
                                Attempting to recover playback.
                            </p>
                        )}
                    </div>
                </div>
            </footer>
        );
    }

    if (error) {
        return (
            <footer className="playback-bar">
                <div className="track-info">
                    <div>
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
                        {playbackStatus === "loading_audio"
                            ? "Loading audio..."
                            : playbackStatus === "buffering"
                            ? "Buffering..."
                            : playbackStatus === "playing"
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
