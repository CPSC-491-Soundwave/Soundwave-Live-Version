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

import AlbumCard from "./AlbumCard";

describe("AlbumCard", () => {
  it("renders album and artist information", () => {
    render(
      <MemoryRouter>
        <AlbumCard
          id={2001}
          title="Fixture Album Alpha"
          artistName="Fixture Artist One"
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Fixture Album Alpha")
    ).toBeTruthy();

    expect(
      screen.getByText("Fixture Artist One")
    ).toBeTruthy();
  });

  it("links to the album detail route", () => {
    render(
      <MemoryRouter>
        <AlbumCard
          id={2001}
          title="Fixture Album Alpha"
          artistName="Fixture Artist One"
        />
      </MemoryRouter>
    );

    const link = screen.getByRole("link", {
      name: "View album Fixture Album Alpha",
    });

    expect(link.getAttribute("href"))
      .toBe("/albums/2001");
  });
});