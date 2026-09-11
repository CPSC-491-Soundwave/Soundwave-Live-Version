import { Routes, Route } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import PlaybackBar from "./components/PlaybackBar"
import Home from "./pages/Home"
import Search from "./pages/Search"
import Library from "./pages/Library"
import Login from "./pages/Login"

export default function App() {
  return (
    <div>
      <Sidebar />

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>

      <PlaybackBar />
    </div>
  )
}