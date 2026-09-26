import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import {
  createApp
} from "../src/app.js";

import {
  createCatalogHandler
} from "../src/catalog/catalog.handler.js";

async function startServer(
  catalogService
) {
  const handleCatalogRequest =
    createCatalogHandler(
      catalogService
    );

  const server = createApp({
    handleCatalogRequest
  });

  server.listen(
    0,
    "127.0.0.1"
  );

  await once(
    server,
    "listening"
  );

  return server;
}

function getBaseUrl(server) {
  const address =
    server.address();

  return (
    `http://127.0.0.1:${address.port}`
  );
}

async function closeServer(server) {
  await new Promise(
    (resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }
  );
}

function createCatalogService(
  overrides = {}
) {
  return {
    async listTracks() {
      return [];
    },

    async listArtists() {
      return [];
    },

    async getArtistById() {
      return null;
    },

    ...overrides
  };
}

test(
  "GET /api/catalog/artists returns the artist list contract",
  async (t) => {
    const server =
      await startServer(
        createCatalogService({
          async listArtists() {
            return [
              {
                id: 1001,
                name:
                  "Fixture Artist One"
              },
              {
                id: 1002,
                name:
                  "Fixture Artist Two"
              }
            ];
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/artists`
      );

    assert.equal(
      response.status,
      200
    );

    assert.deepEqual(
      await response.json(),
      [
        {
          id: 1001,
          name:
            "Fixture Artist One"
        },
        {
          id: 1002,
          name:
            "Fixture Artist Two"
        }
      ]
    );
  }
);

test(
  "GET /api/catalog/artists/:id returns artist detail",
  async (t) => {
    let receivedArtistId;

    const server =
      await startServer(
        createCatalogService({
          async getArtistById(
            artistId
          ) {
            receivedArtistId =
              artistId;

            return {
              id: 1001,
              name:
                "Fixture Artist One",
              albums: [
                {
                  id: 2001,
                  title:
                    "Fixture Album Alpha"
                }
              ]
            };
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/artists/1001`
      );

    assert.equal(
      response.status,
      200
    );

    assert.equal(
      receivedArtistId,
      1001
    );

    assert.deepEqual(
      await response.json(),
      {
        id: 1001,
        name:
          "Fixture Artist One",
        albums: [
          {
            id: 2001,
            title:
              "Fixture Album Alpha"
          }
        ]
      }
    );
  }
);

test(
  "GET /api/catalog/artists/:id returns 404 for a missing artist",
  async (t) => {
    const server =
      await startServer(
        createCatalogService()
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/artists/9999`
      );

    assert.equal(
      response.status,
      404
    );

    assert.deepEqual(
      await response.json(),
      {
        error:
          "artist_not_found"
      }
    );
  }
);

test(
  "GET /api/catalog/artists/:id returns 400 for an invalid artist ID",
  async (t) => {
    let serviceCalled = false;

    const server =
      await startServer(
        createCatalogService({
          async getArtistById() {
            serviceCalled = true;
            return null;
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/artists/not-a-number`
      );

    assert.equal(
      response.status,
      400
    );

    assert.equal(
      serviceCalled,
      false
    );

    assert.deepEqual(
      await response.json(),
      {
        error:
          "invalid_artist_id"
      }
    );
  }
);

test(
  "GET /api/catalog/artists returns 500 when artist retrieval fails",
  async (t) => {
    const server =
      await startServer(
        createCatalogService({
          async listArtists() {
            throw new Error(
              "simulated artist failure"
            );
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/artists`
      );

    assert.equal(
      response.status,
      500
    );

    assert.deepEqual(
      await response.json(),
      {
        error:
          "catalog_unavailable"
      }
    );
  }
);

test(
  "artist catalog integration does not consume unrelated artist subroutes",
  async (t) => {
    const server =
      await startServer(
        createCatalogService()
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/artists/1001/extra`
      );

    assert.equal(
      response.status,
      404
    );

    assert.deepEqual(
      await response.json(),
      {
        error: "not_found"
      }
    );
  }
);