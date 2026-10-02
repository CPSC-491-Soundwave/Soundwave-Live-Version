import {
  useEffect,
  useState
} from "react";

import { Link } from "react-router-dom";

import "../styles/profile.css";

export default function Profile({
  accessToken
}) {
  const [profile, setProfile] =
    useState(null);

  const [isLoading, setIsLoading] =
    useState(Boolean(accessToken));

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      try {
        const response =
          await fetch(
            "/account/profile",
            {
              method: "GET",

              headers: {
                Authorization:
                  `Bearer ${accessToken}`
              },

              cache: "no-store"
            }
          );

        if (!response.ok) {
          throw new Error(
            "Unable to load profile"
          );
        }

        const body =
          await response.json();

        if (!cancelled) {
          setProfile(body);
          setError("");
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setError(
            "Unable to load account profile."
          );
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken) {
    return (
      <main className="profile-page">
        <section className="profile-card">
          <div className="profile-brand">
            SOUNDWAVE
          </div>

          <h1>Account Profile</h1>

          <p className="profile-message">
            Log in to view your account profile.
          </p>

          <Link
            className="profile-login-link"
            to="/login"
          >
            Go to Login
          </Link>
        </section>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="profile-page">
        <section className="profile-card">
          <h1>Account Profile</h1>

          <p className="profile-message">
            Loading profile...
          </p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="profile-page">
        <section className="profile-card">
          <h1>Account Profile</h1>

          <p
            className="profile-error"
            role="alert"
          >
            {error}
          </p>
        </section>
      </main>
    );
  }

  if (!profile) {
    return null;
  }

  const preference =
    profile.preferences
      ?.audioQualityPreference ??
    "Not set";

  return (
    <main className="profile-page">
      <section className="profile-card">
        <div className="profile-brand">
          SOUNDWAVE
        </div>

        <h1>Account Profile</h1>

        <div className="profile-details">
          <span>Username</span>
          <strong>
            {profile.user.username}
          </strong>

          <span>Role</span>
          <strong>
            {profile.user.role}
          </strong>

          <span>
            Audio Quality Preference
          </span>
          <strong>
            {preference}
          </strong>
        </div>
      </section>
    </main>
  );
}
