/* Matthew Choi
 * This is the code responsible for music file reading and playback
 *
 */
let music;

function loadSong(path) {
  if (music) {
    music.unload();
  }

  music = new Howl({
    src: [path],
    volume: 0.5,

    onload: () => {
      console.log("Loading successful");
      console.log("Duration:", music.duration());
    },

    onplay: () => {
      console.log("Song playing");
    },

    onpause: () => {
      console.log("Song paused");
    },

    onend: () => {
      console.log("Finished");
    },

    onloaderror: (id, error) => {
      console.error("Failure on load:", error);
    }
  });
}

function playMusic(){ music.play(); }

function pauseMusic(){ music.pause(); }

function setMusicVol(volume){ music.volume(volume); }

function setMusicProg(seconds){ music.seek(seconds); }

loadSong("./mediaFiles/doomTest.mp3");

document.getElementById("play").addEventListener("click", () => {
  playMusic();
});

document.getElementById("pause").addEventListener("click", () => {
  pauseMusic();
});

document.getElementById("volume").addEventListener("input", (event) => {
  setMusicVol(Number(event.target.value));
});

document.getElementById("seekButton").addEventListener("click", () => {
  const seconds = Number(document.getElementById("seek").value);
  setMusicProg(seconds);
});
