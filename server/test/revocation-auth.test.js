import test from "node:test";
import assert from "node:assert/strict";

import {
  authenticateRequestWithRevocation
} from "../src/auth/revocation-auth.js";

const JTI = "123e4567-e89b-42d3-a456-426614174000";

function validClaims() {
  return {
    sub: "42",
    role: "user",
    jti: JTI,
    exp: Math.floor(Date.now() / 1000) + 3600
  };
}

function request(header = "Bearer signed-token") {
  return {
    headers: {
      authorization: header
    }
  };
}

function tokenService(claims = validClaims()) {
  return {
    verify_token() {
      return claims;
    }
  };
}

test("accepts a valid, nonrevoked token", async () => {
  const lookedUp = [];

  const repository = {
    async isTokenRevoked(jti) {
      lookedUp.push(jti);
      return false;
    }
  };

  const principal =
    await authenticateRequestWithRevocation(
      request(),
      tokenService(),
      repository
    );

  assert.deepEqual(principal, {
    userId: "42",
    role: "user",
    jti: JTI,
    exp: principal.exp
  });

  assert.deepEqual(lookedUp, [JTI]);
});

test("rejects a revoked token", async () => {
  const repository = {
    async isTokenRevoked() {
      return true;
    }
  };

  const principal =
    await authenticateRequestWithRevocation(
      request(),
      tokenService(),
      repository
    );

  assert.equal(principal, null);
});

test("rejects missing or invalid Bearer headers", async () => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("Lookup must not run");
    }
  };

  const headers = [
    undefined,
    "",
    "Basic abc",
    "Bearer",
    "Bearer token extra"
  ];

  for (const header of headers) {
    const req = header === undefined
      ? { headers: {} }
      : request(header);

    const principal =
      await authenticateRequestWithRevocation(
        req,
        tokenService(),
        repository
      );

    assert.equal(principal, null);
  }
});

test("rejects malformed claims before querying database", async () => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("Lookup must not run");
    }
  };

  const malformedClaims = [
    null,
    { ...validClaims(), sub: "" },
    { ...validClaims(), role: "superadmin" },
    { ...validClaims(), jti: undefined },
    { ...validClaims(), jti: "invalid" },
    { ...validClaims(), exp: undefined },
    { ...validClaims(), exp: 0 }
  ];

  for (const claims of malformedClaims) {
    const principal =
      await authenticateRequestWithRevocation(
        request(),
        tokenService(claims),
        repository
      );

    assert.equal(principal, null);
  }
});

test("rejects expired token claims", async () => {
  const expired = {
    ...validClaims(),
    exp: Math.floor(Date.now() / 1000) - 60
  };

  const repository = {
    async isTokenRevoked() {
      throw new Error("Lookup must not run");
    }
  };

  assert.equal(
    await authenticateRequestWithRevocation(
      request(),
      tokenService(expired),
      repository
    ),
    null
  );
});

test("rejects JWT verification failures", async () => {
  const service = {
    verify_token() {
      throw new Error("invalid signature");
    }
  };

  const repository = {
    async isTokenRevoked() {
      throw new Error("Lookup must not run");
    }
  };

  assert.equal(
    await authenticateRequestWithRevocation(
      request(),
      service,
      repository
    ),
    null
  );
});

test("propagates revocation database failures", async () => {
  const repository = {
    async isTokenRevoked() {
      throw new Error("database_unavailable");
    }
  };

  await assert.rejects(
    authenticateRequestWithRevocation(
      request(),
      tokenService(),
      repository
    ),
    /database_unavailable/
  );
});

test("rejects malformed revocation lookup results", async () => {
  const repository = {
    async isTokenRevoked() {
      return undefined;
    }
  };

  await assert.rejects(
    authenticateRequestWithRevocation(
      request(),
      tokenService(),
      repository
    ),
    /must return a boolean/
  );
});

test("rejects missing authentication dependencies", async () => {
  await assert.rejects(
    authenticateRequestWithRevocation(
      request(),
      null,
      { isTokenRevoked: async () => false }
    ),
    TypeError
  );

  await assert.rejects(
    authenticateRequestWithRevocation(
      request(),
      tokenService(),
      null
    ),
    TypeError
  );
});
