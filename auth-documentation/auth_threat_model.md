# Auth Threat Model

### Methodology
This threat model applies the **STRIDE** framework (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) against the provided authentication source code (`auth.js`, `login.js`, `me.js`, `token.js`, `hasher.js`).

---
### Scope
This threat model evaluates the Sprint 1 authentication spike and its current source-code controls. Database-backed identity, full session revocation, client token storage, rate limiting, and deployment-wide HTTP security controls are not yet implemented and are identified as deferred risks where applicable.

---
### 1. Spoofing (Impersonating a User)
*   **Threat A: Credential guessing/enumeration**
    *   *Timing Side-Channel Vulnerability:* Standardized response text prevents payload/status-code enumeration, but execution timing differences remain [login.js]. Requests for non-existent users return quickly after database lookup fails, whereas valid users trigger time-heavy Argon2 verification (`verify`) [login.js, hasher.js]. An attacker can measure response latency to enumerate valid usernames.
    
*   **Threat B: Stolen/replayed bearer token**
    *   *Mitigation in Code:* Tokens expire after 15 minutes (`expiresIn: '15m'`), limiting the replay window [token.js]. However, because the system does not maintain token revocation lists or single-use nonces (`jti`), a valid token intercepted within its 15-minute window can be replayed until expiration.

---

### 2. Tampering (Modifying Data or Tokens)
*   **Threat: JWT claim/header modification & Algorithm Confusion Attacks**
    *   *Mitigation in Code:* `verify_token` enforces algorithm restrictions via `{ algorithms: ['HS256'] }` [token.js].verify_token explicitly restricts accepted tokens to HS256, preventing tokens that specify an unexpected signing algorithm from being accepted. JWTs are cryptographically signed using a mandatory `secretKey` to prevent tampering with claims like `role` or `sub` [token.js].

---

### 3. Repudiation (Denying Performed Actions)
*   **Threat:** A user or attacker performs authentication actions or sensitive API requests and denies responsibility.
*   **Current Code Posture:** The implementation lacks structured audit logging for authentication events in `login.js` or verification failures in `auth.js`.
*   **Gap:** Without structured authentication-event logging, attribution and investigation of disputed authentication activity are limited. A future logging policy can decide exactly which metadata is appropriate while explicitly avoiding the logging of passwords, access tokens, JWT secrets, and other sensitive credentials.

---

### 4. Information Disclosure (Leaking Secrets or Data)
*   **Threat A: Token/identity response caching**
    *   *Mitigation in Code:* Endpoint handlers (`login.js`, `me.js`) include `Cache-Control: no-store` in HTTP headers [login.js, me.js]. This instructs standard-compliant browsers and intermediate proxies not to store response payloads containing access tokens or authenticated identity information on disk.
*   **Threat B: JWT signing-secret disclosure**
    *   *Mitigation & Gap:* `createTokenService` rejects missing or empty secrets [token.js], while AUTHCONFIG.md requires the signing secret to remain outside source control, client code, API responses, and logs. The current code does not enforce secret entropy; secret generation and deployment handling remain configuration responsibilities.
    
* **Threat C: Stored Password-Hash Disclosure**
    * **Threat:** If a future database containing password hashes is exposed,
      an attacker could perform offline password guessing against those hashes.
    * **Mitigation in Code:** Passwords are processed using Argon2id rather than
      stored as plaintext or with a fast general-purpose hash [hasher.js].
    * **Residual Risk:** Password hashing increases the cost of offline guessing
      but does not eliminate risk from weak passwords or a compromised database.	

---

### 5. Denial of Service (Exhausting Server Resources)
*   **Threat A: Memory Exhaustion via Large Payloads**
    *   *Mitigation in Code:* `readJsonBody` tracks the accumulated request size and rejects login bodies exceeding MAX_BODY_BYTES (16 KiB) with HTTP 413 [login.js]. This helps protect Node.js memory against oversized payload buffering.
*   **Threat B: CPU Exhaustion via Repeated Password Hashing**
    *   *Current Code Posture:* Argon2 is intentionally compute-intensive [hasher.js]. Without rate limiting on `/auth/login`, an attacker can send concurrent login requests to saturate server CPU cores.

---

### 6. Elevation of Privilege (Gaining Unauthorized Authority)
*   **Threat:** An attacker injects malformed role strings or modified identities to bypass privilege checks.
*   **Mitigation in Code:**
    *   `authenticateRequest` enforces explicit type validation (`typeof claims.role !== 'string'`) and strictly validates claims against `ALLOWED_ROLES` [auth.js].
    *   User identity validation requires `claims.sub` to be a non-empty string [auth.js] and `createTokenService` prevents issuing tokens for missing or blank user IDs [token.js].

---

### 7. Identified Residual Risks & Recommendations

1.  **Missing Rate Limiting (High Priority):**
    *   *Risk:* `/auth/login` lacks rate limiting, leaving the system exposed to brute-force attacks and CPU exhaustion from repeated Argon2 computations [login.js, hasher.js].
	    *   *Recommendation:* Later authentication hardening should evaluate application-level, account-level, and deployment-layer rate limiting. The implementation should limit repeated credential attempts and expensive Argon2 verification without exposing additional account-enumeration signals.
2.  **Timing Side-Channel on User Verification (Medium Priority):**
    *   *Risk:* Password verification is skipped if a user is not found, creating a measurable response time difference between existing and non-existing accounts [login.js, hasher.js].
    *   *Recommendation:* Perform a dummy Argon2 computation when `findUserByUsername` returns `null` to equalize execution time.
3.  **Client Token Storage and Transport — Deferred (Medium Priority):**
    *   *Risk:* The Sprint 1 backend issues bearer access tokens, but the final browser storage and transport strategy has not yet been integrated. Insecure client storage could expose a valid bearer token to theft and replay.
    *   *Current posture:* Access tokens expire after 15 minutes.
    *   *Deferred decision:* Final client session/token handling will be resolved during frontend/session integration. Long-lived bearer credentials should not be persisted in insecure browser storage.
4.  **Global Security Headers (Deployment Architecture Concern):**
    *   *Note:* Security headers such as HSTS, CSP, and X-Content-Type-Options should be addressed through the shared HTTP/deployment layer rather than independently duplicated across authentication handlers. The specific deployment mechanism remains a team integration decision.