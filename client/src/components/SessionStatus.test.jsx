import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SessionStatus from "./SessionStatus";

function renderStatus(accessToken, onSessionInvalidated = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <SessionStatus
        accessToken={accessToken}
        onSessionInvalidated={onSessionInvalidated}
      />
    </MemoryRouter>
  );

  return { ...view, onSessionInvalidated };
}

function identity(role = "user") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ user: { id: "42", role } })
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SCRUM-206 session indicator", () => {
  test("guest remains signed out without requesting identity", () => {
    renderStatus("");
    expect(screen.queryByLabelText("Session status")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Administrator")).toBeNull();
  });

  test("verified user role appears from /auth/me", async () => {
    fetch.mockResolvedValue(identity());
    renderStatus("valid-token");

    expect(await screen.findByText("Signed in · User")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer valid-token" }
      })
    );
  });

  test("administrator indicator requires verified admin role", async () => {
    fetch.mockResolvedValue(identity("admin"));
    renderStatus("admin-token");
    expect(await screen.findByText("Signed in · Administrator")).toBeTruthy();
  });

  test("401 clears the login token and shows expired guidance", async () => {
    fetch.mockResolvedValue({ status: 401, ok: false });
    const invalidated = vi.fn();
    renderStatus("expired-token", invalidated);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("expired or was revoked")
    );
    await waitFor(() => expect(invalidated).toHaveBeenCalledWith("expired-token"));
    expect(screen.queryByText("Signed in · Administrator")).toBeNull();
  });

  test("revoked session detected when window regains focus", async () => {
    fetch
      .mockResolvedValueOnce(identity())
      .mockResolvedValueOnce({ status: 401, ok: false });

    const invalidated = vi.fn();
    renderStatus("was-valid-token", invalidated);
    expect(await screen.findByText("Signed in · User")).toBeTruthy();

    fireEvent.focus(window);
    await waitFor(() => expect(invalidated).toHaveBeenCalledWith("was-valid-token"));
    expect(screen.getByRole("alert").textContent).toContain("revoked");
  });

  test("403 reports permission denial without clearing login", async () => {
    fetch.mockResolvedValue({ status: 403, ok: false });
    const invalidated = vi.fn();
    renderStatus("denied-token", invalidated);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Permission denied")
    );
    expect(invalidated).not.toHaveBeenCalled();
  });

  test("503 reports outage without clearing login or showing admin", async () => {
    fetch.mockResolvedValue({ status: 503, ok: false });
    const invalidated = vi.fn();
    renderStatus("admin-token", invalidated);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("temporarily unavailable")
    );
    expect(invalidated).not.toHaveBeenCalled();
    expect(screen.queryByText("Signed in · Administrator")).toBeNull();
  });

  test("malformed server identity never becomes administrator state", async () => {
    fetch.mockResolvedValue(identity("superadmin"));
    renderStatus("bad-role-token");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Signed in · Administrator")).toBeNull();
  });

  test("logout calls backend and clears state only after 204", async () => {
    fetch.mockImplementation(async url => {
      if (url === "/auth/me") return identity();
      if (url === "/auth/logout") return { status: 204, ok: true };
      throw new Error(`Unexpected request: ${url}`);
    });

    const invalidated = vi.fn();
    renderStatus("live-token", invalidated);
    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() => expect(invalidated).toHaveBeenCalledWith("live-token"));
    expect(screen.getByText("You have signed out.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer live-token" }
      })
    );
  });

  test("logout infrastructure failure leaves session intact", async () => {
    fetch.mockImplementation(async url => {
      if (url === "/auth/me") return identity();
      if (url === "/auth/logout") return { status: 503, ok: false };
      throw new Error(`Unexpected request: ${url}`);
    });

    const invalidated = vi.fn();
    renderStatus("live-token", invalidated);
    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("temporarily unavailable")
    );
    expect(invalidated).not.toHaveBeenCalled();
  });

  test("changing token hides earlier verified administrator", async () => {
    fetch.mockImplementation(async (url, options) => {
      if (url !== "/auth/me") throw new Error("Unexpected request");
      return options.headers.Authorization === "Bearer old-token"
        ? identity("admin")
        : identity("user");
    });

    const invalidated = vi.fn();
    const view = renderStatus("old-token", invalidated);
    expect(await screen.findByText("Signed in · Administrator")).toBeTruthy();

    view.rerender(
      <MemoryRouter>
        <SessionStatus
          accessToken="new-token"
          onSessionInvalidated={invalidated}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("Signed in · Administrator")).toBeNull();
    expect(await screen.findByText("Signed in · User")).toBeTruthy();
  });

  test("logout identifies its original session after a token change", async () => {
    let finishLogout;

    fetch.mockImplementation((url, options) => {
      if (url === "/auth/me") {
        const role =
          options.headers.Authorization === "Bearer new-token"
            ? "admin"
            : "user";
        return Promise.resolve(identity(role));
      }

      if (url === "/auth/logout") {
        return new Promise(resolve => {
          finishLogout = resolve;
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const invalidated = vi.fn();
    const view = renderStatus("old-token", invalidated);

    fireEvent.click(
      await screen.findByRole("button", { name: "Log out" })
    );

    await waitFor(() => {
      expect(finishLogout).toBeTypeOf("function");
    });

    view.rerender(
      <MemoryRouter>
        <SessionStatus
          accessToken="new-token"
          onSessionInvalidated={invalidated}
        />
      </MemoryRouter>
    );

    expect(
      await screen.findByText("Signed in · Administrator")
    ).toBeTruthy();

    finishLogout({ ok: true, status: 204 });

    await waitFor(() => {
      expect(invalidated).toHaveBeenCalledWith("old-token");
    });

    expect(screen.getByText("Signed in · Administrator")).toBeTruthy();
  });
});

test("logout confirmation disappears after three seconds", async () => {
  fetch.mockImplementation(async (url) => {
    if (url === "/auth/me") return identity();
    if (url === "/auth/logout") return { ok: true, status: 204 };
    throw new Error(`Unexpected request: ${url}`);
  });

  const invalidated = vi.fn();
  const view = renderStatus("live-token", invalidated);

  fireEvent.click(await screen.findByRole("button", { name: "Log out" }));
  await waitFor(() =>
    expect(invalidated).toHaveBeenCalledWith("live-token")
  );

  view.rerender(
    <MemoryRouter>
      <SessionStatus
        accessToken=""
        onSessionInvalidated={invalidated}
      />
    </MemoryRouter>
  );

  expect(screen.getByText("You have signed out.")).toBeTruthy();

  await waitFor(
    () => expect(screen.queryByLabelText("Session status")).toBeNull(),
    { timeout: 4500 }
  );
}, 6500);
