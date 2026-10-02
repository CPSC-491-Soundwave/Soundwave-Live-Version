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
    trackId = null
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
            unloadMusic();

            return;
        }

        let cancelled = false;

        async function loadSelectedTrack() {
            setLoading(true);
            setError(null);
            setIsPlaying(false);

            try {
                const response =
                await fetch(
                    `/api/catalog/tracks/${trackId}`
                );

                if (!response.ok) {
                    throw new Error(
                        `Track metadata request failed with ${response.status}`
                    );
                }

                const metadata =
                await response.json();

                if (cancelled) {
                    return;
                }

                setTrack(metadata);

                loadTrack(
                    metadata.id
                );
            } catch {
                if (cancelled) {
                    return;
                }

                setTrack(null);
                setError(
                    "Unable to load track."
                );
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
    }, [trackId]);

    function handlePlayPause() {
        if (!track) {
            return;
        }

        if (isPlaying) {
            pauseMusic();
            setIsPlaying(false);
        } else {
            playMusic();
            setIsPlaying(true);
        }
    }

    function handleVolumeChange(event) {
        const nextVolume =
        Number(event.target.value);

        setVolume(nextVolume);
        setMusicVolume(nextVolume);
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
            <button disabled>
            ⏮
            </button>

            <button disabled>
            ▶
            </button>

            <button disabled>
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
        onClick={handlePlayPause}
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
