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

    async listArtists() {
      return [];
    },

    async findArtistById() {
      return null;
    },

    async listAlbumsByArtistId() {
      return [];
    },

    ...overrides
  };
}

test(
  "listArtists maps database rows to the artist API shape",
  async () => {
    const repository =
      createRepository({
        async listArtists() {
          return [
            {
              artist_id: "1001",
              artist_name:
                "Fixture Artist One"
            },
            {
              artist_id: "1002",
              artist_name:
                "Fixture Artist Two"
            }
          ];
        }
      });

    const service =
      createCatalogService(repository);

    const artists =
      await service.listArtists();

    assert.deepEqual(
      artists,
      [
        {
          id: 1001,
          name: "Fixture Artist One"
        },
        {
          id: 1002,
          name: "Fixture Artist Two"
        }
      ]
    );
  }
);

test(
  "getArtistById returns artist detail with albums",
  async () => {
    const repository =
      createRepository({
        async findArtistById(
          artistId
        ) {
          assert.equal(
            artistId,
            1001
          );

          return {
            artist_id: "1001",
            artist_name:
              "Fixture Artist One"
          };
        },

        async listAlbumsByArtistId(
          artistId
        ) {
          assert.equal(
            artistId,
            1001
          );

          return [
            {
              album_id: "2001",
              album_title:
                "Fixture Album Alpha"
            }
          ];
        }
      });

    const service =
      createCatalogService(repository);

    const artist =
      await service.getArtistById(
        1001
      );

    assert.deepEqual(
      artist,
      {
        id: 1001,
        name: "Fixture Artist One",

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
  "getArtistById returns null without loading albums when artist is absent",
  async () => {
    let albumsQueried = false;

    const repository =
      createRepository({
        async findArtistById() {
          return null;
        },

        async listAlbumsByArtistId() {
          albumsQueried = true;
          return [];
        }
      });

    const service =
      createCatalogService(repository);

    const artist =
      await service.getArtistById(
        9999
      );

    assert.equal(artist, null);
    assert.equal(
      albumsQueried,
      false
    );
  }
);

test(
  "getArtistById rejects an invalid artist ID",
  async () => {
    const service =
      createCatalogService(
        createRepository()
      );

    await assert.rejects(
      () =>
        service.getArtistById(0),
      {
        name: "TypeError"
      }
    );

    await assert.rejects(
      () =>
        service.getArtistById(
          Number.NaN
        ),
      {
        name: "TypeError"
      }
    );
  }
);