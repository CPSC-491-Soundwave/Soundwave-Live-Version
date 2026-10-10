# Search-to-Play Integration Contract

## Purpose

This document defines the integration boundary between Soundwave catalog Search, shared client playback state, authentication/session state, Track metadata, and protected media playback.

The goal is to document the interfaces that already exist, identify the missing authenticated-media handoff, and define the producer/consumer responsibilities required before status-specific playback authorization behavior can be implemented.

This contract does not introduce a new Search backend, playback system, authentication mechanism, or media authorization strategy.

---

# 1. Current Working Search-to-Play Path

The current successful application flow is:

    GET /api/search
        ↓
    Search Track result
        ↓
    Play action
        ↓
    onSelectTrack(track.id)
        ↓
    App.jsx selectedTrackId
        ↓
    PlaybackBar
        ↓
    GET /api/catalog/tracks/:id
        ↓
    loadTrack(track.id, { onError })
        ↓
    Howler
        ↓
    GET /api/tracks/:id/stream

The current happy path has been implemented and manually verified using the seeded `Kontekst` Track.

---

# 2. Canonical Track Identity

The cross-feature Track identity is:

    tracks.id

Search results expose the stable catalog Track ID.

Example:

    {
      "id": 3005,
      "title": "Kontekst"
    }

The client forwards the Track ID through the existing playback seam:

    Search
        ↓
    onSelectTrack(track.id)
        ↓
    App.jsx
        ↓
    selectedTrackId
        ↓
    PlaybackBar

The client must not use internal media paths as Track identity.

The following must remain backend implementation details:

- `media_path`
- local filesystem paths
- storage keys
- internal media filenames
- other storage-specific identifiers

---

# 3. Search Contract

Current endpoint:

    GET /api/search?q=<query>&type=<type>

Supported type values:

    all
    track
    artist
    album

Search provides catalog discovery only.

The Search response provides stable public catalog identity and metadata.

Track Search results may be selected for playback using:

    onSelectTrack(track.id)

Search does not directly:

- resolve physical media paths;
- load audio;
- create Howler instances;
- implement authentication;
- authorize media access;
- query PostgreSQL directly.

---

# 4. Application Selection Contract

`App.jsx` currently owns the shared Track-selection state:

    selectedTrackId

Search receives:

    onSelectTrack={setSelectedTrackId}

The shared PlaybackBar receives:

    trackId={selectedTrackId}

This provides one common selection path for playback-capable client features.

Features should reuse this state rather than create competing players or separate Track-selection identities.

---

# 5. Current Session State

The client currently stores the authenticated access token in `App.jsx`:

    accessToken

The current application passes that token to authenticated features including:

    Library
    Profile

The current PlaybackBar receives:

    trackId

It does not currently receive:

    accessToken

or another media-specific credential.

Therefore there is currently no authenticated credential handoff between application session state and playback.

---

# 6. Track Metadata Contract

PlaybackBar currently retrieves selected Track metadata through:

    GET /api/catalog/tracks/:id

Example:

    GET /api/catalog/tracks/3005

The response provides public catalog metadata such as:

    id
    title
    durationMs
    album
    artist

The response must not expose physical media paths.

Current Track metadata retrieval is separate from the media-stream request.

---

# 7. Playback Module Contract

The playback module currently exposes:

    loadTrack(trackId, { onError })

The stable Track ID is used to construct the media URL:

    /api/tracks/:id/stream

The playback module uses Howler for audio playback.

The current error callback allows media load or playback failures to be reported back to the React client.

Current controlled failure flow:

    Howler media load/play failure
        ↓
    playback.js
        ↓
    onError(...)
        ↓
    PlaybackBar
        ↓
    unload failed playback
        ↓
    reset playing state
        ↓
    display controlled playback error

This allows generic playback failures to be surfaced instead of remaining console-only failures.

---

# 8. Current Media Route

Current media endpoint:

    GET /api/tracks/:id/stream

The route currently:

1. receives the stable Track ID;
2. retrieves the Track through the catalog repository;
3. resolves the internal media resource;
4. streams the media;
5. supports HTTP Range behavior.

Current automated media behavior includes:

    full-file request       -> 200
    valid byte range        -> 206
    invalid byte range      -> 416
    unknown Track           -> 404
    missing media resource  -> 404

At the time this contract was written, the current merged media route does not yet provide the final protected-media authentication boundary consumed by the client.

The client therefore cannot truthfully interpret media playback failures as authentication `401` or authorization `403` failures yet.

---

# 9. Missing Authenticated Media Handoff

The unresolved integration boundary is:

    authenticated client session
        ↓
    media credential handoff
        ↓
    protected media request
        ↓
    server authentication
        ↓
    media authorization
        ↓
    playback result
        ↓
    client failure UX

