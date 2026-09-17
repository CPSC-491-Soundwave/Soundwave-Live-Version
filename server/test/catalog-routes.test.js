import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createCatalogService } from "../src/catalog/catalog.service.js";
import { createCatalogHandler } from "../src/catalog/catalog.handler.js";

const expectedTracks = [
  {
    id: 3001,
    title: "Fixture Track One",
    durationMs: 180000,
    album: {
      id: 2001,
      title: "Fixture Album Alpha",
    },
    artist: {
      id: 1001,
      name: "Fixture Artist One",
    },
  },
];

function createSuccessfulRepository() {
  return {
    async listTracks() {
      return [
        {
          track_id: "3001",
          track_title: "Fixture Track One",
          duration_ms: 180000,
          album_id: "2001",
          album_title: "Fixture Album Alpha",
          artist_id: "1001",
          artist_name: "Fixture Artist One",
        },
      ];
    },
  };
}

function createFailingRepository() {
  return {
    async listTracks() {
      throw new Error("simulated catalog failure");
    },
  };
}

function createCatalogTestApp(repository) {
  const catalogService = createCatalogService(repository);

  const handleCatalogRequest = createCatalogHandler(catalogService);

  return createApp({
    handleCatalogRequest,
  });
}

test(
  "GET /api/catalog/tracks returns the catalog HTTP contract",
  async (t) => {
    const repository = createSuccessfulRepository();

    const server = createCatalogTestApp(repository);

    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    );

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    assert.ok(address);
    assert.equal(typeof address, "object");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/catalog/tracks`,
    );

    assert.equal(response.status, 200);

    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/json/,
    );

    const body = await response.json();

    assert.deepEqual(body, expectedTracks);
  },
);

test(
  "GET /api/catalog/tracks returns 500 when catalog retrieval fails",
  async (t) => {
    const repository = createFailingRepository();

    const server = createCatalogTestApp(repository);

    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    );

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    assert.ok(address);
    assert.equal(typeof address, "object");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/catalog/tracks`,
    );

    assert.equal(response.status, 500);

    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/json/,
    );

    const body = await response.json();

    assert.deepEqual(body, {
      error: "catalog_unavailable",
    });
  },
);

test(
  "catalog integration does not consume unrelated routes",
  async (t) => {
    const repository = createSuccessfulRepository();

    const server = createCatalogTestApp(repository);

    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    );

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    assert.ok(address);
    assert.equal(typeof address, "object");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/not-a-catalog-route`,
    );

    assert.equal(response.status, 404);

    const body = await response.json();

    assert.deepEqual(body, {
      error: "not_found",
    });
  },
);