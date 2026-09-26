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

    async listAlbums() {
      return [];
    },

    async getAlbumById() {
      return null;
    },

    ...overrides
  };
}

test(
  "GET /api/catalog/albums returns the album list contract",
  async (t) => {
    const server =
      await startServer(
        createCatalogService({
          async listAlbums() {
            return [
              {
                id: 2001,
                title:
                  "Fixture Album Alpha",

                artist: {
                  id: 1001,
                  name:
                    "Fixture Artist One"
                }
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
        `${getBaseUrl(server)}/api/catalog/albums`
      );

    assert.equal(
      response.status,
      200
    );

    assert.deepEqual(
      await response.json(),
      [
        {
          id: 2001,
          title:
            "Fixture Album Alpha",

          artist: {
            id: 1001,
            name:
              "Fixture Artist One"
          }
        }
      ]
    );
  }
);

test(
  "GET /api/catalog/albums/:id returns album detail",
  async (t) => {
    let receivedAlbumId;

    const server =
      await startServer(
        createCatalogService({
          async getAlbumById(
            albumId
          ) {
            receivedAlbumId =
              albumId;

            return {
              id: 2001,
              title:
                "Fixture Album Alpha",

              artist: {
                id: 1001,
                name:
                  "Fixture Artist One"
              },

              tracks: [
                {
                  id: 3001,
                  title:
                    "Fixture Track One",
                  durationMs: 180000
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
        `${getBaseUrl(server)}/api/catalog/albums/2001`
      );

    assert.equal(
      response.status,
      200
    );

    assert.equal(
      receivedAlbumId,
      2001
    );

    assert.deepEqual(
      await response.json(),
      {
        id: 2001,
        title:
          "Fixture Album Alpha",

        artist: {
          id: 1001,
          name:
            "Fixture Artist One"
        },

        tracks: [
          {
            id: 3001,
            title:
              "Fixture Track One",
            durationMs: 180000
          }
        ]
      }
    );
  }
);

test(
  "GET /api/catalog/albums/:id returns 404 for a missing album",
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
        `${getBaseUrl(server)}/api/catalog/albums/9999`
      );

    assert.equal(
      response.status,
      404
    );

    assert.deepEqual(
      await response.json(),
      {
        error:
          "album_not_found"
      }
    );
  }
);

test(
  "GET /api/catalog/albums/:id returns 400 for an invalid album ID",
  async (t) => {
    let serviceCalled = false;

    const server =
      await startServer(
        createCatalogService({
          async getAlbumById() {
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
        `${getBaseUrl(server)}/api/catalog/albums/not-a-number`
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
          "invalid_album_id"
      }
    );
  }
);

test(
  "GET /api/catalog/albums returns 500 when album retrieval fails",
  async (t) => {
    const server =
      await startServer(
        createCatalogService({
          async listAlbums() {
            throw new Error(
              "simulated album failure"
            );
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/albums`
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
  "GET /api/catalog/albums/:id returns 500 when album detail retrieval fails",
  async (t) => {
    const server =
      await startServer(
        createCatalogService({
          async getAlbumById() {
            throw new Error(
              "simulated album detail failure"
            );
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/catalog/albums/2001`
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