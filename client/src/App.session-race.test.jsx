import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

const pending = vi.hoisted(() => ({ completeLogout: null }));

vi.mock("./components/Sidebar", () => ({
  default: () => null
}));
vi.mock("./components/PlaybackBar", () => ({
  default: () => null
}));
vi.mock("./pages/Login", () => ({
  default: ({ setAccessToken }) => (
    <div>
      <button onClick={() => setAccessToken("old-token")}>Login A</button>
      <button onClick={() => setAccessToken("new-token")}>Login B</button>
    </div>
  )
}));
vi.mock("./components/SessionStatus", () => ({
  default: ({ accessToken, onSessionInvalidated }) => (
    <div>
      <span data-testid="active-token">{accessToken || "guest"}</span>
      {accessToken === "old-token" && (
        <button onClick={() => {
          pending.completeLogout = () => onSessionInvalidated(accessToken);
        }}>
          Begin old logout
        </button>
      )}
    </div>
  )
}));

afterEach(() => {
  cleanup();
  pending.completeLogout = null;
});

test("delayed old logout cannot clear a newer login", () => {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByText("Login A"));
  fireEvent.click(screen.getByText("Begin old logout"));
  fireEvent.click(screen.getByText("Login B"));

  expect(screen.getByTestId("active-token").textContent).toBe("new-token");

  act(() => pending.completeLogout());

  expect(screen.getByTestId("active-token").textContent).toBe("new-token");
});
