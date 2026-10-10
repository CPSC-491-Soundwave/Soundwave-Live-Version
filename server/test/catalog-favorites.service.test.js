
import test from "node:test";
import assert from "node:assert/strict";

import {
  createCatalogService
} from "../src/catalog/catalog.service.js";

function makeRepository(overrides = {}) {
  return {
    async listTracks() {
      return [];
    },
    ...overrides
  };
}

test(
  "maps favorites into the catalog track shape",
  async () => {
    let receivedPrincipal;

    const service = createCatalogService(
      makeRepository({
        async listFavoritesForPrincipal(principalId) {
          receivedPrincipal = principalId;

          return [{
            track_id: "3001",
            track_title: "Fixture Track One",
            duration_ms: "180000",
            favorited_at: "2026-10-08T12:00:00.000Z",
            album_id: "2001",
            album_title: "Fixture Album Alpha",
            artist_id: "1001",
            artist_name: "Fixture Artist One"
          }];
        }
      })
    );

    const favorites =
      await service.listFavoritesForPrincipal("101");

    assert.equal(receivedPrincipal, "101");

    assert.deepEqual(favorites, [{
      id: 3001,
      title: "Fixture Track One",
      durationMs: 180000,
      favoritedAt: "2026-10-08T12:00:00.000Z",
      album: {
        id: 2001,
        title: "Fixture Album Alpha"
      },
      artist: {
        id: 1001,
        name: "Fixture Artist One"
      }
    }]);

    assert.equal(
      "media_path" in favorites[0],
      false
    );
  }
);

test(
  "returns an empty array when no favorites exist",
  async () => {
    const service = createCatalogService(
      makeRepository({
        async listFavoritesForPrincipal() {
          return [];
        }
      })
    );

    assert.deepEqual(
      await service.listFavoritesForPrincipal("102"),
      []
    );
  }
);

test(
  "rejects a missing favorites repository method",
  async () => {
    const service = createCatalogService(
      makeRepository()
    );

    await assert.rejects(
      () => service.listFavoritesForPrincipal("101"),
      /does not support listFavoritesForPrincipal/
    );
  }
);

test(
  "propagates database failures",
  async () => {
    const service = createCatalogService(
      makeRepository({
        async listFavoritesForPrincipal() {
          throw new Error("Database unavailable");
        }
      })
    );

    await assert.rejects(
      () => service.listFavoritesForPrincipal("101"),
      /Database unavailable/
    );
  }
);
