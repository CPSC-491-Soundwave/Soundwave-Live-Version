import test from "node:test";
import assert from "node:assert/strict";
import {
  createPlaybackEventsRepository,
  INSERT_PLAYBACK_EVENT_SQL,
  LIST_PLAYBACK_EVENTS_SQL
} from "../src/data/playback-events.repository.js";

const uuid = "00000000-0000-4000-8000-000000000111";
const time = "2026-11-03T18:00:00.000Z";
const receive = "2026-11-03T18:00:01.000Z";
const event = { clientEventId: uuid, trackId: "3005", eventType: "play", occurredAt: time };
const row = {
  id: "77", client_event_id: uuid, track_id: "3005", event_type: "play",
  occurred_at: new Date(time), received_at: new Date(receive)
};

test("insert uses authenticated principal ID, scoped conflict, and parameters", async () => {
  const calls = [];
  const db = { async query(sql, values) { calls.push({sql, values}); return {rows: [row]}; } };
  const repo = createPlaybackEventsRepository(db);
  const result = await repo.createForPrincipal("42", event);
  assert.equal(result.outcome, "created");
  assert.equal(result.event.trackId, "3005");
  assert.equal(result.event.receivedAt, receive);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql, INSERT_PLAYBACK_EVENT_SQL);
  assert.match(calls[0].sql, /ON CONFLICT \(user_id, client_event_id\) DO NOTHING/);
  assert.deepEqual(calls[0].values, ["42", uuid, "3005", "play", time]);
});

test("same logical event replays without inserting a second row", async () => {
  const calls = [];
  const db = {async query(sql, values) {
    calls.push({sql,values});
    return calls.length === 1 ? {rows: []} : {rows: [row]};
  }};
  const result = await createPlaybackEventsRepository(db).createForPrincipal("42", event);
  assert.equal(result.outcome, "replayed");
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /WHERE user_id = \$1 AND client_event_id = \$2::uuid/);
  assert.deepEqual(calls[1].values, ["42", uuid]);
});

test("reused UUID with different content is rejected", async () => {
  let calls = 0;
  const db = {async query() { return {rows: ++calls === 1 ? [] : [row]}; }};
  const result = await createPlaybackEventsRepository(db).createForPrincipal("42", {
    ...event, trackId: "3004"
  });
  assert.equal(result.outcome, "conflict");
});

test("history query always scopes and orders by principal", async () => {
  const calls = [];
  const db = {async query(sql, params) { calls.push({sql,params}); return {rows: [row]}; }};
  const result = await createPlaybackEventsRepository(db).listForPrincipal("57", 25);
  assert.equal(calls[0].sql, LIST_PLAYBACK_EVENTS_SQL);
  assert.deepEqual(calls[0].params, ["57", 25]);
  assert.match(calls[0].sql, /WHERE user_id = \$1/);
  assert.match(calls[0].sql, /ORDER BY occurred_at DESC, id DESC/);
  assert.equal(result.length, 1);
});

test("unsafe principal IDs and history limits cannot reach SQL", async () => {
  let queryCalls = 0;
  const repo = createPlaybackEventsRepository({query() { queryCalls++; return {rows: []}; }});
  await assert.rejects(() => repo.createForPrincipal("-5", event), TypeError);
  await assert.rejects(() => repo.listForPrincipal("42 OR 1=1"), TypeError);
  await assert.rejects(() => repo.listForPrincipal("42", 10000), TypeError);
  assert.equal(queryCalls, 0);
});
