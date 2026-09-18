/* Matthew Choi
 * This is the code responsible for music file reading and playback
 */

let music;

function loadSong(path) {
  if (music) {
    music.unload();
  }

  music = new Howl({
    src: [path],
    volume: 0.5,

    // Force Howler to use HTML5 Audio instead of Web Audio.
    // This is better suited for testing streamed audio.
    html5: true,

    onload: () => {
      console.log("Loading successful");
      console.log("Duration:", music.duration());
    },

    onplay: () => { console.log("Song playing"); },
    onpause: () => { console.log("Song paused"); },
    onend: () => { console.log("Finished"); },
    onloaderror: (id, error) => {
      console.error("Failure on load:", error);
    }
  });
}

/*
 * Load a track using its stable catalog ID.
 * The client does not need to know the physical file location.
 */
function loadTrack(trackId) {
  const streamUrl =
  `http://localhost:4000/api/tracks/${trackId}/stream`;

  loadSong(streamUrl);
}

function playMusic() { music.play(); }
function pauseMusic() { music.pause(); }
function setMusicVol(volume) { music.volume(volume); }
function setMusicProg(seconds) { music.seek(seconds); }


// Temporary Sprint 1 test track.
loadTrack(1);

document.getElementById("play").addEventListener("click", () => { playMusic(); });
document.getElementById("pause").addEventListener("click", () => { pauseMusic(); });
document.getElementById("volume").addEventListener("input", (event) => { setMusicVol(Number(event.target.value)); });
document.getElementById("seekButton").addEventListener("click", () => {
  const seconds = Number(
    document.getElementById("seek").value
  );
  setMusicProg(seconds);
});
