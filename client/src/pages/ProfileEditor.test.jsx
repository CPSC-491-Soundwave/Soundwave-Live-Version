import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Profile from "./Profile";

const TOKEN = "integration-test-token";

function account(username = "soundwave-user", preference = null, id = "42") {
  return {
    user: { id, username, role: "user" },
    preferences: { audioQualityPreference: preference }
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function setup(initial = account(), patch = async () => response(200, initial)) {
  const fetchMock = vi.fn((url, options) => {
    if (url !== "/account/profile") throw new Error(`Unexpected URL: ${url}`);
    if (options.method === "GET") return Promise.resolve(response(200, initial));
    if (options.method === "PATCH") return patch(url, options);
    throw new Error(`Unexpected method: ${options.method}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const view = render(
    <MemoryRouter><Profile accessToken={TOKEN} /></MemoryRouter>
  );
  return { fetchMock, ...view };
}

async function loaded() {
  return screen.findByRole("heading", { name: "Edit account settings" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SCRUM-359 profile editor", () => {
  it("shows the existing account summary and starts with no pending changes", async () => {
    const { fetchMock } = setup();
    await loaded();
    expect(screen.getByText("soundwave-user")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByLabelText("New username")).toHaveValue("soundwave-user");
    expect(screen.getByLabelText("Audio quality preference")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText(/does not change streaming bitrate or codec/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("saves only the changed username and displays the server-confirmed value", async () => {
    const updated = account("renamed-listener");
    const { fetchMock } = setup(account(), async () => response(200, updated));
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "  renamed-listener  " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("status");
    expect(screen.getByRole("status")).toHaveTextContent("Account settings saved.");
    expect(screen.getByText("renamed-listener")).toBeInTheDocument();
    expect(screen.getByLabelText("New username")).toHaveValue("renamed-listener");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    const [, request] = fetchMock.mock.calls.find(([, options]) => options.method === "PATCH");
    expect(request.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    });
    expect(request.cache).toBe("no-store");
    expect(JSON.parse(request.body)).toEqual({ username: "renamed-listener" });
  });

  it("saves audio quality independently and never implies playback transcoding", async () => {
    const { fetchMock } = setup(account(), async () => response(200, account("soundwave-user", "High")));
    await loaded();
    fireEvent.change(screen.getByLabelText("Audio quality preference"), {
      target: { value: "High" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("status");
    const [, request] = fetchMock.mock.calls.find(([, options]) => options.method === "PATCH");
    expect(JSON.parse(request.body)).toEqual({ audioQualityPreference: "High" });
    expect(screen.getByText("High", { selector: "strong" })).toBeInTheDocument();
  });

  it("clears the stored preference using JSON null", async () => {
    const { fetchMock } = setup(account("soundwave-user", "Low"),
      async () => response(200, account()));
    await loaded();
    fireEvent.change(screen.getByLabelText("Audio quality preference"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("status");
    const [, request] = fetchMock.mock.calls.find(([, options]) => options.method === "PATCH");
    expect(JSON.parse(request.body)).toEqual({ audioQualityPreference: null });
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("keeps a legacy preference visible without sending it on username-only updates", async () => {
    const original = account("soundwave-user", "test-quality");
    const updated = account("new-user", "test-quality");
    const { fetchMock } = setup(original, async () => response(200, updated));
    await loaded();
    expect(screen.getByLabelText("Audio quality preference")).toHaveValue("test-quality");
    expect(screen.getByRole("option", { name: /current: test-quality/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "new-user" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("status");
    const [, request] = fetchMock.mock.calls.find(([, options]) => options.method === "PATCH");
    expect(JSON.parse(request.body)).toEqual({ username: "new-user" });
  });

  it("discards unsaved changes without making a PATCH request", async () => {
    const { fetchMock } = setup();
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "temporary" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByLabelText("New username")).toHaveValue("soundwave-user");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects empty or overlong usernames before contacting the server", async () => {
    const { fetchMock } = setup();
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "   " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/1 to 64 characters/i);
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "x".repeat(65) }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/1 to 64 characters/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects ASCII control characters before sending PATCH", async () => {
    const { fetchMock } = setup();
    await loaded();

    for (const codePoint of [7, 127]) {
      fireEvent.change(screen.getByLabelText("New username"), {
        target: { value: `invalid${String.fromCharCode(codePoint)}name` }
      });

      fireEvent.click(screen.getByRole("button", {
        name: "Save changes"
      }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        /control characters/i
      );
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a useful conflict error and retains the unsaved draft", async () => {
    const { fetchMock } = setup(account(), async () => response(409, { error: "username_unavailable" }));
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "already-used" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/already taken/i);
    });
    expect(screen.getByLabelText("New username")).toHaveValue("already-used");
    expect(screen.getByText("soundwave-user")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles revoked sessions and service unavailability separately", async () => {
    const { fetchMock } = setup(account(), async () => response(401, { error: "Unauthorized" }));
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "attempted" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/expired or been revoked/i));
    fetchMock.mockImplementation((url, options) => {
      if (options.method === "GET") return Promise.resolve(response(200, account()));
      return Promise.resolve(response(503, { error: "authentication_unavailable" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i));
  });

  it("reports network failure without claiming that settings were saved", async () => {
    setup(account(), async () => { throw new Error("offline"); });
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "attempted" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not confirmed/i));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("rejects an unexpected account identity in the PATCH response", async () => {
    setup(account(), async () => response(200, account("new-user", "High", "99")));
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "new-user" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not be verified/i));
    expect(screen.getByText("soundwave-user")).toBeInTheDocument();
  });

  it("does not show a previous account while switching access tokens", async () => {
    let resolveOld;
    const oldPending = new Promise((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn((_, options) => {
      if (options.headers.Authorization === "Bearer first-token") return oldPending;
      return Promise.resolve(response(200, account("second-user", null, "102")));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <MemoryRouter><Profile accessToken="first-token" /></MemoryRouter>
    );
    rerender(<MemoryRouter><Profile accessToken="second-token" /></MemoryRouter>);
    resolveOld(response(200, account("first-user")));
    await loaded();
    await screen.findByText("second-user");
    expect(screen.queryByText("first-user")).not.toBeInTheDocument();
    expect(screen.getByLabelText("New username")).toHaveValue("second-user");
  });

  it("ignores an old in-flight save after the session changes", async () => {
    let resolvePatch;
    const pendingPatch = new Promise((resolve) => { resolvePatch = resolve; });
    const fetchMock = vi.fn((_, options) => {
      if (options.method === "PATCH") return pendingPatch;
      if (options.headers.Authorization === "Bearer second-token") {
        return Promise.resolve(response(200, account("second-user", null, "102")));
      }
      return Promise.resolve(response(200, account()));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <MemoryRouter><Profile accessToken={TOKEN} /></MemoryRouter>
    );
    await loaded();
    fireEvent.change(screen.getByLabelText("New username"), {
      target: { value: "first-user-changed" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    rerender(<MemoryRouter><Profile accessToken="second-token" /></MemoryRouter>);
    resolvePatch(response(200, account("first-user-changed")));
    await screen.findByText("second-user");
    expect(screen.queryByText("first-user-changed")).not.toBeInTheDocument();
    expect(screen.getByLabelText("New username")).toHaveValue("second-user");
  });
});
