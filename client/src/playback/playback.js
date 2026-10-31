import { Howl } from "howler";

let music = null;
let loadedTrackId = null;
let stopProgressMonitor = null;

/*
 * SCRUM-293: Allison Yu
 * Core Range/buffering reliability monitoring.
 *
 * The playback helper uses the existing protected
 * backend streaming endpoint.
 *
 * It reports:
 * - Audio readiness
 * - Confirmed playback
 * - Pausing and completion
 * - Sustained playback progress stalls
 * - Playback progress recovery
 *
 * No changes are made to HTTP byte-range delivery,
 * authentication, queue management, or retry policy.
 */

const PROGRESS_POLL_MS = 500;
const STALL_THRESHOLD_MS = 2500;
const PROGRESS_EPSILON_SECONDS = 0.05;

/*
 * Load a Track using the production backend streaming
 * route.
 *
 * The client only needs the stable catalog Track ID.
 * It does not know the physical media path.
 *
 * Callbacks allow PlaybackBar to respond to Howler
 * events and buffering observations.
 */
export function loadTrack(
    trackId,
    {
        onLoad,
        onPlay,
        onPause,
        onEnd,
        onBuffering,
        onRecovered,
        onError
    } = {}
) {
    if (
        !Number.isInteger(trackId) ||
        trackId <= 0
    ) {
        throw new TypeError(
            "Track ID must be a positive integer."
        );
    }

    /*
     * Retire the previous sound and its progress monitor
     * before loading a replacement track.
     */
    unloadMusic();

    let currentHowl = null;
    let pollTimer = null;

    let lastPosition = null;
    let lastProgressAt = Date.now();
    let buffering = false;

    /*
     * Stop monitoring whenever playback pauses, ends,
     * fails, or is unloaded.
     */
    function stopMonitor() {
        if (pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }

        lastPosition = null;
        buffering = false;
    }

    /*
     * Monitor playback position using Howler's public
     * playing() and seek() methods.
     *
     * A sustained lack of progress while playback is
     * active is classified as a buffering observation.
     *
     * This is not an HTTP Range protocol diagnosis.
     */
    function startMonitor() {
        stopMonitor();

        const initialPosition = currentHowl.seek();

        lastPosition =
            Number.isFinite(initialPosition)
                ? initialPosition
                : null;

        lastProgressAt = Date.now();

        pollTimer = setInterval(() => {
            /*
             * A monitor from an obsolete track must
             * never affect the current player.
             */
            if (music !== currentHowl) {
                return;
            }

            /*
             * Do not classify an explicitly paused
             * or inactive sound as buffering.
             */
            if (!currentHowl.playing()) {
                return;
            }

            /*
             * Browser background-tab throttling should
             * not be treated as a streaming stall.
             */
            if (
                typeof document !== "undefined" &&
                document.visibilityState === "hidden"
            ) {
                lastProgressAt = Date.now();
                return;
            }

            const now = Date.now();
            const position = currentHowl.seek();

            /*
             * An unavailable playback position is not
             * enough evidence to declare a stall.
             */
            if (!Number.isFinite(position)) {
                lastProgressAt = now;
                return;
            }

            const advanced =
                lastPosition === null ||
                Math.abs(
                    position - lastPosition
                ) >= PROGRESS_EPSILON_SECONDS;

            /*
             * Playback position advanced.
             *
             * If the player was buffering, notify the
             * UI that playback has recovered.
             */
            if (advanced) {
                lastPosition = position;
                lastProgressAt = now;

                if (buffering) {
                    buffering = false;

                    if (
                        typeof onRecovered === "function"
                    ) {
                        onRecovered();
                    }
                }

                return;
            }

            /*
             * Playback remains active but its position
             * has not advanced for the threshold period.
             *
             * Notify only once per buffering episode.
             */
            if (
                !buffering &&
                now - lastProgressAt >=
                    STALL_THRESHOLD_MS
            ) {
                buffering = true;

                if (
                    typeof onBuffering === "function"
                ) {
                    onBuffering();
                }
            }
        }, PROGRESS_POLL_MS);
    }

    /*
     * Preserve existing controlled error callbacks.
     *
     * Stop monitoring before notifying the UI so
     * a failed track cannot report a later recovery.
     */
    function reportError(
        type,
        soundId,
        error
    ) {
        if (music !== currentHowl) {
            return;
        }

        stopMonitor();

        console.error(
            `Track ${trackId} ${type} error:`,
            error
        );

        if (
            typeof onError === "function"
        ) {
            onError({
                type,
                trackId,
                soundId,
                error
            });
        }
    }

    /*
     * HTML5 Audio supports the existing backend
     * HTTP byte-range streaming path.
     */
    currentHowl = new Howl({
        src: [
            `/api/tracks/${trackId}/stream`
        ],

        format: ["mp3"],

        volume: 0.5,

        html5: true,

        /*
         * Audio resource readiness.
         */
        onload: () => {
            if (music !== currentHowl) {
                return;
            }

            console.log(
                `Track ${trackId} loaded`
            );

            if (
                typeof onLoad === "function"
            ) {
                onLoad();
            }
        },

        /*
         * Playback actually started.
         *
         * Begin observing position progress.
         */
        onplay: () => {
            if (music !== currentHowl) {
                return;
            }

            startMonitor();

            console.log(
                `Track ${trackId} playing`
            );

            if (
                typeof onPlay === "function"
            ) {
                onPlay();
            }
        },

        /*
         * Explicit pause.
         *
         * A paused player must not be classified
         * as stalled.
         */
        onpause: () => {
            if (music !== currentHowl) {
                return;
            }

            stopMonitor();

            console.log(
                `Track ${trackId} paused`
            );

            if (
                typeof onPause === "function"
            ) {
                onPause();
            }
        },

        /*
         * Playback completed.
         */
        onend: () => {
            if (music !== currentHowl) {
                return;
            }

            stopMonitor();

            console.log(
                `Track ${trackId} finished`
            );

            if (
                typeof onEnd === "function"
            ) {
                onEnd();
            }
        },

        /*
         * Existing media loading failure behavior.
         */
        onloaderror: (
            soundId,
            error
        ) => {
            reportError(
                "load",
                soundId,
                error
            );
        },

        /*
         * Existing playback failure behavior.
         */
        onplayerror: (
            soundId,
            error
        ) => {
            reportError(
                "play",
                soundId,
                error
            );
        }
    });

    music = currentHowl;
    loadedTrackId = trackId;

    /*
     * Give unloadMusic() access to this track's
     * monitor cleanup function.
     */
    stopProgressMonitor = stopMonitor;

    return music;
}

