import test from "node:test";
import assert from "node:assert/strict";

import {
  createCatalogRepository
} from "../src/data/catalog.repository.js";

import {
  createCatalogService
} from "../src/catalog/catalog.service.js";

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

test(
  "Favorites INSERT uses conflict protection and authenticated user parameter",
  async () => {
    const queries = [];

    const database = {
      async query(sql, params) {
        queries.push({ sql, params });
        return {
          rows: [{ track_exists: true }]
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    const result =
      await repository.addFavoriteForPrincipal(
        "101",
        3003
      );

    assert.deepEqual(
      result,
      { trackExists: true }
    );

    assert.equal(queries.length, 1);

    assert.deepEqual(
      queries[0].params,
      ["101", "3003"]
    );

    assert.match(
      queries[0].sql,
      /INSERT INTO favorites \(user_id, track_id\)/
    );

    assert.match(
      queries[0].sql,
      /ON CONFLICT \(user_id, track_id\) DO NOTHING/
    );

    assert.match(
      queries[0].sql,
      /WHERE id = \$2/
    );
  }
);

test(
  "Favorites INSERT detects missing tracks without inserting an association",
  async () => {
    const database = {
      async query() {
        return {
          rows: [{ track_exists: false }]
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    assert.deepEqual(
      await repository.addFavoriteForPrincipal(
        "101",
        9999
      ),
      { trackExists: false }
    );
  }
);

test(
  "Favorites DELETE scopes both user and track IDs",
  async () => {
    const queries = [];

    const database = {
      async query(sql, params) {
        queries.push({ sql, params });
        return {
          rows: [],
          rowCount: 0
        };
      }
    };

    const repository =
      createCatalogRepository(database);

    await repository.removeFavoriteForPrincipal(
      "101",
      3003
    );

    assert.equal(queries.length, 1);

    assert.deepEqual(
      queries[0].params,
      ["101", "3003"]
    );

    assert.match(
      queries[0].sql,
      /DELETE FROM favorites/
    );

    assert.match(
      queries[0].sql,
      /WHERE user_id = \$1 AND track_id = \$2/
    );
  }
);

test(
  "Favorites write operations reject malformed IDs before a database call",
  async () => {
    let calls = 0;

    const database = {
      async query() {
        calls++;
        return { rows: [] };
      }
    };

    const repository =
      createCatalogRepository(database);

    await assert.rejects(
      repository.addFavoriteForPrincipal(
        "invalid-user",
        3003
      ),
      TypeError
    );

    await assert.rejects(
      repository.addFavoriteForPrincipal(
        "101",
        -1
      ),
      TypeError
    );

    await assert.rejects(
      repository.removeFavoriteForPrincipal(
        "101",
        Number.MAX_SAFE_INTEGER + 1
      ),
      TypeError
    );

    assert.equal(calls, 0);
  }
);

test(
  "Catalog service forwards principal and validated track to Favorites repository",
  async () => {
    const calls = [];

    const service = createCatalogService({
      async listTracks() {
        return [];
      },

      async addFavoriteForPrincipal(userId, trackId) {
        calls.push([
          "PUT",
          userId,
          trackId
        ]);

        return { trackExists: true };
      },

      async removeFavoriteForPrincipal(userId, trackId) {
        calls.push([
          "DELETE",
          userId,
          trackId
        ]);
      }
    });

    assert.deepEqual(
      await service.addFavoriteForPrincipal(
        "101",
        3003
      ),
      { trackExists: true }
    );

    await service.removeFavoriteForPrincipal(
      "101",
      3003
    );

    assert.deepEqual(calls, [
      ["PUT", "101", 3003],
      ["DELETE", "101", 3003]
    ]);

    await assert.rejects(
      service.addFavoriteForPrincipal(
        "101",
        0
      ),
      TypeError
    );
  }
);