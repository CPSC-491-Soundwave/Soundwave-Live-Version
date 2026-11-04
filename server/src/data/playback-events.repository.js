/**
 * Matthew Choi | SCRUM-296
 * PostgreSQL storage for user-owned playback events.
 * userId is always supplied from the authenticated principal by the caller.
 */

export const INSERT_PLAYBACK_EVENT_SQL = `
  INSERT INTO playback_events (
    user_id, client_event_id, track_id, event_type, occurred_at
  ) VALUES ($1, $2::uuid, $3, $4, $5::timestamptz)
  ON CONFLICT (user_id, client_event_id) DO NOTHING
  RETURNING id, client_event_id, track_id, event_type, occurred_at, received_at
`;

export const FIND_PLAYBACK_EVENT_SQL = `
  SELECT id, client_event_id, track_id, event_type, occurred_at, received_at
  FROM playback_events
  WHERE user_id = $1 AND client_event_id = $2::uuid
`;

export const LIST_PLAYBACK_EVENTS_SQL = `
  SELECT id, client_event_id, track_id, event_type, occurred_at, received_at
  FROM playback_events
  WHERE user_id = $1
  ORDER BY occurred_at DESC, id DESC
  LIMIT $2
`;

function normalizeId(value, label) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new TypeError(`Invalid ${label}`);
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`Invalid ${label}`);
  }
  const text = String(value);
  if (!/^[0-9]+$/.test(text)) {
    throw new TypeError(`Invalid ${label}`);
  }
  const numeric = BigInt(text);
  if (numeric <= 0n || numeric > 9223372036854775807n) {
    throw new TypeError(`Invalid ${label}`);
  }
  return numeric.toString();
}

function mapRow(row) {
  return {
    id: String(row.id),
    clientEventId: String(row.client_event_id),
    trackId: String(row.track_id),
    eventType: row.event_type,
    occurredAt: new Date(row.occurred_at).toISOString(),
    receivedAt: new Date(row.received_at).toISOString()
  };
}

export function createPlaybackEventsRepository(database) {
  if (!database || typeof database.query !== "function") {
    throw new TypeError("PlaybackEvent repository requires database.query()");
  }

  return {
    async createForPrincipal(principalId, event) {
      const userId = normalizeId(principalId, "principal ID");
      const trackId = normalizeId(event.trackId, "track ID");
      const occurredAt = new Date(event.occurredAt).toISOString();
      const values = [
        userId,
        event.clientEventId,
        trackId,
        event.eventType,
        occurredAt
      ];

      const inserted = await database.query(INSERT_PLAYBACK_EVENT_SQL, values);
      if (inserted.rows.length > 0) {
        return { outcome: "created", event: mapRow(inserted.rows[0]) };
      }

      // The uniqueness constraint defines the logical retry identity.
      // A replay may not silently change the associated track or event data.
      const found = await database.query(
        FIND_PLAYBACK_EVENT_SQL,
        [userId, event.clientEventId]
      );
      const existing = found.rows[0];
      if (!existing) {
        // Unexpected concurrent deletion or inconsistent storage state.
        throw new Error("Conflicting playback event could not be read back");
      }

      const existingEvent = mapRow(existing);
      const matches =
        existingEvent.trackId === trackId &&
        existingEvent.eventType === event.eventType &&
        existingEvent.occurredAt === occurredAt;

      return matches
        ? { outcome: "replayed", event: existingEvent }
        : { outcome: "conflict", event: null };
    },

    async listForPrincipal(principalId, limit = 50) {
      const userId = normalizeId(principalId, "principal ID");
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError("Invalid history limit");
      }
      const result = await database.query(
        LIST_PLAYBACK_EVENTS_SQL,
        [userId, limit]
      );
      return result.rows.map(mapRow);
    }
  };
}
