import assert from "node:assert/strict";
import test from "node:test";

import {
  createCatalogService
} from "../src/catalog/catalog.service.js";

const forbiddenMediaKeys = [
  "filePath",
  "mediaPath",
  "storageKey",
  "mediaId",
  "streamUrl"
];

function assertNoMediaStorageDetails(
  value
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoMediaStorageDetails(
        item
      );
    }

    return;
  }

  if (
    value === null ||
    typeof value !== "object"
  ) {
    return;
  }

  for (
    const key of forbiddenMediaKeys
  ) {
    assert.equal(
      Object.hasOwn(value, key),
      false,
      `catalog response must not expose ${key}`
    );
  }

  for (
    const nestedValue of
      Object.values(value)
  ) {
    assertNoMediaStorageDetails(
      nestedValue
    );
  }
}

test(
  "artist detail does not expose media storage implementation details",
  async () => {
    const repository = {
      async listTracks() {
        return [];
      },

      async findArtistById() {
        return {
          artist_id: "1001",
          artist_name:
            "Fixture Artist One",

          // Deliberately injected
          // repository-only details.
          storageKey:
            "should-not-leak",
          mediaPath:
            "/private/media"
        };
      },

      async listAlbumsByArtistId() {
        return [
          {
            album_id: "2001",
            album_title:
              "Fixture Album Alpha",

            // Deliberately injected.
            filePath:
              "/private/album",
            mediaId:
              "internal-album-id"
          }
        ];
      }
    };

    const catalogService =
      createCatalogService(
        repository
      );

    const artist =
      await catalogService.getArtistById(
        1001
      );

    assert.deepEqual(
      artist,
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

    assertNoMediaStorageDetails(
      artist
    );
  }
);

test(
  "album detail does not expose media storage implementation details",
  async () => {
    const repository = {
      async listTracks() {
        return [];
      },

      async findAlbumById() {
        return {
          album_id: "2001",
          album_title:
            "Fixture Album Alpha",
          artist_id: "1001",
          artist_name:
            "Fixture Artist One",

          // Deliberately injected.
          storageKey:
            "should-not-leak",
          mediaPath:
            "/private/media"
        };
      },

      async listTracksByAlbumId() {
        return [
          {
            track_id: "3001",
            track_title:
              "Fixture Track One",
            duration_ms: 180000,

            // Deliberately injected.
            filePath:
              "/private/audio.mp3",
            mediaId:
              "internal-track-id",
            streamUrl:
              "/internal/stream"
          }
        ];
      }
    };

    const catalogService =
      createCatalogService(
        repository
      );

    const album =
      await catalogService.getAlbumById(
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

    assertNoMediaStorageDetails(
      album
    );
  }
);

test(
  "catalog exposes tracks.id as the stable cross-feature track identity",
  async () => {
    const repository = {
      async listTracks() {
        return [
          {
            track_id: "3001",
            track_title:
              "Fixture Track One",
            duration_ms: 180000,
            album_id: "2001",
            album_title:
              "Fixture Album Alpha",
            artist_id: "1001",
            artist_name:
              "Fixture Artist One"
          }
        ];
      }
    };

    const catalogService =
      createCatalogService(repository);

    const tracks =
      await catalogService.listTracks();

    assert.equal(
      tracks.length,
      1
    );

    const track =
      tracks[0];

    assert.equal(
      track.id,
      3001
    );

    assert.equal(
      track.title,
      "Fixture Track One"
    );

    assert.deepEqual(
      track.album,
      {
        id: 2001,
        title:
          "Fixture Album Alpha"
      }
    );

    assert.deepEqual(
      track.artist,
      {
        id: 1001,
        name:
          "Fixture Artist One"
      }
    );
  }
);

test(
  "catalog response does not expose media storage implementation details",
  async () => {
    const repository = {
      async listTracks() {
        return [
          {
            track_id: "3001",
            track_title:
              "Fixture Track One",
            duration_ms: 180000,
            album_id: "2001",
            album_title:
              "Fixture Album Alpha",
            artist_id: "1001",
            artist_name:
              "Fixture Artist One"
          }
        ];
      }
    };

    const catalogService =
      createCatalogService(repository);

    const [track] =
      await catalogService.listTracks();

    assert.equal(
      Object.hasOwn(
        track,
        "filePath"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        track,
        "mediaPath"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        track,
        "storageKey"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        track,
        "mediaId"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        track,
        "streamUrl"
      ),
      false
    );
  }
);