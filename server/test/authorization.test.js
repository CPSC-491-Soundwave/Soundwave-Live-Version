import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRoleAccess,
  write403Response
} from "../src/auth/authorization.js";

const regularUser = {
  userId: "42",
  role: "user"
};

const administrator = {
  userId: "7",
  role: "admin"
};

test("administrator can access admin-only policy", () => {
  assert.equal(
    evaluateRoleAccess(administrator, ["admin"]),
    "allowed"
  );
});

test("regular user is forbidden from admin-only policy", () => {
  assert.equal(
    evaluateRoleAccess(regularUser, ["admin"]),
    "forbidden"
  );
});

test("both roles can access shared permissions", () => {
  for (const principal of [
    regularUser,
    administrator
  ]) {
    assert.equal(
      evaluateRoleAccess(
        principal,
        ["user", "admin"]
      ),
      "allowed"
    );
  }
});

test("admin does not bypass explicitly user-only policy", () => {
  assert.equal(
    evaluateRoleAccess(administrator, ["user"]),
    "forbidden"
  );
});

test("missing and malformed principals are unauthenticated", () => {
  const invalidPrincipals = [
    null,
    undefined,
    {},
    { userId: "", role: "admin" },
    { userId: 42, role: "admin" },
    { userId: "42", role: "superadmin" },
    { userId: "42", role: "Admin" },
    { role: "admin" }
  ];

  for (const principal of invalidPrincipals) {
    assert.equal(
      evaluateRoleAccess(principal, ["admin"]),
      "unauthenticated"
    );
  }
});

test("unsupported authorization policies are rejected", () => {
  const invalidPolicies = [
    null,
    [],
    "admin",
    ["superadmin"],
    ["admin", "superadmin"]
  ];

  for (const policy of invalidPolicies) {
    assert.throws(
      () => evaluateRoleAccess(administrator, policy),
      TypeError
    );
  }
});

test("403 response uses the standard forbidden contract", () => {
  let status;
  let headers;
  let body;

  const response = {
    writeHead(code, values) {
      status = code;
      headers = values;
    },
    end(value) {
      body = value;
    }
  };

  write403Response(response);

  assert.equal(status, 403);
  assert.equal(
    headers["Cache-Control"],
    "no-store"
  );
  assert.deepEqual(
    JSON.parse(body),
    { error: "forbidden" }
  );
});

test("403 writer rejects missing response dependencies", () => {
  assert.throws(
    () => write403Response(null),
    TypeError
  );
});