The current implementation does not yet define the complete path between:

    App.jsx accessToken

and:

    GET /api/tracks/:id/stream

This interface must be established before the client can correctly distinguish expired authentication from other playback failures.

---

# 10. Credential Transport Alternatives

The final protected-media credential transport has not been selected by this integration contract.

The implementation must consume the transport selected by the authentication, media, and shared client-session owners.

## Alternative A — Bearer Authorization Header

Concept:

    GET /api/tracks/:id/stream
    Authorization: Bearer <access-token>

### Advantages

- Reuses the existing JWT access-token model.
- Keeps authentication explicit.
- Matches existing authenticated API requests.

### Tradeoffs

- The playback layer must support attaching an Authorization header to the media request.
- Native media request behavior may require additional client integration.
- The exact Howler/HTML5 transport behavior must be verified before adoption.

---

## Alternative B — Cookie-Based Session Credential

Concept:

    Browser
        ↓
    authenticated cookie
        ↓
    media request

### Advantages

- Browser credential transport may occur automatically.
- Media requests do not require explicit Bearer-header handling in each playback call.

### Tradeoffs

- Changes the current client/session architecture more broadly.
- Requires cookie security policy decisions.
- May require changes outside the Search-to-Play consumer boundary.

---

## Alternative C — Short-Lived Media Credential

Concept:

    authenticated application session
        ↓
    request media credential
        ↓
    short-lived media access
        ↓
    protected stream request

### Advantages

- Separates general application authentication from media access.
- Limits the lifetime and scope of credentials used for streaming.

### Tradeoffs

- Requires credential issuance and expiration behavior.
- Adds another lifecycle to manage.
- Requires an additional producer-side contract before the client can consume it.

---

# 11. Integration Recommendation

This contract does not select the credential transport.

The Search-to-Play consumer should use the credential mechanism established by the merged authentication, media, and shared-session implementations.

The client should not independently invent a competing credential transport.

Once that contract exists, the existing playback error callback should be extended to expose enough information for the UI to distinguish authorization failures from generic playback failures.

---

# 12. Required Protected-Media Response Semantics

The final producer contract should define the behavior for at least the following cases.

## Successful request

Expected behavior:

    authorized full request
        -> 200

or:

    authorized Range request
        -> 206

Authentication must not break supported HTTP Range behavior.

---

## Invalid or expired authentication

Expected semantic requirement:

    invalid / expired authentication
        -> authentication failure

If the chosen HTTP contract uses status `401`, the playback consumer can map that response to session-expired or login-required behavior.

The exact response must come from the merged server contract rather than being invented by the client.

---

## Authenticated but unauthorized media access

If the final authorization model distinguishes authenticated identity from media permission, the producer contract should expose a separate authorization-denied result.

If the selected HTTP contract uses status `403`, the client may display an authorization-specific playback message without incorrectly clearing a valid session.

The client must not assume `403` exists unless the server actually defines that behavior.

---

## Generic media failure

Non-authentication media failures should remain distinguishable from session failures.

Examples include:

- unavailable media;
- unsupported media;
- network failure;
- interrupted playback;
- other media loading errors.

These should continue to use the generic controlled playback-error path.

---

# 13. Client Failure Behavior

The client should ultimately distinguish three categories.

## Authentication failure

Conceptual behavior:

    authentication invalid / expired
        ↓
    playback stops
        ↓
    failed media unloads
        ↓
    session-related feedback is shown
        ↓
    shared session recovery/login behavior is used

The client should reuse the shared session contract rather than create another authentication state manager.

---

## Authorization failure

Conceptual behavior:

    authenticated user
        ↓
    media access denied
        ↓
    playback stops
        ↓
    controlled authorization message

An authorization denial must not automatically be treated as an expired session.

---

## Generic playback failure

Current implemented behavior:

    media failure
        ↓
    onError callback
        ↓
    unloadMusic()
        ↓
    isPlaying = false
        ↓
    Playback unavailable
        ↓
    Unable to play this track.

This behavior provides the fallback path when the failure is not identified as an authentication or authorization condition.

---

# 14. Producer / Consumer Ownership

## Christian McGowan — Authentication Producer

Responsible for the core authentication/session enforcement contract, including the authentication behavior that downstream protected routes consume.

The Search-to-Play consumer should reuse that contract rather than implementing separate token validation.

---

## Matthew Choi — Protected Media Producer

Responsible for the protected-media access implementation and media credential contract.

The Search-to-Play consumer should use Matthew's protected media interface rather than introduce a second streaming or media-authorization implementation.

---

## Konner Rigby — Shared Client Session Integration

Responsible for shared client session/login integration and related session behavior.

The Search-to-Play consumer should reuse the shared client-session interface when responding to invalid or expired authentication.

---

