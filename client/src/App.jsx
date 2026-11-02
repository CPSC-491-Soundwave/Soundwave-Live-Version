
import {
  useCallback,
  useState
} from "react";

import {
  Routes,
  Route
} from "react-router-dom";

import Sidebar from "./components/Sidebar";
import SessionStatus from "./components/SessionStatus";
import PlaybackBar from "./components/PlaybackBar";

import {
  createQueue,
  getCurrentQueueTrack
} from "./playback/queue.js";

import Home from "./pages/Home";
import Search from "./pages/Search";
import Library from "./pages/Library";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import CatalogDebug from "./pages/CatalogDebug";
import Artists from "./pages/Artists";
import ArtistDetail from "./pages/ArtistDetail";
import Albums from "./pages/Albums";
import AlbumDetail from "./pages/AlbumDetail";

import "./App.css";

export default function App() {
  const [
    {
      accessToken,
      loginViewEpoch
    },
    setSession
  ] = useState({
    accessToken: "",
    loginViewEpoch: 0
  });

  const setAccessToken =
    useCallback((token) => {
      setSession((current) => ({
        ...current,
        accessToken: token
      }));
    }, []);

  // An older session cannot invalidate a newer login.
  const handleSessionInvalidated =
    useCallback((token) => {
      setSession((current) =>
        current.accessToken === token
          ? {
            accessToken: "",
            loginViewEpoch:
              current.loginViewEpoch + 1
          }
          : current
      );
    }, []);

  /*
   * SCRUM-323:
   * Maintain playback queue state at the application
   * level so route navigation does not reset it.
   */
  const [queue, setQueue] = useState(
    () => createQueue()
  );

  /*
   * Existing pages select individual track IDs.
   * Establish a single-track queue for each selection.
   *
   * Multi-track queue population and Next/Previous
   * controls will be integrated separately.
   */
  const handleSelectTrack = useCallback(
    (trackId) => {
      if (
        !Number.isInteger(trackId) ||
        trackId <= 0
      ) {
        return;
      }

      setQueue(
        createQueue([trackId], trackId)
      );
    },
    []
  );

  /*
   * Derive the active track from queue state.
   * PlaybackBar continues receiving the same
   * trackId interface as before.
   */
  const selectedTrackId =
    getCurrentQueueTrack(queue);

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="page-content">
        <SessionStatus
          accessToken={accessToken}
          onSessionInvalidated={
            handleSessionInvalidated
          }
        />

        <Routes>
          <Route
            path="/"
            element={<Home />}
          />

          <Route
            path="/search"
            element={
              <Search
                onSelectTrack={
                  handleSelectTrack
                }
              />
            }
          />

          <Route
            path="/library"
            element={
              <Library
                accessToken={
                  accessToken
                }
                onSelectTrack={
                  handleSelectTrack
                }
              />
            }
          />

          <Route
            path="/login"
            element={
              <Login
                key={
                  loginViewEpoch
                }
                setAccessToken={
                  setAccessToken
                }
              />
            }
          />

          <Route
            path="/profile"
            element={
              <Profile
                accessToken={
                  accessToken
                }
              />
            }
          />

          <Route
            path="/artists"
            element={
              <Artists />
            }
          />

          <Route
            path="/artists/:id"
            element={
              <ArtistDetail />
            }
          />

          <Route
            path="/albums"
            element={
              <Albums />
            }
          />

          <Route
            path="/albums/:id"
            element={
              <AlbumDetail
                onSelectTrack={
                  handleSelectTrack
                }
              />
            }
          />

          <Route
            path="/catalog-debug"
            element={
              <CatalogDebug />
            }
          />
        </Routes>
      </main>

      <PlaybackBar
        trackId={
          selectedTrackId
        }
        accessToken={
          accessToken
        }
        onSessionInvalidated={
          handleSessionInvalidated
        }
      />
    </div>
  );
}
