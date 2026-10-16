import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createTokenService } from "../src/auth/token.js";
import { createMediaTicketService } from "../src/media/media-ticket.js";

const LOGIN_SECRET = "cross-feature-login-signing-secret-for-tests";
const MEDIA_SECRET = "cross-feature-independent-media-secret-for-tests";

// CM-T31: This test intentionally spans the account and media boundaries.
// The individual feature suites already test these boundaries separately.
test("one logout revokes account access, media access, and its issued ticket", async t => {
  const revokedSessions = new Set();
  const tokenRevocationRepository = {
    async isTokenRevoked(jti) {
      return revokedSessions.has(jti);
    },
    async revokeToken({ jti }) {
      if (revokedSessions.has(jti)) {
        return false;
      }
      revokedSessions.add(jti);
      return true;
    }
  };

  const tokenService = createTokenService(LOGIN_SECRET);
  const mediaTicketService = createMediaTicketService({
    mediaSecret: MEDIA_SECRET,
    loginSecret: LOGIN_SECRET,
    secureCookies: false
  });

  const server = createApp({
    tokenService,
    tokenRevocationRepository,
    mediaTicketService,
    async findProfileByUserId(userId) {
      return {
        user_id: userId,
        username: "cross-route-user",
        role: "user",
        audio_quality_preference: null
      };
    },
    async findTrackById(trackId) {
      return trackId === 3005
        ? { track_id: 3005, media_path: "synthetic.mp3" }
        : null;
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const token = tokenService.create_token({ id: 42, role: "user" });
  const headers = { Authorization: `Bearer ${token}` };
  const mediaPath = "/api/tracks/3005/media-access";

  const accountBefore = await fetch(`${baseUrl}/auth/me`, { headers });
  assert.equal(accountBefore.status, 200, "account access before logout");

  const mediaBefore = await fetch(`${baseUrl}${mediaPath}`, {
    method: "POST",
    headers
  });
  assert.equal(mediaBefore.status, 204, "media access before logout");
  const cookieHeader = mediaBefore.headers.get("set-cookie");
  assert.ok(cookieHeader, "authorized media access must issue a ticket");
  const mediaCookie = cookieHeader.split(";")[0];

  const logout = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers
  });
  assert.equal(logout.status, 204, "logout succeeds");

  const accountAfter = await fetch(`${baseUrl}/auth/me`, { headers });
  assert.equal(accountAfter.status, 401, "revoked account access");
  assert.equal(accountAfter.headers.get("www-authenticate"), "Bearer");

  const mediaAfter = await fetch(`${baseUrl}${mediaPath}`, {
    method: "POST",
    headers
  });
  assert.equal(mediaAfter.status, 401, "revoked media access");
  assert.equal(mediaAfter.headers.get("set-cookie"), null,
    "a revoked session must not receive another media ticket");

  const streamAfter = await fetch(`${baseUrl}/api/tracks/3005/stream`, {
    headers: { Cookie: mediaCookie }
  });
  assert.equal(streamAfter.status, 401,
    "the earlier media ticket must not survive its source session's logout");
});
