import http from "node:http";
import path from "node:path";

import { handleLogin } from "./auth/login.js";
import { handleMe } from "./auth/me.js";

import {
  handleAccountProfile
} from "./account/profile.js";

import {
  streamTrackFile
} from "./media/streaming.js";

export function createApp({
  tokenService,
  findUserByUsername,
  findProfileByUserId,
  findTrackById,
  handleCatalogRequest,
  handleSearchRequest,
} = {}) {
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

        /*
         * The server is normally launched from the
         * server/ directory.
         *
         * Example:
         *
         * process.cwd()
         *   -> Soundwave-Live-Version/server
         *
         * ..
         *   -> Soundwave-Live-Version
         *
         * track.media_path
         *   -> mediaFiles/test.mp3
         */
        const repositoryRoot =
        path.resolve(
          process.cwd(),
                     ".."
        );

        const filePath =
        path.resolve(
          repositoryRoot,
          track.media_path
        );

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
