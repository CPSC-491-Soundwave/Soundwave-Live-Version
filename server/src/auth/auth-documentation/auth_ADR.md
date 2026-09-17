# Architectural Decision Record (ADR)

## Title: Authentication, Access Tokens, and Credential Storage
**Status:** Proposed  
**Date:** September 7, 2026  

---

### 1. Context
The application requires a secure authentication subsystem to verify user identities, validate supported role claims, issue authentication tokens, and verify subsequent API requests while remaining resilient against common web security risks.

---

### 2. Decisions & Alternatives Considered

#### Decision 1: Use Argon2id for Password Hashing
*   **Decision:** Implement Argon2id via `argon2` for key derivation and password verification [hasher.js].
*   **Alternatives Considered:**
    *   *MD5 / SHA-256:* Rejected due to lack of computational cost controls, making hashes vulnerable to fast GPU/ASIC brute-force attacks.
    *   *bcrypt:* Mature and widely deployed password-hashing algorithm. Considered viable, but Argon2id was selected for its modern memory-hard design and configurable memory/time cost.
    *   *scrypt:* Memory-hard password-hashing alternative. Considered viable, but Argon2id was selected as the project's preferred modern memory-hard KDF.
*   **Rationale:** Argon2id offers memory-hard computational resistance, providing strong protection for stored credential hashes against offline attacks in the event of a database breach [hasher.js].

#### Decision 2: Short-Lived JWT Access Tokens for Authentication
*   **Decision:** Issue stateless JSON Web Tokens (JWTs) using HMAC-SHA256 (`HS256`) symmetric signing with a strict 15-minute expiration (`expiresIn: '15m'`)[token.js].
* **Current vs. Future Session State Architecture:**
    * **Current Sprint State:** Access tokens are verified statelessly, and the
      authenticated principal is derived from validated `sub` and `role` claims.
    * **Deferred/Future Direction:** The implementation plan recommends retaining
      short-lived access tokens while introducing server-tracked refresh/session
      state for revocation and lifecycle management. DB-backed identity lookup
      will also allow handlers such as `/auth/me` to resolve current user
      information rather than relying solely on token claims. This session design
      is not implemented in Sprint 1.

*   **Alternatives Considered:**
    * **Hybrid Access Token + Server-Tracked Session State:** Preserves short-lived
  JWT validation while adding server-side lifecycle and revocation control.
  This is the recommended future direction but is outside the Sprint 1
  implementation.
  
*   **Rationale:** Short-lived signed JWTs allow the server to authenticate requests and validate token claims without requiring a database lookup solely to verify each access token.

#### Decision 3: Validate Supported Role Claims Using an Explicit Allowlist
*   **Decision:** Maintain an explicit, immutable set (`ALLOWED_ROLES`) restricted to `'user'` and `'admin'`[auth.js, token.js].
*   **Alternatives Considered:**
    *   *Dynamic Database Roles / ABAC:* Unnecessary complexity for the current requirements and higher risk of privilege escalation if roles are weakly validated.
*   **Rationale:** Validating role strings against a fixed whitelist during both token generation (`token.js`)[token.js] and request authentication (`auth.js`)[auth.js] prevents unsupported role values from being accepted as valid authenticated claims.

#### Decision 4: Bound Login Request Bodies to 16 KB
*   **Decision:** Implement an asynchronous stream reader (`readJsonBody`) enforcing a 16KB limit (`MAX_BODY_BYTES = 16 * 1024`) on `/auth/login`[login.js].
*   **Alternatives Considered:**
    *   *Standard Framework Middleware (e.g., express.json):* Standard body parsers buffer entire payloads in memory before processing unless pre-configured with strict payload limits.
*   **Rationale:** Tracking incoming body size and rejecting requests that exceed 16 KiB bounds the amount of login-request data intentionally accumulated for parsing and reduces the risk of oversized-request memory consumption.

---

### 3. Consequences

*   **Positive:**
    *   Strong memory-hard password protection using Argon2id [hasher.js].
    *   Reduced per-request database overhead via stateless token signature verification[auth.js, me.js].
    *   Reduced risk of large-payload memory exhaustion on the login route [login.js].
*   **Negative:**
    *   Stateless tokens cannot be revoked before their 15-minute expiration without implementing a centralized blocklist [token.js].
    *   Argon2 requires native binary dependencies, slightly increasing build complexity [hasher.js].
    *  HMAC signing key (secretKey) security is critical; compromise could allow forged access tokens to be created. Rotating the signing key after compromise would invalidate tokens signed with the previous key.