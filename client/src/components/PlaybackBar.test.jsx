import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PlaybackBar from "./PlaybackBar";

describe("PlaybackBar", () => {
    it("renders the empty playback state", () => {
        render(<PlaybackBar />);

        expect(screen.getByText("Nothing Playing")).toBeInTheDocument();
        expect(screen.getByText("Select a track")).toBeInTheDocument();
    });
});