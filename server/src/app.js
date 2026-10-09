
import http from "node:http";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { handleLogin } from "./auth/login.js";
import { handleMe } from "./auth/me.js";

import {
  handleAccountProfile
} from "./account/profile.js";

import {
  streamTrackFile
} from "./media/streaming.js";

/*
 * Default to the repository root, where mediaFiles/ lives.
 * Deriving it from this module avoids dependence on process.cwd().
 *
 * server/src/app.js -> ../../ -> repository root
 */
const DEFAULT_MEDIA_ROOT = fileURLToPath(
  new URL("../../", import.meta.url)
);

function isInsideDirectory(root, candidate) {
  const relative = path.relative(root, candidate);

  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/*
 * Database media_path values must be relative to mediaRoot.
 * Keep resolved paths inside mediaRoot, including after symlinks.
 * The client never receives these physical paths.
 */
async function resolveMediaFile(mediaRoot, mediaPath) {
  if (
    typeof mediaPath !== "string" ||
    mediaPath.trim() === "" ||
    path.isAbsolute(mediaPath) ||
    path.win32.isAbsolute(mediaPath)
  ) {
    return null;
  }

  const candidate = path.resolve(mediaRoot, mediaPath);

  if (!isInsideDirectory(mediaRoot, candidate)) {
    return null;
  }

  try {
    const [realRoot, realFile] = await Promise.all([
      realpath(mediaRoot),
                                                   realpath(candidate)
    ]);

    if (!isInsideDirectory(realRoot, realFile)) {
      return null;
    }

    return realFile;
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      error.code === "ENOTDIR"
    ) {
      return null;
    }

    throw error;
  }
}

export function createApp({
  tokenService,
  findUserByUsername,
  findProfileByUserId,
  findTrackById,
  handleCatalogRequest,
  handleSearchRequest,
  mediaRoot = DEFAULT_MEDIA_ROOT
} = {}) {
  if (
    typeof mediaRoot !== "string" ||
    !path.isAbsolute(mediaRoot)
  ) {
    throw new TypeError(
      "mediaRoot must be an absolute directory path."
    );
  }

  const resolvedMediaRoot = path.resolve(mediaRoot);

  return http.createServer(async (req, res) => {
    if (
      req.method === "GET" &&
      req.url === "/health"
    ) {
      res.writeHead(200, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          status: "ok",
        }),
      );

      return;
    }

    if (
      req.method === "POST" &&
      req.url === "/auth/login"
    ) {
      try {
        await handleLogin(req, res, {
          findUserByUsername,
          tokenService,
        });
      } catch {
        res.writeHead(500, {
          "Content-Type": "application/json",
        });

        res.end(
          JSON.stringify({
            error: "internal_error",
          }),
        );
      }

      return;
    }

    if (
      req.method === "GET" &&
      req.url === "/auth/me"
    ) {
      try {
        await handleMe(
          req,
          res,
          tokenService
        );
      } catch {
        res.writeHead(500, {
          "Content-Type": "application/json",
        });

        res.end(
          JSON.stringify({
            error: "internal_error",
          }),
        );
      }

      return;
    }

    if (
      req.method === "GET" &&
      req.url === "/account/profile"
    ) {
      try {
        await handleAccountProfile(
          req,
          res,
          {
            tokenService,
            findProfileByUserId
          }
        );
      } catch {
        res.writeHead(500, {
          "Content-Type":
          "application/json",
        });

        res.end(
          JSON.stringify({
            error: "internal_error",
          }),
        );
      }

      return;
    }

    /*
     * Media streaming route:
     *
     * GET /api/tracks/3005/stream
     *
     * Track IDs come from the catalog. Only the server
     * resolves media_path to a file on disk.
     */
    const url = new URL(
      req.url,
      "http://localhost"
    );

    const trackStreamRoute =
    /^\/api\/tracks\/(\d+)\/stream$/.exec(
      url.pathname
    );

    if (
      req.method === "GET" &&
      trackStreamRoute
    ) {
      const trackId =
      Number(trackStreamRoute[1]);

      if (
        typeof findTrackById !== "function"
      ) {
        res.writeHead(500, {
          "Content-Type": "application/json",
        });

        res.end(
          JSON.stringify({
            error: "internal_error",
          })
        );

        return;
      }

      try {
        const track =
        await findTrackById(trackId);

        if (!track) {
          res.writeHead(404, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              error: "track_not_found",
            })
          );

          return;
        }

        if (!track.media_path) {
          res.writeHead(404, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              error: "media_not_found",
            })
          );

          return;
        }

        const filePath = await resolveMediaFile(
          resolvedMediaRoot,
          track.media_path
        );

        if (!filePath) {
          res.writeHead(404, {
            "Content-Type": "text/plain",
          });

          res.end("Audio file not found");

          return;
        }

        streamTrackFile(
          req,
          res,
          filePath
        );
      } catch {
        res.writeHead(500, {
          "Content-Type": "application/json",
        });

        res.end(
          JSON.stringify({
            error: "internal_error",
          })
        );
      }

      return;
    }

    if (
      typeof handleSearchRequest ===
      "function"
    ) {
      const handled =
      await handleSearchRequest(
        req,
        res
      );

      if (handled) {
        return;
      }
    }

    if (
      typeof handleCatalogRequest ===
      "function"
    ) {
      const handled =
      await handleCatalogRequest(
        req,
        res
      );

      if (handled) {
        return;
      }
    }

    res.writeHead(404, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        error: "not_found",
      }),
    );
  });
}
