import test from "node:test";
import assert from "node:assert/strict";

import {
  createCatalogRepository
} from "../src/data/catalog.repository.js";

test(
  "listArtists returns database artist rows",
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
              artist_id: "1001",
              artist_name:
                "Fixture Artist One"
            },
            {
              artist_id: "1002",
              artist_name:
                "Fixture Artist Two"
            }
          ]
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    const rows =
      await repository.listArtists();

    assert.equal(rows.length, 2);

    assert.match(
      queries[0].sql,
      /FROM artists ar/
    );

    assert.match(
      queries[0].sql,
      /ORDER BY ar\.id/
    );
  }
);

test(
  "findArtistById uses a parameterized artist lookup",
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

    const artist =
      await repository.findArtistById(
        1001
      );

    assert.equal(
      artist.artist_id,
      "1001"
    );

    assert.deepEqual(
      queries[0].parameters,
      [1001]
    );

    assert.match(
      queries[0].sql,
      /WHERE ar\.id = \$1/
    );
  }
);

test(
  "findArtistById returns null when the artist is absent",
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

    const artist =
      await repository.findArtistById(
        9999
      );

    assert.equal(artist, null);
  }
);

test(
  "listAlbumsByArtistId queries albums by artist ID",
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
                "Fixture Album Alpha"
            }
          ]
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    const albums =
      await repository.listAlbumsByArtistId(
        1001
      );

    assert.equal(albums.length, 1);

    assert.deepEqual(
      queries[0].parameters,
      [1001]
    );

    assert.match(
      queries[0].sql,
      /WHERE a\.artist_id = \$1/
    );
  }
);