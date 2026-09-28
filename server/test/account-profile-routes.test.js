import test from "node:test";
import assert from "node:assert/strict";

import {
  createApp
} from "../src/app.js";

import {
  createTokenService
} from "../src/auth/token.js";

async function startServer(
  t,
  options
) {
  const server =
    createApp(options);

  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      })
  );

  await new Promise((resolve) => {
    server.listen(
      0,
      "127.0.0.1",
      resolve
    );
  });

  const address =
    server.address();

  assert.ok(address);
  assert.equal(
    typeof address,
    "object"
  );

  return address.port;
}

test(
  "GET /account/profile returns authenticated user's profile",
  async (t) => {
    const tokenService =
      createTokenService(
        "test-only-account-profile-secret"
      );

    const accessToken =
      tokenService.create_token({
        id: 42,
        role: "user"
      });

    let requestedUserId;

    const findProfileByUserId =
      async (userId) => {
        requestedUserId = userId;

        return {
          user_id: "42",
          username:
            "profile-test-user",
          role: "user",
          audio_quality_preference:
            "test-quality",

          // Deliberately included in the fake
          // repository result to prove the HTTP
          // response does not expose it.
          password_hash:
            "must-not-be-exposed"
        };
      };

    const port =
      await startServer(
        t,
        {
          tokenService,
          findProfileByUserId
        }
      );

    const response =
      await fetch(
        `http://127.0.0.1:${port}/account/profile`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    assert.equal(
      response.status,
      200
    );

    assert.equal(
      requestedUserId,
      "42"
    );

    const body =
      await response.json();

    assert.deepEqual(
      body,
      {
        user: {
          id: "42",
          username:
            "profile-test-user",
          role: "user"
        },

        preferences: {
          audioQualityPreference:
            "test-quality"
        }
      }
    );

    assert.equal(
      "password_hash" in body,
      false
    );

    assert.equal(
      JSON.stringify(body).includes(
        "must-not-be-exposed"
      ),
      false
    );
  }
);

test(
  "GET /account/profile rejects an unauthenticated request",
  async (t) => {
    const tokenService =
      createTokenService(
        "test-only-account-profile-secret"
      );

    let repositoryCalled = false;

    const port =
      await startServer(
        t,
        {
          tokenService,

          findProfileByUserId:
            async () => {
              repositoryCalled = true;
              return null;
            }
        }
      );

    const response =
      await fetch(
        `http://127.0.0.1:${port}/account/profile`
      );

    assert.equal(
      response.status,
      401
    );

    assert.equal(
      repositoryCalled,
      false
    );
  }
);

test(
  "GET /account/profile rejects an invalid Bearer token",
  async (t) => {
    const tokenService =
      createTokenService(
        "test-only-account-profile-secret"
      );

    let repositoryCalled = false;

    const port =
      await startServer(
        t,
        {
          tokenService,

          findProfileByUserId:
            async () => {
              repositoryCalled = true;
              return null;
            }
        }
      );

    const response =
      await fetch(
        `http://127.0.0.1:${port}/account/profile`,
        {
          headers: {
            Authorization:
              "Bearer invalid-token"
          }
        }
      );

    assert.equal(
      response.status,
      401
    );

    assert.equal(
      repositoryCalled,
      false
    );
  }
);

test(
  "GET /account/profile returns 404 when authenticated user no longer exists",
  async (t) => {
    const tokenService =
      createTokenService(
        "test-only-account-profile-secret"
      );

    const accessToken =
      tokenService.create_token({
        id: 77,
        role: "user"
      });

    const port =
      await startServer(
        t,
        {
          tokenService,
          findProfileByUserId:
            async () => null
        }
      );

    const response =
      await fetch(
        `http://127.0.0.1:${port}/account/profile`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    assert.equal(
      response.status,
      404
    );

    assert.deepEqual(
      await response.json(),
      {
        error: "profile_not_found"
      }
    );
  }
);

test(
  "GET /account/profile rejects a mismatched repository profile",
  async (t) => {
    const tokenService =
      createTokenService(
        "test-only-account-profile-secret"
      );

    const accessToken =
      tokenService.create_token({
        id: 42,
        role: "user"
      });

    const port =
      await startServer(
        t,
        {
          tokenService,

          findProfileByUserId:
            async () => ({
              user_id: "999",
              username:
                "wrong-user",
              role: "user",
              audio_quality_preference:
                null
            })
        }
      );

    const response =
      await fetch(
        `http://127.0.0.1:${port}/account/profile`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    assert.equal(
      response.status,
      500
    );

    assert.deepEqual(
      await response.json(),
      {
        error: "internal_error"
      }
    );
  }
);

test(
  "GET /account/profile returns controlled 500 when repository lookup fails",
  async (t) => {
    const tokenService =
      createTokenService(
        "test-only-account-profile-secret"
      );

    const accessToken =
      tokenService.create_token({
        id: 42,
        role: "user"
      });

    const port =
      await startServer(
        t,
        {
          tokenService,

          findProfileByUserId:
            async () => {
              throw new Error(
                "simulated profile lookup failure"
              );
            }
        }
      );

    const response =
      await fetch(
        `http://127.0.0.1:${port}/account/profile`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    assert.equal(
      response.status,
      500
    );

    assert.deepEqual(
      await response.json(),
      {
        error: "internal_error"
      }
    );
  }
);
