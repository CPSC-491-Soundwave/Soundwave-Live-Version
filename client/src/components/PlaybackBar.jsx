import "./PlaybackBar.css"

export default function PlaybackBar() {
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
                <button>⏮</button>
                <button>▶</button>
                <button>⏭</button>
            </div>

            <div className="volume-placeholder">
                Volume
            </div>
        </footer>
    )
}