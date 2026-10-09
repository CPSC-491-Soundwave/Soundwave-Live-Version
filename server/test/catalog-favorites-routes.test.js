
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createApp } from "../src/app.js";
import {
  createCatalogHandler
} from "../src/catalog/catalog.handler.js";

const tokenService = {
  verify_token(token) {
    if (token === "valid-101") {
      return { sub: "101", role: "user" };
    }

    if (token === "valid-102") {
      return { sub: "102", role: "user" };
    }

    throw new Error("Invalid token");
  }
};

async function startServer(catalogService) {
  const handler = createCatalogHandler(
    {
      async listTracks() {
        return [];
      },
      ...catalogService
    },
    { tokenService }
  );

  const server = createApp({
    handleCatalogRequest: handler
  });

  server.listen(0, "127.0.0.1");

  await once(server, "listening");

  return server;
}

function getUrl(server, path) {
  const port = server.address().port;

  return `http://127.0.0.1:${port}${path}`;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

test(
  "authenticated users receive their own favorites",
  async (t) => {
    const receivedUserIds = [];

    const server = await startServer({
      async listFavoritesForPrincipal(userId) {
        receivedUserIds.push(userId);

        if (userId === "101") {
          return [{
            id: 3001,
            title: "User A Favorite"
          }];
        }

        return [{
          id: 3002,
          title: "User B Favorite"
        }];
      }
    });

    t.after(() => closeServer(server));

    const cases = [
      [
        "valid-101",
        { id: 3001, title: "User A Favorite" }
      ],
      [
        "valid-102",
        { id: 3002, title: "User B Favorite" }
      ]
    ];

    for (const [token, expected] of cases) {
      const response = await fetch(
        getUrl(server, "/api/library/favorites"),
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      assert.equal(response.status, 200);
      assert.deepEqual(
        await response.json(),
        [expected]
      );
    }

    assert.deepEqual(
      receivedUserIds,
      ["101", "102"]
    );
  }
);

test(
  "unauthenticated favorites request returns 401",
  async (t) => {
    let repositoryCalled = false;

    const server = await startServer({
      async listFavoritesForPrincipal() {
        repositoryCalled = true;
        return [];
      }
    });

    t.after(() => closeServer(server));

    const response = await fetch(
      getUrl(server, "/api/library/favorites")
    );

    assert.equal(response.status, 401);
    assert.equal(repositoryCalled, false);

    assert.equal(
      response.headers.get("www-authenticate"),
      "Bearer"
    );
  }
);

test(
  "invalid Bearer token returns 401",
  async (t) => {
    const server = await startServer({
      async listFavoritesForPrincipal() {
        throw new Error("Must not execute");
      }
    });

    t.after(() => closeServer(server));

    const response = await fetch(
      getUrl(server, "/api/library/favorites"),
      {
        headers: {
          Authorization: "Bearer invalid"
        }
      }
    );

    assert.equal(response.status, 401);
  }
);

test(
  "favorites database failure returns controlled 500",
  async (t) => {
    const server = await startServer({
      async listFavoritesForPrincipal() {
        throw new Error("Simulated database failure");
      }
    });

    t.after(() => closeServer(server));

    const response = await fetch(
      getUrl(server, "/api/library/favorites"),
      {
        headers: {
          Authorization: "Bearer valid-101"
        }
      }
    );

    assert.equal(response.status, 500);

    assert.deepEqual(
      await response.json(),
      { error: "library_unavailable" }
    );
  }
);

test(
  "public tracks catalog remains accessible",
  async (t) => {
    const server = await startServer({});

    t.after(() => closeServer(server));

    const response = await fetch(
      getUrl(server, "/api/catalog/tracks")
    );

    assert.equal(response.status, 200);

    assert.deepEqual(
      await response.json(),
      []
    );
  }
);
