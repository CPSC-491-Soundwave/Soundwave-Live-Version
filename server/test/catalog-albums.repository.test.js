import test from "node:test";
import assert from "node:assert/strict";

import {
  createCatalogRepository
} from "../src/data/catalog.repository.js";

test(
  "listAlbums returns album rows with artist identity",
  async () => {
    const queries = [];

    const database = {
      async query(sql, parameters) {
        queries.push({
          sql,
          parameters
        });

        return {
          rows: [
            {
              album_id: "2001",
              album_title:
                "Fixture Album Alpha",
              artist_id: "1001",
              artist_name:
                "Fixture Artist One"
            }
          ]
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    const albums =
      await repository.listAlbums();

    assert.equal(albums.length, 1);

    assert.match(
      queries[0].sql,
      /FROM albums a/
    );

    assert.match(
      queries[0].sql,
      /JOIN artists ar/
    );
  }
);

test(
  "findAlbumById uses a parameterized album lookup",
  async () => {
    const queries = [];

    const database = {
      async query(sql, parameters) {
        queries.push({
          sql,
          parameters
        });

        return {
          rows: [
            {
              album_id: "2001",
              album_title:
                "Fixture Album Alpha",
              artist_id: "1001",
              artist_name:
                "Fixture Artist One"
            }
          ]
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    const album =
      await repository.findAlbumById(
        2001
      );

    assert.equal(
      album.album_id,
      "2001"
    );

    assert.deepEqual(
      queries[0].parameters,
      [2001]
    );

    assert.match(
      queries[0].sql,
      /WHERE a\.id = \$1/
    );
  }
);

test(
  "findAlbumById returns null when the album is absent",
  async () => {
    const database = {
      async query() {
        return {
          rows: []
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    const album =
      await repository.findAlbumById(
        9999
      );

    assert.equal(album, null);
  }
);

test(
  "listTracksByAlbumId queries tracks by album ID",
  async () => {
    const queries = [];

    const database = {
      async query(sql, parameters) {
        queries.push({
          sql,
          parameters
        });

        return {
          rows: [
            {
              track_id: "3001",
              track_title:
                "Fixture Track One",
              duration_ms: 180000
            }
          ]
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    const tracks =
      await repository.listTracksByAlbumId(
        2001
      );

    assert.equal(tracks.length, 1);

    assert.deepEqual(
      queries[0].parameters,
      [2001]
    );

    assert.match(
      queries[0].sql,
      /WHERE t\.album_id = \$1/
    );
  }
);