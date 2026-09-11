import { Link } from "react-router-dom"
import "./Sidebar.css"

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">Soundwave</div>

            <nav className="sidebar-nav">
                <Link to="/">Home</Link>
                <Link to="/search">Search</Link>
                <Link to="/library">Library</Link>
                <Link to="/login">Login</Link>
            </nav>

            <div className="sidebar-section">
                <h3>Recently played</h3>
                <p>Nothing yet</p>
            </div>
        </aside>
    )
}