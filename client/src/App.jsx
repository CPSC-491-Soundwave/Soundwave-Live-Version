import { Routes, Route } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import PlaybackBar from "./components/PlaybackBar"
import Home from "./pages/Home"
import Search from "./pages/Search"
import Library from "./pages/Library"
import Login from "./pages/Login"
import CatalogDebug from "./pages/CatalogDebug"
import "./App.css"

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />

      <main className="page-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/login" element={<Login />} />
          <Route path="/catalog-debug"element={<CatalogDebug />}
          />
        </Routes>
      </main>

      <PlaybackBar />
    </div>
  )
}