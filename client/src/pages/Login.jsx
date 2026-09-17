import { useState } from "react";
import "../styles/login.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setIsLoading(true);

    try {
      const loginResponse = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      if (!loginResponse.ok) {
        throw new Error("Login failed");
      }

      const loginBody = await loginResponse.json();

      const meResponse = await fetch("/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
      });

      if (!meResponse.ok) {
        throw new Error("Unable to retrieve authenticated user");
      }

      const meBody = await meResponse.json();

      setUser(meBody.user);
      setPassword("");
    } catch {
      setError("Unable to log in. Check your username and password.");
    } finally {
      setIsLoading(false);
    }
  }

  if (user) {
    return (
      <main className="login-page">
        <section className="login-card login-success">
          <div className="login-brand">SOUNDWAVE</div>

          <h1>Welcome Back!</h1>

          <p className="login-subtitle">
            You are successfully authenticated.
          </p>

          <div className="login-identity">
            <span>User ID</span>
            <strong>{user.id}</strong>

            <span>Role</span>
            <strong>{user.role}</strong>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">SOUNDWAVE</div>

        <div className="login-heading">
          <h1>Welcome Back!</h1>
          <p>Log in to continue listening.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="username">Username</label>

            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="login-button"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="login-footer">
          Securely connect to your Soundwave server.
        </p>
      </section>
    </main>
  );
}
