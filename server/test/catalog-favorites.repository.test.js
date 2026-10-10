
import test from "node:test";
import assert from "node:assert/strict";

import {
  createCatalogRepository
} from "../src/data/catalog.repository.js";

test(
  "catalog repository forwards user-scoped favorites queries",
  async () => {
    const queries = [];

    const database = {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      }
    };

    const repository =
      createCatalogRepository(database);

    assert.equal(
      typeof repository.listTracks,
      "function"
    );

    assert.equal(
      typeof repository.listFavoritesForPrincipal,
      "function"
    );

    const first =
      await repository.listFavoritesForPrincipal("101");

    const second =
      await repository.listFavoritesForPrincipal("102");

    assert.deepEqual(first, []);
    assert.deepEqual(second, []);

    assert.equal(queries.length, 2);

    assert.deepEqual(
      queries.map(({ params }) => params),
      [["101"], ["102"]]
    );

    for (const { sql } of queries) {
      assert.match(
        sql,
        /FROM favorites AS f/
      );

      assert.match(
        sql,
        /WHERE f\.user_id = \$1/
      );
    }
  }
);
