import { describe, expect, it } from "vitest";

import {
  createQueue,
  selectQueueTrack,
  getCurrentQueueTrack,
  getNextQueueTrack,
  getPreviousQueueTrack
} from "./queue.js";

describe("playback queue state", () => {
  it("creates an ordered queue with an active track", () => {
    const queue = createQueue([3001, 3002, 3003], 3002);

    expect(queue.trackIds).toEqual([3001, 3002, 3003]);
    expect(queue.activeIndex).toBe(1);
    expect(getCurrentQueueTrack(queue)).toBe(3002);
  });

  it("removes duplicate and invalid track IDs", () => {
    const queue = createQueue([3001, -1, 3001, 0, 3002]);

    expect(queue.trackIds).toEqual([3001, 3002]);
  });

  it("selects an existing track", () => {
    const queue = createQueue([3001, 3002, 3003], 3001);

    const updated = selectQueueTrack(queue, 3003);

    expect(getCurrentQueueTrack(updated)).toBe(3003);
  });

  it("does not select a track outside the queue", () => {
    const queue = createQueue([3001, 3002], 3001);

    expect(selectQueueTrack(queue, 9999)).toBe(queue);
  });

  it("returns next and previous tracks", () => {
    const queue = createQueue([3001, 3002, 3003], 3002);

    expect(getNextQueueTrack(queue)).toBe(3003);
    expect(getPreviousQueueTrack(queue)).toBe(3001);
  });

  it("returns null at queue boundaries", () => {
    const first = createQueue([3001, 3002], 3001);
    const last = createQueue([3001, 3002], 3002);

    expect(getPreviousQueueTrack(first)).toBeNull();
    expect(getNextQueueTrack(last)).toBeNull();
  });
});
