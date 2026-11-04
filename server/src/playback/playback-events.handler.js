/**
 * Matthew Choi | SCRUM-296 / CC6.1
 * Provisional HTTP contract (must be agreed with the team before frontend wiring):
 *   POST /api/playback-events
 *   GET  /api/playback-events?limit=50
 * The authenticated principal, never request JSON, determines data ownership.
 */

const ROUTE = "/api/playback-events";
const MAX_REQUEST_BYTES = 16 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCEPTED_KEYS = new Set([
  "clientEventId", "trackId", "eventType", "occurredAt"
]);

function json(response, status, value, extra = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    Vary: "Authorization",
    ...extra
  });
  response.end(JSON.stringify(value));
}

function validBigintId(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    return false;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return false;
  }
  const text = String(value);
  if (!/^[0-9]+$/.test(text)) return false;
  const n = BigInt(text);
  return n > 0n && n <= 9223372036854775807n;
}

function validateEvent(body) {
  if (!body || Array.isArray(body) || typeof body !== "object") {
    return null;
  }
  // Reject forged user identifiers and all other unexpected input fields.
  if (Object.keys(body).some(key => !ACCEPTED_KEYS.has(key))) {
    return null;
  }
  if (
    typeof body.clientEventId !== "string" ||
    !UUID_PATTERN.test(body.clientEventId) ||
    !validBigintId(body.trackId) ||
    typeof body.eventType !== "string" ||
    body.eventType.trim().length === 0 ||
    body.eventType.trim().length > 128 ||
    typeof body.occurredAt !== "string" ||
    !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(body.occurredAt) ||
    Number.isNaN(Date.parse(body.occurredAt))
  ) {
    return null;
  }
  return {
    clientEventId: body.clientEventId.toLowerCase(),
    trackId: String(BigInt(String(body.trackId))),
    eventType: body.eventType.trim(),
    occurredAt: new Date(body.occurredAt).toISOString()
  };
}

async function readJson(request) {
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string" ||
    contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json"
  ) {
    return { errorStatus: 415, error: "unsupported_media_type" };
  }
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { errorStatus: 413, error: "payload_too_large" };
  }
  let receivedBytes = 0;
  const parts = [];
  try {
    for await (const chunk of request) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_REQUEST_BYTES) {
        return { errorStatus: 413, error: "payload_too_large" };
      }
      parts.push(chunk);
    }
    return { value: JSON.parse(Buffer.concat(parts).toString("utf8")) };
  } catch {
    return { errorStatus: 400, error: "invalid_json" };
  }
}

export function createPlaybackEventsHandler({
  playbackEventsRepository,
  authorizeRevocableRequest,
  tokenService,
  tokenRevocationRepository
} = {}) {
  if (
    !playbackEventsRepository ||
    typeof playbackEventsRepository.createForPrincipal !== "function" ||
    typeof playbackEventsRepository.listForPrincipal !== "function" ||
    typeof authorizeRevocableRequest !== "function"
  ) {
    throw new TypeError("PlaybackEvent handler requires repository and authorization guard");
  }

  return async function handlePlaybackEventsRequest(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== ROUTE) return false;

    if (request.method !== "POST" && request.method !== "GET") {
      json(response, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
      return true;
    }

    // Authenticate before parsing a POST body or querying event storage.
    const principal = await authorizeRevocableRequest(request, response, {
      tokenService,
      tokenRevocationRepository,
      allowedRoles: ["user", "admin"]
    });
    if (!principal) return true;

    if (request.method === "GET") {
      const unknown = [...url.searchParams.keys()].some(key => key !== "limit");
      const values = url.searchParams.getAll("limit");
      const rawLimit = values.length === 0 ? "50" : values[0];
      if (
        unknown ||
        values.length > 1 ||
        !/^[0-9]+$/.test(rawLimit) ||
        Number(rawLimit) < 1 ||
        Number(rawLimit) > 100
      ) {
        json(response, 400, { error: "invalid_limit" });
        return true;
      }
      try {
        const events = await playbackEventsRepository.listForPrincipal(
          principal.userId,
          Number(rawLimit)
        );
        json(response, 200, { events });
      } catch (error) {
        console.error("Playback history query failed:", error);
        json(response, 503, { error: "storage_unavailable" });
      }
      return true;
    }

    if (url.search) {
      json(response, 400, { error: "unexpected_query" });
      return true;
    }
    const parsed = await readJson(request);
    if (parsed.errorStatus) {
      json(response, parsed.errorStatus, { error: parsed.error });
      return true;
    }
    const event = validateEvent(parsed.value);
    if (!event) {
      json(response, 400, { error: "invalid_playback_event" });
      return true;
    }

    try {
      const result = await playbackEventsRepository.createForPrincipal(
        principal.userId,
        event
      );
      if (result.outcome === "conflict") {
        json(response, 409, { error: "client_event_id_conflict" });
      } else {
        json(response, result.outcome === "created" ? 201 : 200, {
          event: result.event,
          replayed: result.outcome === "replayed"
        });
      }
    } catch (error) {
      if (
        error.code === "23503" &&
        error.constraint === "playback_events_track_id_fkey"
      ) {
        json(response, 404, { error: "track_not_found" });
      } else {
        console.error("Playback event write failed:", error);
        json(response, 503, { error: "storage_unavailable" });
      }
    }
    return true;
  };
}
