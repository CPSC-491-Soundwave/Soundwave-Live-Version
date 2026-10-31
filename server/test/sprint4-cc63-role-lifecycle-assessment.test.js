/**
 * SCRUM-308 / B1: CC6.3 role-policy and old-token characterization.
 *
 * All HTTP paths here are TEST-ONLY guards, not production admin routes.
 * The roleState Map is a simulated durable-role fixture, NOT PostgreSQL.
 * The old-token test characterizes current middleware behavior; an observed
 * HTTP 200 after demotion is a CC6.3 gap under an immediate-removal policy,
 * not a security PASS or proof that a production admin endpoint is exposed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createTokenService } from "../src/auth/token.js";
import { authorizeRevocableRequest } from "../src/auth/request-authorization.js";

const tokenService = createTokenService("s4-cc63-isolated-test-secret");

async function createHarness(t) {
  const roleState = new Map([["731", "admin"]]);
  const revoked = new Set();
  let outage = false;
  const repository = {
    async isTokenRevoked(jti) {
      if (outage) throw new Error("isolated_revocation_lookup_outage");
      return revoked.has(jti);
    }
  };
  const server = http.createServer(async (request, response) => {
    const allowedRoles = request.url === "/admin-only" ? ["admin"] : ["user"];
    const principal = await authorizeRevocableRequest(request, response, {
      tokenService,
      tokenRevocationRepository: repository,
      allowedRoles
    });
    if (!principal) return;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ userId: principal.userId, role: principal.role }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeIdleConnections?.();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, token, headers = {}) {
    return fetch(base + path, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    });
  }
  return {
    roleState, revoked, request,
    setOutage(value) { outage = value; }
  };
}

test("SCRUM-308 CC6.3 policy matrix and role-change characterization", async t => {
  const harness = await createHarness(t);
  const oldAdmin = tokenService.create_token({ id: 731, role: "admin" });
  const user = tokenService.create_token({ id: 732, role: "user" });
  const adminClaims = tokenService.verify_token(oldAdmin);

  const cases = [
    ["CM-01 no session denied", "/admin-only", null, {}, 401],
    ["CM-02 signed user denied by admin policy", "/admin-only", user, {}, 403],
    ["CM-03 signed admin allowed by admin policy", "/admin-only", oldAdmin, {}, 200],
    ["CM-04 admin not allowed by explicit user-only policy", "/user-only", oldAdmin, {}, 403],
    ["CM-05 signed user allowed by user-only policy", "/user-only", user, {}, 200],
    ["CM-06 X-Role spoof cannot escalate user", "/admin-only", user, { "X-Role": "admin" }, 403],
    ["CM-07 X-User-Id spoof cannot escalate user", "/admin-only", user, { "X-User-Id": "731" }, 403]
  ];
  for (const [name, path, token, headers, expected] of cases) {
    await t.test(name, async () => {
      const response = await harness.request(path, token, headers);
      assert.equal(response.status, expected);
    });
  }

  await t.test("CM-08 revoked privileged token denied", async () => {
    harness.revoked.add(adminClaims.jti);
    const response = await harness.request("/admin-only", oldAdmin);
    assert.equal(response.status, 401);
    harness.revoked.delete(adminClaims.jti);
  });

  await t.test("CM-09 revocation dependency outage fails closed", async () => {
    harness.setOutage(true);
    try {
      const response = await harness.request("/admin-only", oldAdmin);
      assert.equal(response.status, 503);
    } finally {
      harness.setOutage(false);
    }
  });

  await t.test("CM-10 role demotion: measure old signed admin JWT behavior", async t2 => {
    assert.equal(harness.roleState.get("731"), "admin");
    const before = await harness.request("/admin-only", oldAdmin);
    assert.equal(before.status, 200);

    // An isolated model of a durable-role change; no PostgreSQL UPDATE occurs.
    harness.roleState.set("731", "user");
    const after = await harness.request("/admin-only", oldAdmin);
    const currentRole = harness.roleState.get("731");
    assert.equal(currentRole, "user");
    assert.ok([200, 401, 403, 503].includes(after.status));
    t2.diagnostic(`currentRole=${currentRole}; oldAdminTokenStatus=${after.status}; simulated role fixture, not production DB`);
    if (after.status === 200) {
      t2.diagnostic("ASSESSMENT GAP under immediate privilege-removal policy: old signed admin token still allowed by test-only guard. Not a compliance PASS.");
    } else {
      t2.diagnostic("Old token denied or unavailable; investigate exact enforcement mechanism before concluding PASS.");
    }
  });

  await t.test("CM-11 newly issued user JWT after downgrade is forbidden", async () => {
    assert.equal(harness.roleState.get("731"), "user");
    const newToken = tokenService.create_token({ id: 731, role: "user" });
    const response = await harness.request("/admin-only", newToken);
    assert.equal(response.status, 403);
  });
});