/*
 * Start or resume the current track.
 *
 * Preserve the existing return-value contract.
 * The caller must wait for onPlay before displaying
 * a confirmed Playing state.
 */
export function playMusic() {
    if (!music) {
        return false;
    }

    music.play();

    return true;
}

/*
 * Pause the current track.
 */
export function pauseMusic() {
    if (!music) {
        return false;
    }

    music.pause();

    return true;
}

/*
 * Update playback volume.
 *
 * Valid range: 0 through 1.
 */
export function setMusicVolume(volume) {
    if (!music) {
        return false;
    }

    const numericVolume = Number(volume);

    if (
        !Number.isFinite(numericVolume) ||
        numericVolume < 0 ||
        numericVolume > 1
    ) {
        throw new RangeError(
            "Volume must be between 0 and 1."
        );
    }

    music.volume(numericVolume);

    return true;
}

/*
 * Seek to a playback position.
 *
 * Retain the existing interface used by
 * other playback controls.
 */
export function setMusicProgress(seconds) {
    if (!music) {
        return false;
    }

    const numericSeconds = Number(seconds);

    if (
        !Number.isFinite(numericSeconds) ||
        numericSeconds < 0
    ) {
        throw new RangeError(
            "Playback position must be zero or greater."
        );
    }

    music.seek(numericSeconds);

    return true;
}

/*
 * Fully release the current track and stop its
 * buffering monitor.
 *
 * Prevent orphaned timers and stale callbacks
 * when tracks are replaced or components unmount.
 */
export function unloadMusic() {
    if (stopProgressMonitor) {
        stopProgressMonitor();
        stopProgressMonitor = null;
    }

    if (music) {
        music.unload();
    }

    music = null;
    loadedTrackId = null;
}

/*
 * Return the currently loaded catalog Track ID.
 *
 * Preserve the original API contract.
 */
export function getLoadedTrackId() {
    return loadedTrackId;
}