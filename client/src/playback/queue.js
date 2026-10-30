/**
 * Pure playback queue state helpers.
 * No audio or browser dependencies.
 */

export function createQueue(trackIds = [], selectedTrackId = null) {
  const ids = trackIds.filter(
    (id) => Number.isInteger(id) && id > 0
  );

  const uniqueIds = [...new Set(ids)];

  const activeIndex = uniqueIds.indexOf(selectedTrackId);

  return {
    trackIds: uniqueIds,
    activeIndex: activeIndex >= 0 ? activeIndex : -1
  };
}

export function selectQueueTrack(queue, trackId) {
  const index = queue.trackIds.indexOf(trackId);

  if (index === -1) {
    return queue;
  }

  return {
    ...queue,
    activeIndex: index
  };
}

export function getCurrentQueueTrack(queue) {
  return queue.trackIds[queue.activeIndex] ?? null;
}

export function getNextQueueTrack(queue) {
  const nextIndex = queue.activeIndex + 1;

  return nextIndex < queue.trackIds.length
    ? queue.trackIds[nextIndex]
    : null;
}

export function getPreviousQueueTrack(queue) {
  const previousIndex = queue.activeIndex - 1;

  return previousIndex >= 0
    ? queue.trackIds[previousIndex]
    : null;
}
