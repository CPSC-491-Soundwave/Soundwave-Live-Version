import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./SessionStatus.css";

const RECHECK_INTERVAL_MS = 60_000;
const PERMITTED_ROLES = new Set(["user", "admin"]);

/**
 * SCRUM-206. Display session state from /auth/me, never from an
 * unverified client-side JWT decode or a request-supplied role.
 *
 * The parent keeps ownership of the access token. This component
 * does not persist tokens or change application navigation.
 */
export default function SessionStatus({
  accessToken,
  onSessionInvalidated
}) {
  const [verification, setVerification] = useState({
    token: "",
    kind: "guest",
    user: null
  });
  const [retryCount, setRetryCount] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    let stopped = false;
    let requestNumber = 0;
    const controllers = new Set();

    async function verifySession() {
      const currentRequest = ++requestNumber;
      const controller = new AbortController();
      controllers.add(controller);

      setVerification({
        token: accessToken,
        kind: "checking",
        user: null
      });

      try {
        const response = await fetch("/auth/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          signal: controller.signal
        });

        if (stopped || currentRequest !== requestNumber) return;

        if (response.status === 401) {
          setVerification({ token: accessToken, kind: "expired", user: null });
          onSessionInvalidated?.(accessToken);
          return;
        }

        if (response.status === 403) {
          setVerification({
            token: accessToken,
            kind: "forbidden",
            user: null
          });
          return;
        }

        if (!response.ok) {
          setVerification({
            token: accessToken,
            kind: "unavailable",
            user: null
          });
          return;
        }

        const body = await response.json();
        if (stopped || currentRequest !== requestNumber) return;

        const user = body?.user;
        const validId =
          (typeof user?.id === "string" && Boolean(user.id.trim())) ||
          (Number.isSafeInteger(user?.id) && user.id > 0);

        if (!validId || !PERMITTED_ROLES.has(user?.role)) {
          setVerification({
            token: accessToken,
            kind: "unavailable",
            user: null
          });
          return;
        }

        setVerification({
          token: accessToken,
          kind: "authenticated",
          user: { id: user.id, role: user.role }
        });
      } catch {
        if (!stopped && currentRequest === requestNumber) {
          setVerification({
            token: accessToken,
            kind: "unavailable",
            user: null
          });
        }
      } finally {
        controllers.delete(controller);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    }

    void verifySession();
    window.addEventListener("focus", verifySession);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(verifySession, RECHECK_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", verifySession);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controllers.forEach(controller => controller.abort());
    };
  }, [accessToken, onSessionInvalidated, retryCount]);

  async function logout() {
    if (!accessToken || loggingOut) return;

    setLoggingOut(true);

    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });

      if (response.status === 204) {
        setVerification(previous =>
        previous.token === accessToken
          ? { token: accessToken, kind: "signed-out", user: null }
          : previous
      );
        onSessionInvalidated?.(accessToken);
      } else if (response.status === 401) {
        setVerification(previous =>
        previous.token === accessToken
          ? { token: accessToken, kind: "expired", user: null }
          : previous
      );
        onSessionInvalidated?.(accessToken);
      } else if (response.status === 403) {
        setVerification(previous =>
        previous.token === accessToken
          ? { token: accessToken, kind: "forbidden", user: null }
          : previous
      );
      } else {
        // A 503 or network failure does not prove logout succeeded.
        setVerification(previous =>
        previous.token === accessToken
          ? { token: accessToken, kind: "unavailable", user: null }
          : previous
      );
      }
    } catch {
      setVerification(previous =>
        previous.token === accessToken
          ? { token: accessToken, kind: "unavailable", user: null }
          : previous
      );
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    if (accessToken || verification.kind !== "signed-out") return;

    const token = verification.token;
    const timer = window.setTimeout(() => {
      setVerification(previous =>
        previous.kind === "signed-out" && previous.token === token
          ? { token: "", kind: "guest", user: null }
          : previous
      );
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [accessToken, verification.kind, verification.token]);

  // Do not display the last principal if the parent's token changes.
  const current = accessToken && verification.token === accessToken;
  const kind = !accessToken
    ? (["expired", "signed-out"].includes(verification.kind)
        ? verification.kind
        : "guest")
    : current
      ? verification.kind
      : "checking";

  if (kind === "guest") return null;

  return (
    <section className="session-status" aria-label="Session status">
      {kind === "checking" && <span>Verifying session...</span>}
      {kind === "authenticated" && (
        <>
          <span>
            Signed in · {verification.user.role === "admin"
              ? "Administrator"
              : "User"}
          </span>
          <button type="button" onClick={logout} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Log out"}
          </button>
        </>
      )}
      {kind === "expired" && (
        <>
          <span role="alert">Your session expired or was revoked. Please sign in again.</span>
          <Link to="/login">Go to Login</Link>
        </>
      )}
      {kind === "signed-out" && <span role="status">You have signed out.</span>}
      {kind === "forbidden" && (
        <>
          <span role="alert">Permission denied. Your login session has not been cleared.</span>
          <button type="button" onClick={() => setRetryCount(n => n + 1)}>
            Retry session check
          </button>
        </>
      )}
      {kind === "unavailable" && (
        <>
          <span role="alert">Session verification is temporarily unavailable. Try again.</span>
          <button type="button" onClick={() => setRetryCount(n => n + 1)}>
            Retry session check
          </button>
        </>
      )}
    </section>
  );
}
