import { useEffect, useRef, useState } from "react";
import "../styles/profile-editor.css";

const QUALITY_OPTIONS = ["Auto", "Low", "Medium", "High"];

function profilePreference(profile) {
  return profile.preferences?.audioQualityPreference ?? "";
}

function describeFailure(status) {
  if (status === 409) {
    return "That username is already taken. Choose a different username.";
  }
  if (status === 401) {
    return "Your session has expired or been revoked. Log in again to save changes.";
  }
  if (status === 403) {
    return "You do not have permission to update this account.";
  }
  if (status === 503) {
    return "Account verification is temporarily unavailable. Try again later.";
  }
  if (status === 400 || status === 413 || status === 415) {
    return "The server rejected these settings. Check your values and try again.";
  }
  return "Unable to save account settings. Please try again.";
}

function validUsername(username) {
  const characters = Array.from(username);

  return characters.length > 0 &&
    characters.length <= 64 &&
    characters.every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint > 31 && codePoint !== 127;
    });
}

/**
 * Self-service editor for the existing authenticated Profile page.
 * Parent owns the access token and the authoritative profile response.
 */
export default function ProfileEditor({ accessToken, profile, onProfileChange }) {
  const [username, setUsername] = useState(profile.user.username);
  const [quality, setQuality] = useState(profilePreference(profile));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const controllerRef = useRef(null);
  const activeRef = useRef(true);
  const savingRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const storedQuality = profilePreference(profile);
  const normalizedUsername = username.trim();
  const usernameChanged = normalizedUsername !== profile.user.username;
  const qualityChanged = quality !== storedQuality;
  const hasChanges = usernameChanged || qualityChanged;
  const hasDraftChanges = username !== profile.user.username || qualityChanged;
  const isLegacyQuality = storedQuality !== "" &&
    !QUALITY_OPTIONS.includes(storedQuality);

  function resetDraft() {
    setUsername(profile.user.username);
    setQuality(storedQuality);
    setError("");
    setSuccess("");
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (savingRef.current || !hasChanges) return;

    setError("");
    setSuccess("");
    if (usernameChanged && !validUsername(normalizedUsername)) {
      setError("Username must contain 1 to 64 characters and no control characters.");
      return;
    }
    if (qualityChanged && quality !== "" && !QUALITY_OPTIONS.includes(quality)) {
      setError("Choose a supported audio-quality preference.");
      return;
    }

    const changes = {};
    if (usernameChanged) changes.username = normalizedUsername;
    if (qualityChanged) changes.audioQualityPreference = quality || null;

    const controller = new AbortController();
    controllerRef.current = controller;
    savingRef.current = true;
    setIsSaving(true);

    try {
      const response = await fetch("/account/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(changes),
        cache: "no-store",
        signal: controller.signal
      });
      if (!activeRef.current) return;

      if (!response.ok) {
        setError(describeFailure(response.status));
        return;
      }

      const updated = await response.json();
      if (!activeRef.current) return;
      const updatedQuality = updated?.preferences?.audioQualityPreference ?? null;
      const responseValid =
        String(updated?.user?.id) === String(profile.user.id) &&
        updated?.user?.role === profile.user.role &&
        typeof updated?.user?.username === "string" &&
        (changes.username === undefined || updated.user.username === changes.username) &&
        (changes.audioQualityPreference === undefined ||
          updatedQuality === changes.audioQualityPreference);

      if (!responseValid) {
        setError("The save response could not be verified. Reload your profile before retrying.");
        return;
      }

      onProfileChange(updated);
      setUsername(updated.user.username);
      setQuality(updatedQuality ?? "");
      setSuccess("Account settings saved.");
    } catch (requestError) {
      if (activeRef.current && requestError?.name !== "AbortError") {
        setError("Unable to contact the account service. Your changes were not confirmed.");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      savingRef.current = false;
      if (activeRef.current) setIsSaving(false);
    }
  }

  return (
    <section className="profile-editor" aria-labelledby="profile-edit-heading">
      <h2 id="profile-edit-heading">Edit account settings</h2>
      <p className="profile-editor-intro">
        Update your sign-in username and saved listening preference.
      </p>
      <form onSubmit={saveSettings} noValidate>
        <div className="profile-editor-field">
          <label htmlFor="profile-username">New username</label>
          <input
            id="profile-username"
            name="username"
            type="text"
            autoComplete="username"
            maxLength={128}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError("");
              setSuccess("");
            }}
            disabled={isSaving}
            aria-describedby="profile-username-help"
          />
          <small id="profile-username-help">
            Changing this name changes the username for your next login.
          </small>
        </div>

        <div className="profile-editor-field">
          <label htmlFor="profile-audio-quality">Audio quality preference</label>
          <select
            id="profile-audio-quality"
            name="audioQualityPreference"
            value={quality}
            onChange={(event) => {
              setQuality(event.target.value);
              setError("");
              setSuccess("");
            }}
            disabled={isSaving}
            aria-describedby="profile-quality-help"
          >
            <option value="">Clear preference</option>
            {QUALITY_OPTIONS.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
            {isLegacyQuality && (
              <option value={storedQuality}>
                Current: {storedQuality} (legacy value)
              </option>
            )}
          </select>
          <small id="profile-quality-help">
            Saved preference only. This does not change streaming bitrate or codec.
          </small>
        </div>

        {error && <p className="profile-editor-error" role="alert">{error}</p>}
        {success && <p className="profile-editor-success" role="status">{success}</p>}
        <div className="profile-editor-actions">
          <button className="profile-save-button" type="submit"
            disabled={!hasChanges || isSaving}>
            {isSaving ? "Saving changes..." : "Save changes"}
          </button>
          <button className="profile-cancel-button" type="button"
            onClick={resetDraft} disabled={!hasDraftChanges || isSaving}>
            Discard changes
          </button>
        </div>
      </form>
    </section>
  );
}
