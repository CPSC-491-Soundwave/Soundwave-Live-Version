import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createPlaybackEventsHandler } from "../src/playback/playback-events.handler.js";

const uuid = "00000000-0000-4000-8000-000000000111";
const body = {
  clientEventId: uuid,
  trackId: "3005",
  eventType: "play",
  occurredAt: "2026-11-03T18:00:00.000Z"
};

async function start(t, repository, auth = async (_req, _res) => ({userId: "42", role: "user"})) {
  const handler = createPlaybackEventsHandler({
    playbackEventsRepository: repository,
    authorizeRevocableRequest: auth,
    tokenService: {},
    tokenRevocationRepository: {}
  });
  const server = http.createServer(async (req, res) => {
    if (!await handler(req, res)) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

function post(url, payload, type = "application/json") {
  return fetch(`${url}/api/playback-events`, {
    method: "POST", headers: {"Content-Type": type}, body: JSON.stringify(payload)
  });
}

test("POST uses authenticated user, validates JSON, and acknowledges insert", async t => {
  const seen = [];
  const repository = {
    async createForPrincipal(userId, event) {
      seen.push({userId, event});
      return {outcome: "created", event: {id: "1", ...event}};
    },
    async listForPrincipal() { return []; }
  };
  const base = await start(t, repository);
  const result = await post(base, body);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).replayed, false);
  assert.equal(seen[0].userId, "42");
  assert.equal(seen[0].event.trackId, "3005");
});

test("unapproved body keys including forged userId never reach storage", async t => {
  let calls = 0;
  const repo = {
    async createForPrincipal() { calls++; },
    async listForPrincipal() { calls++; }
  };
  const base = await start(t, repo);
  assert.equal((await post(base, {...body, userId: "99"})).status, 400);
  assert.equal((await post(base, {...body, user_id: "99"})).status, 400);
  assert.equal((await post(base, {...body, trackId: -1})).status, 400);
  assert.equal((await post(base, {...body, occurredAt: "2026-11-03"})).status, 400);
  assert.equal((await post(base, body, "text/plain")).status, 415);
  assert.equal(calls, 0);
});

test("GET history uses user ID and validates query limit", async t => {
  const calls = [];
  const repo = {
    async createForPrincipal() {},
    async listForPrincipal(userId, limit) {calls.push({userId,limit}); return [];}
  };
  const base = await start(t, repo);
  const response = await fetch(`${base}/api/playback-events?limit=10`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {events: []});
  assert.deepEqual(calls, [{userId: "42", limit: 10}]);
  assert.equal((await fetch(`${base}/api/playback-events?userId=99`)).status, 400);
  assert.equal((await fetch(`${base}/api/playback-events?limit=1001`)).status, 400);
  assert.equal(calls.length, 1);
});

test("authorization denial halts before the repository", async t => {
  let calls = 0;
  const repo = {
    async createForPrincipal() {calls++;},
    async listForPrincipal() {calls++;}
  };
  const deniedAuth = async (_req, res) => {
    res.writeHead(401, {"WWW-Authenticate": "Bearer"});
    res.end();
    return null;
  };
  const base = await start(t, repo, deniedAuth);
  assert.equal((await post(base, body)).status, 401);
  assert.equal((await fetch(`${base}/api/playback-events`)).status, 401);
  assert.equal(calls, 0);
});

test("storage errors return 503 and track foreign key errors return 404", async t => {
  const repo = {
    async createForPrincipal() {const err = new Error("fk violation"); err.code = "23503"; err.constraint = "playback_events_track_id_fkey"; throw err;},
    async listForPrincipal() {throw new Error("database unavailable");}
  };
  const base = await start(t, repo);
  assert.equal((await post(base, body)).status, 404);
  assert.equal((await fetch(`${base}/api/playback-events`)).status, 503);
});

test("unknown route is not claimed by playback handler", async t => {
  const repo = {async createForPrincipal() {}, async listForPrincipal() {}};
  const base = await start(t, repo);
  assert.equal((await fetch(`${base}/health`)).status, 404);
});
