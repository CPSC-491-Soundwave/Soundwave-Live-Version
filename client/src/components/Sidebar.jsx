import { Link } from "react-router-dom"

export default function Sidebar() {
    return (
        <aside>
            <h2>Soundwave</h2>

            <nav>
                <Link to="/">Home</Link>
                <Link to="/search">Search</Link>
                <Link to="/library">Library</Link>
                <Link to="/login">Login</Link>
            </nav>
        </aside>
    )
}