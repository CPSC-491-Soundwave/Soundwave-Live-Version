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
      return {
        sub: "101",
        role: "user",
        jti: "11111111-1111-4111-8111-111111111101",
        exp: Math.floor(Date.now() / 1000) + 3600
      };
    }

    if (token === "valid-102") {
      return {
        sub: "102",
        role: "user",
        jti: "11111111-1111-4111-8111-111111111102",
        exp: Math.floor(Date.now() / 1000) + 3600
      };
    }

    throw new Error("Invalid token");
  }
};

async function startServer(
  catalogService,
  { isTokenRevoked = async () => false } = {}
) {
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
    tokenService,
    tokenRevocationRepository: {
      isTokenRevoked
    },
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

/*
 * Existing Sprint 3 read-only tests.
 */

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
    assert.deepEqual(await response.json(), []);
  }
);

/*
 * SCRUM-355 write-path test fixture.
 *
 * Two distinct users:
 *   101 starts with Track 3001.
 *   102 starts with Track 3002.
 *
 * Changes to user 101 must not alter user 102.
 */
function createMutableFavoritesService() {
  const favorites = new Map([
    ["101", new Set([3001])],
    ["102", new Set([3002])]
  ]);

  let mutationCount = 0;

  return {
    favorites,

    get mutationCount() {
      return mutationCount;
    },

    async listFavoritesForPrincipal(userId) {
      return [...(favorites.get(userId) ?? new Set())]
        .map((id) => ({ id }));
    },

    async addFavoriteForPrincipal(userId, trackId) {
      mutationCount++;

      if (trackId === 9999) {
        return { trackExists: false };
      }

      favorites.get(userId).add(trackId);
      return { trackExists: true };
    },

    async removeFavoriteForPrincipal(userId, trackId) {
      mutationCount++;
      favorites.get(userId).delete(trackId);
    }
  };
}

function bearer(token) {
  return {
    Authorization: `Bearer ${token}`
  };
}

test(
  "PUT adds a favorite; GET reflects the change; duplicate PUT is idempotent",
  async (t) => {
    const service = createMutableFavoritesService();
    const server = await startServer(service);

    t.after(() => closeServer(server));

    for (let i = 0; i < 2; i++) {
      const response = await fetch(
        getUrl(server, "/api/library/favorites/3003"),
        {
          method: "PUT",
          headers: bearer("valid-101")
        }
      );

      assert.equal(response.status, 204);
      assert.equal(await response.text(), "");
    }

    const response = await fetch(
      getUrl(server, "/api/library/favorites"),
      {
        headers: bearer("valid-101")
      }
    );

    assert.equal(response.status, 200);

    assert.deepEqual(
      await response.json(),
      [{ id: 3001 }, { id: 3003 }]
    );

    assert.equal(service.favorites.get("101").size, 2);

    assert.deepEqual(
      [...service.favorites.get("102")],
      [3002]
    );
  }
);

test(
  "DELETE removes only the caller's favorite; repeated DELETE is harmless",
  async (t) => {
    const service = createMutableFavoritesService();
    const server = await startServer(service);

    t.after(() => closeServer(server));

    for (let i = 0; i < 2; i++) {
      const response = await fetch(
        getUrl(server, "/api/library/favorites/3001"),
        {
          method: "DELETE",
          headers: bearer("valid-101")
        }
      );

      assert.equal(response.status, 204);
    }

    const ownResponse = await fetch(
      getUrl(server, "/api/library/favorites"),
      {
        headers: bearer("valid-101")
      }
    );

    assert.deepEqual(await ownResponse.json(), []);

    assert.deepEqual(
      [...service.favorites.get("102")],
      [3002]
    );
  }
);

test(
  "client-supplied user identities cannot redirect a Favorites mutation",
  async (t) => {
    const service = createMutableFavoritesService();
    const server = await startServer(service);

    t.after(() => closeServer(server));

    const response = await fetch(
      getUrl(server, "/api/library/favorites/3003"),
      {
        method: "PUT",
        headers: {
          ...bearer("valid-101"),
          "Content-Type": "application/json",
          "X-User-Id": "102"
        },
        body: JSON.stringify({
          userId: "102",
          trackId: 3003
        })
      }
    );

    assert.equal(response.status, 204);

    assert.deepEqual(
      [...service.favorites.get("101")],
      [3001, 3003]
    );

    assert.deepEqual(
      [...service.favorites.get("102")],
      [3002]
    );
  }
);

test(
  "missing and invalid authorization deny both write methods before persistence",
  async (t) => {
    const service = createMutableFavoritesService();
    const server = await startServer(service);

    t.after(() => closeServer(server));

    for (const method of ["PUT", "DELETE"]) {
      for (const headers of [
        {},
        bearer("invalid-token")
      ]) {
        const response = await fetch(
          getUrl(server, "/api/library/favorites/3003"),
          {
            method,
            headers
          }
        );

        assert.equal(response.status, 401);
      }
    }

    assert.equal(service.mutationCount, 0);
  }
);

test(
  "malformed and nonexistent track IDs receive controlled errors",
  async (t) => {
    const service = createMutableFavoritesService();
    const server = await startServer(service);

    t.after(() => closeServer(server));

    for (const trackId of [
      "invalid",
      "0",
      "9007199254740992"
    ]) {
      const response = await fetch(
        getUrl(
          server,
          `/api/library/favorites/${trackId}`
        ),
        {
          method: "PUT",
          headers: bearer("valid-101")
        }
      );

      assert.equal(response.status, 400);
      assert.deepEqual(
        await response.json(),
        { error: "invalid_track_id" }
      );
    }

    const missing = await fetch(
      getUrl(server, "/api/library/favorites/9999"),
      {
        method: "PUT",
        headers: bearer("valid-101")
      }
    );

    assert.equal(missing.status, 404);

    assert.deepEqual(
      await missing.json(),
      { error: "track_not_found" }
    );

    assert.deepEqual(
      [...service.favorites.get("101")],
      [3001]
    );
  }
);

test(
  "revoked bearer tokens cannot perform Favorites writes",
  async (t) => {
    const service = createMutableFavoritesService();

    const server = await startServer(service, {
      isTokenRevoked: async () => true
    });

    t.after(() => closeServer(server));

    const response = await fetch(
      getUrl(server, "/api/library/favorites/3003"),
      {
        method: "PUT",
        headers: bearer("valid-101")
      }
    );

    assert.equal(response.status, 401);
    assert.equal(service.mutationCount, 0);
  }
);

test(
  "mutation service failures produce a safe 500 without leaking details",
  async (t) => {
    const server = await startServer({
      async addFavoriteForPrincipal() {
        throw new Error(
          "database password should never appear in response"
        );
      }
    });

    t.after(() => closeServer(server));

    const response = await fetch(
      getUrl(server, "/api/library/favorites/3003"),
      {
        method: "PUT",
        headers: bearer("valid-101")
      }
    );

    assert.equal(response.status, 500);

    assert.deepEqual(
      await response.json(),
      { error: "library_unavailable" }
    );
  }
);