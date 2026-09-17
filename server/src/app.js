import http from "node:http";
import { handleLogin } from "./auth/login.js";
import { handleMe } from "./auth/me.js";

export function createApp({
  tokenService,
  findUserByUsername,
} = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
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

    if (req.method === "POST" && req.url === "/auth/login") {
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

    if (req.method === "GET" && req.url === "/auth/me") {
      try {
        await handleMe(req, res, tokenService);
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
