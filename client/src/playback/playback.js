import { Howl } from "howler";

let music = null;
let loadedTrackId = null;

/*
 * Load a Track using the production backend streaming route.
 *
 * The client only needs the stable catalog Track ID.
 * It does not know the physical media path.
 */
export function loadTrack(trackId) {
    if (
        !Number.isInteger(trackId) ||
        trackId <= 0
    ) {
        throw new TypeError(
            "Track ID must be a positive integer."
        );
    }

    if (music) {
        music.unload();
    }

    loadedTrackId = trackId;

    music = new Howl({
        src: [
            `/api/tracks/${trackId}/stream`
        ],

        volume: 0.5,

        /*
         * HTML5 Audio is appropriate for the
         * backend HTTP byte-range streaming path.
         */
        html5: true,

        onload: () => {
            console.log(
                `Track ${trackId} loaded`
            );
        },

        onplay: () => {
            console.log(
                `Track ${trackId} playing`
            );
        },

        onpause: () => {
            console.log(
                `Track ${trackId} paused`
            );
        },

        onend: () => {
            console.log(
                `Track ${trackId} finished`
            );
        },

        onloaderror: (id, error) => {
            console.error(
                `Track ${trackId} failed to load:`,
                error
            );
        }
    });

    return music;
}

export function playMusic() {
    if (!music) {
        return false;
    }

    music.play();
    return true;
}

export function pauseMusic() {
    if (!music) {
        return false;
    }

    music.pause();
    return true;
}

export function setMusicVolume(volume) {
    if (!music) {
        return false;
    }

    const numericVolume =
    Number(volume);

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

export function setMusicProgress(seconds) {
    if (!music) {
        return false;
    }

    const numericSeconds =
    Number(seconds);

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

export function unloadMusic() {
    if (music) {
        music.unload();
    }

    music = null;
    loadedTrackId = null;
}

export function getLoadedTrackId() {
    return loadedTrackId;
}
