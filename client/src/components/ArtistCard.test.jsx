import {
  describe,
  expect,
  it,
} from "vitest";
import {
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ArtistCard from "./ArtistCard";

describe("ArtistCard", () => {
  it("renders the artist name and detail link", () => {
    render(
      <MemoryRouter>
        <ArtistCard
          id={1001}
          name="Fixture Artist One"
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Fixture Artist One")
    ).toBeTruthy();

    const link = screen.getByRole("link", {
      name: "View artist Fixture Artist One",
    });

    expect(link.getAttribute("href"))
      .toBe("/artists/1001");
  });

  it("renders an initial when artwork is unavailable", () => {
    render(
      <MemoryRouter>
        <ArtistCard
          id={1001}
          name="Fixture Artist One"
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText("F")
    ).toBeTruthy();
  });
});