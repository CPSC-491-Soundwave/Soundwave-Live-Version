import test from "node:test";
import assert from "node:assert/strict";

import {
  createSearchRepository
} from "../src/data/search.repository.js";

test(
  "createSearchRepository requires database query function",
  () => {
    assert.throws(
      () => createSearchRepository(),
      TypeError
    );

    assert.throws(
      () => createSearchRepository({}),
      TypeError
    );
  }
);

test(
  "searchTracks uses a parameterized substring query",
  async () => {
    let receivedSql;
    let receivedParameters;

    const database = {
      async query(sql, parameters) {
        receivedSql = sql;
        receivedParameters =
          parameters;

        return {
          rows: [
            {
              track_id: 3001,
              track_title:
                "Fixture Track One"
            }
          ]
        };
      }
    };

    const repository =
      createSearchRepository(
        database
      );

    const rows =
      await repository.searchTracks(
        "track"
      );

    assert.deepEqual(
      receivedParameters,
      ["track"]
    );

    assert.match(
      receivedSql,
      /ILIKE\s+'%'\s+\|\|\s+\$1\s+\|\|\s+'%'/i
    );

    assert.match(
      receivedSql,
      /FROM\s+tracks/i
    );

    assert.equal(
      rows[0].track_id,
      3001
    );
  }
);

test(
  "searchArtists uses a parameterized substring query",
  async () => {
    let receivedSql;
    let receivedParameters;

    const database = {
      async query(sql, parameters) {
        receivedSql = sql;
        receivedParameters =
          parameters;

        return {
          rows: [
            {
              artist_id: 1001,
              artist_name:
                "Fixture Artist One"
            }
          ]
        };
      }
    };

    const repository =
      createSearchRepository(
        database
      );

    const rows =
      await repository.searchArtists(
        "artist"
      );

    assert.deepEqual(
      receivedParameters,
      ["artist"]
    );

    assert.match(
      receivedSql,
      /ILIKE\s+'%'\s+\|\|\s+\$1\s+\|\|\s+'%'/i
    );

    assert.match(
      receivedSql,
      /FROM\s+artists/i
    );

    assert.equal(
      rows[0].artist_id,
      1001
    );
  }
);

test(
  "searchAlbums uses a parameterized substring query",
  async () => {
    let receivedSql;
    let receivedParameters;

    const database = {
      async query(sql, parameters) {
        receivedSql = sql;
        receivedParameters =
          parameters;

        return {
          rows: [
            {
              album_id: 2001,
              album_title:
                "Fixture Album Alpha"
            }
          ]
        };
      }
    };

    const repository =
      createSearchRepository(
        database
      );

    const rows =
      await repository.searchAlbums(
        "album"
      );

    assert.deepEqual(
      receivedParameters,
      ["album"]
    );

    assert.match(
      receivedSql,
      /ILIKE\s+'%'\s+\|\|\s+\$1\s+\|\|\s+'%'/i
    );

    assert.match(
      receivedSql,
      /FROM\s+albums/i
    );

    assert.equal(
      rows[0].album_id,
      2001
    );
  }
);
