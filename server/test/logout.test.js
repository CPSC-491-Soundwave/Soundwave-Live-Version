import test from "node:test";
import assert from "node:assert/strict";

import {
  handleLogout
} from "../src/auth/logout.js";

const JTI =
  "123e4567-e89b-42d3-a456-426614174000";

function claims() {
  return {
    sub: "42",
    role: "user",
    jti: JTI,
    exp: Math.floor(Date.now() / 1000) + 3600
  };
}

function request(
  authorization = "Bearer signed-token"
) {
  return {
    headers: { authorization }
  };
}

function response() {
  return {
    statusCode: null,
    headers: null,
    body: null,

    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },

    end(body) {
      this.body = body;
    }
  };
}

function service(tokenClaims = claims()) {
  return {
    verify_token() {
      return tokenClaims;
    }
  };
}

test("valid logout revokes the current token and returns 204", async () => {
  const revokedRecords = [];

  const repository = {
    async isTokenRevoked() {
      return false;
    },

    async revokeToken(record) {
      revokedRecords.push(record);
      return true;
    }
  };

  const res = response();
  const tokenClaims = claims();

  await handleLogout(request(), res, {
    tokenService: service(tokenClaims),
    tokenRevocationRepository: repository
  });

  assert.equal(res.statusCode, 204);
  assert.equal(res.body, undefined);
  assert.equal(res.headers["Cache-Control"], "no-store");

  assert.equal(revokedRecords.length, 1);
  assert.equal(revokedRecords[0].jti, JTI);
  assert.equal(revokedRecords[0].userId, "42");

  assert.equal(
    revokedRecords[0].expiresAt.getTime(),
    tokenClaims.exp * 1000
  );
});

test("logout without a Bearer token returns 401", async () => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("Should not query database");
    },

    async revokeToken() {
      throw new Error("Should not revoke token");
    }
  };

  const res = response();

  await handleLogout(
    { headers: {} },
    res,
    {
      tokenService: service(),
      tokenRevocationRepository: repository
    }
  );

  assert.equal(res.statusCode, 401);
  assert.equal(
    res.headers["WWW-Authenticate"],
    "Bearer"
  );
});

test("already-revoked tokens cannot log out again", async () => {
  let inserted = false;

  const repository = {
    async isTokenRevoked() {
      return true;
    },

    async revokeToken() {
      inserted = true;
      return true;
    }
  };

  const res = response();

  await handleLogout(request(), res, {
    tokenService: service(),
    tokenRevocationRepository: repository
  });

  assert.equal(res.statusCode, 401);
  assert.equal(inserted, false);
});

test("legacy JWT without jti is rejected", async () => {
  const legacyClaims = {
    sub: "42",
    role: "user",
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const repository = {
    async isTokenRevoked() {
      throw new Error("Should not query database");
    },

    async revokeToken() {
      throw new Error("Should not revoke token");
    }
  };

  const res = response();

  await handleLogout(request(), res, {
    tokenService: service(legacyClaims),
    tokenRevocationRepository: repository
  });

  assert.equal(res.statusCode, 401);
});

test("revocation lookup failure propagates", async () => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("database_unavailable");
    },

    async revokeToken() {
      throw new Error("Should not insert");
    }
  };

  await assert.rejects(
    handleLogout(request(), response(), {
      tokenService: service(),
      tokenRevocationRepository: repository
    }),
    /database_unavailable/
  );
});

test("revocation insertion failure propagates", async () => {
  const repository = {
    async isTokenRevoked() {
      return false;
    },

    async revokeToken() {
      throw new Error("database_write_failed");
    }
  };

  await assert.rejects(
    handleLogout(request(), response(), {
      tokenService: service(),
      tokenRevocationRepository: repository
    }),
    /database_write_failed/
  );
});

test("concurrent duplicate insertion can return 204", async () => {
  const repository = {
    async isTokenRevoked() {
      return false;
    },

    async revokeToken() {
      return false;
    }
  };

  const res = response();

  await handleLogout(request(), res, {
    tokenService: service(),
    tokenRevocationRepository: repository
  });

  assert.equal(res.statusCode, 204);
});

test("missing repository dependencies fail closed", async () => {
  await assert.rejects(
    handleLogout(request(), response(), {
      tokenService: service()
    }),
    TypeError
  );
});
