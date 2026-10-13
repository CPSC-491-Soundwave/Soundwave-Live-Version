import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

vi.mock("./components/PlaybackBar", () => ({
  default: () => <div data-testid="playback">Playback mocked</div>
}));
vi.mock("./components/BackendStatus", () => ({
  default: () => <div data-testid="backend-status">Backend mocked</div>
}));

function renderApp(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

function mockLoginRequests({ role = "user", laterMeStatus = 200 } = {}) {
  let meCalls = 0;
  fetch.mockImplementation(async (url, options = {}) => {
    if (url === "/auth/login") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: "verified-test-token" })
      };
    }
    if (url === "/auth/me") {
      meCalls += 1;
      const status = meCalls >= 3 ? laterMeStatus : 200;
      if (status !== 200) return { ok: false, status };
      return {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 42, role } })
      };
    }
    if (url === "/auth/logout") {
      return { ok: true, status: 204 };
    }
    throw new Error(`Unexpected request: ${url} (${options.method ?? "GET"})`);
  });
}

async function login() {
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "test-user" }
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Login" }));
  expect(await screen.findByText("You are successfully authenticated.")).toBeTruthy();
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SCRUM-206 App integration", () => {
  test("fresh application renders as guest with no identity request", () => {
    renderApp("/login");
    expect(screen.queryByLabelText("Session status")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Signed in · Administrator")).toBeNull();
  });

  test("verified regular user can log out without stale Login success card", async () => {
    mockLoginRequests();
    renderApp();
    await login();
    expect(await screen.findByText("Signed in · User")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByText("You have signed out.")).toBeTruthy();
    expect(screen.queryByText("You are successfully authenticated.")).toBeNull();
    expect(screen.getByRole("button", { name: "Login" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer verified-test-token" }
      })
    );
  });

  test("server-verified administrator indicator disappears on logout", async () => {
    mockLoginRequests({ role: "admin" });
    renderApp();
    await login();
    expect(await screen.findByText("Signed in · Administrator")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByText("You have signed out.")).toBeTruthy();
    expect(screen.queryByText("Signed in · Administrator")).toBeNull();
    expect(screen.queryByText("You are successfully authenticated.")).toBeNull();
  });

  test("revocation found on focus clears app state and old login card", async () => {
    mockLoginRequests({ laterMeStatus: 401 });
    renderApp();
    await login();
    expect(await screen.findByText("Signed in · User")).toBeTruthy();
    fireEvent.focus(window);
    expect(await screen.findByText(/session expired or was revoked/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Login" })).toBeTruthy();
      expect(screen.queryByText("You are successfully authenticated.")).toBeNull();
    });
  });

  test("a 503 validation outage does not log out or show admin state", async () => {
    mockLoginRequests({ laterMeStatus: 503 });
    renderApp();
    await login();
    expect(await screen.findByText("Signed in · User")).toBeTruthy();
    fireEvent.focus(window);
    expect(await screen.findByText(/Session verification is temporarily unavailable/i)).toBeTruthy();
    expect(screen.getByText("You are successfully authenticated.")).toBeTruthy();
    expect(screen.queryByText("Signed in · Administrator")).toBeNull();
  });

  test("a fresh mount never restores a previously authenticated session", async () => {
    mockLoginRequests({ role: "admin" });
    const view = renderApp();
    await login();
    expect(await screen.findByText("Signed in · Administrator")).toBeTruthy();
    view.unmount();
    fetch.mockClear();
    renderApp();
    expect(screen.queryByLabelText("Session status")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
