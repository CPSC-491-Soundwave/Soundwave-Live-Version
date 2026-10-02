import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  render,
  screen,
  waitFor
} from "@testing-library/react";

import {
  MemoryRouter
} from "react-router-dom";

import Profile from "./Profile";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Profile", () => {
  it(
    "renders authenticated account profile data",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => ({
            user: {
              id: "42",
              username:
                "profile-test-user",
              role: "user"
            },

            preferences: {
              audioQualityPreference:
                "test-quality"
            }
          })
        })
      );

      render(
        <MemoryRouter>
          <Profile
            accessToken="test-token"
          />
        </MemoryRouter>
      );

      expect(
        screen.getByText(
          "Loading profile..."
        )
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByText(
            "profile-test-user"
          )
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText("user")
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          "test-quality"
        )
      ).toBeInTheDocument();

      expect(fetch).toHaveBeenCalledWith(
        "/account/profile",
        {
          method: "GET",

          headers: {
            Authorization:
              "Bearer test-token"
          },

          cache: "no-store"
        }
      );
    }
  );

  it(
    "renders Not set when audio quality preference is null",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => ({
            user: {
              id: "43",
              username:
                "no-preference-user",
              role: "user"
            },

            preferences: {
              audioQualityPreference:
                null
            }
          })
        })
      );

      render(
        <MemoryRouter>
          <Profile
            accessToken="test-token"
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            "no-preference-user"
          )
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText("Not set")
      ).toBeInTheDocument();
    }
  );

  it(
    "renders a controlled error when profile loading fails",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false
        })
      );

      render(
        <MemoryRouter>
          <Profile
            accessToken="test-token"
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByRole("alert")
        ).toHaveTextContent(
          "Unable to load account profile."
        );
      });
    }
  );

  it(
    "prompts the user to log in when no access token is available",
    () => {
      const fetchMock = vi.fn();

      vi.stubGlobal(
        "fetch",
        fetchMock
      );

      render(
        <MemoryRouter>
          <Profile accessToken="" />
        </MemoryRouter>
      );

      expect(
        screen.getByText(
          "Log in to view your account profile."
        )
      ).toBeInTheDocument();

      expect(
        fetchMock
      ).not.toHaveBeenCalled();
    }
  );
});
