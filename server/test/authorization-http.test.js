import test from "node:test";
import assert from "node:assert/strict";

import {
  enforceRoleAccess
} from "../src/auth/authorization.js";

function createResponse() {
  return {
    status: null,
    headers: null,
    body: null,

    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },

    end(body) {
      this.body = body;
    }
  };
}

test("allowed role continues without writing a response", () => {
  const response = createResponse();

  const permitted = enforceRoleAccess(
    { userId: "1", role: "admin" },
    ["admin"],
    response
  );

  assert.equal(permitted, true);
  assert.equal(response.status, null);
});

test("missing authentication returns 401", () => {
  const response = createResponse();

  const permitted = enforceRoleAccess(
    null,
    ["admin"],
    response
  );

  assert.equal(permitted, false);
  assert.equal(response.status, 401);
  assert.equal(
    response.headers["WWW-Authenticate"],
    "Bearer"
  );
});

test("insufficient permissions return 403", () => {
  const response = createResponse();

  const permitted = enforceRoleAccess(
    { userId: "42", role: "user" },
    ["admin"],
    response
  );

  assert.equal(permitted, false);
  assert.equal(response.status, 403);
  assert.deepEqual(
    JSON.parse(response.body),
    { error: "forbidden" }
  );
});

test("invalid permission policy fails without granting access", () => {
  const response = createResponse();

  assert.throws(
    () => enforceRoleAccess(
      { userId: "1", role: "admin" },
      ["superadmin"],
      response
    ),
    TypeError
  );

  assert.equal(response.status, null);
});