## Emmanuel De Guzman — Search-to-Play Consumer

Responsible for integrating Search selection with playback and consuming the authentication/media/session contracts.

Emmanuel's consumer responsibilities include:

- forwarding stable Track identity;
- initiating playback through the shared playback path;
- exposing controlled playback failure UX;
- handling authentication/authorization failure states once the producer contracts expose them;
- adding integration and regression coverage;
- verifying the complete Search-to-Play path.

Emmanuel does not own the core authentication hardening or protected-media authorization implementation for this integration.

---

# 15. Existing Verified Behavior

The following Search-to-Play behavior has already been verified:

    Search "Kontekst"
        ↓
    Track 3005 returned
        ↓
    select Play
        ↓
    selectedTrackId = 3005
        ↓
    PlaybackBar receives Track 3005
        ↓
    GET /api/catalog/tracks/3005
        ↓
    metadata displayed
        ↓
    loadTrack(3005, { onError })
        ↓
    media requested
        ↓
    audio playback succeeds

The following generic failure behavior has also been implemented:

    playback media failure
        ↓
    playback error callback
        ↓
    failed media unloaded
        ↓
    playing state reset
        ↓
    controlled Playback unavailable state

---

# 16. Remaining Contract Questions

The following questions must be answered by the final merged producer interfaces before status-specific playback authorization UX is completed.

1. What credential does protected playback consume?

2. How does the client provide that credential to the media request?

3. Does the media request use the existing access token directly or another media-specific credential?

4. What exact response identifies invalid or expired authentication?

5. Does the server distinguish authenticated-but-unauthorized media access from invalid authentication?

6. If so, what exact response identifies the authorization-denied condition?

7. How does the playback layer expose the relevant failure result to PlaybackBar?

8. What shared client-session action should be used after the server reports that authentication is no longer valid?

9. Does authentication preserve existing `206 Partial Content` and HTTP Range behavior?

10. What legacy or transitional behavior is required while old and new session/media behavior coexist?

---

# 17. Definition of Ready for Status-Specific Failure Handling

The remaining authentication-specific Search-to-Play frontend work is ready when the merged application provides all of the following:

- a defined protected-media credential;
- a defined client-to-media credential transport;
- a server-side protected-media authentication boundary;
- a defined expired/invalid-authentication response;
- a defined authorization-denied response if applicable;
- a playback-layer mechanism for exposing the failure category;
- a shared client-session recovery interface;
- verified preservation of normal and HTTP Range playback.

Once those interfaces exist, the frontend can implement status-specific failure UX without guessing at the authentication or media architecture.

---

# 18. Non-Goals

This contract does not implement:

- JWT signing;
- JWT verification;
- token revocation persistence;
- revocation-aware authentication middleware;
- logout;
- a new session manager;
- protected-media authorization;
- a new stream endpoint;
- a second playback component;
- a second Search implementation;
- a new media credential;
- a cookie-session architecture;
- a signed-media architecture.

Those responsibilities remain with their respective subsystem implementations.

---

# 19. Acceptance Criteria

This integration contract is complete when:

- [x] The Search-to-Play happy-path interfaces are identified.
- [x] Stable `track.id` is documented as the cross-feature Track identity.
- [x] Search selection ownership is documented.
- [x] Shared `selectedTrackId` playback state is documented.
- [x] Track metadata retrieval is documented.
- [x] Current playback-module behavior is documented.
- [x] Generic playback-failure propagation is documented.
- [x] Current application session state is identified.
- [x] The missing media credential handoff is explicitly identified.
- [x] The current lack of final protected-stream authentication is documented.
- [x] Bearer-header, cookie, and short-lived media-credential alternatives are evaluated.
- [x] Producer and consumer ownership boundaries are documented.
- [x] Required authentication and authorization failure semantics are identified.
- [x] The conditions required to unblock status-specific frontend failure handling are defined.
- [x] The contract does not duplicate authentication, session, or media subsystem ownership.

---

# 20. Current Integration Status

Current state:

    Search contract                     READY
    Stable Track identity               READY
    Search → App selection              READY
    App → PlaybackBar selection         READY
    Track metadata retrieval            READY
    Shared playback path                READY
    Generic playback failure callback   READY
    Generic playback failure UI         READY

    Client → media credential handoff   WAITING ON PRODUCER CONTRACT
    Protected stream authentication     WAITING ON PRODUCER CONTRACT
    Expired-session playback response   WAITING ON PRODUCER CONTRACT
    Authorization-denied response       WAITING ON PRODUCER CONTRACT
    Shared session recovery behavior    WAITING ON MERGED SESSION CONTRACT

The current Search-to-Play integration is therefore functional for the happy path and generic playback failures.

Authentication-specific playback failure handling should be completed only after the shared protected-media and session interfaces are available.