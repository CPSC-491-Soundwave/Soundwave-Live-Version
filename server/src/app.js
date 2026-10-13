import http from "node:http";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { handleLogin } from "./auth/login.js";
import { handleMe } from "./auth/me.js";
import { handleLogout } from "./auth/logout.js";

import {
  authorizeRevocableRequest
} from "./auth/request-authorization.js";

import {
  handleAccountProfile
} from "./account/profile.js";

import {
  streamTrackFile
} from "./media/streaming.js";

import {
  createMediaAccessHandler,
  authorizeMediaStreamRequest
} from "./media/media-access.handler.js";

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
  tokenRevocationRepository,
  mediaTicketService,
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

  const handleMediaAccessRequest = mediaTicketService
  ? createMediaAccessHandler({
    mediaTicketService,
    tokenService,
    tokenRevocationRepository,
    authorizeRevocableRequest,
    findTrackById
  })
  : null;

  return http.createServer(async (req, res) => {

    /*
     * Existing protected endpoints.
     *
     * Media streaming authorization is handled separately
     * inside its dynamic route below.
     */
    const isProtectedRoute =
    req.method === "GET" &&
    (
      req.url === "/auth/me" ||
      req.url === "/account/profile" ||
      req.url === "/api/library/recently-added" ||
      req.url === "/api/library/favorites"
    );

    if (isProtectedRoute) {
      const principal =
      await authorizeRevocableRequest(
        req,
        res,
        {
          tokenService,
          tokenRevocationRepository,
          allowedRoles: ["user", "admin"]
        }
      );

      if (!principal) {
        return;
      }
    }

    /*
     * Health endpoint.
     */
    if (
      req.method === "GET" &&
      req.url === "/health"
    ) {
      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(
        JSON.stringify({
          status: "ok"
        })
      );

      return;
    }

    /*
     * Login endpoint.
     */
    if (
      req.method === "POST" &&
      req.url === "/auth/login"
    ) {
      try {
        await handleLogin(req, res, {
          findUserByUsername,
          tokenService
        });
      } catch {
        res.writeHead(500, {
          "Content-Type": "application/json"
        });

        res.end(
          JSON.stringify({
            error: "internal_error"
          })
        );
      }

      return;
    }

    /*
     * Logout endpoint.
     */
    if (
      req.method === "POST" &&
      req.url === "/auth/logout"
    ) {
      try {
        await handleLogout(req, res, {
          tokenService,
          tokenRevocationRepository
        });
      } catch (error) {
        console.error(
          "Logout failed:",
          error
        );

        if (!res.headersSent) {
          res.writeHead(503, {
            "Content-Type":
            "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          });

          res.end(
            JSON.stringify({
              error: "authentication_unavailable"
            })
          );
        } else {
          res.destroy();
        }
      }

      return;
    }

    /*
     * Current user endpoint.
     */
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
          "Content-Type": "application/json"
        });

        res.end(
          JSON.stringify({
            error: "internal_error"
          })
        );
      }

      return;
    }

    /*
     * Account profile endpoint.
     */
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
          "Content-Type": "application/json"
        });

        res.end(
          JSON.stringify({
            error: "internal_error"
          })
        );
      }

      return;
    }

    /*
     * Media streaming route:
     *
     * GET /api/tracks/3005/stream
     *
     * Track IDs come from the catalog.
     * Only the server resolves media_path to a file.
     *
     * Authentication must succeed before track lookup,
     * media path resolution, or sending audio bytes.
     */
    const url = new URL(
      req.url,
      "http://localhost"
    );

    if (
      handleMediaAccessRequest &&
      await handleMediaAccessRequest(req, res)
    ) {
      return;
    }

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
          "Content-Type": "application/json"
        });

        res.end(
          JSON.stringify({
            error: "internal_error"
          })
        );

        return;
      }

      // Prevent protected media responses from being cached.
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Vary", "Authorization, Cookie");

      try {

        /*
         * NEW: Streaming authorization.
         *
         * Reuse the existing revocation-aware
         * authentication system.
         *
         * This checks the request before any track
         * metadata or physical audio file is accessed.
         */
        const principal = await authorizeMediaStreamRequest(
          req,
          res,
          {
            trackId,
            mediaTicketService,
            tokenService,
            tokenRevocationRepository,
            authorizeRevocableRequest
          }
        );

        /*
         * When authorization fails, the shared helper
         * is responsible for the denial response.
         *
         * Stop processing immediately so no audio
         * bytes can be returned.
         */
        if (!principal) {
          return;
        }

        /*
         * Authentication succeeded.
         *
         * Continue with the existing streaming logic.
         */
        const track =
        await findTrackById(trackId);

        if (!track) {
          res.writeHead(404, {
            "Content-Type": "application/json"
          });

          res.end(
            JSON.stringify({
              error: "track_not_found"
            })
          );

          return;
        }

        if (!track.media_path) {
          res.writeHead(404, {
            "Content-Type": "application/json"
          });

          res.end(
            JSON.stringify({
              error: "media_not_found"
            })
          );

          return;
        }

        /*
         * Resolve media_path securely.
         *
         * The resolved file must remain inside
         * the configured media root.
         */
        const filePath =
        await resolveMediaFile(
          resolvedMediaRoot,
          track.media_path
        );

        if (!filePath) {
          res.writeHead(404, {
            "Content-Type": "text/plain"
          });

          res.end("Audio file not found");

          return;
        }

        /*
         * Existing byte-range streaming implementation.
         *
         * Supports standard full and partial responses.
         */
        streamTrackFile(
          req,
          res,
          filePath
        );

      } catch (error) {
        console.error(
          "Media streaming request failed:",
          error
        );

        /*
         * Avoid writing a second response if another
         * handler has already sent the headers.
         */
        if (!res.headersSent) {
          res.writeHead(500, {
            "Content-Type": "application/json"
          });

          res.end(
            JSON.stringify({
              error: "internal_error"
            })
          );
        } else {
          res.destroy();
        }
      }

      return;
    }

    /*
     * Search routes.
     */
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

    /*
     * Catalog routes.
     */
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

    /*
     * Default 404.
     */
    res.writeHead(404, {
      "Content-Type": "application/json"
    });

    res.end(
      JSON.stringify({
        error: "not_found"
      })
    );
  });
}
