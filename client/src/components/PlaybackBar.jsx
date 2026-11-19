import { useEffect, useRef, useState } from "react";

import {
    loadTrack,
    playMusic,
    pauseMusic,
    unloadMusic,
    setMusicVolume,
    setMusicProgress
} from "../playback/playback.js";

import {
    canRetryPlayback,
    classifyMediaAccessRequestError,
    classifyMediaAccessStatus
} from "../playback/streamFailure.js";

import {
    recordPlaybackDiagnostic
} from "../playback/playbackDiagnostics.js";

import {
    reportPlaybackEvent
} from "../playback/playbackEvents.js";

import {
    CACHE_AVAILABILITY,
    getCacheAvailabilityLabel,
    getTrackCacheAvailability,
    normalizeCacheAvailability
} from "../playback/cacheStatus.js";

import PlaybackFavoriteButton from "./PlaybackFavoriteButton.jsx";

import "./PlaybackBar.css";

function formatPlaybackTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    const wholeSeconds = Math.floor(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = String(wholeSeconds % 60).padStart(2, "0");

    return `${minutes}:${remainder}`;
}

export default function PlaybackBar({
    trackId = null,
    accessToken = "",
    onSessionInvalidated,
    onNextTrack,
    onPreviousTrack,
    canGoNext = false,
    canGoPrevious = false,
    enableFavoriteControl = false,
    favoritesVersion = 0,
    onFavoritesChanged,
    cacheStatusProvider = getTrackCacheAvailability
}) {
    const [track, setTrack] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [failureState, setFailureState] = useState(null);
    const [playbackStatus, setPlaybackStatus] = useState("ready");
    const [volume, setVolume] = useState(0.5);
    const [retryAttempt, setRetryAttempt] = useState(0);

    // Matthew Choi - Sprint 5: Cache availability is informational only.
    // Scope every result to the selected track, current session, and provider.
    const [cacheLookup, setCacheLookup] = useState({
        trackId: null,
        accessToken: null,
        provider: null,
        status: CACHE_AVAILABILITY.UNKNOWN
    });

    const hasCacheLookupTarget =
        Number.isInteger(trackId) && trackId > 0 && !!accessToken;

    // A new track/session can never render the previous track's cache label,
    // even for the render before the lookup effect starts.
    const cacheAvailability = !hasCacheLookupTarget
        ? CACHE_AVAILABILITY.UNKNOWN
        : cacheLookup.trackId === trackId &&
            cacheLookup.accessToken === accessToken &&
            cacheLookup.provider === cacheStatusProvider
        ? cacheLookup.status
        : CACHE_AVAILABILITY.LOADING;

    useEffect(() => {
        if (!Number.isInteger(trackId) || trackId <= 0 || !accessToken) {
            return;
        }

        let cancelled = false;

        Promise.resolve()
            .then(() => cacheStatusProvider({ trackId, accessToken }))
            .then((result) => {
                if (!cancelled) {
                    setCacheLookup({
                        trackId,
                        accessToken,
                        provider: cacheStatusProvider,
                        status: normalizeCacheAvailability(result)
                    });
                }
            })
            .catch(() => {
                // An unavailable cache service must never block playback.
                if (!cancelled) {
                    setCacheLookup({
                        trackId,
                        accessToken,
                        provider: cacheStatusProvider,
                        status: CACHE_AVAILABILITY.UNKNOWN
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [trackId, accessToken, cacheStatusProvider]);

    // Matthew Choi - Sprint 5: Only the view expands, not the audio player.
    const [isExpanded, setIsExpanded] = useState(false);
    const playerRootRef = useRef(null);
    const expandButtonRef = useRef(null);

    // SCRUM-310: Position and duration come from the actual media.
    const [playbackPositionSeconds, setPlaybackPositionSeconds] = useState(0);
    const [mediaDurationSeconds, setMediaDurationSeconds] = useState(0);

    // SCRUM-309: Block duplicate unconfirmed transport commands.
    const pendingTransportCommandRef = useRef(null);

    // SCRUM-289: Associate visible playback state with a track.
    const [requestedTrackId, setRequestedTrackId] = useState(null);

    // SCRUM-289: Distinguish initial loading from manual retry.
    const [retryingTrackId, setRetryingTrackId] = useState(null);

    // SCRUM-293: A buffering player is still actively playing.
    const isPlaying =
        playbackStatus === "playing" ||
        playbackStatus === "buffering";

    // Escape closes the expanded player. Keep keyboard focus inside its
    // controls while the full-window overlay is open, and restore scroll.
    useEffect(() => {
        if (!isExpanded) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function handleExpandedKeyDown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                setIsExpanded(false);
                expandButtonRef.current?.focus();
                return;
            }

            if (event.key !== "Tab" || !playerRootRef.current) {
                return;
            }

            const controls = Array.from(
                playerRootRef.current.querySelectorAll(
                    'button:not([disabled]), input:not([disabled])'
                )
            );

            if (controls.length === 0) {
                event.preventDefault();
                return;
            }

            const first = controls[0];
            const last = controls[controls.length - 1];
            const focused = document.activeElement;

            if (!playerRootRef.current.contains(focused)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && focused === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && focused === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", handleExpandedKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleExpandedKeyDown);
        };
    }, [isExpanded]);

    useEffect(() => {
        if (!trackId) {
            setIsExpanded(false);
        }
    }, [trackId]);

    const playerClassName = isExpanded && trackId
        ? "playback-bar playback-bar--expanded"
        : "playback-bar";

    const expandedAccessibility = isExpanded && trackId
        ? {
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "Expanded playback player"
        }
        : {};

    const expandControl = trackId ? (
        <button
            ref={expandButtonRef}
            type="button"
            className="playback-expand-button"
            aria-label={isExpanded ? "Collapse player" : "Expand player"}
            aria-expanded={isExpanded}
            title={isExpanded ? "Collapse player (Esc)" : "Expand player"}
            onClick={() => setIsExpanded((current) => !current)}
        >
            {isExpanded ? "✕" : "⛶"}
        </button>
    ) : null;

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

            pendingTransportCommandRef.current = null;
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
            pendingTransportCommandRef.current = null;
            setPlaybackPositionSeconds(0);
            setMediaDurationSeconds(0);
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
                    // SCRUM-310: Ignore obsolete player events and
                    // use actual media duration, not fixture metadata.
                    onProgress: ({ positionSeconds, durationSeconds }) => {
                        if (cancelled) {
                            return;
                        }

                        const duration =
                            Number.isFinite(durationSeconds) &&
                            durationSeconds > 0
                                ? durationSeconds
                                : 0;

                        const position =
                            Number.isFinite(positionSeconds) &&
                            positionSeconds >= 0 &&
                            duration > 0
                                ? Math.min(positionSeconds, duration)
                                : 0;

                        setMediaDurationSeconds(duration);
                        setPlaybackPositionSeconds(position);
                    },

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
                        if (cancelled) {
                            return;
                        }

                        const confirmedUserPlay =
                            pendingTransportCommandRef.current === "play";

                        if (confirmedUserPlay) {
                            pendingTransportCommandRef.current = null;

                            // SCRUM-297:
                            // Record playback only after Howler confirms
                            // that a user-requested Play action succeeded.
                            // Reporting failures must not interrupt audio.
                            void reportPlaybackEvent({
                                trackId: metadata.id,
                                accessToken,
                                eventType: "play"
                            });
                        }

                        setPlaybackStatus("playing");
                    },

                    onPause: () => {
                        if (!cancelled) {
                            if (
                                pendingTransportCommandRef.current === "pause"
                            ) {
                                pendingTransportCommandRef.current = null;
                            }

                            setPlaybackStatus("paused");
                        }
                    },

                    onEnd: () => {
                        if (!cancelled) {
                            pendingTransportCommandRef.current = null;
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

                        pendingTransportCommandRef.current = null;
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
            pendingTransportCommandRef.current = null;
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
        if (!track || pendingTransportCommandRef.current !== null) {
            return;
        }

        if (isPlaying) {
            pendingTransportCommandRef.current = "pause";
            const paused = pauseMusic();

            if (paused === false) {
                pendingTransportCommandRef.current = null;
            }

            return;
        }

        pendingTransportCommandRef.current = "play";
        const started = playMusic();

        if (!started) {
            pendingTransportCommandRef.current = null;
            setPlaybackStatus("ready");
            setFailureState(null);
            setError("Unable to play this track.");
        }
    }

    function handleSeekChange(event) {
        if (
            !track ||
            !Number.isFinite(mediaDurationSeconds) ||
            mediaDurationSeconds <= 0
        ) {
            return;
        }

        const requestedSeconds = Number(event.target.value);

        if (!Number.isFinite(requestedSeconds)) {
            return;
        }

        const boundedSeconds = Math.max(
            0,
            Math.min(requestedSeconds, mediaDurationSeconds)
        );

        // Only show the new position if the player accepted it.
        // Seeking must not change Play/Pause state.
        if (setMusicProgress(boundedSeconds)) {
            setPlaybackPositionSeconds(boundedSeconds);
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
            <footer ref={playerRootRef} className={playerClassName} {...expandedAccessibility}>
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

                <div className="playback-end">
                    {expandControl}
                </div>
            </footer>
        );
    }

    if (error) {
        return (
            <footer ref={playerRootRef} className={playerClassName} {...expandedAccessibility}>
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

                <div className="playback-end">
                    {expandControl}
                </div>
            </footer>
        );
    }

    if (!track) {
        return null;
    }

    const canSeek =
        Number.isFinite(mediaDurationSeconds) &&
        mediaDurationSeconds > 0;

    return (
        <footer ref={playerRootRef} className={playerClassName} {...expandedAccessibility}>
            <div className="track-info">
                <div className="track-placeholder" />

                <div className="playback-track-copy">
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

                    <p
                    className="playback-cache-status"
                    data-cache-status={cacheAvailability}
                    aria-live="polite"
                    >
                    {getCacheAvailabilityLabel(cacheAvailability)}
                    </p>
                </div>

                {enableFavoriteControl && (
                    <PlaybackFavoriteButton
                        trackId={track.id}
                        trackTitle={track.title}
                        accessToken={accessToken}
                        favoritesVersion={favoritesVersion}
                        onFavoritesChanged={onFavoritesChanged}
                    />
                )}
            </div>

            <div className="playback-center">
                <div className="playback-controls">
                    <button
                        type="button"
                        onClick={onPreviousTrack}
                        disabled={!canGoPrevious || !onPreviousTrack}
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
                        type="button"
                        onClick={onNextTrack}
                        disabled={!canGoNext || !onNextTrack}
                        aria-label="Next track"
                    >
                        ⏭
                    </button>
                </div>

                <div className="playback-timeline">
                    <span
                        className="playback-time"
                        aria-label="Elapsed time"
                    >
                        {formatPlaybackTime(playbackPositionSeconds)}
                    </span>

                    <input
                        className="playback-seek"
                        type="range"
                        aria-label="Seek position"
                        aria-valuetext={
                            canSeek
                                ? `${formatPlaybackTime(playbackPositionSeconds)} of ${formatPlaybackTime(mediaDurationSeconds)}`
                                : "Position unavailable"
                        }
                        min="0"
                        max={canSeek ? mediaDurationSeconds : 0}
                        step="0.1"
                        value={
                            canSeek
                                ? Math.min(
                                    playbackPositionSeconds,
                                    mediaDurationSeconds
                                )
                                : 0
                        }
                        disabled={!canSeek}
                        onChange={handleSeekChange}
                    />

                    <span
                        className="playback-time"
                        aria-label="Total duration"
                    >
                        {canSeek
                            ? formatPlaybackTime(mediaDurationSeconds)
                            : "--:--"}
                    </span>
                </div>
            </div>

            <div className="playback-end">
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

                {expandControl}
            </div>
        </footer>
    );
}
