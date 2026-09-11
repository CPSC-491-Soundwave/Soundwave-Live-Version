import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createApp } from "../src/app.js";

let server;
let baseUrl;

before(async () => {
  server = createApp();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test("GET /health returns status ok", async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/json/,
  );

  const body = await response.json();

  assert.deepEqual(body, {
    status: "ok",
  });
});

test("unknown route returns 404", async () => {
  const response = await fetch(`${baseUrl}/not-real`);

  assert.equal(response.status, 404);

  const body = await response.json();

  assert.deepEqual(body, {
    error: "not_found",
  });
});