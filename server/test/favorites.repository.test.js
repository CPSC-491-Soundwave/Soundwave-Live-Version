
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIST_USER_FAVORITES_SQL,
  createFavoritesRepository
} from "../src/data/favorites.repository.js";

test("favorites query uses the correct user ID", async () => {
  const calls = [];

  const repository = createFavoritesRepository({
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [{ track_id: "3001" }]
      };
    }
  });

  const result = await repository.listForPrincipal("101");

  assert.equal(result.length, 1);
  assert.deepEqual(calls[0].params, ["101"]);
  assert.equal(calls[0].sql, LIST_USER_FAVORITES_SQL);
  assert.match(calls[0].sql, /WHERE f\.user_id = \$1/);
});

test("returns empty favorites when none exist", async () => {
  const repository = createFavoritesRepository({
    async query() {
      return { rows: [] };
    }
  });

  assert.deepEqual(
    await repository.listForPrincipal("102"),
    []
  );
});

test("rejects invalid user IDs", async () => {
  const repository = createFavoritesRepository({
    async query() {
      return { rows: [] };
    }
  });

  for (const invalidId of [
    null,
    undefined,
    "abc",
    "1 OR 1=1",
    -1,
    0,
    "9223372036854775808"
  ]) {
    await assert.rejects(
      () => repository.listForPrincipal(invalidId),
      TypeError
    );
  }
});

test("does not expose media paths in query", () => {
  assert.doesNotMatch(
    LIST_USER_FAVORITES_SQL,
    /media_path|storage_path|file_path/i
  );
});

test("propagates database failures", async () => {
  const repository = createFavoritesRepository({
    async query() {
      throw new Error("Database unavailable");
    }
  });

  await assert.rejects(
    () => repository.listForPrincipal("101"),
    /Database unavailable/
  );
});
