import test from "node:test";
import assert from "node:assert/strict";

import {
  createCatalogService
} from "../src/catalog/catalog.service.js";

function createRepository(
  overrides = {}
) {
  return {
    async listTracks() {
      return [];
    },

    async listAlbums() {
      return [];
    },

    async findAlbumById() {
      return null;
    },

    async listTracksByAlbumId() {
      return [];
    },

    ...overrides
  };
}

test(
  "listAlbums maps rows to the album API shape",
  async () => {
    const repository =
      createRepository({
        async listAlbums() {
          return [
            {
              album_id: "2001",
              album_title:
                "Fixture Album Alpha",
              artist_id: "1001",
              artist_name:
                "Fixture Artist One"
            }
          ];
        }
      });

    const service =
      createCatalogService(repository);

    const albums =
      await service.listAlbums();

    assert.deepEqual(
      albums,
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
  "getAlbumById returns album detail with tracks",
  async () => {
    const repository =
      createRepository({
        async findAlbumById(
          albumId
        ) {
          assert.equal(
            albumId,
            2001
          );

          return {
            album_id: "2001",
            album_title:
              "Fixture Album Alpha",
            artist_id: "1001",
            artist_name:
              "Fixture Artist One"
          };
        },

        async listTracksByAlbumId(
          albumId
        ) {
          assert.equal(
            albumId,
            2001
          );

          return [
            {
              track_id: "3001",
              track_title:
                "Fixture Track One",
              duration_ms: 180000
            }
          ];
        }
      });

    const service =
      createCatalogService(repository);

    const album =
      await service.getAlbumById(
        2001
      );

    assert.deepEqual(
      album,
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
  "getAlbumById returns null without loading tracks when album is absent",
  async () => {
    let tracksQueried = false;

    const repository =
      createRepository({
        async findAlbumById() {
          return null;
        },

        async listTracksByAlbumId() {
          tracksQueried = true;
          return [];
        }
      });

    const service =
      createCatalogService(repository);

    const album =
      await service.getAlbumById(
        9999
      );

    assert.equal(album, null);

    assert.equal(
      tracksQueried,
      false
    );
  }
);

test(
  "getAlbumById rejects an invalid album ID",
  async () => {
    const service =
      createCatalogService(
        createRepository()
      );

    await assert.rejects(
      () =>
        service.getAlbumById(0),
      {
        name: "TypeError"
      }
    );

    await assert.rejects(
      () =>
        service.getAlbumById(
          Number.NaN
        ),
      {
        name: "TypeError"
      }
    );
  }
);