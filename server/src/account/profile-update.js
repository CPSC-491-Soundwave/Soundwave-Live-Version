/**
 * Self-service profile updates. The application must authorize and check
 * persistent JWT revocation before calling this handler.
 */
import { UsernameConflictError } from "../data/account-profile.repository.js";

const MAX_BODY_BYTES = 16 * 1024;
const QUALITY_OPTIONS = new Set(["Auto", "Low", "Medium", "High"]);
const ALLOWED_FIELDS = new Set(["username", "audioQualityPreference"]);

class InvalidProfileRequest extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

/**
 * Reject repeated top-level JSON keys. JSON.parse alone silently keeps the
 * final duplicate value, which makes security audits difficult.
 * Nested objects are rejected separately by the field validator.
 */
function assertNoDuplicateTopLevelKeys(json) {
  const keys = new Set();
  let depth = 0;
  let expectingKey = false;

  for (let index = 0; index < json.length; index += 1) {
    const char = json[index];

    if (char === '"') {
      const start = index;
      index += 1;
      while (index < json.length) {
        if (json[index] === "\\") {
          index += 2;
          continue;
        }
        if (json[index] === '"') {
          break;
        }
        index += 1;
      }
      if (depth === 1 && expectingKey) {
        const key = JSON.parse(json.slice(start, index + 1));
        if (keys.has(key)) {
          throw new InvalidProfileRequest(400, "duplicate_field");
        }
        keys.add(key);
        expectingKey = false;
      }
      continue;
    }

    if (char === "{") {
      depth += 1;
      if (depth === 1) {
        expectingKey = true;
      }
    } else if (char === "}") {
      depth -= 1;
    } else if (char === "," && depth === 1) {
      expectingKey = true;
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let byteCount = 0;
    let oversized = false;
    const chunks = [];

    req.on("data", (chunk) => {
      byteCount += chunk.length;
      if (byteCount > MAX_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) {
        chunks.push(chunk);
      }
    });

    req.once("end", () => {
      if (oversized) {
        reject(new InvalidProfileRequest(413, "body_too_large"));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    req.once("error", reject);
    req.once("aborted", () => {
      reject(new InvalidProfileRequest(400, "invalid_body"));
    });
  });
}

function validateUpdates(payload) {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new InvalidProfileRequest(400, "invalid_profile_update");
  }

  const fields = Object.keys(payload);
  if (fields.length === 0 || fields.some((key) => !ALLOWED_FIELDS.has(key))) {
    throw new InvalidProfileRequest(400, "invalid_profile_update");
  }

  const updates = {};
  if (Object.hasOwn(payload, "username")) {
    if (typeof payload.username !== "string") {
      throw new InvalidProfileRequest(400, "invalid_username");
    }
    const username = payload.username.trim();
    if (
      username.length === 0 ||
      Array.from(username).length > 64 ||
      /[\u0000-\u001f\u007f]/u.test(username)
    ) {
      throw new InvalidProfileRequest(400, "invalid_username");
    }
    updates.username = username;
  }

  if (Object.hasOwn(payload, "audioQualityPreference")) {
    const preference = payload.audioQualityPreference;
    if (preference === null) {
      updates.audioQualityPreference = null;
    } else {
      if (typeof preference !== "string" || !QUALITY_OPTIONS.has(preference.trim())) {
        throw new InvalidProfileRequest(400, "invalid_audio_quality_preference");
      }
      updates.audioQualityPreference = preference.trim();
    }
  }
  return updates;
}

function presentProfile(profile) {
  return {
    user: {
      id: String(profile.user_id),
      username: profile.username,
      role: profile.role
    },
    preferences: {
      audioQualityPreference: profile.audio_quality_preference ?? null
    }
  };
}

export async function handleAccountProfileUpdate(
  req,
  res,
  { principal, updateProfileByUserId } = {}
) {
  if (!principal || typeof principal.userId !== "string") {
    // Must not proceed if the app's revocation-aware pre-handler was bypassed.
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  if (typeof updateProfileByUserId !== "function") {
    throw new TypeError("Account profile update repository is unavailable.");
  }

  const mediaType = req.headers["content-type"];
  if (
    typeof mediaType !== "string" ||
    !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(mediaType.trim())
  ) {
    sendJson(res, 415, { error: "unsupported_media_type" });
    return;
  }
  const contentEncoding = req.headers["content-encoding"];
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    sendJson(res, 415, { error: "unsupported_content_encoding" });
    return;
  }

  let updates;
  try {
    const bytes = await readBody(req);
    let body;
    try {
      const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      body = JSON.parse(json);
      assertNoDuplicateTopLevelKeys(json);
    } catch (error) {
      if (error instanceof InvalidProfileRequest) {
        throw error;
      }
      throw new InvalidProfileRequest(400, "invalid_json");
    }
    updates = validateUpdates(body);
  } catch (error) {
    if (error instanceof InvalidProfileRequest) {
      sendJson(res, error.status, { error: error.code });
      return;
    }
    throw error;
  }

  try {
    const profile = await updateProfileByUserId(principal.userId, updates);
    if (!profile) {
      sendJson(res, 404, { error: "profile_not_found" });
      return;
    }
    if (String(profile.user_id) !== principal.userId) {
      throw new Error("Profile update returned a mismatched account.");
    }
    sendJson(res, 200, presentProfile(profile));
  } catch (error) {
    if (error instanceof UsernameConflictError) {
      sendJson(res, 409, { error: "username_unavailable" });
      return;
    }
    throw error;
  }
}
