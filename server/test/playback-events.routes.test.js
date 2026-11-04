import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";

const tokenService = createTokenService("mchoi-playback-events-test-secret");

const UUID_A = "00000000-0000-4000-8000-000000000111";
const UUID_B = "00000000-0000-4000-8000-000000000222";
const TIMESTAMP = "2026-11-03T18:00:00.000Z";

function makeRepository() {
  const store = new Map();
  const calls = [];
  return {
    calls,
    async createForPrincipal(userId, input) {
      calls.push({method: "write", userId: String(userId), input});
      const key = `${userId}/${input.clientEventId}`;
      const existing = store.get(key);
      if (existing) {
        if (
          existing.trackId === input.trackId &&
          existing.eventType === input.eventType &&
          existing.occurredAt === input.occurredAt
        ) return {outcome: "replayed", event: existing};
        return {outcome: "conflict", event: null};
      }
      const event = {
        id: String(store.size + 1),
        clientEventId: input.clientEventId,
        trackId: input.trackId,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        receivedAt: "2026-11-03T18:00:01.000Z"
      };
      store.set(key, event);
      return {outcome: "created", event};
    },
    async listForPrincipal(userId, limit) {
      calls.push({method: "read", userId: String(userId), limit});
      return [...store.entries()]
        .filter(([key]) => key.startsWith(`${userId}/`))
        .map(([, value]) => value)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) ||
          Number(b.id) - Number(a.id))
        .slice(0, limit);
    }
  };
}

async function start(t, repository, revocations = new Set()) {
  const tokenRevocationRepository = {
    async isTokenRevoked(jti) { return revocations.has(jti); }
  };
  const server = createApp({
    tokenService, tokenRevocationRepository,
    playbackEventsRepository: repository
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return {base: `http://127.0.0.1:${server.address().port}`, revocations};
}

function payload(overrides = {}) {
  return {
    clientEventId: UUID_A,
    trackId: 3005,
    eventType: "play",
    occurredAt: TIMESTAMP,
    ...overrides
  };
}

async function post(base, token, data = payload()) {
  return fetch(`${base}/api/playback-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${token}`} : {}) },
    body: JSON.stringify(data)
  });
}

async function history(base, token, suffix = "") {
  return fetch(`${base}/api/playback-events${suffix}`, {
    headers: token ? {Authorization: `Bearer ${token}`} : {}
  });
}

test("CC6.1: missing credentials reject event writes and history without storage calls", async t => {
  const repository = makeRepository();
  const {base} = await start(t, repository);
  const write = await post(base, null);
  assert.equal(write.status, 401);
  assert.equal(write.headers.get("www-authenticate"), "Bearer");
  assert.equal((await history(base, null)).status, 401);
  assert.equal(repository.calls.length, 0);
});

test("CC6.1: invalid token rejects writes with no storage calls", async t => {
  const repository = makeRepository();
  const {base} = await start(t, repository);
  assert.equal((await post(base, "invalid.jwt.token")).status, 401);
  assert.equal(repository.calls.length, 0);
});

test("CC6.1: authenticated write takes owner from signed principal, not request", async t => {
  const repository = makeRepository();
  const {base} = await start(t, repository);
  const token = tokenService.create_token({id: 42, role: "user"});
  const response = await post(base, token);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).replayed, false);
  assert.equal(repository.calls[0].userId, "42");
  const ownHistory = await history(base, token);
  assert.equal(ownHistory.status, 200);
  assert.equal((await ownHistory.json()).events.length, 1);
});

test("CC6.1: forged userId in JSON is rejected without a database write", async t => {
  const repository = makeRepository();
  const {base} = await start(t, repository);
  const token = tokenService.create_token({id: 42, role: "user"});
  const forged = await post(base, token, payload({userId: "99"}));
  assert.equal(forged.status, 400);
  assert.equal(repository.calls.length, 0);
});

test("CC6.1: two users can only retrieve their own history", async t => {
  const repository = makeRepository();
  const {base} = await start(t, repository);
  const a = tokenService.create_token({id: 42, role: "user"});
  const b = tokenService.create_token({id: 99, role: "user"});
  assert.equal((await post(base, a)).status, 201);
  assert.equal((await post(base, b, payload({clientEventId: UUID_B}))).status, 201);
  const aHistory = (await (await history(base, a)).json()).events;
  const bHistory = (await (await history(base, b)).json()).events;
  assert.deepEqual(aHistory.map(e => e.clientEventId), [UUID_A]);
  assert.deepEqual(bHistory.map(e => e.clientEventId), [UUID_B]);
  assert.equal((await history(base, a, "?userId=99")).status, 400);
});

test("idempotency: identical request is acknowledged; changed request conflicts", async t => {
  const repository = makeRepository();
  const {base} = await start(t, repository);
  const token = tokenService.create_token({id: 42, role: "user"});
  assert.equal((await post(base, token)).status, 201);
  const replay = await post(base, token);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.equal((await post(base, token, payload({eventType: "pause"}))).status, 409);
  const events = (await (await history(base, token)).json()).events;
  assert.equal(events.length, 1);
});

test("CC6.1: revoked token cannot read or write after logout", async t => {
  const repository = makeRepository();
  const {base, revocations} = await start(t, repository);
  const token = tokenService.create_token({id: 42, role: "user"});
  const jti = tokenService.verify_token(token).jti;
  revocations.add(jti);
  assert.equal((await post(base, token)).status, 401);
  assert.equal((await history(base, token)).status, 401);
  assert.equal(repository.calls.length, 0);
});

test("CC6.1: revocation lookup outage fails closed before storage", async t => {
  const repository = makeRepository();
  const tokenRevocationRepository = {
    async isTokenRevoked() { throw new Error("simulated_auth_database_outage"); }
  };
  const server = createApp({tokenService, tokenRevocationRepository, playbackEventsRepository: repository});
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = tokenService.create_token({id: 42, role: "user"});
  assert.equal((await post(base, token)).status, 503);
  assert.equal((await history(base, token)).status, 503);
  assert.equal(repository.calls.length, 0);
});

test("invalid track ID and invalid timestamps are rejected before storage", async t => {
  const repository = makeRepository();
  const {base} = await start(t, repository);
  const token = tokenService.create_token({id: 42, role: "user"});
  assert.equal((await post(base, token, payload({trackId: "42 OR 1=1"}))).status, 400);
  assert.equal((await post(base, token, payload({occurredAt: "yesterday"}))).status, 400);
  assert.equal(repository.calls.length, 0);
});
