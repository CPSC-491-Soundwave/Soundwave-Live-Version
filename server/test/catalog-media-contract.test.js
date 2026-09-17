import assert from "node:assert/strict";
import test from "node:test";

import {
  createCatalogService
} from "../src/catalog/catalog.service.js";

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