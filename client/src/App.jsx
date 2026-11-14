
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
  selectQueueTrack,
  getCurrentQueueTrack,
  getNextQueueTrack,
  getPreviousQueueTrack
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
   * SCRUM-323: Keep selected tracks in a stable queue.
   * Re-selecting an existing track does not duplicate it.
   */
  const handleSelectTrack = useCallback((trackId) => {
    if (!Number.isInteger(trackId) || trackId <= 0) {
      return;
    }

    setQueue((current) => {
      if (current.trackIds.includes(trackId)) {
        return selectQueueTrack(current, trackId);
      }

      return createQueue(
        [...current.trackIds, trackId],
        trackId
      );
    });
  }, []);

  const handleNextTrack = useCallback(() => {
    setQueue((current) => {
      const next = getNextQueueTrack(current);
      return next === null
        ? current
        : selectQueueTrack(current, next);
    });
  }, []);

  const handlePreviousTrack = useCallback(() => {
    setQueue((current) => {
      const previous = getPreviousQueueTrack(current);
      return previous === null
        ? current
        : selectQueueTrack(current, previous);
    });
  }, []);

  const selectedTrackId = getCurrentQueueTrack(queue);
  const canGoNext = getNextQueueTrack(queue) !== null;
  const canGoPrevious = getPreviousQueueTrack(queue) !== null;

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
        onNextTrack={handleNextTrack}
        onPreviousTrack={handlePreviousTrack}
        canGoNext={canGoNext}
        canGoPrevious={canGoPrevious}
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
