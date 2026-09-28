import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import {
  createApp
} from "../src/app.js";

import {
  createSearchHandler
} from "../src/search/search.handler.js";

async function startServer(
  searchService
) {
  const handleSearchRequest =
    createSearchHandler(
      searchService
    );

  const server =
    createApp({
      handleSearchRequest
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

function createSearchService(
  overrides = {}
) {
  return {
    async search(
      query,
      type = "all"
    ) {
      return {
        query,
        tracks: [],
        artists: [],
        albums: [],
        type
      };
    },

    ...overrides
  };
}

test(
  "GET /api/search returns the grouped search contract",
  async (t) => {
    const server =
      await startServer(
        createSearchService({
          async search(
            query,
            type
          ) {
            assert.equal(
              query,
              "fixture"
            );

            assert.equal(
              type,
              "all"
            );

            return {
              query: "fixture",

              tracks: [
                {
                  id: 3001,
                  title:
                    "Fixture Track One",
                  durationMs: 180000,

                  album: {
                    id: 2001,
                    title:
                      "Fixture Album Alpha"
                  },

                  artist: {
                    id: 1001,
                    name:
                      "Fixture Artist One"
                  }
                }
              ],

              artists: [
                {
                  id: 1001,
                  name:
                    "Fixture Artist One"
                }
              ],

              albums: [
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
            };
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=fixture`
      );

    assert.equal(
      response.status,
      200
    );

    const body =
      await response.json();

    assert.equal(
      body.query,
      "fixture"
    );

    assert.equal(
      body.tracks.length,
      1
    );

    assert.equal(
      body.artists.length,
      1
    );

    assert.equal(
      body.albums.length,
      1
    );
  }
);

test(
  "GET /api/search defaults omitted type to all",
  async (t) => {
    let receivedType;

    const server =
      await startServer(
        createSearchService({
          async search(
            query,
            type
          ) {
            receivedType = type;

            return {
              query,
              tracks: [],
              artists: [],
              albums: []
            };
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=fixture`
      );

    assert.equal(
      response.status,
      200
    );

    assert.equal(
      receivedType,
      "all"
    );
  }
);

for (
  const searchType of [
    "track",
    "artist",
    "album"
  ]
) {
  test(
    `GET /api/search accepts type=${searchType}`,
    async (t) => {
      let receivedType;

      const server =
        await startServer(
          createSearchService({
            async search(
              query,
              type
            ) {
              receivedType = type;

              return {
                query,
                tracks: [],
                artists: [],
                albums: []
              };
            }
          })
        );

      t.after(
        () => closeServer(server)
      );

      const response =
        await fetch(
          `${getBaseUrl(server)}/api/search?q=fixture&type=${searchType}`
        );

      assert.equal(
        response.status,
        200
      );

      assert.equal(
        receivedType,
        searchType
      );
    }
  );
}

test(
  "GET /api/search returns 400 when q is missing",
  async (t) => {
    let serviceCalled = false;

    const server =
      await startServer(
        createSearchService({
          async search() {
            serviceCalled = true;
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search`
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
          "invalid_search_query"
      }
    );
  }
);

test(
  "GET /api/search returns 400 when q is blank",
  async (t) => {
    const server =
      await startServer(
        createSearchService()
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=%20%20%20`
      );

    assert.equal(
      response.status,
      400
    );

    assert.deepEqual(
      await response.json(),
      {
        error:
          "invalid_search_query"
      }
    );
  }
);

test(
  "GET /api/search returns 400 when q exceeds 100 characters",
  async (t) => {
    const server =
      await startServer(
        createSearchService()
      );

    t.after(
      () => closeServer(server)
    );

    const query =
      "a".repeat(101);

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=${query}`
      );

    assert.equal(
      response.status,
      400
    );

    assert.deepEqual(
      await response.json(),
      {
        error:
          "invalid_search_query"
      }
    );
  }
);

test(
  "GET /api/search returns 400 for invalid type",
  async (t) => {
    let serviceCalled = false;

    const server =
      await startServer(
        createSearchService({
          async search() {
            serviceCalled = true;
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=fixture&type=playlist`
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
          "invalid_search_type"
      }
    );
  }
);

test(
  "GET /api/search returns 200 for no matches",
  async (t) => {
    const server =
      await startServer(
        createSearchService({
          async search(query) {
            return {
              query,
              tracks: [],
              artists: [],
              albums: []
            };
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=nothing`
      );

    assert.equal(
      response.status,
      200
    );

    assert.deepEqual(
      await response.json(),
      {
        query: "nothing",
        tracks: [],
        artists: [],
        albums: []
      }
    );
  }
);

test(
  "GET /api/search returns 500 when search fails",
  async (t) => {
    const server =
      await startServer(
        createSearchService({
          async search() {
            throw new Error(
              "simulated search failure"
            );
          }
        })
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=fixture`
      );

    assert.equal(
      response.status,
      500
    );

    assert.deepEqual(
      await response.json(),
      {
        error:
          "search_unavailable"
      }
    );
  }
);

test(
  "search integration does not consume unrelated routes",
  async (t) => {
    const server =
      await startServer(
        createSearchService()
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search/extra?q=fixture`
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

test(
  "POST /api/search is not consumed by the GET search handler",
  async (t) => {
    const server =
      await startServer(
        createSearchService()
      );

    t.after(
      () => closeServer(server)
    );

    const response =
      await fetch(
        `${getBaseUrl(server)}/api/search?q=fixture`,
        {
          method: "POST"
        }
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
