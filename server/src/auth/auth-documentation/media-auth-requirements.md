# Media-Auth Integration Requirements

**Status:** Proposed Requirements  
*Note: This document defines constraints and requirements for future integration. It does not yet approve a final transport mechanism.*

## Purpose
This document exists to define the integration boundary between the authentication subsystem and the protected media delivery subsystem. The goal is to prevent integration mismatches by establishing a shared contract before final implementation begins. This document focuses exclusively on the auth/media boundary and authorization handoff; it does not dictate media playback implementation or audio processing.

## Scope
**What is included:**
* Authentication requirements for protected media delivery
* Authenticated principal handoff and contract
* HTTP Range-request compatibility constraints
* Expected failure behavior and status code alignment
* Credential-handling security constraints

**What is excluded:**
* Client playback controls and UI implementation
* File storage and transcoding mechanisms
* Underlying HTTP Range parsing logic
* Final token/session design (deferred)

## Current State (Sprint 1)
Currently in Sprint 1, the subsystems exist independently:
* **Auth:** Provides access-token validation and derives the trusted authenticated principal used by downstream handlers.
* **Media (Matthew's Spike):** The current media spike is not yet integrated with the authentication subsystem.
* **Client Shell (Konner's Spike):** Provides basic client scaffolding and UI.
* **Missing:** Linking an authenticated principal to the protected media endpoint

## Current Authentication Contract
A successfully authenticated request must yield a trusted internal principal object before media processing begins. 

* **Flow:** `Credential` → `Auth Validation` → `Authenticated Principal { userId, role }` → `Media Authorization`
* **Trust:** Downstream media code must only consume the trusted internal principal. It must **never** trust client-supplied identity fields (e.g., `userId` or `role` passed in a query parameter or payload).
* **Separation of Concerns:** Media handlers must not parse or validate JWTs themselves; they must consume the boundary object provided by the shared auth middleware.

## Media Request Constraints
Future media delivery must adhere to the following constraints:
* **Range Preservation:** Adding authentication must not prevent valid, supported HTTP Range requests from receiving the media endpoint’s expected partial-content behavior.
* **Partial Content:** Authenticated requests must still correctly return `206 Partial Content`.
* **Multiple Requests:** Playback involving multiple rapid/sequential Range requests must be supported.
* **Independent Auth:** Each protected media request must independently satisfy the selected authentication and authorization contract before protected bytes are served.
* **Mid-Stream Expiry:** The system must define clear behavior if a credential expires during active playback (e.g., between consecutive Range requests).

## Security Requirements
* Protected audio bytes must **never** be returned without successful authorization.
* Client-supplied identity assertions must not be trusted directly; all identity must be derived from validated credentials.
* Credentials MUST NOT appear in application logs.
* Credentials should not be placed in URLs unnecessarily to prevent leakage via browser history or referer headers.
* Expired, missing, or invalid credentials must immediately "fail closed."
* Authentication validation must complete successfully *before* any protected content is read or served.

## Failure Behavior
The system must provide predictable behavior (expected HTTP status codes and lack of media bytes) in the following scenarios:
* **No credential provided:** Reject request.
* **Malformed credential:** Reject request.
* **Expired credential:** Reject request.
* **Valid authentication but failed media authorization:** Reject the request.
* **Invalid/unsupported Range request:** Follow Matthew’s established Range-error contract after authentication succeeds.
* **Valid auth + valid Range request:** Serve `206 Partial Content`.
* **Credential expires between playback requests:** Client recovery behavior is deferred.

## Options Considered
*(No final selection has been made yet)*

### 1. Bearer Authorization Header
* **How it works:** The client attaches an `Authorization: Bearer <token>` header to the media request.
* **Advantage:** 
	* Aligns with your current API auth contract;
	* Doesn't require browser cookie state;
	* Avoids the main API credential being automatically attached by the browser.
* **Drawback:** Native media elements do not provide a straightforward API for setting arbitrary `Authorization` headers.
* **Client integration impact:** The client would need a playback request path capable of attaching an `Authorization` header.
* **Client Fit:** Challenging for native browser playback without custom JavaScript wrappers.
* **Arch Change:** Minimal changes to the current auth architecture.

### 2. Cookie-Based Authentication
* **How it works:** A browser-managed authentication/session credential is delivered using an `HttpOnly` cookie and automatically attached to eligible requests.
* **Advantage:** Browser-managed cookies may integrate more naturally with native media requests because the browser can attach eligible cookies automatically, subject to origin, SameSite, Secure, and CORS rules. 
* **Drawback:** Introduces CSRF risks; can complicate cross-origin (CORS) setups.
* **Implementation Required:** Cookie security attributes must be configured; cross-origin deployments would additionally require appropriate CORS configuration.
* **Client Fit:** Potentially well-suited to native browser media requests.
* **Architecture impact:** Changes how authentication credentials are transported and introduces browser cookie configuration and policy concerns.

### 3. Short-Lived Media-Specific Credential
* **How it works:** The client uses its main API token to request a short-lived media-specific credential or ticket, which is then used by the selected playback/media-request mechanism.
* **Advantage:** A narrowly scoped short-lived media credential may be easier to incorporate into a native playback URL, but its transport mechanism must avoid unnecessary credential leakage.
* **Drawback:** May introduce additional server-side state and/or signing, issuance, and validation logic.
* **Implementation Required:** New ticketing endpoint and validation middleware.
* **Client Fit:** Potentially compatible with native playback, depending on transport.
* **Arch Change:** Adds a new credential type and issuance flow to the architecture.

## Ownership / Integration Boundary
* **Emmanuel:** Owns the authentication contract and authenticated principal requirements.
* **Matthew:** Owns the protected-media implementation and future media credential integration (consuming the principal).
* **Konner:** Owns the client session and playback integration.
* **Shared:** The contract must be agreed upon before implementation. Auth-sensitive handlers (Matthew) will consume the agreed principal/session contract instead of reimplementing token parsing.

## Requirements

* **REQ-1:** Given a request for protected media without a credential, when the media endpoint is accessed, the system must reject the request and return no audio bytes.
* **REQ-2:** Given a request with a valid credential and a valid HTTP Range header, when the media endpoint processes the request, the system must return a `206 Partial Content` response with the correct byte range.
* **REQ-3:** Given a valid credential, when auth validation completes, the system must pass a structured principal object (containing at minimum `userId` and `role`) to the media handler.
* **REQ-4:** Given a client performing long playback via repeated Range requests, when a request is made with a credential that has just expired, the system must reject that specific request.
* **REQ-5:** Given an integration with the client, when requesting media, the system must not expose the primary access credential in the URL path or query string (e.g., neither `/media/<token>/song.mp3` nor `/media/song.mp3?token=<primary-access-token>`).
* **REQ-6:** If a media-specific credential is introduced, its transport mechanism must be evaluated for exposure through logs, browser history, referrer data, or copied URLs.
* **REQ-7:** The system must complete authentication and authorization before reading or returning protected media content.
* **REQ-8:** Authentication/media credentials MUST NOT be written to application logs.


## Deferred Decisions
The following decisions are explicitly excluded from Sprint 1 and will be finalized later:
* Selection between Bearer, Cookie, or Media-specific credentials.
* Final credential format (JWT vs. opaque credential).
* Credential storage location on the client.
* Refresh and revocation mechanisms.
* Specific UX handling for long-playback token expiration.
* Whether media access grants require database tracking/records.
* Final CORS, origin, and deployment configurations.

## Future Validation / Test Expectations
Eventually, the following scenarios must be covered by integration tests:
* Authenticated Range request succeeds and returns correct bytes.
* Unauthenticated protected Range request fails.
* Expired media credential fails.
* Forged/manipulated credential fails.
* Supported single-range semantics continue to function correctly after authentication is introduced.
* Adding authentication must not prevent valid supported Range requests from receiving the expected partial-content behavior.

## Open Integration Questions

For Matthew:
* What will the protected HTTP media interface eventually look like?
* What does the media layer need from auth?
* Does the chosen playback path impose any credential constraints?
* What authorization rule determines whether an authenticated principal may access a particular media resource?

For Konner:
* How will client authenticated state eventually expose credentials to playback?
* Will playback use a direct media URL or another abstraction?
* Are there constraints from the persistent player shell?