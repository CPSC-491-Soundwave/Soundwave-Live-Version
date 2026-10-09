import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import PlaybackBar from "./components/PlaybackBar";
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
  const [accessToken, setAccessToken] = useState("");
  const [selectedTrackId, setSelectedTrackId] =
    useState(null);

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="page-content">
        <Routes>
          <Route
            path="/"
            element={<Home />}
          />

          <Route
            path="/search"
            element={
              <Search
                onSelectTrack={setSelectedTrackId}
              />
            }
          />

          <Route
            path="/library"
            element={
              <Library
                accessToken={accessToken}
                onSelectTrack={setSelectedTrackId}
              />
            }
          />

          <Route
            path="/login"
            element={
              <Login
                setAccessToken={setAccessToken}
              />
            }
          />

          <Route
            path="/profile"
            element={
              <Profile
                accessToken={accessToken}
              />
            }
          />

          <Route
            path="/artists"
            element={<Artists />}
          />

          <Route
            path="/artists/:id"
            element={<ArtistDetail />}
          />

          <Route
            path="/albums"
            element={<Albums />}
          />

          <Route
            path="/albums/:id"
            element={
              <AlbumDetail
                onSelectTrack={setSelectedTrackId}
              />
            }
          />

          <Route
            path="/catalog-debug"
            element={<CatalogDebug />}
          />
        </Routes>
      </main>

      <PlaybackBar
        trackId={selectedTrackId}
      />
    </div>
  );
}
