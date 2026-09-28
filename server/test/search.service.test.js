import test from "node:test";
import assert from "node:assert/strict";

import {
  createSearchService
} from "../src/search/search.service.js";

function createRepository(
  overrides = {}
) {
  return {
    async searchTracks() {
      return [];
    },

    async searchArtists() {
      return [];
    },

    async searchAlbums() {
      return [];
    },

    ...overrides
  };
}

test(
  "createSearchService requires a complete repository",
  () => {
    assert.throws(
      () => createSearchService(),
      TypeError
    );

    assert.throws(
      () => createSearchService({
        searchTracks() {}
      }),
      TypeError
    );
  }
);

test(
  "search maps grouped repository rows to the API contract",
  async () => {
    const service =
      createSearchService(
        createRepository({
          async searchTracks() {
            return [
              {
                track_id: 3001,
                track_title:
                  "Fixture Track One",
                duration_ms: 180000,
                album_id: 2001,
                album_title:
                  "Fixture Album Alpha",
                artist_id: 1001,
                artist_name:
                  "Fixture Artist One"
              }
            ];
          },

          async searchArtists() {
            return [
              {
                artist_id: 1001,
                artist_name:
                  "Fixture Artist One"
              }
            ];
          },

          async searchAlbums() {
            return [
              {
                album_id: 2001,
                album_title:
                  "Fixture Album Alpha",
                artist_id: 1001,
                artist_name:
                  "Fixture Artist One"
              }
            ];
          }
        })
      );

    const result =
      await service.search(
        "fixture"
      );

    assert.deepEqual(
      result,
      {
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
      }
    );
  }
);

test(
  "search trims the query before repository calls",
  async () => {
    const receivedQueries = [];

    const service =
      createSearchService(
        createRepository({
          async searchTracks(query) {
            receivedQueries.push(query);
            return [];
          },

          async searchArtists(query) {
            receivedQueries.push(query);
            return [];
          },

          async searchAlbums(query) {
            receivedQueries.push(query);
            return [];
          }
        })
      );

    const result =
      await service.search(
        "  fixture  "
      );

    assert.deepEqual(
      receivedQueries,
      [
        "fixture",
        "fixture",
        "fixture"
      ]
    );

    assert.equal(
      result.query,
      "fixture"
    );
  }
);

test(
  "track filter only searches tracks",
  async () => {
    const calls = [];

    const service =
      createSearchService(
        createRepository({
          async searchTracks() {
            calls.push("track");
            return [];
          },

          async searchArtists() {
            calls.push("artist");
            return [];
          },

          async searchAlbums() {
            calls.push("album");
            return [];
          }
        })
      );

    const result =
      await service.search(
        "fixture",
        "track"
      );

    assert.deepEqual(
      calls,
      ["track"]
    );

    assert.deepEqual(
      result.artists,
      []
    );

    assert.deepEqual(
      result.albums,
      []
    );
  }
);

test(
  "artist filter only searches artists",
  async () => {
    const calls = [];

    const service =
      createSearchService(
        createRepository({
          async searchTracks() {
            calls.push("track");
            return [];
          },

          async searchArtists() {
            calls.push("artist");
            return [];
          },

          async searchAlbums() {
            calls.push("album");
            return [];
          }
        })
      );

    await service.search(
      "fixture",
      "artist"
    );

    assert.deepEqual(
      calls,
      ["artist"]
    );
  }
);

test(
  "album filter only searches albums",
  async () => {
    const calls = [];

    const service =
      createSearchService(
        createRepository({
          async searchTracks() {
            calls.push("track");
            return [];
          },

          async searchArtists() {
            calls.push("artist");
            return [];
          },

          async searchAlbums() {
            calls.push("album");
            return [];
          }
        })
      );

    await service.search(
      "fixture",
      "album"
    );

    assert.deepEqual(
      calls,
      ["album"]
    );
  }
);

test(
  "search rejects blank queries",
  async () => {
    const service =
      createSearchService(
        createRepository()
      );

    await assert.rejects(
      service.search("   "),
      TypeError
    );
  }
);

test(
  "search rejects queries longer than 100 characters",
  async () => {
    const service =
      createSearchService(
        createRepository()
      );

    await assert.rejects(
      service.search(
        "a".repeat(101)
      ),
      TypeError
    );
  }
);

test(
  "search rejects unsupported types",
  async () => {
    const service =
      createSearchService(
        createRepository()
      );

    await assert.rejects(
      service.search(
        "fixture",
        "playlist"
      ),
      TypeError
    );
  }
);
